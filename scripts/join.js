import supabase from './supabase.js';

const form   = document.getElementById('joinForm');
const email  = document.getElementById('email');
const pwd    = document.getElementById('pwd');
const pwd2   = document.getElementById('pwd2');
const message = document.getElementById('message');

// ✅ 관리자 이메일 목록 (여기에 추가하면 자동으로 관리자 권한 부여)
const ADMIN_EMAILS = [
  'jotest2@aaa.com'  // ← 본인 이메일로 변경하세요
];

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  
  // 비밀번호 일치 확인
  if (pwd.value !== pwd2.value) {
    message.textContent = "비밀번호가 일치하지 않습니다."
    pwd2.focus();
    return;
  }
  
  const emailValue = document.getElementById('email').value
  const password = document.getElementById('pwd').value
  const nickname = document.getElementById('nickname').value

  // ✅ 회원가입
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: emailValue,
    password,
  })
  
  if (signUpError) {
    message.textContent = `회원가입 오류: ${signUpError.message}`
    return
  }

  const user = signUpData.user
  if (user) {
    // ✅ 이메일이 관리자 목록에 있는지 확인
    const userRole = ADMIN_EMAILS.includes(emailValue.toLowerCase()) ? 'admin' : 'user';
    
    // ✅ Users 테이블에 role 포함하여 저장
    const { error: insertError } = await supabase
      .from('Users')
      .insert({
        user_id: user.id,
        email: user.email,
        nickname: nickname,
        password: password,
        role: userRole  // ← 역할 저장
      })

    if (insertError) {
      message.textContent = `⚠️ DB 저장 오류: ${insertError.message}`
    } else {
      // ✅ 관리자 가입 시 안내 메시지
      if (userRole === 'admin') {
        alert("✅ 관리자 계정으로 회원가입이 완료되었습니다!");
      } else {
        alert("✅ 회원가입이 완료되었습니다.");
      }
      
      await supabase.auth.signOut()
      window.location.href = 'login.html'  // 로그인 페이지로 이동
    }
  }
})