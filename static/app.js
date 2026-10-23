'use strict';

const FAV_KEY = 'news_favs_v1';
const itemRegistry = {};
let favs = loadFavs();
let newsIds = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadFavs() {
  try {
    const a = JSON.parse(localStorage.getItem(FAV_KEY));
    if (Array.isArray(a)) {
      return a.map((f) => {
        if (f.src === '财联社') f.url = 'https://www.cls.cn/detail/' + f.id;
        return f;
      });
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveFavs() {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

function fmtRead(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

function shortTimeHM(t) {
  if (!t) return '--';
  const parts = String(t).split(' ');
  const seg = parts.length > 1 ? parts[1] : parts[0];
  return seg.slice(0, 5);
}

function isFav(item) {
  return favs.some((f) => f.fid === item.fid);
}

function starHtml(item) {
  const on = isFav(item);
  return `<button class="fav-btn${on ? ' on' : ''}" data-fav="${esc(item.fid)}" title="${on ? '取消收藏' : '收藏'}">${on ? '★' : '☆'}</button>`;
}

function renderImportant(data) {
  const box = $('important');
  box.innerHTML = '';
  const items = (data && data.items) || [];
  if (!items.length) {
    box.innerHTML = '<div class="empty">正在加载重要消息…</div>';
  }
  items.forEach((it, i) => {
    const item = { fid: 'cls:' + it.id, id: it.id, src: '财联社', text: it.text, time: it.time, url: it.url || '' };
    itemRegistry[item.fid] = item;
    let lvl = '';
    if (it.level === 'A') lvl = '<span class="lvl-tag">重磅</span>';
    else if (it.level === 'B') lvl = '<span class="lvl-tag b">关注</span>';
    const read = fmtRead(it.reading_num);
    const div = document.createElement('div');
    div.className = 'imp-item';
    div.innerHTML = `
      <div class="imp-rank">${i + 1}</div>
      <div class="imp-body">
        <div class="imp-text">${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.text)}</a>` : esc(item.text)}</div>
        <div class="imp-meta">${lvl}<span class="read">阅读 ${esc(read)}</span><span class="dot">·</span><span>${esc(it.time)}</span></div>
      </div>
      ${starHtml(item)}`;
    box.appendChild(div);
  });
  $('cls-updated').textContent = items.length ? '前 ' + items.length + ' · 24h 共 ' + ((data && data.total) || 0) + ' 条' : '--';
}

function renderNews(items) {
  const box = $('news');
  box.innerHTML = '';
  const first = newsIds === null;
  if (first) newsIds = new Set();
  const newSet = new Set();
  for (const it of items) {
    const isNew = !first && it.id != null && !newsIds.has(it.id);
    newSet.add(it.id);
    const item = { fid: 'sina:' + it.id, id: it.id, src: '新浪', text: it.text, time: it.time, url: it.url || '' };
    itemRegistry[item.fid] = item;
    const div = document.createElement('div');
    div.className = 'news-item' + (isNew ? ' fresh' : '');
    const tags = (it.tags || []).map((t) => `<span class="news-tag">${esc(t)}</span>`).join('');
    const text = item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.text)}</a>` : esc(item.text);
    div.innerHTML = `
      <div class="news-time">${esc(shortTimeHM(item.time))}</div>
      <div class="news-body"><div class="news-text">${text}<span class="news-tags">${tags}</span></div></div>
      ${starHtml(item)}`;
    box.appendChild(div);
  }
  newsIds = newSet;
  $('news-updated').textContent = items.length ? '已更新 ' + items.length + ' 条' : '--';
}

function renderFavs() {
  const box = $('favs');
  box.innerHTML = '';
  if (!favs.length) {
    box.innerHTML = '<div class="empty">还没有收藏，点任意消息右侧的 ☆ 即可收藏</div>';
    return;
  }
  for (const f of favs.slice().reverse()) {
    const item = { fid: f.fid, id: f.id, src: f.src, text: f.text, time: f.time, url: f.url || '' };
    itemRegistry[item.fid] = item;
    const div = document.createElement('div');
    div.className = 'news-item';
    const text = f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.text)}</a>` : esc(f.text);
    div.innerHTML = `
      <div class="news-time">${esc(shortTimeHM(f.time))}</div>
      <div class="news-body"><div class="news-text">${text}<span class="news-src">${esc(f.src)}</span></div></div>
      ${starHtml(item)}`;
    box.appendChild(div);
  }
}

function updateFavBadge() {
  const n = favs.length;
  $('fav-count').textContent = n;
  $('fav-count-head').textContent = n + ' 条';
}

function openDrawer() {
  renderFavs();
  $('fav-drawer').classList.add('open');
  $('drawer-overlay').classList.add('open');
}

function closeDrawer() {
  $('fav-drawer').classList.remove('open');
  $('drawer-overlay').classList.remove('open');
}

function onFavClick(e) {
  const btn = e.target.closest('.fav-btn');
  if (!btn) return;
  const item = itemRegistry[btn.dataset.fav];
  if (!item) return;
  const on = !btn.classList.contains('on');
  if (on) {
    favs.push({ fid: item.fid, id: item.id, src: item.src, text: item.text, time: item.time, url: item.url || '' });
  } else {
    favs = favs.filter((f) => f.fid !== item.fid);
  }
  saveFavs();
  document.querySelectorAll('.fav-btn').forEach((b) => {
    if (b.dataset.fav === item.fid) {
      b.classList.toggle('on', on);
      b.textContent = on ? '★' : '☆';
      b.title = on ? '取消收藏' : '收藏';
    }
  });
  updateFavBadge();
  renderFavs();
}

function setConnection(ok) {
  const pill = $('connection');
  if (ok) {
    pill.textContent = '● 已连接';
    pill.className = 'status-pill ok';
  } else {
    pill.textContent = '● 连接中断，重试中';
    pill.className = 'status-pill err';
  }
}

async function refreshCls() {
  try {
    const data = await api('/api/cls');
    renderImportant(data);
    setConnection(true);
  } catch (e) {
    setConnection(false);
  }
}

async function refreshNews() {
  try {
    const data = await api('/api/news');
    renderNews(data.items || []);
    setConnection(true);
  } catch (e) {
    setConnection(false);
  }
}

/* ---------- 市场状态与时钟 ---------- */
function zonedHM(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return ((parseInt(g('hour'), 10) % 24) * 60) + parseInt(g('minute'), 10);
}

function weekdayIn(tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    .formatToParts(new Date());
  return parts.find((p) => p.type === 'weekday').value;
}

function updateMarketStatus() {
  const cn = zonedHM('Asia/Shanghai');
  const cnDay = weekdayIn('Asia/Shanghai');
  const hk = zonedHM('Asia/Hong_Kong');
  const hkDay = weekdayIn('Asia/Hong_Kong');
  const us = zonedHM('America/New_York');
  const usDay = weekdayIn('America/New_York');
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes;

  setMarket($('mkt-cn'), weekday(cnDay) && ((cn >= 570 && cn <= 690) || (cn >= 780 && cn <= 900)));
  setMarket($('mkt-hk'), weekday(hkDay) && ((hk >= 570 && hk <= 720) || (hk >= 780 && hk <= 960)));
  setMarket($('mkt-us'), weekday(usDay) && (us >= 570 && us <= 960));
}

function setMarket(el, open) {
  const b = el.querySelector('b');
  el.classList.toggle('open', open);
  el.classList.toggle('closed', !open);
  b.textContent = open ? '交易中' : '休市';
}

function tickClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------- 启动 ---------- */
function init() {
  document.addEventListener('click', onFavClick);
  $('refresh-btn').addEventListener('click', () => {
    const btn = $('refresh-btn');
    btn.classList.remove('spinning');
    void btn.offsetWidth;
    btn.classList.add('spinning');
    refreshCls();
    refreshNews();
    setTimeout(() => btn.classList.remove('spinning'), 800);
  });
  $('fav-toggle').addEventListener('click', openDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
  $('clear-favs').addEventListener('click', () => {
    favs = [];
    saveFavs();
    document.querySelectorAll('.fav-btn').forEach((b) => {
      b.classList.remove('on');
      b.textContent = '☆';
      b.title = '收藏';
    });
    updateFavBadge();
    renderFavs();
  });
  renderFavs();
  updateFavBadge();
  refreshCls();
  refreshNews();
  updateMarketStatus();
  tickClock();
  setInterval(refreshCls, 60000);
  setInterval(refreshNews, 30000);
  setInterval(updateMarketStatus, 30000);
  setInterval(tickClock, 1000);
}

init();
