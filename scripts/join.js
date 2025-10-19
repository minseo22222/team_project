import supabase from './supabase.js';

const form   = document.getElementById('joinForm');
const email  = document.getElementById('email');
const pwd    = document.getElementById('pwd');
const pwd2   = document.getElementById('pwd2');
const message = document.getElementById('message');

form.addEventListener('submit', async (e) => {
  e.preventDefault()
    //两次密码一致
    if (pwd.value !== pwd2.value) {
        e.preventDefault();
        message.textContent="비밀번호가 일치하지 않습니다."
        pwd2.focus();
        return;
      }
    else{
         const email = document.getElementById('email').value
  const password = document.getElementById('pwd').value
  const nickname =document.getElementById('nickname').value

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })
    if (signUpError) {
    message.textContent = `회원가입 오류: ${signUpError.message}`
    return
  }

  const user = signUpData.user
  if (user) {
    const { error: insertError } = await supabase
      .from('Users')
      .insert({
        user_id: user.id,
        email: user.email,
        nickname: nickname,
        password: password,

      })

if (insertError) {
      message.textContent = `⚠️ DB 저장 오류: ${insertError.message}`
    } else {
     alert("회원가입이 완료되었습니다.")
     await supabase.auth.signOut()
     window.location.href = 'home.html'
    }
}
    }
 

})