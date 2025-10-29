import supabase from './supabase.js';

// Quill 에디터 초기화
let quill = null;

// 헤더 로드
fetch('components/header.html')
    .then(res => res.text())
    .then(html => {
        document.getElementById('header').innerHTML = html;
        const redirectURL = document.getElementById('redirect');
        redirectURL.textContent = window.location.href;
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'scripts/header_user.js';
        document.body.appendChild(script);
    });

// URL 파라미터 가져오기
const params = new URLSearchParams(window.location.search);
const gameId = params.get('game_id');
const gameSlug = params.get('slug');
const gameTitle = decodeURIComponent(params.get('title') || '');

// 타이틀 설정
document.getElementById('boardTitle').textContent = `${gameTitle} 게시판`;
document.getElementById('gameLink').textContent = gameTitle;
document.getElementById('gameLink').href = `/game.html?id=${gameSlug}`;
document.title = `${gameTitle} 게시판 - 갓겜판독기`;

// 전역 변수
let currentUser = null;
let currentUserProfile = null;

// 게임으로 돌아가기
window.goBackToGame = function () {
    window.location.href = `/game.html?id=${gameSlug}`;
};

// 로그인 상태 확인
async function checkAuthStatus() {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        currentUser = user;

        // Users 테이블에서 프로필 정보 가져오기
        const { data: profile } = await supabase
            .from('Users')
            .select('nickname, profile_image_url')
            .eq('user_id', user.id)
            .maybeSingle();

        currentUserProfile = profile;

        // 글쓰기 버튼 활성화
        document.getElementById('writeBtnTop').disabled = false;
    } else {
        // 로그인 안 됨
        document.getElementById('loginNotice').style.display = 'block';
        document.getElementById('writeBtnTop').disabled = true;
    }
}

// 게시글 목록 로드
async function loadPosts() {
    try {
        const { data, error } = await supabase
            .from('board_posts')
            .select(`
            *,
            Users!board_posts_user_id_fkey (
              nickname,
              profile_image_url
            )
          `)
            .eq('game_id', gameId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const postList = document.getElementById('postList');
        const loading = document.getElementById('loading');

        if (!data || data.length === 0) {
            postList.innerHTML = '<div class="empty">아직 게시글이 없습니다.<br>첫 번째 글을 작성해보세요! ✍️</div>';
        } else {
            postList.innerHTML = data.map(post => {
                const author = post.Users || {};
                const nickname = author.nickname || '익명';
                const date = new Date(post.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                return `
              <div class="post-item" onclick="viewPost('${post.post_id}')">
                <div class="post-title">${post.title}</div>
                <div class="post-meta">
                  <span>👤 ${nickname}</span>
                  <span>📅 ${date}</span>
                  <span>👁️ ${post.views || 0}</span>
                  <span>👍 ${post.like_count || 0}</span>
                </div>
              </div>
            `;
            }).join('');
        }

        loading.style.display = 'none';
        postList.style.display = 'block';
    } catch (err) {
        console.error('Error loading posts:', err);
        document.getElementById('loading').textContent = '게시글을 불러오는데 실패했습니다.';
    }
}

// 글쓰기 폼 토글
window.toggleWriteForm = function () {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        return;
    }

    const form = document.getElementById('writeForm');

    if (form.style.display === 'none') {
        form.style.display = 'block';

        // Quill 에디터 초기화 (처음 한 번만)
        if (!quill) {
            quill = new Quill('#editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        ['link'],
                        ['clean']
                    ]
                },
                placeholder: '내용을 입력하세요...'
            });
        } else {
            quill.setText('');
        }
    } else {
        form.style.display = 'none';
        document.getElementById('postTitle').value = '';
        if (quill) quill.setText('');
    }
};

// 게시글 등록
window.submitPost = async function () {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }

    const title = document.getElementById('postTitle').value.trim();
    const content = quill.root.innerHTML.trim();
    const textContent = quill.getText().trim();

    if (!title || !textContent) {
        alert('제목과 내용을 모두 입력해주세요.');
        return;
    }

    try {
        const { error } = await supabase
            .from('board_posts')
            .insert({
                game_id: gameId,
                game_slug: gameSlug,
                user_id: currentUser.id,
                title: title,
                content: content
            });

        if (error) throw error;

        alert('게시글이 등록되었습니다.');
        toggleWriteForm();
        loadPosts();
    } catch (err) {
        console.error('Error creating post:', err);
        alert('게시글 등록에 실패했습니다: ' + err.message);
    }
};

// 게시글 상세보기
window.viewPost = function (postId) {
    location.href = `/board_post.html?id=${postId}`;
};

// 초기 로드
checkAuthStatus();
loadPosts();
