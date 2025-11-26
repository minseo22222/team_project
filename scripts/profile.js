import supabase from './supabase.js';

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 로그인 상태 확인 (세션 체크)
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        alert("로그인이 필요합니다.");
        window.location.href = 'login.html';
        return;
    }

    // 현재 로그인한 유저의 ID
    const userId = session.user.id;

    // 2. 사용자 프로필 정보 로드 (닉네임, 프사, 자기소개)
    await loadUserProfile(userId, session.user.email);

    // 3. [핵심] 사용자가 작성한 리뷰(Comments) 로드
    await loadUserReviews(userId);

    // 4. 버튼 이벤트 연결 (수정, 로그아웃)
    setupButtons();
});

// --- 사용자 프로필 정보 로드 함수 ---
async function loadUserProfile(userId, authEmail) {
    try {
        // Users 테이블에서 데이터 조회
        const { data: userData, error } = await supabase
            .from('Users') 
            .select('nickname, profile_image_url, "showMyself", email') 
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;

        if (userData) {
            // 화면에 데이터 표시
            document.getElementById('nickname').textContent = userData.nickname || '사용자';
            document.getElementById('email').textContent = userData.email || authEmail;
            document.getElementById('showMyself').textContent = userData.showMyself || '자기소개가 없습니다.';
            
            // 프로필 이미지 처리
            const imgEl = document.getElementById('profile_img');
            if (imgEl) {
                imgEl.src = userData.profile_image_url || '/default_profile.png';
                // 이미지 로드 실패 시 기본 이미지로 대체
                imgEl.onerror = () => { imgEl.src = '/default_profile.png'; };
            }
        }
    } catch (err) {
        console.error('프로필 로드 실패:', err);
    }
}

// --- [핵심] 사용자 리뷰(Comments) 로드 함수 ---
async function loadUserReviews(userId) {
    const rateList = document.getElementById('rateList');
    if (!rateList) return;

    // 로딩 중 표시
    rateList.innerHTML = '<p style="padding:20px;">불러오는 중...</p>';

    try {
        // Comments 테이블과 Games 테이블을 조인(Join)하여 데이터 가져오기
        // 주의: 사용자의 SQL에 따르면 테이블명은 'Comments', 내용은 'content' 컬럼임
        const { data: reviews, error } = await supabase
            .from('Comments') 
            .select(`
                rating,
                content,
                created_at,
                Games (game_id, title, cover_image_url, storage_folder_name, slug)
            `)
            .eq('user_id', userId)
            .not('game_id', 'is', null) // 게임에 달린 댓글만 가져오기 (게시판 댓글 제외)
            .order('created_at', { ascending: false }); // 최신순 정렬

        if (error) {
            console.error('리뷰 로드 에러:', error);
            rateList.innerHTML = '<p style="color:red; padding:20px;">평가 내역을 불러올 수 없습니다.</p>';
            return;
        }

        if (!reviews || reviews.length === 0) {
            rateList.innerHTML = '<p style="color:#666; padding:20px;">작성한 평가가 없습니다.</p>';
            return;
        }

        // 리스트 초기화
        rateList.innerHTML = '';

        // 리뷰 카드 생성 반복문
        for (const review of reviews) {
            const game = review.Games; // 조인된 게임 정보
            if (!game) continue; // 게임 정보가 없으면 건너뜀

            // 링크 생성 (slug가 있으면 slug 우선, 없으면 game_id)
            const link = `game.html?id=${game.slug || game.game_id}`;
            
            // 게임 이미지 URL 가져오기 (비동기)
            const imgUrl = await getGameImageUrl(game);
            
            // 평점 및 내용 처리
            const contentText = review.content || '코멘트 없음';
            const ratingVal = review.rating ? review.rating.toFixed(1) : '0.0';

            // HTML 카드 생성
            const card = document.createElement('div');
            card.innerHTML = `
                <a href="${link}" class="game-card" style="text-decoration:none; color:inherit;">
                    <div class="card-img-wrapper">
                        <img src="${imgUrl}" alt="${game.title}" onerror="this.src='https://via.placeholder.com/150'">
                    </div>
                    <div class="card-info">
                        <span class="game-title">${game.title}</span>
                        <div class="rating">★ ${ratingVal}</div>
                        <div style="font-size:13px; color:#555; margin-top:6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
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

// --- 게임 이미지 URL 가져오기 헬퍼 함수 ---
async function getGameImageUrl(game) {
    // 1. DB에 저장된 URL이 http로 시작하면(직접 링크) 바로 사용
    if (game.cover_image_url && game.cover_image_url.startsWith('http')) {
        return game.cover_image_url;
    }

    // 2. Storage 폴더명이 있으면 Storage에서 jpg/png 파일 찾기
    if (game.storage_folder_name) {
        const bucket = 'games'; // 버킷 이름
        const folderPath = game.storage_folder_name + '/';
        
        const { data, error } = await supabase.storage.from(bucket).list(folderPath);

        if (!error && data && data.length > 0) {
            // jpg 또는 png 파일 찾기
            const file = data.find(f => f.name.match(/\.(jpg|jpeg|png)$/i));
            if (file) {
                const { data: pub } = supabase.storage.from(bucket).getPublicUrl(folderPath + file.name);
                return pub.publicUrl;
            }
        }
    }
    // 3. 없으면 기본 이미지 반환
    return 'https://via.placeholder.com/200x120?text=No+Image';
}

// --- 버튼 이벤트 설정 함수 ---
function setupButtons() {
    // [내 정보 수정] 버튼
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            window.location.href = 'profile_edit.html'; 
        });
    }

    // [로그아웃] 버튼
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await supabase.auth.signOut(); // Supabase 로그아웃
                sessionStorage.clear();        // 세션 스토리지 비우기
                alert("로그아웃 되었습니다.");
                window.location.href = 'login.html'; // 로그인 페이지로 이동
            } catch (error) {
                console.error("로그아웃 실패:", error);
                window.location.href = 'login.html';
            }
        });
    }
}