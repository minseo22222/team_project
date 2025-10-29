import supabase from './supabase.js';

const profileImg = document.getElementById('profile_img')
const uploadBtn = document.getElementById('uploadBtn')
const nicknameInput = document.getElementById('nicknameInput')
const showMyselfInput = document.getElementById('showMyselfInput')
const saveBtn = document.getElementById('saveBtn')
const rstBtn =document.getElementById('reset')

// 로그인한 사용자 정보 불러오기
async function loadProfile() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
        console.error('사용자 인증 에러:', authError)
        return window.location.href = '/home.html'
    }
    if (!user) return window.location.href = '/home.html'

    const { data: profile, error } = await supabase
        .from('Users')
        .select('nickname, profile_image_url, email, showMyself')
        .eq('user_id', user.id)
        .maybeSingle()

    if (error) return console.error('프로필 불러오기 실패:', error)
    if (!profile) return console.warn('사용자 프로필 없음')

    // 화면에 표시
    nicknameInput.value = profile.nickname || ''
    showMyselfInput.value=profile.showMyself || ''
    profileImg.src = profile.profile_image_url || '/default_profile.png'
}

loadProfile()

let selectedImageFile = null // 선택한 이미지 파일 임시 저장

uploadBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.onchange = (e) => {
        const file = e.target.files[0]
        if (!file) return

        selectedImageFile = file // 임시 저장
        profileImg.src = URL.createObjectURL(file) // 미리보기
    }
    fileInput.click()
})

saveBtn.addEventListener('click', async () => {
    // 로그인 사용자 정보 가져오기
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return console.error('사용자 인증 실패', authError)

    let profileImageUrl = null

    // 1️⃣ 이미지 업로드
    if (selectedImageFile) {
        const safeFileName = selectedImageFile.name.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
        const filePath = `profile_image/${user.id}_${Date.now()}_${safeFileName}`
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile_image') // 버킷 이름 확인
            .upload(filePath, selectedImageFile, { upsert: true })

        console.log(uploadData);
        if (uploadError) return console.error('이미지 업로드 실패:', uploadError)
        
        const { data: urlData } = supabase.storage
            .from('profile_image')
            .getPublicUrl(filePath)

        profileImageUrl = urlData.publicUrl
    }

    // 2️⃣ 닉네임 + 이미지 DB 업데이트
    const updateData = { nickname: nicknameInput.value , showMyself: showMyselfInput.value}
    if (profileImageUrl) updateData.profile_image_url = profileImageUrl

    const { error: updateError } = await supabase
        .from('Users')
        .update(updateData)
        .eq('user_id', user.id)
    console.log(user.id);
    console.log('업데이트 데이터:', updateData)
    if (updateError) return console.error('프로필 업데이트 실패:', updateError)

    alert('프로필이 업데이트되었습니다!')
    window.location.href = './home.html'
})

rstBtn.addEventListener("click",async () =>{
    window.location.href="./profile.html"
})