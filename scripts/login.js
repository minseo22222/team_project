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
  } else {
    // 로그인 성공 시 다음 페이지로 이동
    const params = new URLSearchParams(window.location.search)
    let redirectURL = params.get('redirect') || '/home.html'
    if (redirectURL.startsWith('/')) {
      redirectURL = redirectURL.replace(/^\/+/, '/');
    }
    window.location.href=redirectURL;
  }
})