import supabase from './supabase.js';

// 검색 함수
function onSearch() {
  const q = document.getElementById('q').value.trim();
  if (!q) return;
  location.href =  `/search.html?q=${encodeURIComponent(q)}`;
}
window.onSearch = onSearch

const authLink = document.getElementById('auth-link')
const menu = document.getElementById('ddMenu')
const profile_img = document.getElementById('user_profile')
const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))

// 메뉴 열기/닫기 함수
function openMenu() {
    menu.hidden = false
    menu.classList.add('open')
}
function closeMenu() {
    menu.classList.remove('open')
    setTimeout(() => {
        if (!menu.classList.contains('open')) menu.hidden = true
    }, 230)
}

// 🔹 로그인 상태 확인
async function checkAuthStatus() {
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        // ✅ 로그인 상태
        const { data: profile, error } = await supabase
            .from('Users')
            .select('nickname, profile_image_url')
            .eq('user_id', user.id)
            .maybeSingle()

        authLink.textContent = `${profile?.nickname || '사용자'}`
        authLink.href = '#'

        profile_img.src = profile.profile_image_url
        profile_img.width=40;
        profile_img.height=40;
        profile_img.style="background-color: white; border-radius: 50%; object-fit: cover;"
        // 클릭 시 메뉴 토글
        authLink.addEventListener('click', (e) => {
            e.stopPropagation()
            if (menu.classList.contains('open')) closeMenu()
            else openMenu()
        })

        // 메뉴 항목 클릭 이벤트 (한 번만 등록)
        items.forEach((li) => {
            li.addEventListener('click', async (e) => {
                const text = li.textContent.trim()
                if (text === '내정보') {
                    closeMenu()
                    // 예: 프로필 페이지 이동
                    const url=`profile.html?id=${user.id}`;
                    window.location.href = url;
                } else if (text === '로그아웃') {
                    e.preventDefault()
                    await supabase.auth.signOut()
                    window.location.reload()
                }
            })
        })

        // 바깥 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !authLink.contains(e.target)) closeMenu()
        })
    } else {
        // ❌ 로그아웃 상태
        authLink.textContent = '로그인'
        const redirectTo= document.getElementById('redirect').textContent;
        authLink.href = `../login.html?redirect=${redirectTo}`
    }
}

// 실행
checkAuthStatus()
