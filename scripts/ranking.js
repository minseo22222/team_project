// [수정 1] 사용자 환경에 맞게 import 방식 변경
import supabase from './supabase.js';

// 페이지 로드 시 실행
loadRanking();

async function loadRanking() {
    const top3Container = document.getElementById('top3-container');
    const rankList = document.getElementById('rank-list');

    console.log("🚀 랭킹 로딩 시작...");

    try {
        // 1. 데이터 가져오기
        // [수정 2] slug 컬럼을 반드시 가져와야 함
        const { data: games, error } = await supabase
            .from('Games')
            .select('game_id, title, cover_image_url, avg_rating, genre, storage_folder_name, slug')
            .order('avg_rating', { ascending: false, nullsFirst: false }) // 평점 높은 순
            .limit(10);

        if (error) {
            console.error('❌ DB Error:', error);
            top3Container.innerHTML = `<div class="error">데이터 오류: ${error.message}</div>`;
            return;
        }

        if (!games || games.length === 0) {
            top3Container.innerHTML = '<div class="error">등록된 게임이 없습니다.</div>';
            return;
        }

        console.log(`✅ 로드된 게임: ${games.length}개`);

        // 2. 초기화
        top3Container.innerHTML = '';
        rankList.innerHTML = '';

        // 3. TOP 3 렌더링 (2등 -> 1등 -> 3등 순서)
        
        // [2등]
        if (games[1]) {
            await createPodiumItem(games[1], 2, top3Container);
        } else {
            createEmptyItem(top3Container);
        }

        // [1등]
        if (games[0]) {
            await createPodiumItem(games[0], 1, top3Container);
        }

        // [3등]
        if (games[2]) {
            await createPodiumItem(games[2], 3, top3Container);
        } else {
            createEmptyItem(top3Container);
        }

        // 4. 4위 ~ 10위 리스트 렌더링
        // 게임이 3개보다 많을 때만 리스트에 표시됨 (현재 2개라면 여기는 빈칸이 정상입니다)
        if (games.length > 3) {
            for (let i = 3; i < games.length; i++) {
                await createListItem(games[i], i + 1, rankList);
            }
        } else {
            // (선택사항) 리스트가 비었을 때 메시지를 띄우고 싶다면 아래 주석 해제
            // rankList.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">순위권 밖의 게임이 없습니다.</div>';
        }

    } catch (err) {
        console.error("❌ Script Error:", err);
    }
}

// --- 이미지 URL 가져오기 ---
async function getImageUrl(game) {
    // 1. DB URL 우선
    if (game.cover_image_url) return game.cover_image_url;

    // 2. Storage 폴더 검색
    if (game.storage_folder_name) {
        const bucket = 'games'; 
        const folderPath = game.storage_folder_name + '/';
        
        // 폴더 내 파일 검색
        const { data, error } = await supabase.storage.from(bucket).list(folderPath);

        if (!error && data && data.length > 0) {
            // jpg, png, jpeg 파일 찾기
            const file = data.find(f => f.name.match(/\.(jpg|jpeg|png)$/i));
            if (file) {
                const { data: pub } = supabase.storage.from(bucket).getPublicUrl(folderPath + file.name);
                return pub.publicUrl;
            }
        }
    }
    // 3. 기본 이미지
    return 'https://via.placeholder.com/300x169?text=No+Image';
}

// [수정 3] 클릭 시 game_id 대신 slug를 사용하도록 변경 함수
function getLink(game) {
    // game.js가 slug를 기준으로 검색하므로 slug를 우선 사용
    const idParam = game.slug ? game.slug : game.game_id;
    return `game.html?id=${idParam}`;
}

// 시상대 아이템 생성 (Top 3)
async function createPodiumItem(game, rank, container) {
    const isFirst = rank === 1;
    const div = document.createElement('div');
    div.className = `podium-item rank-${rank}`;
    
    const rating = game.avg_rating ? game.avg_rating.toFixed(1) : '0.0';
    const imgUrl = await getImageUrl(game);
    const link = getLink(game); // 링크 생성

    div.innerHTML = `
        ${isFirst ? '<div class="crown">👑</div>' : ''}
        <div class="rank-badge">${rank}</div>
        <div class="game-card" onclick="location.href='${link}'">
            <img src="${imgUrl}" class="game-cover" alt="${game.title}">
            <div class="game-title">${game.title}</div>
            <div class="game-rating">★ ${rating}</div>
        </div>
        <div class="podium-base"></div>
    `;
    container.appendChild(div);
}

// 빈 박스 (자리 채우기)
function createEmptyItem(container) {
    const div = document.createElement('div');
    div.className = 'podium-item empty'; 
    div.innerHTML = `
        <div class="game-card" style="opacity:0; height:200px"></div>
        <div class="podium-base" style="opacity:0"></div>
    `;
    container.appendChild(div);
}

// 리스트 아이템 생성 (4~10위)
async function createListItem(game, rank, container) {
    const div = document.createElement('div');
    div.className = 'rank-row';
    
    const link = getLink(game); // 링크 생성
    div.onclick = () => location.href = link;

    const rating = game.avg_rating ? game.avg_rating.toFixed(1) : '0.0';
    const genre = game.genre || '';
    const imgUrl = await getImageUrl(game);

    div.innerHTML = `
        <div class="rank-num">${rank}</div>
        <img src="${imgUrl}" class="row-cover" alt="${game.title}">
        <div class="row-info">
            <div class="row-title">${game.title}</div>
            <div style="font-size:12px; color:#666">${genre}</div>
        </div>
        <div class="row-score">★ ${rating}</div>
    `;
    container.appendChild(div);
}