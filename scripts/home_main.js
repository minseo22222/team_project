/*################################################################*/
/*################################################################*/
/*################################################################*/
/*함수정의부*/

import supabase from './supabase.js';

/*불러올 게임의 유형*/
const LoadGameType = {
    POPULAR: 0,
    UPCOMING: 1,
    GALLARY: 2,
};

/*날짜 계산용 클래스 */
class DateManager {
    formatDateKR(d) {
        if (!d) return '';
        // 문자열 날짜를 직접 파싱 (YYYY-MM-DD 형식)
        const [year, month, day] = d.split('-');
        return `${year}.${month}.${day}`;
    }
    daysUntil(d) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const target = new Date(d); target.setHours(0, 0, 0, 0);
        return Math.max(0, Math.ceil((target - today) / 86400000));
    }
}

/*Gallary 동작을 담는 클래스*/
class Gallary {
    constructor() {
        this.images = [];  //불러온 이미지
        this.titles = [];  //..타이틀
        this.slugs = [];  //..url 생성용

        this.current = 0; //현재 이미지 번호 1~6까지
        this.imgLeft = document.getElementById('imgLeft'); //좌측이미지
        this.imgCenter = document.getElementById('imgCenter'); //중앙이미지
        this.imgRight = document.getElementById('imgRight'); //우측이미지
        this.centerCaption = document.getElementById('caption_center') //가운데 Caption 문자열
    }

    async init() { //데이터 불러오기
        const gallary_games = await loadGames(LoadGameType.GALLARY);
        this.images = gallary_games.map(item => item.cover_image_url);
        this.titles = gallary_games.map(item => item.title);
        this.slugs = gallary_games.map(item => item.slug);
    }

    render() {  //화면에 출력
        const n = this.images.length;
        this.imgCenter.src = this.images[this.current];
        this.imgLeft.src = this.images[(this.current - 1 + n) % n];
        this.imgRight.src = this.images[(this.current + 1) % n];

        this.centerCaption.textContent = this.titles[this.current];
    }

    action() { // 클릭 시의 동작
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.current = (this.current - 1 + this.images.length) % this.images.length;
            this.render();
        });
        document.getElementById('nextBtn').addEventListener('click', () => {
            this.current = (this.current + 1) % this.images.length;
            this.render();
        });
        document.getElementById('center_link').addEventListener('click', () => {
            window.location.href = `/game.html?id=${this.slugs[this.current]}`;
        });
    }
}


/*게임들의 배열을 반환하는함수(type에 따라 다른 data 반환)*/
async function loadGames(type) {
    const today = new Date().toISOString().split('T')[0]
    let games = null
    switch (type) {
        /*#####인기#####*/
        case LoadGameType.POPULAR: {
            const { data } = await supabase
                .from('Games')
                .select('*')
                .lte('release_date', today)  // ← 출시일이 오늘 이전 (이미 출시됨)
                .order('recommended_count', { ascending: false })  // ← 추천 많은 순
                .limit(6)
            return data
        }
            break;
        /*#####발매예정#####*/
        case LoadGameType.UPCOMING: {
            const { data } = await supabase
                .from('Games')
                .select('*')
                .gte('release_date', today)  // 출시일이 오늘 이후
                .order('release_date', { ascending: true })
                .limit(6)
            return data
        }
            break;
        /*#####갤러리 출력용#####*/
        case LoadGameType.GALLARY: {
            const { data, error } = await supabase
                .from('Games')
                .select('cover_image_url,title,slug')
                .order('game_id', { ascending: false }) // id 기준으로 최신 6개 가져오기, 필요 없으면 제거
                .limit(6);
            return data
        }
            break;
        default:
            return null
            break;
    }
}

/*별점 색칠 함수*/
function setRating(score,rateEl) {
    if (score != null) {
        const stars = rateEl.querySelectorAll('.star');  
        stars.forEach((star, index) => {  
            star.classList.remove('full', 'half');
            if (score >= index + 1) {      
                star.classList.add('full'); // 완전 채움
            } else if (score >= index + 0.5) {
                star.classList.add('half'); // 반만 채움
            } else {
                // 그대로 빈 별
            }
        });
    }
    else {
        console.log("평점이 NULL!!");
    }
}

/*인기게임 데이터를 받아 형식을 만드는 함수*/
function renderGamePopular(games) {
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

        setRating(g.avg_rating,node.querySelector('.rate'))
        grid.appendChild(node);
    }
}

/*출시예정게임 데이터를 받아 형식을 만드는 함수*/
function renderGameUpcoming(games) {
    const grid = document.getElementById('upcomingGrid');
    const tpl = document.getElementById('gameCardTpl');
    const dateManager = new DateManager();
    grid.innerHTML = '';
    for (const g of games) {
        const node = tpl.content.firstElementChild.cloneNode(true);
        const rate=node.querySelector('.rate');
        if(rate) rate.remove();

        node.querySelector('.link').href = `/game.html?id=${g.slug}`;
        const img = node.querySelector('.game-cover'); img.src = g.cover_image_url; img.alt = `${g.title} 커버`;
        node.querySelector('.game-title').textContent = g.title;

        const badges = node.querySelector('.badges'); badges.innerHTML = '';

        const tags = g.tags || [g.genre]  // tags 없으면 genre 사용
        tags.forEach(t => {
            const s = document.createElement('span')
            s.className = 'badge'
            s.textContent = t
            badges.appendChild(s)
        })

        const d = dateManager.daysUntil(g.release_date);
        node.querySelector('.price').innerHTML =
            `<span class="badge soon">D-${d}</span><span class="eta">${dateManager.formatDateKR(g.release)}</span>`;

        grid.appendChild(node);
    }
}


/*형식과 데이터를 받아 화면에 출력하는 함수*/
function renderGameData(type, games) {
    switch (type) {
        case LoadGameType.UPCOMING:
            renderGameUpcoming(games)
            break
        default:
            renderGamePopular(games)
            break
    }
}


/*불러온 게임 데이터의 개수만큼 출력하는 함수*/
async function renderGames(type) {
    const data = await loadGames(type)
    if (data && data.length > 0) {
        renderGameData(type, data)
    }
}

/*칩을 누를 시 동작하는 함수*/
function handleChipClick(e) {
    const value = e.target.textContent; // 클릭한 버튼의 텍스트
    console.log('선택된 칩:', value);
    location.href = `/search.html?q=${value}`;
}

/*################################################################*/
/*################################################################*/
/*################################################################*/
/*함수실행부*/

/*Gallay 객체 생성및 출력*/
const gallery = new Gallary();
await gallery.init();
gallery.render()
gallery.action()

/*홈 화면에 게임출력(인기,출시예정)*/
await renderGames(LoadGameType.POPULAR)
await renderGames(LoadGameType.UPCOMING)

/*chip 동작 실행*/
const chipsContainer = document.querySelector('.chips');

chipsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) {
        handleChipClick(e);
    }
});