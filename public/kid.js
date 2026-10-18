'use strict';
const $ = s => document.querySelector(s);
let kid = null;
let gifts = [];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = t => new Date(t).toLocaleString('zh-CN', { hour12: false });
const statusText = s => ({ pending: '⏳ 待审核', approved: '✅ 已通过', rejected: '❌ 已驳回' }[s] || s);

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (ok ? '' : ' err');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.className = 'toast', 2600);
}

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '哎呀，网络开小差了，请稍后再试哦');
  return d;
}

/* ---------------- 名字登录 ---------------- */
async function showLogin() {
  $('#mainView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  $('#loginErr').classList.add('hidden');
  $('#loginName').focus();
}

function showLoginErr(msg) {
  const e = $('#loginErr');
  e.textContent = msg;
  e.classList.remove('hidden');
}

async function doLogin() {
  const name = $('#loginName').value.trim();
  if (!name) { showLoginErr('请输入名字哦~'); return; }
  try {
    const d = await api('/api/kid/login', { method: 'POST', body: JSON.stringify({ name }) });
    localStorage.setItem('kidId', d.id);
    $('#loginName').value = '';
    initMain();
  } catch (e) { showLoginErr(e.message); }
}
$('#btnLogin').onclick = doLogin;
$('#loginName').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

/* ---------------- 主界面 ---------------- */
async function initMain() {
  try {
    const d = await api(`/api/kid/${localStorage.getItem('kidId')}/home`);
    kid = d.kid;
    gifts = d.gifts;
    $('#loginView').classList.add('hidden');
    $('#mainView').classList.remove('hidden');
    $('#kidAvatar').textContent = kid.avatar;
    $('#kidName').textContent = kid.name;
    renderPoints();
    renderGifts();
  } catch (e) {
    localStorage.removeItem('kidId');
    showLogin();
  }
}

function renderPoints() { $('#kidPoints').textContent = kid.points; }

function giftMedia(g, cls) {
  return g.image
    ? `<img src="${esc(g.image)}" alt="">`
    : `<span class="${cls}">${g.emoji || '🎁'}</span>`;
}

function renderGifts() {
  $('#giftGrid').innerHTML = gifts.map(g => {
    const enough = kid.points >= g.points;
    return `
    <div class="gift-card ${enough ? '' : 'not-enough'}">
      <div class="gift-media">${giftMedia(g, 'gift-emoji')}</div>
      <div class="gift-name">${esc(g.name)}</div>
      <div class="gift-points">⭐ ${g.points} 分</div>
      <button class="btn-redeem" data-id="${g.id}">${enough ? '申请兑换' : '积分不够'}</button>
    </div>`;
  }).join('') || '<p class="empty">货架整理中，稍后再来看看吧~</p>';
  $('#giftGrid').querySelectorAll('.btn-redeem').forEach(b => {
    b.onclick = () => confirmRedeem(gifts.find(g => g.id == b.dataset.id));
  });
}

/* ---------------- 兑换弹窗 ---------------- */
let modalOkCb = null;
function openModal(title, bodyHtml, okText, cb) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalOk').textContent = okText || '确定';
  modalOkCb = cb;
  $('#modalMask').classList.remove('hidden');
}
function closeModal() { $('#modalMask').classList.add('hidden'); modalOkCb = null; }
$('#modalCancel').onclick = closeModal;
$('#modalMask').onclick = e => { if (e.target === $('#modalMask')) closeModal(); };
$('#modalOk').onclick = () => { const cb = modalOkCb; closeModal(); cb && cb(); };

function confirmRedeem(g) {
  if (!g) return;
  if (kid.points < g.points) {
    toast(`同学，积分还不够哦！兑换「${g.name}」需要 ${g.points} 分，你目前只有 ${kid.points} 分，继续加油！`, false);
    return;
  }
  openModal(
    '同学，要兑换这个礼物吗？',
    `<div class="redeem-preview">${giftMedia(g, '')}</div>
     <p style="font-weight:800;color:#111827">${esc(g.name)}</p>
     <p>需要 ⭐ ${g.points} 分，兑换后还剩 <b>${kid.points - g.points}</b> 分<br>提交后老师会尽快审核哦</p>`,
    '提交申请',
    async () => {
      try {
        await api(`/api/kid/${kid.id}/redeem`, { method: 'POST', body: JSON.stringify({ giftId: g.id }) });
        toast('申请提交成功，请耐心等待老师审核哦 🎉');
      } catch (e) { toast(e.message, false); }
    });
}

/* ---------------- Tab 切换 ---------------- */
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  const tab = t.dataset.tab;
  $('#tab-shelf').classList.toggle('hidden', tab !== 'shelf');
  $('#tab-records').classList.toggle('hidden', tab !== 'records');
  if (tab === 'records') loadRecords();
});

async function loadRecords() {
  try {
    const d = await api(`/api/kid/${kid.id}/records`);
    kid = d.kid;
    renderPoints();
    $('#historyList').innerHTML = d.history.map(h => `
      <div class="record-row">
        <div class="record-main">
          <span class="record-title">${esc(h.reason)}</span>
          <span class="record-time">${fmt(h.time)}</span>
        </div>
        <span class="delta ${h.delta >= 0 ? 'plus' : 'minus'}">${h.delta >= 0 ? '+' : ''}${h.delta}</span>
      </div>`).join('') || '<p class="empty">还没有积分记录哦，继续加油赚积分吧~</p>';
    $('#requestList').innerHTML = d.requests.map(r => `
      <div class="record-row">
        <div class="record-main">
          <span class="record-title">${esc(r.giftName)}（⭐${r.giftPoints} 分）</span>
          <span class="record-time">${fmt(r.createdAt)}</span>
        </div>
        <span class="chip chip-${r.status}">${statusText(r.status)}</span>
      </div>`).join('') || '<p class="empty">还没有兑换申请哦，去挑一件喜欢的礼物吧~</p>';
  } catch (e) { toast(e.message, false); }
}

$('#btnLogout').onclick = () => { localStorage.removeItem('kidId'); showLogin(); };

/* ---------------- 启动 ---------------- */
(async () => {
  if (localStorage.getItem('kidId')) initMain();
  else showLogin();
})();
