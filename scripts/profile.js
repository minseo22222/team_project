import supabase from './supabase.js';

async function loadRates(user_id) {
  // Comments 테이블에서 평가 가져오기
  const { data: comments, error } = await supabase
    .from('Comments')
    .select('game_id,rating,content')
    .eq('user_id', user_id)
    .is('parent_comment_id', null)

  if (error) {
    console.error('평가 정보 불러오기 실패:', error)
    return
  }
  return comments;
}

async function showRates(user_id) {
  const rateList = document.getElementById('rateList');
  rateList.innerHTML = ''; // 기존 내용 초기화

  const comments = await loadRates(user_id);
  if (!comments || comments.length === 0) {
    rateList.innerHTML = '<p>평가가 없습니다.</p>';
    return;
  }

  //게임로드
  const gameIds = comments.map(c => c.game_id); // 배열 생성

  const { data: games, error } = await supabase
    .from('Games')
    .select('title, game_id,cover_image_url,slug')
    .in('game_id', gameIds); // game_id가 배열 안에 있는 값이면 모두 선택

  comments.forEach(comment => {
    // 별점 표시: ★ 개수만큼 반복
    const stars = '★'.repeat(comment.rating) + '☆'.repeat(5 - comment.rating);
    const game = games.find(g => g.game_id === comment.game_id);

    const item = document.createElement('div');
    item.innerHTML = `
    <a href="/game.html?id=${game.slug}" class="no-underline"">
    <div class="intro-card">
      <img class="game_img" src="${game.cover_image_url}" />
      <div class="game">${game.title}</div>
      <div class="stars">${stars}</div>
      <div class="content">${comment.content}</div>
    </div>
    </a>
    `;

    rateList.appendChild(item);
  });
}


async function loadProfile() {
  const params = new URLSearchParams(window.location.search);
  const URLId = params.get('id');
  // 현재 로그인한 사용자 가져오기
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('사용자 인증 에러:', authError)
    window.location.href = '/home.html'
    return
  }

  if (!user) {
    window.location.href = '/home.html'
    return
  }

  // Users 테이블에서 프로필 정보 가져오기
  const { data: profile, error } = await supabase
    .from('Users')
    .select('nickname, profile_image_url, email,showMyself')
    .eq('user_id', URLId)
    .maybeSingle()

  if (error) {
    console.error('프로필 정보 불러오기 실패:', error)
    return
  }

  if (!profile) {
    console.warn('사용자 프로필 없음')
    return
  }

  const editbtn = document.getElementById('editProfileBtn');
  const outbtn = document.getElementById('logout');

  if (user.id != URLId) {
    editbtn.style.display = 'none';
    outbtn.style.display = 'none';
  }
  else {
    editbtn.style.display = 'block';
    outbtn.style.display = 'block';
  }

  showRates(URLId);

  // 프로필 정보 화면에 표시
  document.getElementById('nickname').textContent = profile.nickname || '사용자'
  document.getElementById('email').textContent = `이메일: ${profile.email || '없음'}`
  document.getElementById('showMyself').textContent = `${profile.showMyself}`

  // 프로필 이미지
  if (profile.profile_image_url) {
    document.getElementById('profile_img').src = profile.profile_image_url
  } else {
    document.getElementById('profile_img').src = '/default_profile.png'
  }

  // 내정보 수정 버튼
  editbtn.addEventListener('click', () => {
    window.location.href = '/profile_edit.html'
  })

  // 로그아웃 버튼
  outbtn.addEventListener('click', async () => {
    const { error: logoutError } = await supabase.auth.signOut()
    if (logoutError) {
      console.error('로그아웃 실패:', logoutError)
    } else {
      window.location.href = '/home.html'
    }
  })
}

// 페이지 로드 시 프로필 불러오기
loadProfile()