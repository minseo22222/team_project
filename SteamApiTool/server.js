// server.js — Steam → Supabase 자동 등록 (FX 시리즈 보정 추가됨)
import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio"; 

const app = express();
const PORT = process.env.PORT || 3000;

const STEAM_API = "https://store.steampowered.com";
const LOCALE_CC = "kr";
const LOCALE_L = "koreana";

// ── Supabase Admin 클라이언트 ──
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

app.use(express.json());
app.use(express.static("public"));

/* ───────────── 공용 유틸 ───────────── */

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text();
  if (!ct.includes("application/json")) {
    throw new Error(`Upstream non-JSON(${r.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

// 사양 파싱 함수
function parseSteamSpecs(htmlString) {
  if (!htmlString) return null;
  const $ = cheerio.load(htmlString);
  const specs = {};
  
  const standardKeys = ['processor', 'cpu', 'graphics', 'video', 'gpu', 'memory', 'ram', 'os', 'storage', 'directx'];

  $('li').each((i, elem) => {
    let text = $(elem).text().trim(); 
    let key = "";
    let value = "";

    let parts = text.split(':');
    
    if (parts.length >= 2) {
      const candidateKey = parts[0].trim().toLowerCase().replace(/[\(\)]/g, '').replace(/ /g, '_');
      const isStandard = standardKeys.some(k => candidateKey.includes(k));
      if (isStandard || candidateKey.length < 20) {
        key = candidateKey;
        value = parts.slice(1).join(':').trim();
      }
    }

    if (!key) {
      const lowerText = text.toLowerCase();
      if (lowerText.match(/geforce|radeon|gtx|rtx|rx |arc |graphics|vga|gpu/)) {
        key = 'graphics';
        value = text;
      }
      else if (lowerText.match(/intel|amd|ryzen|core|i3|i5|i7|i9|cpu|processor|ghz/)) {
        key = 'processor';
        value = text;
      }
      else if (lowerText.match(/ram|memory|gb/)) {
        key = 'memory';
        value = text;
      }
      else if (lowerText.match(/windows|os|mac|linux/)) {
        key = 'os';
        value = text;
      }
    }

    if (key && value) {
        if (key.includes('cpu') || key.includes('proc')) key = 'processor';
        if (key.includes('gpu') || key.includes('graph') || key.includes('video')) key = 'graphics';
        specs[key] = value;
    }
  });
  
  return Object.keys(specs).length > 0 ? specs : null;
}

// 객체 값 찾기
function findSpecValue(specsObj, keywords) {
  if (!specsObj) return null;
  const keys = Object.keys(specsObj);
  for (const key of keys) {
    for (const word of keywords) {
      if (key.includes(word)) return specsObj[key];
    }
  }
  return null;
}

function safeSlug(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

async function ensureUniqueSlug(base, appid) {
  let candidate = base || `app-${appid}`;
  async function takenByOthers(slug) {
    const { data, error } = await supabaseAdmin
      .from("Games").select("steam_app_id").eq("slug", slug).limit(1);
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

// ★ [수정됨] 하드웨어 점수 검색 함수 (FX 시리즈 보정 추가)
async function getHardwareScores(table, textSpec) {
  if (!textSpec) return {}; 
  
  // 1. 텍스트 대청소 (특수문자, 괄호 등 제거)
  // 1. 텍스트 대청소 (특수문자, 괄호, TM 등 제거)
  let cleanText = textSpec
    .replace(/[®™]/g, '')                 // ®, ™ 기호 삭제
    .replace(/\(tm\)/gi, '')              // (tm) 글자 삭제
    .replace(/[\(（].*?[\)）]/g, '')      // 괄호 내용 삭제
    .replace(/ and above/gi, '')          
    .replace(/ processor/gi, '')
    .replace(/ graphics/gi, '')
    .replace(/ video card/gi, '')
    .trim();

  const parts = cleanText.split(/[\/|,]| or /i)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  const resultMap = {};
  
  for (let part of parts) {
    // 브랜드 자동 부착
    let searchKeyword = part;
    const lowerPart = part.toLowerCase();

    // 1. AMD Ryzen
    if (lowerPart.includes('ryzen') && !lowerPart.includes('amd')) {
      searchKeyword = 'AMD ' + searchKeyword;
    }
    // 2. Intel Core
    if (lowerPart.match(/\bi\d[-\s]/) && !lowerPart.includes('intel')) {
      searchKeyword = 'Intel Core ' + searchKeyword;
    }
    // 3. NVIDIA GeForce
    if ((lowerPart.includes('gtx') || lowerPart.includes('rtx')) && !lowerPart.includes('nvidia')) {
      searchKeyword = 'NVIDIA GeForce ' + searchKeyword;
    }
    // 4. Radeon
    if ((lowerPart.includes('rx ') || lowerPart.includes('radeon')) && !lowerPart.includes('amd')) {
      searchKeyword = 'AMD ' + searchKeyword;
    }
    // ★ 5. [추가됨] AMD FX 시리즈 보정 (CPU 테이블일 때만)
    // "FX-"로 시작하거나 "FX "가 포함되어 있는데 "AMD"가 없으면 -> "AMD " 붙임
    if (table === 'cpu_tb' && (lowerPart.includes('fx-') || lowerPart.match(/\bfx\s/)) && !lowerPart.includes('amd')) {
      searchKeyword = 'AMD ' + searchKeyword;
    }

    console.log(`[DB검색] 원본: '${part}' -> 변환후: '${searchKeyword}'`);

    // DB 검색
    const { data, error } = await supabaseAdmin.rpc('match_hardware_score', {
      tb_name: table, input_text: searchKeyword
    });

    if (!error && data > 0) {
      resultMap[part] = data; 
    } 
  }
  return resultMap;
}

/* ───────────── 라우트 ───────────── */

async function getAppDetail(appid) {
  const url = `${STEAM_API}/api/appdetails?appids=${appid}&cc=${LOCALE_CC}&l=${LOCALE_L}`;
  const raw = await fetchJSON(url);
  const payload = raw?.[appid];
  if (!payload?.success) throw new Error("앱을 찾을 수 없음 / App not found");

  const d = payload.data || {};
  
  const minSpecs = d.pc_requirements?.minimum ? parseSteamSpecs(d.pc_requirements.minimum) : null;
  const recSpecs = d.pc_requirements?.recommended ? parseSteamSpecs(d.pc_requirements.recommended) : null;

  const priceCents = d?.price_overview?.final != null ? parseInt(d.price_overview.final, 10) : (d.is_free ? 0 : null);
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
    screenshots,
    specs_min: minSpecs,
    specs_rec: recSpecs
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

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

app.get("/api/app/:appid", async (req, res) => {
  try {
    const { appid } = req.params;
    const detail = await getAppDetail(appid);
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/app/:appid/requirements", async (req, res) => {
  try {
    const { appid } = req.params;
    const url = `${STEAM_API}/api/appdetails?appids=${appid}&cc=${LOCALE_CC}&l=${LOCALE_L}`;
    const raw = await fetchJSON(url);
    const d = raw?.[appid]?.data || {};
    res.json({
      pc_requirements: {
        minimum_html: d.pc_requirements?.minimum || "정보 없음",
        recommended_html: d.pc_requirements?.recommended || "정보 없음"
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { appid } = req.body || {};
    if (!appid || !/^\d+$/.test(String(appid))) {
      return res.status(400).json({ error: "valid appid required" });
    }

    const d = await getAppDetail(String(appid));
    console.log(`\n=== [${appid}] 등록 시작: ${d.name} ===`);
    
    const cpuKeywords = ['cpu', 'processor', '프로세서', 'proc'];
    const gpuKeywords = ['graphic', 'video', 'gpu', '그래픽', '비디오'];
    
    const minCpuText = findSpecValue(d.specs_min, cpuKeywords);
    const minGpuText = findSpecValue(d.specs_min, gpuKeywords);
    const recCpuText = findSpecValue(d.specs_rec, cpuKeywords);
    const recGpuText = findSpecValue(d.specs_rec, gpuKeywords);

    console.log(`[파싱확인] CPU: ${minCpuText}`);
    console.log(`[파싱확인] GPU: ${minGpuText}`);

    const title = d.name || `app-${appid}`;
    const baseSlug = safeSlug(title);
    const slug = await ensureUniqueSlug(baseSlug, Number(appid));
    const folder = safeSlug(`${baseSlug}-${appid}`) || `app-${appid}`;

    // 이미지 업로드
    let storedCoverUrl = d.header_image || "";
    if (process.env.MEDIA_BUCKET && d.header_image) {
      try {
        const r = await fetch(d.header_image);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const ext = d.header_image.split("?")[0].toLowerCase().endsWith(".png") ? ".png" : ".jpg";
          const key = `${folder}/cover${ext}`;
          await supabaseAdmin.storage.from(process.env.MEDIA_BUCKET).upload(key, buf, { upsert: true, contentType: ext === ".png" ? "image/png" : "image/jpeg" });
          const { data: pub } = supabaseAdmin.storage.from(process.env.MEDIA_BUCKET).getPublicUrl(key);
          if (pub?.publicUrl) storedCoverUrl = pub.publicUrl;
        }
      } catch (e) { console.warn("[cover upload warn]", e.message); }
    }

    // 스크린샷 업로드
    if (process.env.MEDIA_BUCKET && Array.isArray(d.screenshots)) {
      const limited = d.screenshots.slice(0, 8);
      let idx = 1;
      for (const s of limited) {
        try {
          const r = await fetch(s.full || s.thumb);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const key = `${folder}/screenshots/ss_${idx++}.jpg`;
            await supabaseAdmin.storage.from(process.env.MEDIA_BUCKET).upload(key, buf, { upsert: true, contentType: "image/jpeg" });
          }
        } catch {}
      }
    }

    const platform = Object.entries(d.platforms || {}).filter(([, v]) => !!v).map(([k]) => k).join(",");

    const gameRow = {
      title,
      steam_app_id: Number(appid),
      genre: (d.genres || []).join(","),
      developer: d.developers,
      publisher: d.publishers,
      description: d.description,
      cover_image_url: storedCoverUrl, 
      storage_folder_name: folder,
      release_date: d.release_date.date_iso,
      slug,
      platform,
      price: d.price_cents == null ? (d.is_free ? 0 : null) : Math.round(d.price_cents / 100),
      specs_min: d.specs_min, 
      specs_rec: d.specs_rec 
    };

    const { error: upsertErr } = await supabaseAdmin.from("Games").upsert(gameRow, { onConflict: "steam_app_id" });
    if (upsertErr) throw upsertErr;

    // 점수 계산
    const [minCpuScores, minGpuScores, recCpuScores, recGpuScores] = await Promise.all([
      getHardwareScores('cpu_tb', minCpuText),
      getHardwareScores('gpu_tb', minGpuText),
      getHardwareScores('cpu_tb', recCpuText),
      getHardwareScores('gpu_tb', recGpuText)
    ]);

    const scoreRow = {
      steam_app_id: Number(appid),
      min_cpu_score: minCpuScores, 
      min_gpu_score: minGpuScores,
      rec_cpu_score: recCpuScores,
      rec_gpu_score: recGpuScores
    };

    const { error: scoreErr } = await supabaseAdmin.from("game_score_tb").upsert(scoreRow, { onConflict: "steam_app_id" });
    if (scoreErr) console.error("점수 저장 실패:", scoreErr);

    res.json({ ok: true, saved: gameRow, scores: scoreRow });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
});