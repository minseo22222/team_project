import supabase from './supabase.js';

// 검색 함수
function onSearch() {
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    location.href = `/search?q=${encodeURIComponent(q)}`;
}
window.onSearch = onSearch

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
        renderGame(game)
        loading.style.display = 'none'
        gameContent.style.display = 'block'

    } catch (err) {
        console.error('Error loading game:', err)
        loading.style.display = 'none'
        error.style.display = 'block'
    }
}

function renderGame(game) {
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
            <img class="game-cover-large" src="${game.cover || 'placeholder.jpg'}" alt="${game.title} 커버">
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
}
