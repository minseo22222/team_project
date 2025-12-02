// scripts/profile_edit.js
import supabase from './supabase.js';

const profileImg      = document.getElementById('profile_img');
const uploadBtn       = document.getElementById('uploadBtn');
const nicknameInput   = document.getElementById('nicknameInput');
const showMyselfInput = document.getElementById('showMyselfInput');
const steamIdInput    = document.getElementById('steamIdInput');
const saveBtn         = document.getElementById('saveBtn');
const rstBtn          = document.getElementById('reset');

// 돌아갈 주소 기본값
let backURL = "./profile.html";

// [1] 로그인한 사용자 정보 + 프로필 로드
async function loadProfile() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('사용자 인증 실패:', authError);
    window.location.href = '/login.html';
    return;
  }

  const { data: profile, error } = await supabase
    .from('Users')
    .select('nickname, profile_image_url, email, showMyself, steam_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('프로필 불러오기 실패:', error);
  }

  if (profile) {
    nicknameInput.value   = profile.nickname   || '';
    showMyselfInput.value = profile.showMyself || '';
    profileImg.src        = profile.profile_image_url || '/default_profile.png';
    steamIdInput.value    = profile.steam_id   || '';
  }

  // 수정 후 돌아갈 URL (id 포함)
  backURL = `./profile.html?id=${user.id}`;
}

// 페이지 로드 시 실행
loadProfile();

// [2] 이미지 선택 시 미리보기
let selectedImageFile = null;

uploadBtn.addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;
    profileImg.src = URL.createObjectURL(file); // 미리보기
  };
  fileInput.click();
});

// [3] 저장 버튼 클릭
saveBtn.addEventListener('click', async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('인증 실패:', authError);
    return;
  }

  let profileImageUrl = null;

  // 3-1. 이미지가 변경되었다면 업로드
  if (selectedImageFile) {
    const safeFileName = selectedImageFile.name
      .replace(/\s/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');

    const filePath = `profile_image/${user.id}_${Date.now()}_${safeFileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile_image')
      .upload(filePath, selectedImageFile, { upsert: true });

    if (uploadError) {
      alert('이미지 업로드 실패');
      console.error(uploadError);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('profile_image')
      .getPublicUrl(filePath);

    profileImageUrl = urlData.publicUrl;
  }

  // 3-2. 업데이트 데이터 준비
  const updateData = {
    nickname:   nicknameInput.value.trim(),
    showMyself: showMyselfInput.value.trim(),
    // ✅ Steam ID64 추가 (빈 값이면 null 로 저장)
    steam_id:   steamIdInput.value.trim() || null,
  };

  if (profileImageUrl) {
    updateData.profile_image_url = profileImageUrl;
  }

  // 3-3. DB 업데이트
  const { error: updateError } = await supabase
    .from('Users')
    .update(updateData)
    .eq('user_id', user.id);

  if (updateError) {
    alert('프로필 업데이트 실패');
    console.error(updateError);
    return;
  }

  alert('프로필이 성공적으로 수정되었습니다!');
  window.location.href = backURL;
});

// [4] 취소 버튼 (저장 안 하고 돌아가기)
rstBtn.addEventListener('click', () => {
  window.location.href = backURL;
});
