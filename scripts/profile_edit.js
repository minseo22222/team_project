import supabase from './supabase.js';

const profileImg = document.getElementById('profile_img')
const uploadBtn = document.getElementById('uploadBtn')
const nicknameInput = document.getElementById('nicknameInput')
const showMyselfInput = document.getElementById('showMyselfInput')
const saveBtn = document.getElementById('saveBtn')
const rstBtn = document.getElementById('reset')

// 돌아갈 주소 기본값 (loadProfile에서 완성됨)
let backURL = "./profile.html"; 

// [1] 로그인한 사용자 정보 불러오기
async function loadProfile() {
    // 1. 세션 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
        console.error('사용자 인증 실패:', authError)
        return window.location.href = '/login.html' // 로그인 안 되어 있으면 로그인 페이지로
    }

    // 2. Users 테이블에서 데이터 조회
    const { data: profile, error } = await supabase
        .from('Users')
        .select('nickname, profile_image_url, email, showMyself')
        .eq('user_id', user.id)
        .maybeSingle()

    if (error) return console.error('프로필 불러오기 실패:', error)
    
    // 3. 화면에 기존 정보 표시
    if (profile) {
        nicknameInput.value = profile.nickname || ''
        showMyselfInput.value = profile.showMyself || ''
        profileImg.src = profile.profile_image_url || '/default_profile.png'
    }

    // 4. [중요] 돌아갈 URL 설정 (ID 포함)
    // 예: ./profile.html?id=uuid-1234...
    // (단, profile.html이 id 파라미터를 처리하도록 되어 있어야 함. 
    //  보통 본인 프로필은 세션으로 확인하므로 id가 없어도 되지만, 요청하신 대로 넣음)
    backURL = `./profile.html?id=${user.id}`;
}

// 페이지 로드 시 실행
loadProfile()

// [2] 이미지 선택 시 미리보기
let selectedImageFile = null 

uploadBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.onchange = (e) => {
        const file = e.target.files[0]
        if (!file) return

        selectedImageFile = file
        profileImg.src = URL.createObjectURL(file) // 미리보기 업데이트
    }
    fileInput.click()
})

// [3] 저장 버튼 클릭 (업데이트)
saveBtn.addEventListener('click', async () => {
    // 사용자 정보 다시 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return console.error('인증 실패')

    let profileImageUrl = null

    // 3-1. 이미지가 변경되었다면 업로드
    if (selectedImageFile) {
        // 파일명 안전하게 변환
        const safeFileName = selectedImageFile.name.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
        const filePath = `profile_image/${user.id}_${Date.now()}_${safeFileName}`
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile_image') // 버킷 이름
            .upload(filePath, selectedImageFile, { upsert: true })

        if (uploadError) {
            alert('이미지 업로드 실패');
            return console.error(uploadError);
        }
        
        // 업로드된 이미지의 공개 URL 가져오기
        const { data: urlData } = supabase.storage
            .from('profile_image')
            .getPublicUrl(filePath)

        profileImageUrl = urlData.publicUrl
    }

    // 3-2. DB 업데이트 데이터 준비
    const updateData = { 
        nickname: nicknameInput.value, 
        showMyself: showMyselfInput.value 
    }
    // 새 이미지가 있을 때만 URL 업데이트 (없으면 기존 유지)
    if (profileImageUrl) {
        updateData.profile_image_url = profileImageUrl
    }

    // 3-3. Users 테이블 업데이트
    const { error: updateError } = await supabase
        .from('Users')
        .update(updateData)
        .eq('user_id', user.id)

    if (updateError) {
        alert('프로필 업데이트 실패');
        return console.error(updateError);
    }

    alert('프로필이 성공적으로 수정되었습니다!');
    
    // [중요] 수정 후 프로필 페이지로 돌아가기
    window.location.href = backURL;
})

// [4] 취소 버튼 (저장 안 하고 돌아가기)
rstBtn.addEventListener("click", async () => {
    window.location.href = backURL;
})