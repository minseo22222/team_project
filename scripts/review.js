// scripts/review.js
import supabase from './supabase.js';

/* ================================
 * 全局 DOM / Global DOM
 * ================================
 * - 中文 | Korean
 *   评论列表容器 | 리뷰 목록 컨테이너
 *   “更多”按钮   | 더보기 버튼
 *   排序按钮组   | 정렬 버튼들
 *   顶部发表表单 | 상단 작성 폼
 *   提交按钮     | 제출 버튼
 */
const listEl      = document.getElementById('review-list');
const loadMoreBtn = document.getElementById('load-more');
const sortBtns    = document.querySelectorAll('.sort-btn');
const formEl      = document.querySelector('.review-composer');
const submitBtn   = document.querySelector('.review-actions input[type="submit"]');

const loginURL     = `./login.html?redirect=${encodeURIComponent(location.href)}`;
const USERS_TABLE  = 'Users';
const USER_PK_COL  = 'user_id';

/* ================================
 * 状态 State
 * ================================
 * - 中文 | Korean
 *   分页大小     | 페이지 크기
 *   当前页码     | 현재 페이지
 *   排序模式     | 정렬 모드
 *   游戏ID       | 게임 ID
 *   URL参数slug  | URL 파라미터 slug
 *   当前登录用户 | 현재 로그인 사용자
 */
const PAGE_SIZE = 10;
let page = 0;
let sortMode = 'time'; // 'time' | 'reco'
let GAME_ID = null;    // 从 Games 表通过 slug 取得 | Games 테이블의 slug로 조회
let SLUG = null;
let CURRENT_USER_ID = null;

/* =========================================
 * 入口：初始化 & 首次渲染
 * 진입점: 초기화 & 최초 렌더링
 * ========================================= */
(async function main() {
  // 读取当前用户 | 현재 사용자 조회
  const { data:{ user } } = await supabase.auth.getUser();
  CURRENT_USER_ID = user?.id || null;

  // 关闭浏览器原生表单校验（用我们自己的 JS 校验）
  // 브라우저 기본 폼 검증 비활성화(커스텀 JS 검증 사용)
  formEl?.setAttribute('novalidate', 'true');

  // 监听登录状态变化：变化时刷新列表
  // 로그인 상태 변경 감지: 변경 시 목록 새로고침
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const newId = session?.user?.id || null;
    if (newId !== CURRENT_USER_ID) {
      CURRENT_USER_ID = newId;
      await reload();
    }
  });

  // 取 URL 中的 slug | URL에서 slug 추출
  SLUG = new URLSearchParams(location.search).get('id')?.trim();
  if (!SLUG) return fail('URL에 id=slug 가 없습니다.');

  // 通过 slug 查询 game_id | slug로 game_id 조회
  const { data: gameRow, error: gErr } = await supabase
    .from('Games')
    .select('game_id')
    .eq('slug', SLUG)
    .single();
  if (gErr || !gameRow?.game_id) {
    console.error('게임 조회 실패:', gErr);
    return fail('게임을 찾을 수 없습니다.');
  }
  GAME_ID = gameRow.game_id;

  bindEvents();
  await reload();
})();

/* =========================================
 * 事件绑定 / 이벤트 바인딩
 * ========================================= */
function bindEvents() {
  // 排序切换 | 정렬 전환
  sortBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('active')) return;
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.sort; // time | reco
      await reload();
    });
  });

  // “更多”分页 | 더보기 페이지네이션
  loadMoreBtn?.addEventListener('click', async () => {
    page += 1;
    await fetchAndRender({ append: true });
  });

  // 未登录时点击“评价”跳登录 | 미로그인 시 '평가' 클릭 → 로그인 이동
  submitBtn?.addEventListener('click', async (e) => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { e.preventDefault(); location.href = loginURL; }
  });

  // 提交顶层评论 | 상단 댓글 제출
  formEl?.addEventListener('submit', onSubmitComment);

  // 点赞/点踩（顶层+回帖共用）| 추천/비추천 (상단+대댓글 공용)
  listEl.addEventListener('click', onVoteClick);

  // 展开/收起回帖 | 대댓글 펼치기/접기
  listEl.addEventListener('click', onRepliesToggle);

  // 提交“写回帖”（事件委托）| 대댓글 작성 제출 (이벤트 위임)
  listEl.addEventListener('submit', onReplySubmit);
}

/* ===================================================
 * 发表评论：每个用户对同一游戏仅能发表一次顶层评论
 * 댓글 작성: 유저당 게임별 상단 댓글 1회 제한
 * =================================================== */
async function onSubmitComment(e) {
  e.preventDefault();

  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) { location.href = loginURL; return; }
  if (!GAME_ID) { alert('game_id 를 찾을 수 없습니다.'); return; }

  const fd = new FormData(formEl);

  // ⭐ 星级校验：未选则为 null（自定义弹窗+滚动至星级区域）
  // ⭐ 별점 검증: 미선택이면 null (커스텀 알럿 + 별점 영역 스크롤)
  const ratingRaw = fd.get('rating');
  if (ratingRaw === null) {
    alert('별점을 선택해 주세요.'); // 请选择星级
    formEl.querySelector('.rating')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const rating = Number(ratingRaw);

  // 👍/👎 推荐校验：未选则为 null（自定义弹窗+滚动至推荐区域）
  // 👍/👎 추천 검증: 미선택이면 null (커스텀 알럿 + 추천 영역 스크롤)
  const recRaw = fd.get('is_recommended');
  if (recRaw === null) {
    alert('추천/비추천을 선택해 주세요.'); // 请选择推荐/不推荐
    formEl.querySelector('.recommend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const isRecommended = Number(recRaw); // 1 or 0

  // 📝 评论内容 | 댓글 내용
  const content = String(fd.get('comment') || '').trim();
  if (!content) {
    alert('내용을 입력해 주세요.'); // 请输入内容
    formEl.querySelector('textarea[name="comment"]')?.focus();
    return;
  }

  // 友好前置检查（数据库已有唯一约束兜底）
  // 사전 확인 (DB의 유니크 제약으로 최종 보강)
  const { count: existed } = await supabase
    .from('Comments')
    .select('comment_id', { count: 'exact', head: true })
    .eq('game_id', GAME_ID)
    .eq('user_id', user.id)
    .is('parent_comment_id', null);
  if ((existed ?? 0) > 0) {
    alert('이미 이 게임을 평가하셨습니다. (한 사용자는 한 게임에 한 번만 평가할 수 있어요)');
    return;
  }

  const { error } = await supabase.from('Comments').insert({
    game_id: GAME_ID,
    user_id: user.id,
    rating,
    content,
    is_recommended: isRecommended,
    parent_comment_id: null
  });

  if (error) {
    if (error.code === '23505' || /duplicate key|unique/i.test(error.message)) {
      alert('이미 이 게임을 평가하셨습니다. (한 사용자는 한 게임에 한 번만 평가할 수 있어요)');
    } else {
      alert('저장 실패: ' + error.message);
    }
    return;
  }

  formEl.reset();
  await reload();
}

/* =========================================
 * 投票：必须登录；不能给自己投
 * 투표: 로그인 필수; 자기 댓글 투표 금지
 * ========================================= */
function voteKey(commentId, type) { return `ggc_vote_${commentId}_${type}`; }

async function onVoteClick(e) {
  const btn = e.target.closest('.vote-btn');
  if (!btn) return;

  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) {
    alert('로그인 후 이용할 수 있어요.');
    location.href = loginURL;
    return;
  }

  // 自己的评论禁止投票 | 본인 댓글 투표 금지
  const card = btn.closest('[data-owner]');
  const ownerId = card?.dataset.owner;
  if (ownerId && ownerId === user.id) {
    alert('본인 댓글에는 추천/비추천을 할 수 없어요.');
    return;
  }

  const commentId = btn.dataset.id;
  const want = btn.classList.contains('like') ? 1 : -1;

  // 查询我对该评论的现有投票 | 내 기존 투표 조회
  const { data: existing, error: qErr } = await supabase
    .from('CommentVotes')
    .select('vote_id, value')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (qErr) {
    console.warn('read vote error:', qErr);
    alert('처리 중 오류가 발생했습니다.');
    return;
  }

  let opErr = null;

  if (!existing) {
    // 首投 | 첫 투표
    const { error } = await supabase.from('CommentVotes').insert({
      comment_id: commentId,
      user_id: user.id,
      value: want
    });
    opErr = error;
  } else if (existing.value === want) {
    // 再点同方向 = 取消投票 | 동일 방향 재클릭 = 투표 취소
    const { error } = await supabase
      .from('CommentVotes')
      .delete()
      .eq('vote_id', existing.vote_id);
    opErr = error;
  } else {
    // 反向改票 | 반대 방향으로 변경
    const { error } = await supabase
      .from('CommentVotes')
      .update({ value: want })
      .eq('vote_id', existing.vote_id);
    opErr = error;
  }

  if (opErr) {
    alert('투표 실패: ' + opErr.message);
    return;
  }

  // DB 触发器会更新 like_count/dislike_count，刷新以反映最新计数与高亮
  // DB 트리거가 카운트를 갱신하므로, 새로고침으로 최신 수/하이라이트 반영
  await reload();
}

/* =========================================
 * 回帖展开/收起（点击 💬 按钮）
 * 대댓글 펼치기/접기 (💬 버튼)
 * ========================================= */
async function onRepliesToggle(e){
  const t = e.target.closest('.replies-toggle');
  if (!t) return;

  const parentId = t.dataset.id;
  if (!parentId) return;

  const box = document.getElementById(`replies-${parentId}`);
  if (!box) return;

  // 使用 .hidden 类来控制开合（与 CSS 保持一致）
  // CSS의 .hidden 클래스로 토글 (CSS와 일치)
  const isHidden = box.classList.contains('hidden') || box.hasAttribute('hidden');

  if (isHidden) {
    // 首次展开时加载（只加载一次）
    // 최초 펼칠 때 로드(한 번만)
    if (!box.dataset.loaded) {
      await loadReplies(parentId, box);
      box.dataset.loaded = '1';
    }
    box.classList.remove('hidden');
    box.removeAttribute('hidden');
    t.setAttribute('aria-expanded','true');
  } else {
    // 收起 | 접기
    box.classList.add('hidden');
    t.setAttribute('aria-expanded','false');
  }
}

/* =========================================
 * 写回帖：事件委托（回帖表单在每个父评论里）
 * 대댓글 작성: 이벤트 위임 (부모 댓글별 폼)
 * ========================================= */
async function onReplySubmit(e){
  const form = e.target.closest('.reply-form');
  if (!form) return;
  e.preventDefault();

  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) { alert('로그인 후 이용할 수 있어요.'); location.href = loginURL; return; }

  const parentId = form.dataset.parent;
  const ta = form.querySelector('textarea');
  const content = String(ta?.value || '').trim();
  if (!content) { alert('내용을 입력해 주세요.'); return; }

  const { error } = await supabase
    .from('Comments')
    .insert({
      game_id: GAME_ID,
      user_id: user.id,
      content,
      parent_comment_id: parentId
    });

  if (error) {
    alert('등록 실패: ' + error.message);
    return;
  }

  if (ta) ta.value = '';

  // 重新加载该父评论的回帖并更新“数量徽标”
  // 해당 부모의 대댓글을 다시 로드하고 "개수 배지" 갱신
  const box = document.getElementById(`replies-${parentId}`);
  if (box) {
    const count = await loadReplies(parentId, box);
    const toggle = document.querySelector(`.replies-toggle[data-id="${parentId}"] .reply-count`);
    if (toggle) toggle.textContent = String(count);
  }
}

/* =======================================================
 * 加载 & 渲染回帖（竖向下拉 + 内嵌编辑框 + 我的投票高亮）
 * 대댓글 로딩/렌더링 (세로 펼침 + 내 투표 하이라이트)
 * ======================================================= */
async function loadReplies(parentId, box){
  // 取回帖列表 | 대댓글 목록 조회
  const { data: replies, error } = await supabase
    .from('Comments')
    .select('comment_id,user_id,content,created_at,like_count,dislike_count')
    .eq('parent_comment_id', parentId)
    .order('created_at', { ascending: true });

  if (error) {
    box.innerHTML = `<div class="empty-replies">불러오기 실패</div>`;
    return 0;
  }

  // 批量取用户资料 | 사용자 정보 일괄 조회
  const uids = [...new Set((replies||[]).map(r => r.user_id))];
  let uMap = new Map();
  if (uids.length){
    const { data: users } = await supabase
      .from(USERS_TABLE)
      .select(`${USER_PK_COL}, nickname, profile_image_url`)
      .in(USER_PK_COL, uids);
    uMap = new Map((users||[]).map(u => [u[USER_PK_COL], u]));
  }

  // 取“我对这些回帖”的投票，用于高亮 | 내 대댓글 투표값 하이라이트용
  let voteMap = new Map();
  if (CURRENT_USER_ID && replies?.length){
    const ids = replies.map(r => r.comment_id);
    const { data: myVotes } = await supabase
      .from('CommentVotes')
      .select('comment_id,value')
      .eq('user_id', CURRENT_USER_ID)
      .in('comment_id', ids);
    voteMap = new Map((myVotes||[]).map(v => [v.comment_id, v.value]));
  }

  // 顶部：回帖编辑框（登录后显示）
  // 상단: 대댓글 입력 폼 (로그인 시 노출)
  const composer = CURRENT_USER_ID
    ? `
      <form class="reply-form" data-parent="${parentId}">
        <div class="reply-form-row">
          <textarea name="reply" placeholder="답글을 입력해 주세요" required></textarea>
          <button type="submit" class="btn reply-send">게시</button>
        </div>
      </form>`
    : `<div class="reply-login-hint">로그인 후 답글을 작성할 수 있어요.</div>`;

  // 列表项 | 목록 아이템
  const items = (replies||[]).map(r => {
    const u = uMap.get(r.user_id) || {};
    const likeAct    = voteMap.get(r.comment_id) === 1  ? 'active' : '';
    const dislikeAct = voteMap.get(r.comment_id) === -1 ? 'active' : '';
    const avatar = (u.profile_image_url && typeof u.profile_image_url === 'string')
      ? u.profile_image_url
      : `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(r.user_id||'anon')}`;

    // 登录/本人禁投 UI 属性 | 로그인/본인 금지 UI 속성
    const needLogin = !CURRENT_USER_ID;
    const isOwn     = CURRENT_USER_ID && r.user_id === CURRENT_USER_ID;
    const disable   = needLogin || isOwn;
    const titleTip  = needLogin ? '로그인 후 이용할 수 있어요.' : (isOwn ? '본인 댓글에는 추천/비추천을 할 수 없어요.' : '');
    const disAttr   = disable ? `disabled aria-disabled="true" title="${titleTip}"` : '';
    const disCls    = disable ? ' disabled' : '';

    return `
      <article class="reply-card" data-id="${r.comment_id}" data-owner="${r.user_id}">
        <div class="avatar"><img src="${esc(avatar)}" alt=""></div>

        <div class="reply-main">
          <div class="reply-user">${esc(u.nickname || '익명')}</div>
          <p class="reply-content">${esc(r.content || '')}</p>
          <time class="reply-time">${r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : ''}</time>
        </div>

        <div class="reply-actions-top">
          <button class="vote-btn small like ${likeAct}${disCls}" data-id="${r.comment_id}" ${disAttr}>
            👍 <span class="count">${r.like_count ?? 0}</span>
          </button>
          <button class="vote-btn small dislike ${dislikeAct}${disCls}" data-id="${r.comment_id}" ${disAttr}>
            👎 <span class="count">${r.dislike_count ?? 0}</span>
          </button>
        </div>
      </article>
    `;
  }).join('');

  box.innerHTML = composer + items;
  return replies?.length || 0;
}

/* =========================================
 * 列表重载 / 목록 새로고침
 * ========================================= */
async function reload() {
  page = 0;
  setLoading(true);
  await fetchAndRender({ append: false });
}

/* =====================================================
 * 顶层评论：分页查询 + 合并资料 + 高亮我的投票 + 渲染
 * 상단 댓글: 페이지 조회 + 사용자 병합 + 내 투표 하이라이트 + 렌더
 * ===================================================== */
async function fetchAndRender({ append }) {
  const orderCol = (sortMode === 'reco') ? 'like_count' : 'created_at';
  const ascending = false;

  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // 只取顶层（parent_comment_id IS NULL）
  // 상단 댓글만 조회 (parent_comment_id IS NULL)
  const { data: comments, error, count } = await supabase
    .from('Comments')
    .select('comment_id, user_id, content, rating, like_count, dislike_count, is_recommended, reply_count, created_at', { count: 'exact' })
    .eq('game_id', GAME_ID)
    .is('parent_comment_id', null)
    .order(orderCol, { ascending })
    .range(from, to);

  if (error) {
    setError('댓글을 불러올 수 없습니다: ' + error.message);
    toggleLoadMore(false);
    return;
  }

  // 批量取用户 | 사용자 일괄 조회
  const userIds = Array.from(new Set((comments || []).map(r => r.user_id).filter(Boolean)));
  let profileMap = new Map();
  if (userIds.length) {
    const { data: users } = await supabase
      .from(USERS_TABLE)
      .select(`${USER_PK_COL}, nickname, profile_image_url`)
      .in(USER_PK_COL, userIds);
    profileMap = new Map((users||[]).map(u => [u[USER_PK_COL], u]));
  }

  // 我对“本页顶层评论”的投票（用于高亮）| 내 상단 댓글 투표값(하이라이트)
  let topVotesMap = new Map();
  if (CURRENT_USER_ID && comments?.length) {
    const ids = comments.map(c => c.comment_id);
    const { data: myVotes } = await supabase
      .from('CommentVotes')
      .select('comment_id,value')
      .eq('user_id', CURRENT_USER_ID)
      .in('comment_id', ids);
    topVotesMap = new Map((myVotes||[]).map(v => [v.comment_id, v.value]));
  }

  // 合并并渲染 | 병합 후 렌더
  const rows = (comments || []).map(r => {
    const u = profileMap.get(r.user_id);
    const nickname = u?.nickname || ('User-' + String(r.user_id || '').slice(0, 8));
    const avatar   = (u?.profile_image_url && typeof u.profile_image_url === 'string')
      ? u.profile_image_url
      : `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(r.user_id || 'anon')}`;
    const myVote   = topVotesMap.get(r.comment_id) || 0; // 1 / -1 / 0
    return renderItem({ ...r, nickname, avatar, myVote });
  });

  const html = rows.join('');
  if (append) {
    listEl?.insertAdjacentHTML('beforeend', html);
  } else {
    listEl.innerHTML = html || '<p class="empty">아직 댓글이 없어요. 첫 평가를 남겨 보세요!</p>';
  }

  // “更多”按钮显隐 | 더보기 버튼 표시/숨김
  const shown = Math.min(to + 1, count ?? 0);
  toggleLoadMore(!!count && shown < count);

  setLoading(false);
}

/* =====================================================
 * 单条顶层评论模板 | 상단 댓글 템플릿
 * ===================================================== */
function renderItem(r) {
  const starsNum = Number(r.rating || 0);
  const sideStars = Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < starsNum ? 'on' : 'off'}">★</span>`
  ).join('');

  const timeTxt = r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '';
  const like    = r.like_count ?? 0;
  const dislike = r.dislike_count ?? 0;
  const recYes  = Number(r.is_recommended) === 1;

  // 未登录/本人 禁投 | 미로그인/본인 금지
  const needLogin   = !CURRENT_USER_ID;
  const isOwn       = CURRENT_USER_ID && r.user_id === CURRENT_USER_ID;
  const disableVote = needLogin || isOwn;
  const reason = needLogin
    ? '로그인 후 이용할 수 있어요.'
    : '본인 댓글에는 추천/비추천을 할 수 없어요.';
  const disAttr = disableVote ? `disabled aria-disabled="true" title="${reason}"` : '';
  const disCls  = disableVote ? ' disabled' : '';

  const likeAct    = r.myVote === 1  ? 'active' : '';
  const dislikeAct = r.myVote === -1 ? 'active' : '';

  return `
    <article class="review-card" data-id="${r.comment_id}" data-owner="${r.user_id}">
      <!-- 左：头像 | 좌: 아바타 -->
      <div class="avatar">
        <img src="${esc(r.avatar)}" alt="" />
      </div>

      <!-- 中：昵称/时间/内容/投票 + 回帖按钮 | 중앙: 닉네임/시간/내용/투표 + 대댓글 버튼 -->
      <div class="review-meta">
        <div class="review-headline">
          <strong class="review-user">${esc(r.nickname)}</strong>
          <time class="review-time" datetime="${r.created_at || ''}">${esc(timeTxt)}</time>
        </div>

        <p class="review-content">${esc(r.content || '')}</p>

        <div class="review-actions-row">
          <button class="vote-btn like ${likeAct}${disCls}" data-id="${r.comment_id}" ${disAttr} aria-label="추천">
            👍 <span class="count">${like}</span>
          </button>
          <button class="vote-btn dislike ${dislikeAct}${disCls}" data-id="${r.comment_id}" ${disAttr} aria-label="비추천">
            👎 <span class="count">${dislike}</span>
          </button>

          <!-- 回帖开关按钮 / 대댓글 토글 버튼 -->
          <button class="replies-toggle" data-id="${r.comment_id}" aria-expanded="false" title="답글 보기">
            💬 <span class="reply-count">${r.reply_count || 0}</span>
          </button>
        </div>

        <!-- 回帖列表容器：默认隐藏（用 .hidden 控制） -->
        <!-- 대댓글 영역: 기본 숨김 (.hidden 제어) -->
        <div class="replies hidden" id="replies-${r.comment_id}"></div>
      </div>

      <!-- 右：推荐与星级 | 우: 추천/별점 -->
      <aside class="review-side">
        <div class="rec-icon ${recYes ? 'rec-yes' : 'rec-no'}" title="${recYes ? '추천' : '비추천'}">
          ${recYes ? '👍' : '👎'}
        </div>
        <div class="side-stars">${sideStars}</div>
      </aside>
    </article>
  `;
}

/* ================================
 * 工具函数 / 유틸 함수
 * ================================ */
function setLoading(on) {
  if (on) listEl.innerHTML = '<div class="loading">불러오는 중…</div>';
}
function setError(msg) {
  listEl.innerHTML = `<p class="error">${esc(msg)}</p>`;
}
function toggleLoadMore(show) {
  if (!loadMoreBtn) return;
  loadMoreBtn.style.display = show ? '' : 'none';
}
function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function fail(msg){ setError(msg); }
