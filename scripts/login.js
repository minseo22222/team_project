import supabase from './supabase.js';

const form = document.getElementById('form')

// ✅ 로그인 처리
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = document.getElementById('email').value
  const password = document.getElementById('pwd').value

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  
  if (error) {
    var error_message = '❌ 로그인 실패: ' + error.message
    alert(error_message);
    return;
  }

  // ✅ 로그인 성공 - Users 테이블에서 role 가져오기
  const userId = data.user.id;
  const { data: userData, error: userError } = await supabase
    .from('Users')
    .select('role, nickname')
    .eq('user_id', userId)  // ← user_id로 수정!
    .single();

  if (userError) {
    console.error('사용자 정보 조회 실패:', userError);
    alert('❌ 사용자 정보를 가져올 수 없습니다.');
    return;
  }

  // ✅ 사용자 정보 localStorage에 저장
  const userRole = userData?.role || 'user';
  
  if (userData?.is_suspended) {
    alert('❌ 정지된 계정입니다. 관리자에게 문의하세요.');
    await supabase.auth.signOut();
    return;
}
  localStorage.setItem('userRole', userRole);
  localStorage.setItem('userEmail', data.user.email);
  localStorage.setItem('userId', userId);
  localStorage.setItem('userNickname', userData?.nickname || '');

  // ✅ 로그인 성공 - 모두 홈으로 이동
  const params = new URLSearchParams(window.location.search)
  let redirectURL = params.get('redirect') || '/home.html'
  if (redirectURL.startsWith('/')) {
    redirectURL = redirectURL.replace(/^\/+/, '/');
  }
  
  // 관리자는 조용히 알림만
  if (userRole === 'admin') {
    console.log('✅ 관리자로 로그인되었습니다.');
  }
  
  window.location.href = redirectURL;
})