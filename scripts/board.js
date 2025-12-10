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
async function loadPosts(sortType = 'latest') {
    try {
        let query = supabase
            .from('board_posts')
            .select(`
            *,
            Users!board_posts_user_id_fkey (
              nickname,
              profile_image_url
            )
          `)
            .eq('game_id', gameId);
        
        // 정렬 조건 추가
        if (sortType === 'latest') {
            query = query.order('created_at', { ascending: false });
        } else if (sortType === 'likes') {
            query = query.order('like_count', { ascending: false, nullsFirst: false });
        }
        
        const { data, error } = await query;

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

// ==========================================
    // [수정됨] 이미지 업로드 기능이 추가된 글쓰기 폼 토글
    // ==========================================
    window.toggleWriteForm = function () {
      if (!currentUser) {
        alert('로그인이 필요합니다.');
        // 필요시 로그인 페이지 경로 수정
        // window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        return;
      }

      const form = document.getElementById('writeForm');

      if (form.style.display === 'none') {
        form.style.display = 'block';

        // Quill 에디터 초기화 (처음 한 번만 실행)
        if (!quill) {
          quill = new Quill('#editor', {
            theme: 'snow',
            modules: {
              toolbar: {
                container: [
                  [{ 'header': [1, 2, 3, false] }],
                  ['bold', 'italic', 'underline', 'strike'],
                  [{ 'color': [] }, { 'background': [] }],
                  [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                  ['image', 'link', 'clean'] // 'image' 버튼 필수
                ],
                handlers: {
                  // 기본 이미지 동작을 가로채서 우리 함수(imageHandler)를 실행
                  'image': imageHandler 
                }
              }
            },
            placeholder: '내용을 입력하세요... (이미지 버튼을 눌러 사진을 올릴 수 있습니다)'
          });
        }
      } else {
        form.style.display = 'none';
      }
    };

    // ==========================================
    // [신규] 이미지 핸들러 (파일 선택 -> 업로드 -> 에디터 삽입)
    // ==========================================
    function imageHandler() {
      // 1. 가상의 파일 선택창(<input type="file">)을 만듦
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*'); // 이미지 파일만 허용
      input.click(); // 클릭해서 창 띄우기

      // 2. 사용자가 파일을 선택했을 때 실행
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        // 파일 유효성 검사 (예: 5MB 제한)
        if (file.size > 5 * 1024 * 1024) {
          alert('이미지 크기는 5MB 이하여야 합니다.');
          return;
        }

        try {
          // 3. 파일명 생성 (겹치지 않게 시간+랜덤값 사용)
          // 예: 1700000_랜덤.png
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${currentUser.id}/${fileName}`; // 폴더별 정리 (선택사항)

          // 로딩 표시 (선택사항)
          // alert('이미지 업로드 중...'); 

          // 4. Supabase Storage에 업로드
          const { data, error } = await supabase
            .storage
            .from('guide_images') // 1단계에서 만든 버킷 이름
            .upload(filePath, file);

          if (error) throw error;

          // 5. 업로드된 이미지의 공개 URL 가져오기
          const { data: publicData } = supabase
            .storage
            .from('guide_images')
            .getPublicUrl(filePath);
            
          const publicUrl = publicData.publicUrl;

          // 6. Quill 에디터의 현재 커서 위치에 이미지 태그 삽입
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', publicUrl);
          
          // 커서를 이미지 다음으로 이동
          quill.setSelection(range.index + 1);

        } catch (err) {
          console.error('이미지 업로드 실패:', err);
          alert('이미지 업로드에 실패했습니다.');
        }
      };
    }

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

// 정렬 이벤트 리스너
window.addEventListener('sortPosts', async (e) => {
    const sortType = e.detail.sortType;
    await loadPosts(sortType);
});
