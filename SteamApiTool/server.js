// server.js — Steam → Supabase 자동 등록 + 프록시 API
// server.js — Steam → Supabase 自动导入 + 代理 API
// (한/중 주석 포함 / 含韩/中文双语注释)

import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// Steam 상점/웹 API 기본 주소 / Steam 商店/开放接口
const STEAM_API = "https://store.steampowered.com";

// 지역/언어 파라미터(한국/한글) / 地区/语言参数（韩国/韩文）
const LOCALE_CC = "kr";
const LOCALE_L = "koreana";

// ── Supabase Admin 클라이언트(서버 전용) / 仅后端使用 ──
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

app.use(express.json());
app.use(express.static("public")); // 프런트 정적파일 / 同源托管前端

/* ───────────── 공용 유틸 / 通用工具 ───────────── */

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text();
  if (!ct.includes("application/json")) {
    throw new Error(`Upstream non-JSON(${r.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

// 문자열 → 안전한 slug (Storage key로도 안전) / 字符串 → ASCII 安全 slug
function safeSlug(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

// slug 유일성 보장 / 确保 slug 唯一
async function ensureUniqueSlug(base, appid) {
  let candidate = base || `app-${appid}`;

  async function takenByOthers(slug) {
    const { data, error } = await supabaseAdmin
      .from("Games")
      .select("steam_app_id")
      .eq("slug", slug)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return false;
    return Number(data[0].steam_app_id) !== Number(appid);
  }

  if (!(await takenByOthers(candidate))) return candidate;

  candidate = `${base}-${appid}`;
  if (!(await takenByOthers(candidate))) return candidate;

  let i = 2;
  while (await takenByOthers(candidate)) {
    candidate = `${base}-${appid}-${i++}`;
  }
  return candidate;
}

// 한국어/자유 형식 날짜 → ISO / 韩文/自由格式 → ISO
function parseKoreanDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) {
    const [_, y, mm, dd] = m;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(+d)) return d.toISOString().slice(0, 10);
  return null;
}

/* ───────────── Steam appdetails 파서 / 解析 ───────────── */

async function getAppDetail(appid) {
  const url = `${STEAM_API}/api/appdetails?appids=${appid}&cc=${LOCALE_CC}&l=${LOCALE_L}`;
  const raw = await fetchJSON(url);
  const payload = raw?.[appid];
  if (!payload?.success) throw new Error("앱을 찾을 수 없음 / App not found");

  const d = payload.data || {};
  const priceCents =
    d?.price_overview?.final != null
      ? parseInt(d.price_overview.final, 10)
      : d.is_free
      ? 0
      : null;

  const genres = Array.isArray(d.genres) ? d.genres.map(g => g.description) : [];
  const developers = Array.isArray(d.developers) ? d.developers.join(", ") : "";
  const publishers = Array.isArray(d.publishers) ? d.publishers.join(", ") : "";

  const screenshots = Array.isArray(d.screenshots)
    ? d.screenshots.map(s => ({ id: s.id, full: s.path_full, thumb: s.path_thumbnail }))
    : [];

  return {
    appid,
    name: d.name,
    type: d.type,
    is_free: !!d.is_free,
    header_image: d.header_image,
    platforms: d.platforms || { windows: false, mac: false, linux: false },
    release_date: {
      date_raw: d.release_date?.date || null,
      date_iso: parseKoreanDate(d.release_date?.date),
    },
    genres,
    developers,
    publishers,
    price_cents: priceCents,
    description: d.short_description || "",
    screenshots
  };
}

/* ───────────── 라우트 / 路由 ───────────── */

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Steam 검색 위임 / 代理 Steam 搜索
app.get("/api/search", async (req, res) => {
  try {
    const term = (req.query.term || "").toString().trim();
    if (!term) return res.status(400).json({ error: "term required" });

    const url = `${STEAM_API}/api/storesearch/?term=${encodeURIComponent(term)}&l=${LOCALE_L}&cc=${LOCALE_CC}`;
    const j = await fetchJSON(url);
    const items = Array.isArray(j.items)
      ? j.items.map(it => ({ appid: String(it.id), name: it.name, tiny_image: it.tiny_image }))
      : [];
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// App 기본 정보 / 基本信息
app.get("/api/app/:appid", async (req, res) => {
  try {
    const { appid } = req.params;
    const detail = await getAppDetail(appid);
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DB 등록 + Storage 업로드 / 写库 + 上传到 Storage
app.post("/api/register", async (req, res) => {
  try {
    const { appid } = req.body || {};
    if (!appid || !/^\d+$/.test(String(appid))) {
      return res.status(400).json({ error: "valid appid required" });
    }

    // 1) Steam 상세
    const d = await getAppDetail(String(appid));

    // 2) slug + Storage 폴더명
    const title = d.name || `app-${appid}`;
    const baseSlug = safeSlug(title);
    const slug = await ensureUniqueSlug(baseSlug, Number(appid));
    const folder = safeSlug(`${baseSlug}-${appid}`) || `app-${appid}`; // games/<folder>/...

    // 3) 커버 업로드
    let storedCoverUrl = d.header_image || "";
    if (process.env.MEDIA_BUCKET && d.header_image) {
      try {
        const r = await fetch(d.header_image);
        if (!r.ok) throw new Error(`fetch cover ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const ext = d.header_image.split("?")[0].toLowerCase().endsWith(".png") ? ".png" : ".jpg";
        const key = `${folder}/cover${ext}`;

        const { error: upErr } = await supabaseAdmin
          .storage.from(process.env.MEDIA_BUCKET)
          .upload(key, buf, { upsert: true, contentType: ext === ".png" ? "image/png" : "image/jpeg" });
        if (upErr) throw upErr;

        const { data: pub } = supabaseAdmin.storage.from(process.env.MEDIA_BUCKET).getPublicUrl(key);
        if (pub?.publicUrl) storedCoverUrl = pub.publicUrl;
      } catch (e) {
        console.warn("[cover upload warn]", e.message);
      }
    }

    // 4) 스크린샷 업로드(있으면) / 上传截图(如有)
    if (process.env.MEDIA_BUCKET && Array.isArray(d.screenshots) && d.screenshots.length) {
      const limited = d.screenshots.slice(0, 8); // 最多 8 张
      let idx = 1;
      for (const s of limited) {
        try {
          const r = await fetch(s.full || s.thumb);
          if (!r.ok) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          const key = `${folder}/screenshots/ss_${idx++}.jpg`;
          await supabaseAdmin.storage.from(process.env.MEDIA_BUCKET).upload(key, buf, {
            upsert: true,
            contentType: "image/jpeg",
          });
        } catch {}
      }
    }

    // 5) 플랫폼 문자열 / 平台串
    const platform = Object.entries(d.platforms || {})
      .filter(([, v]) => !!v)
      .map(([k]) => k)
      .join(",");

    // 6) upsert 데이터 / 数据
    const row = {
      title,
      steam_app_id: Number(appid),
      genre: (d.genres || []).join(","),
      developer: d.developers,
      publisher: d.publishers,
      description: d.description,
      cover_image_url: storedCoverUrl,     // 前端直接用这个显示封面
      release_date: d.release_date.date_iso,
      slug,                                // 唯一
      platform,
      price: d.price_cents == null ? (d.is_free ? 0 : null) : Math.round(d.price_cents / 100),
      storage_folder_name: folder          // ★ 前端用它去 Storage 列出 screenshots
    };

    const { error: upsertErr } = await supabaseAdmin
      .from("Games")
      .upsert(row, { onConflict: "steam_app_id" });

    if (upsertErr) throw upsertErr;

    res.json({ ok: true, saved: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 서버 시작 / 启动服务
app.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
});
