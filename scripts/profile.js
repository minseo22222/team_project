import supabase from './supabase.js';

async function loadProfile() {
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
    .select('nickname, profile_image_url, email')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('프로필 정보 불러오기 실패:', error)
    return
  }

  if (!profile) {
    console.warn('사용자 프로필 없음')
    return
  }

  // 프로필 정보 화면에 표시
  document.getElementById('nickname').textContent = profile.nickname || '사용자'
  document.getElementById('email').textContent = `이메일: ${profile.email || '없음'}`

  // 프로필 이미지
  if (profile.profile_image_url) {
    document.getElementById('profile_img').src = profile.profile_image_url
  } else {
    document.getElementById('profile_img').src = '/default_profile.png'
  }

  // 내정보 수정 버튼
  document.getElementById('editProfileBtn').addEventListener('click', () => {
    window.location.href = '/profile_edit.html'
  })

  // 로그아웃 버튼
  document.getElementById('logout').addEventListener('click', async () => {
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