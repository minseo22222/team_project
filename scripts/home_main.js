
import supabase from './supabase.js';

/* 搜索提交 */
function onSearch() {
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    location.href = `/search?q=${encodeURIComponent(q)}`;
}
window.onSearch = onSearch

/* 顶部画廊：上一张 / 下一张 */
const images = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'];
let current = 0;
const imgLeft = document.getElementById('imgLeft');
const imgCenter = document.getElementById('imgCenter');
const imgRight = document.getElementById('imgRight');

function render() {
    const n = images.length;
    imgCenter.src = images[current];
    imgLeft.src = images[(current - 1 + n) % n];
    imgRight.src = images[(current + 1) % n];
}
document.getElementById('prevBtn').addEventListener('click', () => { current = (current - 1 + images.length) % images.length; render(); });
document.getElementById('nextBtn').addEventListener('click', () => { current = (current + 1) % images.length; render(); });
render();

/* ========== 数据：本周人气 ========== */
/* ========== 데이터: 이번 주 인기 ========== */
async function loadPopularGames() {
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
        .from('Games')
        .select('*')
        .lte('release_date', today)  // ← 출시일이 오늘 이전 (이미 출시됨)
        .order('recommended_count', { ascending: false })  // ← 추천 많은 순
        .limit(6)

    if (data && data.length > 0) {
        renderPopular(data)
    }
}
const formatKRW = n => new Intl.NumberFormat('ko-KR').format(n);

function renderPopular(games) {
    const grid = document.getElementById('gameGrid');
    const tpl = document.getElementById('gameCardTpl');
    grid.innerHTML = '';
    for (const g of games) {
        const node = tpl.content.firstElementChild.cloneNode(true);

        node.querySelector('.link').href = `/game.html?id=${g.slug}`;
        const img = node.querySelector('.game-cover');
        img.src = g.cover_image_url || '1.jpg';
        img.alt = `${g.title} 커버`;

        node.querySelector('.game-title').textContent = g.title;

        const badges = node.querySelector('.badges');
        badges.innerHTML = '';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = g.genre || '장르';
        badges.appendChild(badge);

        const priceBox = node.querySelector('.price');
        priceBox.innerHTML = `<span>${g.developer || '개발사 정보 없음'}</span>`;

        grid.appendChild(node);
    }
}
loadPopularGames();

/* ========== 数据：即将发售 ========== */
async function loadUpcomingGames() {
    const today = new Date().toISOString().split('T')[0] // 오늘 날짜

    const { data } = await supabase
        .from('Games')
        .select('*')
        .gte('release_date', today)  // 출시일이 오늘 이후
        .order('release_date', { ascending: true })
        .limit(6)

    if (data && data.length > 0) {
        renderUpcoming(data)
    }
}

const pad2 = n => (n < 10 ? '0' : '') + n;
function formatDateKR(d) {
    if (!d) return '';

    // 문자열 날짜를 직접 파싱 (YYYY-MM-DD 형식)
    const [year, month, day] = d.split('-');
    return `${year}.${month}.${day}`;
}

function daysUntil(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(d); target.setHours(0, 0, 0, 0);
    return Math.max(0, Math.ceil((target - today) / 86400000));
}

function renderUpcoming(games) {
    const grid = document.getElementById('upcomingGrid');
    const tpl = document.getElementById('gameCardTpl'); // 复用同一模板
    grid.innerHTML = '';
    for (const g of games) {
        const node = tpl.content.firstElementChild.cloneNode(true);

        node.querySelector('.link').href = `/game.html?id=${g.slug}`;
        const img = node.querySelector('.game-cover'); img.src = g.cover; img.alt = `${g.title} 커버`;
        node.querySelector('.game-title').textContent = g.title;

        const badges = node.querySelector('.badges'); badges.innerHTML = '';

        const tags = g.tags || [g.genre]  // tags 없으면 genre 사용
        tags.forEach(t => {
            const s = document.createElement('span')
            s.className = 'badge'
            s.textContent = t
            badges.appendChild(s)
        })

        const d = daysUntil(g.release_date);
        node.querySelector('.price').innerHTML =
            `<span class="badge soon">D-${d}</span><span class="eta">${formatDateKR(g.release)}</span>`;

        grid.appendChild(node);
    }
}
loadUpcomingGames();
