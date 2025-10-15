import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
    'https://qjusboguowpyamitokjh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdXNib2d1b3dweWFtaXRva2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjU5MDIsImV4cCI6MjA3NTY0MTkwMn0._AMM8U_rwX6RLAe1ACIvdC-047nnykVaQvnfcAuXZ0Q'
)

async function loadProfile() {
  // 현재 로그인한 사용자 가져오기
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('사용자 인증 에러:', authError)
    window.location.href = '/login.html'
    return
  }

  if (!user) {
    // 로그인 안된 상태 → 로그인 페이지로 이동
    window.location.href = '/login.html'
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