/* /scripts/review.js */
import supabase from './supabase.js';

const listEl   = document.getElementById('review-list');
const moreBtn  = document.getElementById('load-more');
const sortBtns = document.querySelectorAll('.reviews-toolbar .sort-btn');
const form     = document.querySelector('.review-composer');

let data = [];
let page = 1;
const PAGE_SIZE = 5;
let sortMode = 'time';

// 从 URL 取 gameId（支持 ?id= 或 ?game_id=）
const params = new URLSearchParams(location.search);
const gameId =
  Number(params.get('game_id') || params.get('id')) || null;

/* UI: 星星 */
function makeStars(r){
  const d = document.createElement('div'); d.className='stars';
  for (let i=1;i<=5;i++){
    const s = document.createElement('span');
    s.className = i<=r ? 'on' : 'off';
    s.textContent = '★';
    d.appendChild(s);
  }
  return d;
}

/* 卡片 */
function card(item){
  const el = document.createElement('article');
  el.className = 'review-card';

  // 头像
  const avatar = document.createElement('div'); avatar.className='avatar';
  const img = new Image();
  img.src = item.avatar || '/img/avatar-default.png';
  img.alt = `${item.user}의 프로필 사진`;
  img.loading = 'lazy';
  img.onerror = () => { img.src = '/img/avatar-default.png'; };
  avatar.appendChild(img);

  // 主体
  const meta = document.createElement('div'); meta.className='review-meta';
  const u = document.createElement('div'); u.className='review-user'; u.textContent = item.user;
  const t = document.createElement('div'); t.className='review-text'; t.textContent = item.text;
  const sub = document.createElement('div'); sub.className='review-sub';
  sub.innerHTML = `
    <span>${item.date.replaceAll('-', '.')}</span>
    <span class="inline-btn">👍 <b>${item.up}</b></span>
    <span class="inline-btn">👎 <b>${item.down}</b></span>
    <a href="javascript:void(0)" class="inline-btn">댓글 ${item.comments}</a>
    <span class="inline-btn">공유</span>
  `;
  meta.append(u, t, sub);

  const side = document.createElement('div'); side.className='review-side';
  side.append(makeStars(item.rating));

  el.append(avatar, meta, side);
  return el;
}

/* 渲染 + 分页 */
function render(){
  listEl.innerHTML = '';
  const slice = data.slice(0, page*PAGE_SIZE);
  slice.forEach(item => listEl.appendChild(card(item)));
  moreBtn.style.display = (data.length > slice.length) ? 'block' : 'none';
}

/* 排序 */
function applySort(mode){
  sortMode = mode;
  sortBtns.forEach(b => b.classList.toggle('active', b.dataset.sort === mode));
  if (mode === 'reco') {
    data.sort((a,b)=> (b.up - a.up) || b.date.localeCompare(a.date));
  } else {
    data.sort((a,b)=> b.date.localeCompare(a.date));
  }
  page = 1; render();
}

/* 从 Supabase 读取：按 game_id 过滤，联表 Users 拿昵称&头像 */
async function fetchReviewsByGameId(gid){
  const { data: rows, error } = await supabase
    .from('Reviews')
    .select(`
      id, text, rating, up, down, comments, created_at, game_id,
      user:Users ( user_id, nickname, profile_image_url )
    `)
    .eq('game_id', gid)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (rows ?? []).map(r => ({
    id: r.id,
    game_id: r.game_id,
    user: r.user?.nickname ?? '익명',
    avatar: r.user?.profile_image_url ?? '',
    text: r.text ?? '',
    rating: r.rating ?? 0,
    up: r.up ?? 0,
    down: r.down ?? 0,
    comments: r.comments ?? 0,
    date: (r.created_at ?? '').slice(0,10),
  }));
}

/* “追加” */
moreBtn.addEventListener('click', ()=>{ page += 1; render(); });
sortBtns.forEach(btn => btn.addEventListener('click', ()=> applySort(btn.dataset.sort)));

/* 发表：把评论写入 Reviews，并带上 game_id */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!gameId) { alert('缺少 game_id，无法发表评价'); return; }

  const rating = Number((form.querySelector('input[name="rating"]:checked')||{}).value || 0);
  const text = (form.querySelector('textarea[name="comment"]')||{}).value?.trim() || '';

  if (!rating) return alert('请选择星级');
  if (!text)   return alert('请填写评价内容');

  // 当前登录用户
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) { console.error(authErr); return alert('登录状态错误'); }
  if (!user) {
    // 未登录 → 跳登录页，带回跳
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?redirect=${redirect}`;
    return;
  }

  // 插入
  const { data: inserted, error } = await supabase
    .from('Reviews')
    .insert([{
      game_id: gameId,
      user_id: user.id,
      text,
      rating,
      up: 0, down: 0, comments: 0
    }])
    .select(`
      id, text, rating, up, down, comments, created_at, game_id,
      user:Users ( nickname, profile_image_url )
    `)
    .single();

  if (error) {
    console.error('insert error', error);
    return alert('保存失败：' + error.message);
  }

  // 插入成功 → 更新前端列表（顶端插入）
  const item = {
    id: inserted.id,
    game_id: inserted.game_id,
    user: inserted.user?.nickname ?? '익명',
    avatar: inserted.user?.profile_image_url ?? '',
    text: inserted.text ?? '',
    rating: inserted.rating ?? 0,
    up: inserted.up ?? 0,
    down: inserted.down ?? 0,
    comments: inserted.comments ?? 0,
    date: (inserted.created_at ?? '').slice(0,10),
  };
  data.unshift(item);
  applySort('time');
  form.reset();
});

/* 启动：加载该游戏的评论 */
(async () => {
  try {
    if (!gameId) throw new Error('缺少 game_id（请用 ?game_id= 或 ?id= 访问该页）');
    data = await fetchReviewsByGameId(gameId);
  } catch (e) {
    console.error('[reviews] load failed:', e);
    data = [];
  }
  applySort('time');
})();
