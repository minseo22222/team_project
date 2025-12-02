// scripts/profile.js
import supabase from './supabase.js';

// 페이지 로드 시
document.addEventListener('DOMContentLoaded', async () => {
  // 현재 로그인 세션
  const { data: { session } } = await supabase.auth.getSession();

  const params = new URLSearchParams(window.location.search);
  const queryUserId = params.get('id');          // URL 로 온 user_id
  const loggedInId  = session?.user?.id || null; // 내가 로그인한 id

  // 보여줄 대상 유저 id (URL 이 우선, 없으면 내 것)
  const viewUserId = queryUserId || loggedInId;

  if (!viewUserId) {
    alert("로그인이 필요합니다.");
    window.location.href = 'login.html';
    return;
  }

  // 프로필 / 리뷰 / Steam 동시 로딩
  await loadUserProfile(viewUserId, session?.user?.email || '');
  await Promise.all([
    loadSteamRecent(viewUserId),
    loadUserReviews(viewUserId),
  ]);

  setupButtons(session, viewUserId);
});


// --- 프로필 정보 로드 ---
async function loadUserProfile(userId, authEmail) {
  try {
    const { data: userData, error } = await supabase
      .from('Users')
      .select('nickname, profile_image_url, "showMyself", email')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (userData) {
      document.getElementById('nickname').textContent =
        userData.nickname || '사용자';
      document.getElementById('email').textContent =
        userData.email || authEmail || 'email 정보 없음';
      document.getElementById('showMyself').textContent =
        userData.showMyself || '자기소개가 없습니다.';

      const imgEl = document.getElementById('profile_img');
      if (imgEl) {
        imgEl.src = userData.profile_image_url || '/default_profile.png';
        imgEl.onerror = () => { imgEl.src = '/default_profile.png'; };
      }
    }
  } catch (err) {
    console.error('프로필 로드 실패:', err);
  }
}


// --- ✅ Steam 최근 플레이 로드 ---
async function loadSteamRecent(userId) {
  const box = document.getElementById('steamRecent');
  if (!box) return;

  box.innerHTML = '<p style="padding:10px;">Steam 데이터 로딩 중...</p>';

  try {
    // 1) Users 테이블에서 steam_id 조회
    const { data: userRow, error: userErr } = await supabase
      .from('Users')
      .select('steam_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (userErr) {
      console.error('steam_id 조회 실패:', userErr);
      box.innerHTML = '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
      return;
    }

    const steamId = userRow?.steam_id?.trim();
    if (!steamId) {
      // 등록 안 된 경우 안내 문구
      box.innerHTML = `
        <p style="font-size:14px; color:#444;">
          프로필 편집에서 Steam ID64 를 등록하면<br>
          이곳에 최근 플레이한 게임이 표시됩니다.
        </p>`;
      return;
    }

    // 2) Edge Function 호출
    const EDGE_FUNC_SLUG = 'hyper-api';
    const { data, error: fnError } = await supabase.functions.invoke(
      EDGE_FUNC_SLUG,
      { body: { steamid: steamId } },
    );

    console.log('Steam Edge 결과:', { data, fnError });

    if (fnError) {
      const msg = fnError.message || JSON.stringify(fnError);
      console.error('Steam Edge 함수 오류:', fnError);
      box.innerHTML =
        `<p style="color:red;">Steam 데이터를 불러올 수 없습니다.<br>${esc(msg)}</p>`;
      return;
    }

    const games = data?.response?.games || [];
    if (!games.length) {
      box.innerHTML =
        '<p style="font-size:14px; color:#444;">최근 2주간 플레이한 게임이 없습니다.</p>';
      return;
    }

    // 3) 카드 렌더링 (최대 2개)
    box.innerHTML = '';
    games.slice(0, 2).forEach((game) => {
      const appid = game.appid;
      const name  = game.name;
      const play2w = (game.playtime_2weeks   || 0) / 60;
      const playAll = (game.playtime_forever || 0) / 60;
      const imgUrl =
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

      const card = document.createElement('a');
      card.className = 'game-card';
      card.href = `https://store.steampowered.com/app/${appid}`;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';

      card.innerHTML = `
        <div class="card-img-wrapper">
          <img src="${imgUrl}" alt="${esc(name)}"
               onerror="this.src='https://via.placeholder.com/300x140?text=No+Image'">
        </div>
        <div class="card-info">
          <span class="game-title">${esc(name)}</span>
          <div style="font-size:13px; margin-top:6px; line-height:1.4;">
            최근 2주: ${play2w.toFixed(1)}시간<br>
            누적 플레이: ${playAll.toFixed(1)}시간
          </div>
        </div>
      `;
      box.appendChild(card);
    });
  } catch (err) {
    console.error('Steam 섹션 오류:', err);
    box.innerHTML = '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
  }
}


// --- 사용자 리뷰 로드 (원래 있던 함수, userId 파라미터만 사용) ---
async function loadUserReviews(userId) {
  const rateList = document.getElementById('rateList');
  if (!rateList) return;

  rateList.innerHTML = '<p style="padding:20px;">불러오는 중...</p>';

  try {
    const { data: reviews, error } = await supabase
      .from('Comments')
      .select(`
        rating,
        content,
        created_at,
        Games (game_id, title, cover_image_url, storage_folder_name, slug)
      `)
      .eq('user_id', userId)
      .not('game_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('리뷰 로드 에러:', error);
      rateList.innerHTML =
        '<p style="color:red; padding:20px;">평가 내역을 불러올 수 없습니다.</p>';
      return;
    }

    if (!reviews || reviews.length === 0) {
      rateList.innerHTML =
        '<p style="color:#666; padding:20px;">작성한 평가가 없습니다.</p>';
      return;
    }

    rateList.innerHTML = '';

    for (const review of reviews) {
      const game = review.Games;
      if (!game) continue;

      const link = `game.html?id=${game.slug || game.game_id}`;
      const imgUrl = await getGameImageUrl(game);
      const contentText = review.content || '코멘트 없음';
      const ratingVal   = review.rating ? review.rating.toFixed(1) : '0.0';

      const card = document.createElement('div');
      card.innerHTML = `
        <a href="${link}" class="game-card" style="text-decoration:none; color:inherit;">
          <div class="card-img-wrapper">
            <img src="${imgUrl}" alt="${game.title}"
                 onerror="this.src='https://via.placeholder.com/150'">
          </div>
          <div class="card-info">
            <span class="game-title">${game.title}</span>
            <div class="rating">★ ${ratingVal}</div>
            <div style="font-size:13px; color:#555; margin-top:6px;
                        display: -webkit-box; -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical; overflow: hidden;">
              ${contentText}
            </div>
          </div>
        </a>
      `;
      rateList.appendChild(card);
    }

  } catch (err) {
    console.error('리뷰 스크립트 오류:', err);
    document.getElementById('rateList').innerHTML =
      '<p>오류가 발생했습니다.</p>';
  }
}


// --- 게임 이미지 URL 헬퍼 ---
async function getGameImageUrl(game) {
  if (game.cover_image_url && game.cover_image_url.startsWith('http')) {
    return game.cover_image_url;
  }

  if (game.storage_folder_name) {
    const bucket = 'games';
    const folderPath = game.storage_folder_name + '/';

    const { data, error } = await supabase.storage.from(bucket).list(folderPath);

    if (!error && data && data.length > 0) {
      const file = data.find(f => f.name.match(/\.(jpg|jpeg|png)$/i));
      if (file) {
        const { data: pub } = supabase.storage
          .from(bucket)
          .getPublicUrl(folderPath + file.name);
        return pub.publicUrl;
      }
    }
  }
  return 'https://via.placeholder.com/200x120?text=No+Image';
}


// --- 버튼 이벤트 설정 ---
function setupButtons(session, viewUserId) {
  const editBtn   = document.getElementById('editProfileBtn');
  const logoutBtn = document.getElementById('logout');
  const loggedInId = session?.user?.id || null;

  // 세션이 없으면 둘 다 숨김
  if (!session) {
    if (editBtn) editBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return;
  }

  // 내 프로필이 아닐 때는 "내 정보 수정" 버튼 숨김
  if (editBtn) {
    if (loggedInId === viewUserId) {
      editBtn.style.display = '';
      editBtn.addEventListener('click', () => {
        window.location.href = 'profile_edit.html';
      });
    } else {
      editBtn.style.display = 'none';
    }
  }

  // 로그아웃은 항상 가능
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await supabase.auth.signOut();
        sessionStorage.clear();
        alert("로그아웃 되었습니다.");
        window.location.href = 'login.html';
      } catch (error) {
        console.error("로그아웃 실패:", error);
        window.location.href = 'login.html';
      }
    });
  }
}


// --- 간단 이스케이프 헬퍼 ---
function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
