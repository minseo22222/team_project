import supabase from './supabase.js';

const loading = document.getElementById('loading')
const error = document.getElementById('error')
const gameContent = document.getElementById('gameContent')

// URL에서 게임 ID 추출
const params = new URLSearchParams(window.location.search)
const gameId = params.get('id')

if (!gameId) {
  loading.style.display = 'none'
  error.style.display = 'block'
} else {
  loadGameData()
}
async function getImageUrls(storage_path) { //이미지url 배열 반환 함수
  // ① 스토리지 버킷 이름과 폴더 지정
  const bucket = 'games'        // 버킷 이름
  const folderPath = storage_path + '/'      // 폴더 경로 (없으면 '')

  // ② 폴더 안의 파일 목록 가져오기
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .list(folderPath, {
      limit: 100, // 최대 100개까지
      offset: 0
    })

  if (error) {
    console.error('파일 목록 불러오기 실패:', error)
    return []
  }

  // ③ 파일 이름들을 기반으로 공개 URL 생성
  const urls = data
    .filter(file => file.name.endsWith('.jpg') || file.name.endsWith('.png') || file.name.endsWith('.jpeg'))
    .map(file => {
      const { data: publicUrlData } = supabase
        .storage
        .from(bucket)
        .getPublicUrl(`${folderPath}${file.name}`)
      return publicUrlData.publicUrl
    })

  console.log('이미지 URL 배열:', urls)
  return urls
}


async function loadGameData() {
  try {
    // Supabase에서 게임 데이터 조회
    const { data: game, error: dbError } = await supabase
      .from('Games')
      .select('*')
      .eq('slug', gameId)
      .single()

    if (dbError || !game) {
      throw new Error('게임을 찾을 수 없습니다')
    }

    // 페이지 렌더링
    const urls = await getImageUrls(game.storage_folder_name)
    renderGame(game, urls)
    loading.style.display = 'none'
    gameContent.style.display = 'block'

  } catch (err) {
    console.error('Error loading game:', err)
    loading.style.display = 'none'
    error.style.display = 'block'
  }
}

function imgViewer(img_urls) {
  const mainImage = document.getElementById('mainImage');
  const thumbnailList = document.getElementById('thumbnailList');

  // 첫 번째 이미지를 기본 큰 이미지로 설정
  mainImage.src = img_urls[0] || 'placeholder.jpg';

  // 썸네일 생성
  img_urls.forEach((url, index) => {
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = `썸네일 ${index + 1}`;

    // 클릭 시 큰 이미지 변경
    thumb.addEventListener('click', () => {
      mainImage.src = url;
    });

    thumbnailList.appendChild(thumb);
  });
}

function renderGame(game, img_urls) {
  const formatKRW = n => new Intl.NumberFormat('ko-KR').format(n)

  // 가격 계산
  let priceHTML = ''
  if (game.discount && game.discount > 0) {
    const newPrice = Math.round(game.price * (100 - game.discount) / 100)
    priceHTML = `
          <div class="price">
            <span class="off">-${game.discount}%</span>
            <span class="old">₩${formatKRW(game.price)}</span>
            <span>₩${formatKRW(newPrice)}</span>
          </div>
        `
  } else {
    priceHTML = `
          <div class="price">₩${formatKRW(game.price)}</div>
        `
  }

  // 태그 배지
  const tags = game.tags || []
  const badgesHTML = tags.map(tag => `<span class="badge">${tag}</span>`).join('')

  // 페이지 제목 설정
  document.title = `${game.title} - 갓겜판독기`

  gameContent.innerHTML = `
        <!-- 게임 헤더 -->
        <section class="game-header">
          <div class="game-header-content">
           <div class="main-image-wrapper">
            <img id="mainImage" class="game-cover-large" src="placeholder.jpg" alt="게임 커버">
           </div>
            <!-- 썸네일 목록 -->
            <div class="thumbnail-list" id="thumbnailList">
              <!-- JS에서 자동 생성 -->
            </div>
          </div>
            <div class="game-info">
              <h1>${game.title}</h1>
              <div class="badges">${badgesHTML}</div>
              
              <div class="price-box">
                <div class="price-label">가격</div>
                ${priceHTML}
              </div>

              <div class="description">
                ${game.description || '게임 설명이 없습니다.'}
              </div>
            </div>
          </div>
        </section>

        <!-- 상세 정보 -->
        <section class="details-section">
          <h2>📋 게임 정보</h2>
          <div class="detail-grid">
            ${game.developer ? `
              <div class="detail-item">
                <div class="detail-label">개발사</div>
                <div class="detail-value">${game.developer}</div>
              </div>
            ` : ''}
            ${game.publisher ? `
              <div class="detail-item">
                <div class="detail-label">퍼블리셔</div>
                <div class="detail-value">${game.publisher}</div>
              </div>
            ` : ''}
            ${game.release_date ? `
              <div class="detail-item">
                <div class="detail-label">출시일</div>
                <div class="detail-value">${game.release_date}</div>
              </div>
            ` : ''}
            ${game.platform ? `
              <div class="detail-item">
                <div class="detail-label">플랫폼</div>
                <div class="detail-value">${game.platform}</div>
              </div>
            ` : ''}
            ${game.genre ? `
              <div class="detail-item">
                <div class="detail-label">장르</div>
                <div class="detail-value">${game.genre}</div>
              </div>
            ` : ''}
            ${game.metacritic_score ? `
              <div class="detail-item">
                <div class="detail-label">메타크리틱</div>
                <div class="detail-value">${game.metacritic_score}점</div>
              </div>
            ` : ''}
          </div>
        </section>
      `
      imgViewer(img_urls)
}
