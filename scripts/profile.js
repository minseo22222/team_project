// scripts/profile.js
import supabase from './supabase.js';

// ✅ Edge Function 슬러그 (Supabase Edge Functions > Details 화면의 Slug)
const EDGE_FUNC_SLUG = 'hyper-api';


// 페이지 로드 시 진입점
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();

  const params = new URLSearchParams(window.location.search);
  const queryUserId = params.get('id');          // URL 로 온 user_id
  const loggedInId  = session?.user?.id || null; // 내가 로그인한 id

  // 보여줄 대상 유저 id (URL 우선, 없으면 내 것)
  const viewUserId = queryUserId || loggedInId;

  if (!viewUserId) {
    alert("로그인이 필요합니다.");
    window.location.href = 'login.html';
    return;
  }

  await loadUserProfile(viewUserId, session?.user?.email || '');

  // Steam / 리뷰 동시 로드
  await Promise.all([
    loadSteamSections(viewUserId),
    loadUserReviews(viewUserId),
  ]);

  setupButtons(session, viewUserId);
});


// ===================== 프로필 정보 로드 =====================

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


// ===================== Steam 섹션 (최근 + 라이브러리) =====================

async function loadSteamSections(userId) {
  const recentRow = document.getElementById('steam-recent-two');  // 상단: 최근 2개
  const gamesRow  = document.getElementById('steamRecent');       // 하단: 전체 라이브러리
  const countEl   = document.getElementById('steam-total-games'); // 총 보유 게임

  if (!recentRow && !gamesRow) return;

  // 초기 메세지
  if (recentRow) {
    recentRow.innerHTML =
      '<p style="font-size:14px; color:#444;">Steam 데이터 로딩 중...</p>';
  }
  if (gamesRow) {
    gamesRow.innerHTML =
      '<p style="padding:10px; font-size:14px;">Steam 데이터 로딩 중...</p>';
  }
  if (countEl) countEl.textContent = '정보 로딩 중...';

  try {
    // 1) Users 테이블에서 steam_id 가져오기
    const { data: userRow, error: userErr } = await supabase
      .from('Users')
      .select('steam_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (userErr) {
      console.error('steam_id 조회 실패:', userErr);
      if (recentRow) recentRow.innerHTML = '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
      if (gamesRow)  gamesRow.innerHTML  = '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
      if (countEl)   countEl.textContent = 'Steam 정보 오류';
      return;
    }

    const steamId = userRow?.steam_id?.trim();
    if (!steamId) {
      if (recentRow) {
        recentRow.innerHTML = `
          <p style="font-size:14px; color:#444;">
            프로필 편집에서 Steam ID64 를 등록하면,<br>
            최근 2주 동안 플레이한 게임이 여기 표시됩니다.
          </p>`;
      }
      if (gamesRow) {
        gamesRow.innerHTML = `
          <p style="font-size:14px; color:#444;">
            Steam ID64 를 등록하면, 보유한 게임과 플레이 시간이 표시됩니다.
          </p>`;
      }
      if (countEl) countEl.textContent = 'Steam ID 미등록';
      return;
    }

    // 2) Edge Function 호출
    const { data, error: fnError } = await supabase.functions.invoke(
      EDGE_FUNC_SLUG,
      { body: { steamid: steamId } },
    );

    console.log('Steam Edge 결과:', { data, fnError });

    if (fnError) {
      const msg = fnError.message || JSON.stringify(fnError);
      console.error('Steam Edge 함수 오류:', fnError);
      if (recentRow) {
        recentRow.innerHTML =
          `<p style="color:red;">Steam 데이터를 불러올 수 없습니다.<br>${esc(msg)}</p>`;
      }
      if (gamesRow) {
        gamesRow.innerHTML =
          `<p style="color:red;">Steam 데이터를 불러올 수 없습니다.<br>${esc(msg)}</p>`;
      }
      if (countEl) countEl.textContent = 'Steam 정보 오류';
      return;
    }

    // 응답 구조가 약간 바뀌어도 괜찮게 처리
    const summary = data?.summary || {};
    const owned   = data?.owned_games  || data?.games   || [];
    const recent  = data?.recent_games || data?.recent  || [];

    // ===== 2-1) 상단: 최근 2주 플레이 게임 =====
    if (recentRow) {
      if (!recent || recent.length === 0) {
        recentRow.innerHTML =
          '<p style="font-size:14px; color:#666;">최근 2주 동안 플레이한 게임이 없습니다.</p>';
      } else {
        // playtime_2weeks 기준으로 정렬, 최대 2개
        const recentSorted = [...recent].sort(
          (a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0)
        ).slice(0, 2);

        recentRow.innerHTML = '';
        recentSorted.forEach(g => {
          const appid = g.appid;
          const name  = g.name;
          const hours2w = (g.playtime_2weeks || 0) / 60;
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
                최근 2주 플레이: ${hours2w.toFixed(1)}시간
              </div>
            </div>
          `;
          recentRow.appendChild(card);
        });
      }
    }

    // ===== 2-2) 하단: 전체 라이브러리 (가로 스크롤) =====
    if (gamesRow) {
      const totalGames =
        summary?.owned_game_count ??
        data?.owned_game_count ??
        owned.length;

      if (countEl) {
        countEl.textContent = `총 보유 게임 ${totalGames}개`;
      }

      if (!owned || owned.length === 0) {
        gamesRow.innerHTML =
          '<p style="font-size:14px; color:#444;">보유한 게임이 없습니다.</p>';
      } else {
        const gamesSorted = [...owned].sort(
          (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
        );

        gamesRow.innerHTML = '';

        gamesSorted.forEach(game => {
          const appid = game.appid;
          const name  = game.name;
          const hours = (game.playtime_forever || 0) / 60;
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
                누적 플레이: ${hours.toFixed(1)}시간
              </div>
            </div>
          `;
          gamesRow.appendChild(card);
        });
      }
    }

  } catch (err) {
    console.error('Steam 섹션 오류:', err);
    if (recentRow) {
      recentRow.innerHTML =
        '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
    }
    if (gamesRow) {
      gamesRow.innerHTML =
        '<p style="color:red;">Steam 데이터를 불러올 수 없습니다.</p>';
    }
    if (countEl) countEl.textContent = 'Steam 정보 오류';
  }
}


// ===================== 사용자 리뷰 로드 =====================

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
    rateList.innerHTML = '<p>오류가 발생했습니다.</p>';
  }
}


// ===================== 게임 이미지 URL 헬퍼 =====================

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


// ===================== 버튼 이벤트 =====================

function setupButtons(session, viewUserId) {
  const editBtn    = document.getElementById('editProfileBtn');
  const logoutBtn  = document.getElementById('logout');
  const loggedInId = session?.user?.id || null;

  // 세션이 없으면 둘 다 숨김
  if (!session) {
    if (editBtn)   editBtn.style.display = 'none';
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

  // 로그아웃 버튼
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


// ===================== 간단 escape 헬퍼 =====================

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
