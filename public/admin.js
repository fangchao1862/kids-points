'use strict';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const AVATARS = ['🦊', '🐼', '🐯', '🐰', '🐻', '🐸', '🐵', '🐧', '🦁', '🐨', '🐷', '🐤', '🦄', '🐙', '🐬', '🦕'];

let token = localStorage.getItem('adminToken') || '';
let reqStatus = 'pending';
let editingGift = null;   // null=新增, 数字=编辑中的礼品 id
let giftImage = '';       // 已上传图片 url
let pointsKid = null;     // 积分弹窗对应的小朋友
let avatarIdx = 0;

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
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, ...opts });
  if (r.status === 401) { showLogin(); throw new Error('登录已过期，请重新登录'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '网络开小差了，请稍后再试');
  return d;
}

/* ---------------- 登录 ---------------- */
function showLogin() {
  $('#mainView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
}
function showMain() {
  $('#loginView').classList.add('hidden');
  $('#mainView').classList.remove('hidden');
  switchView('requests');
  loadRequests();
  loadGifts();
  loadKids();
  loadQr();
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#loginPwd').value }) });
    token = d.token;
    localStorage.setItem('adminToken', token);
    $('#loginPwd').value = '';
    showMain();
  } catch (err) { toast(err.message, false); }
};
$('#btnLogout').onclick = () => { token = ''; localStorage.removeItem('adminToken'); showLogin(); };

/* ---------------- 视图切换 ---------------- */
function switchView(view) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + view));
}
$$('.nav-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));

/* ---------------- 兑换申请 ---------------- */
$$('#reqFilters .filter').forEach(b => b.onclick = () => {
  $$('#reqFilters .filter').forEach(x => x.classList.toggle('active', x === b));
  reqStatus = b.dataset.status;
  loadRequests();
});

function reqMedia(r) {
  return r.giftImage
    ? `<img src="${esc(r.giftImage)}" alt="">`
    : `<span>${r.giftEmoji || '🎁'}</span>`;
}

async function loadRequests() {
  let list = [];
  try { list = await api('/api/admin/requests?status=' + reqStatus); }
  catch (e) { if (token) return; }
  $('#reqList').innerHTML = list.map(r => `
    <div class="req-card">
      <div class="req-media">${reqMedia(r)}</div>
      <div class="req-info">
        <div class="req-title"><b>${esc(r.kidName)}</b> 申请兑换 <b>${esc(r.giftName)}</b></div>
        <div class="req-meta">⭐ ${r.giftPoints} 分 · 申请于 ${fmt(r.createdAt)}</div>
        <span class="chip chip-${r.status}">${statusText(r.status)}${r.reviewedAt ? ' · ' + fmt(r.reviewedAt) : ''}</span>
      </div>
      ${r.status === 'pending' ? `
      <div class="req-actions">
        <button class="btn-reject" data-reject="${r.id}">驳回</button>
        <button class="btn-approve" data-approve="${r.id}">同意</button>
      </div>` : ''}
    </div>`).join('') || `<p class="empty">暂无${statusText(reqStatus).replace(/^.+\s/, '')}的申请</p>`;

  $('#reqList').querySelectorAll('[data-approve]').forEach(b => b.onclick = () => review(b.dataset.approve, 'approve'));
  $('#reqList').querySelectorAll('[data-reject]').forEach(b => b.onclick = () => review(b.dataset.reject, 'reject'));
}

async function review(id, action) {
  try {
    await api(`/api/admin/requests/${id}/${action}`, { method: 'POST' });
    toast(action === 'approve' ? '老师，已同意该申请并扣除相应积分' : '老师，已驳回该申请，积分保持不变');
  } catch (e) { toast(e.message, false); }
  loadRequests();
  loadKids();
}

/* ---------------- 礼品管理 ---------------- */
function gMedia(g) {
  return g.image ? `<img src="${esc(g.image)}" alt="">` : `<span>${g.emoji || '🎁'}</span>`;
}

async function loadGifts() {
  let gifts = [];
  try { gifts = await api('/api/admin/gifts'); } catch (e) { return; }
  $('#giftGrid').innerHTML = gifts.map(g => `
    <div class="g-card ${g.onShelf ? '' : 'off'}">
      ${g.onShelf ? '' : '<span class="off-tag">已下架</span>'}
      <div class="g-media">${gMedia(g)}</div>
      <div class="g-name">${esc(g.name)}</div>
      <div class="g-points">⭐ ${g.points} 分</div>
      <div class="g-ops">
        <button class="op" data-toggle="${g.id}">${g.onShelf ? '下架' : '上架'}</button>
        <button class="op" data-edit="${g.id}">编辑</button>
        <button class="op danger" data-del="${g.id}">删除</button>
      </div>
    </div>`).join('') || '<p class="empty" style="grid-column:1/-1">还没有礼品，点击右上角新增</p>';

  $('#giftGrid').querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const g = gifts.find(x => x.id == b.dataset.toggle);
    try {
      await api(`/api/admin/gifts/${g.id}`, { method: 'PUT', body: JSON.stringify({ onShelf: !g.onShelf }) });
      loadGifts();
    } catch (e) { toast(e.message, false); }
  });
  $('#giftGrid').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    openGiftModal(gifts.find(x => x.id == b.dataset.edit));
  });
  $('#giftGrid').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const g = gifts.find(x => x.id == b.dataset.del);
    if (!confirm(`老师，确定要删除礼品「${g.name}」吗？`)) return;
    try {
      await api(`/api/admin/gifts/${g.id}`, { method: 'DELETE' });
      toast('老师，礼品已删除');
      loadGifts();
    } catch (e) { toast(e.message, false); }
  });
}

function setGiftPreview() {
  $('#giftPreview').innerHTML = giftImage ? `<img src="${esc(giftImage)}">` : ($('#giftEmoji').value || '🎁');
}

function openGiftModal(g) {
  editingGift = g ? g.id : null;
  giftImage = g ? (g.image || '') : '';
  $('#giftModalTitle').textContent = g ? '编辑礼品' : '新增礼品';
  $('#giftName').value = g ? g.name : '';
  $('#giftPoints').value = g ? g.points : '';
  $('#giftEmoji').value = g ? (g.emoji || '') : '';
  $('#giftOnShelf').checked = g ? g.onShelf : true;
  $('#giftFile').value = '';
  setGiftPreview();
  $('#giftModal').classList.remove('hidden');
}
$('#btnAddGift').onclick = () => openGiftModal(null);

$('#giftEmoji').oninput = setGiftPreview;

// 上传前压缩图片（最长边 640px，jpeg 85%），gif 保留原样
async function compressImage(file) {
  if (file.type === 'image/gif') return file;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  const img = await new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => no(new Error('图片读取失败'));
    i.src = URL.createObjectURL(file);
  });
  const MAX = 640;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
  return blob || file;
}

$('#giftFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    toast('图片处理上传中...');
    const img = await compressImage(file);
    const buf = await img.arrayBuffer();
    const r = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': img.type, 'X-Admin-Token': token },
      body: buf,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '老师，图片上传失败了');
    giftImage = d.url;
    setGiftPreview();
    toast('老师，图片上传成功');
  } catch (err) { toast(err.message, false); }
};

$('#giftSave').onclick = async () => {
  try {
    const body = {
      name: $('#giftName').value,
      points: Number($('#giftPoints').value),
      emoji: $('#giftEmoji').value,
      image: giftImage,
      onShelf: $('#giftOnShelf').checked,
    };
    if (editingGift) await api(`/api/admin/gifts/${editingGift}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/admin/gifts', { method: 'POST', body: JSON.stringify(body) });
    $('#giftModal').classList.add('hidden');
    toast('老师，礼品保存成功');
    loadGifts();
  } catch (e) { toast(e.message, false); }
};

/* ---------------- 小朋友账号 ---------------- */
async function loadKids() {
  let kids = [];
  try { kids = await api('/api/admin/kids'); } catch (e) { return; }
  $('#kidList').innerHTML = kids.map(k => `
    <div class="k-card">
      <div class="k-avatar">${k.avatar}</div>
      <div class="k-main">
        <div class="k-name">${esc(k.name)}</div>
        <div class="k-points">当前积分 <b>${k.points}</b> 分</div>
      </div>
      <div class="req-actions">
        <button class="op" data-points="${k.id}">积分</button>
        <button class="op danger" data-delkid="${k.id}">删除</button>
      </div>
    </div>`).join('') || '<p class="empty" style="grid-column:1/-1">还没有小朋友账号</p>';

  $('#kidList').querySelectorAll('[data-points]').forEach(b => b.onclick = () => {
    openPointsModal(kids.find(x => x.id == b.dataset.points));
  });
  $('#kidList').querySelectorAll('[data-delkid]').forEach(b => b.onclick = async () => {
    const k = kids.find(x => x.id == b.dataset.delkid);
    if (!confirm(`老师，确定要删除「${k.name}」的账号吗？删除后孩子端将无法登录（历史记录保留）。`)) return;
    try {
      await api(`/api/admin/kids/${k.id}`, { method: 'DELETE' });
      toast('老师，账号已删除');
      loadKids();
    } catch (e) { toast(e.message, false); }
  });
}

/* 添加小朋友 */
$('#btnAddKid').onclick = () => {
  avatarIdx = Math.floor(Math.random() * AVATARS.length);
  $('#kidAvatarBtn').textContent = AVATARS[avatarIdx];
  $('#kidName').value = '';
  $('#kidModal').classList.remove('hidden');
};
$('#kidAvatarBtn').onclick = () => {
  avatarIdx = (avatarIdx + 1) % AVATARS.length;
  $('#kidAvatarBtn').textContent = AVATARS[avatarIdx];
};
$('#kidSave').onclick = async () => {
  try {
    await api('/api/admin/kids', {
      method: 'POST',
      body: JSON.stringify({ name: $('#kidName').value, avatar: $('#kidAvatarBtn').textContent }),
    });
    $('#kidModal').classList.add('hidden');
    toast('老师，账号创建成功');
    loadKids();
  } catch (e) { toast(e.message, false); }
};

/* 积分调整 */
function openPointsModal(k) {
  pointsKid = k;
  $('#pointsTitle').textContent = `${k.avatar} ${k.name} 的积分`;
  $('#pointsNow').textContent = `当前积分：${k.points} 分`;
  $('#pointsAmount').value = '';
  $('#pointsReason').value = '';
  $('#pointsModal').classList.remove('hidden');
}
$$('#pointsModal .quick-row button').forEach(b => b.onclick = () => { $('#pointsAmount').value = b.dataset.v; });

async function submitPoints(sign) {
  const amount = Number($('#pointsAmount').value);
  try {
    const k = await api(`/api/admin/kids/${pointsKid.id}/points`, {
      method: 'POST',
      body: JSON.stringify({ delta: sign * Math.abs(amount), reason: $('#pointsReason').value }),
    });
    $('#pointsModal').classList.add('hidden');
    toast(`老师，${k.name}现在的积分是 ${k.points} 分`);
    loadKids();
  } catch (e) { toast(e.message, false); }
}
$('#pointsPlus').onclick = () => submitPoints(1);
$('#pointsMinus').onclick = () => submitPoints(-1);

/* ---------------- 二维码（学生端 + 管理员端） ---------------- */
async function loadQr() {
  if (!$('#qrUrl').value) {
    const host = location.hostname;
    let base = location.origin + '/';
    // 本地用局域网 IP（手机同 WiFi 可访问）；已部署公网则直接用当前域名
    if (host === 'localhost' || host === '127.0.0.1') {
      try { base = (await api('/api/network')).url; } catch (e) { /* 用默认 */ }
    }
    $('#qrUrl').value = base;
  }
  updateQr();
}

function updateQr() {
  const base = ($('#qrUrl').value.trim() || location.origin).replace(/\/+$/, '');
  $$('.qrImg').forEach(img => {
    const url = base + img.dataset.path;
    img.src = '/api/qrcode?text=' + encodeURIComponent(url);
  });
  $$('.qr-sub[data-path]').forEach(p => {
    p.textContent = '扫码打开：' + base + p.dataset.path;
  });
}

$('#btnQrRefresh').onclick = updateQr;
$('#qrUrl').onchange = updateQr;

$('#btnQrPrint').onclick = () => {
  const base = ($('#qrUrl').value.trim() || location.origin).replace(/\/+$/, '');
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>积分礼物小卖部 · 访问二维码</title>
    <body style="text-align:center;font-family:sans-serif">
    <div style="page-break-after:always;padding:30px">
      <h2>🧒 学生端 · 礼物货架</h2>
      <img src="/api/qrcode?text=${encodeURIComponent(base + '/')}" style="width:330px;height:330px">
      <p style="color:#555;word-break:break-all">${base}/</p>
    </div>
    <div style="padding:30px">
      <h2>🛠 管理员端 · 管理后台</h2>
      <img src="/api/qrcode?text=${encodeURIComponent(base + '/admin')}" style="width:330px;height:330px">
      <p style="color:#555;word-break:break-all">${base}/admin</p>
    </div>
    </body>`);
  w.document.close();
  setTimeout(() => w.print(), 800);
};

/* ---------------- 修改密码 ---------------- */
$('#btnPwd').onclick = () => { $('#pwdNew').value = ''; $('#pwdModal').classList.remove('hidden'); };
$('#pwdSave').onclick = async () => {
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ password: $('#pwdNew').value }) });
    $('#pwdModal').classList.add('hidden');
    toast('老师，密码已修改，下次登录请用新密码哦');
  } catch (e) { toast(e.message, false); }
};

/* ---------------- 弹窗关闭 ---------------- */
$$('.mask [data-close]').forEach(b => b.onclick = () => b.closest('.mask').classList.add('hidden'));
$$('.mask').forEach(m => m.onclick = e => { if (e.target === m) m.classList.add('hidden'); });

/* ---------------- 轮询：新申请提醒 ---------------- */
async function refreshBadge() {
  try {
    const o = await api('/api/admin/overview');
    const badge = $('#pendingBadge');
    if (o.pending > 0) { badge.textContent = o.pending; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
    // 申请页自动刷新
    if (!$('#view-requests').classList.contains('hidden')) loadRequests();
  } catch (e) { /* 未登录时忽略 */ }
}
setInterval(refreshBadge, 8000);

/* ---------------- 启动 ---------------- */
(async () => {
  if (token) {
    try { await api('/api/admin/overview'); showMain(); return; } catch (e) { token = ''; localStorage.removeItem('adminToken'); }
  }
  showLogin();
})();
