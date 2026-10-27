'use strict';

const FAV_KEY = 'news_favs_v1';
const itemRegistry = {};
let favs = loadFavs();
let newsCompany = [];
let newsOther = [];
let companyShown = 0;
let otherShown = 0;
const NEWS_CHUNK = 100;
let currentFilter = '全部';

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
  return `<button class="fav-btn${on ? ' on' : ''}" data-fav="${esc(item.fid)}" title="${on ? '取消收藏' : '收藏'}">${on ? '★ 已收藏' : '☆ 收藏'}</button>`;
}

async function fetchJSON(path) {
  const res = await fetch(path + '?t=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function renderImportant(data) {
  const items = (data && data.items) || [];
  const box = $('important');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="empty">暂无数据，请稍后刷新</div>';
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
  $('cls-updated').textContent = data && data.updated ? '更新于 ' + data.updated.slice(11, 16) : '--';
}

function buildNewsItem(it, isNew) {
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
  return div;
}

function hasTag(it, tag) {
  return (it.tags || []).indexOf(tag) >= 0;
}

function filteredOther() {
  if (currentFilter === '全部') return newsOther;
  return newsOther.filter((it) => hasTag(it, currentFilter));
}

function appendCompanyChunk() {
  const box = $('company');
  const chunk = newsCompany.slice(companyShown, companyShown + NEWS_CHUNK);
  const frag = document.createDocumentFragment();
  for (const it of chunk) frag.appendChild(buildNewsItem(it, false));
  box.appendChild(frag);
  companyShown += chunk.length;
  updateCompanyMore();
}

function updateCompanyMore() {
  let btn = $('company-more');
  const remaining = newsCompany.length - companyShown;
  if (!remaining) {
    if (btn) btn.style.display = 'none';
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'company-more';
    btn.className = 'load-more';
    btn.addEventListener('click', appendCompanyChunk);
    $('company').parentElement.appendChild(btn);
  }
  btn.style.display = 'block';
  btn.textContent = '加载更多（还有 ' + remaining + ' 条）';
}

function appendOtherChunk() {
  const box = $('news');
  const list = filteredOther();
  const chunk = list.slice(otherShown, otherShown + NEWS_CHUNK);
  const frag = document.createDocumentFragment();
  for (const it of chunk) frag.appendChild(buildNewsItem(it, false));
  box.appendChild(frag);
  otherShown += chunk.length;
  updateOtherMore();
}

function updateOtherMore() {
  let btn = $('news-more');
  const remaining = filteredOther().length - otherShown;
  if (!remaining) {
    if (btn) btn.style.display = 'none';
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'news-more';
    btn.className = 'load-more';
    btn.addEventListener('click', appendOtherChunk);
    $('news').parentElement.appendChild(btn);
  }
  btn.style.display = 'block';
  btn.textContent = '加载更多（还有 ' + remaining + ' 条）';
}

function renderNewsFilters() {
  const box = $('news-filters');
  const cats = ['全部', '市场', '国际', '观点', '焦点', '其他'];
  box.innerHTML = '';
  for (const c of cats) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (c === currentFilter ? ' active' : '');
    btn.textContent = c;
    btn.addEventListener('click', () => {
      currentFilter = c;
      otherShown = 0;
      $('news').innerHTML = '';
      appendOtherChunk();
      renderNewsFilters();
    });
    box.appendChild(btn);
  }
}

function renderCompany(data) {
  const items = (data && data.items) || [];
  newsCompany = items.filter((it) => hasTag(it, '公司'));
  companyShown = 0;
  $('company').innerHTML = '';
  appendCompanyChunk();
  $('company-updated').textContent = newsCompany.length ? newsCompany.length + ' 条' : '--';
}

function renderNews(data) {
  const items = (data && data.items) || [];
  newsOther = items.filter((it) => !hasTag(it, '公司'));
  otherShown = 0;
  $('news').innerHTML = '';
  appendOtherChunk();
  renderNewsFilters();
  $('news-updated').textContent = newsOther.length ? '全天 ' + newsOther.length + ' 条' : '--';
}

function renderAnn(data) {
  const items = (data && data.items) || [];
  const box = $('announcements');
  box.innerHTML = '';
  for (const it of items) {
    const item = { fid: 'ann:' + it.id, id: it.id, src: '公告', text: it.title, time: it.date, url: it.url || '' };
    itemRegistry[item.fid] = item;
    const div = document.createElement('div');
    div.className = 'ann-item';
    const title = item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title);
    const cat = it.category ? `<span class="ann-cat">${esc(it.category)}</span>` : '';
    div.innerHTML = `
      <div class="ann-date">${esc((it.date || '').slice(5))}</div>
      <div class="ann-body">
        <div class="ann-title">${title}</div>
        <div class="ann-meta"><span class="ann-company">${esc(it.name)} ${esc(it.code)}</span>${cat}</div>
      </div>
      ${starHtml(item)}`;
    box.appendChild(div);
  }
  $('ann-updated').textContent = items.length ? items.length + ' 条' : '--';
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
      b.textContent = on ? '★ 已收藏' : '☆ 收藏';
      b.title = on ? '取消收藏' : '收藏';
    }
  });
  updateFavBadge();
  renderFavs();
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

function openAnnDrawer() {
  $('ann-drawer').classList.add('open');
  $('drawer-overlay').classList.add('open');
}

function closeDrawer() {
  $('fav-drawer').classList.remove('open');
  $('ann-drawer').classList.remove('open');
  $('drawer-overlay').classList.remove('open');
}

function setConnection(ok) {
  const pill = $('connection');
  if (!pill) return;
  if (ok) {
    pill.textContent = '● 已连接';
    pill.className = 'status-pill ok';
  } else {
    pill.textContent = '● 加载失败';
    pill.className = 'status-pill err';
  }
}

async function refreshAll() {
  try {
    const [cls, news, ann] = await Promise.all([
      fetchJSON('data/cls.json'),
      fetchJSON('data/news.json'),
      fetchJSON('data/ann.json'),
    ]);
    renderImportant(cls);
    renderCompany(news);
    renderNews(news);
    renderAnn(ann);
  } catch (e) {
    setConnection(false);
  }
}

function tickClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function init() {
  document.addEventListener('click', onFavClick);
  $('refresh-btn').addEventListener('click', () => {
    const btn = $('refresh-btn');
    btn.classList.remove('spinning');
    void btn.offsetWidth;
    btn.classList.add('spinning');
    refreshAll();
    setTimeout(() => btn.classList.remove('spinning'), 800);
  });
  $('fav-toggle').addEventListener('click', openDrawer);
  $('ann-toggle').addEventListener('click', openAnnDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  $('ann-drawer-close').addEventListener('click', closeDrawer);
  $('drawer-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
  $('clear-favs').addEventListener('click', () => {
    favs = [];
    saveFavs();
    document.querySelectorAll('.fav-btn').forEach((b) => {
      b.classList.remove('on');
      b.textContent = '☆ 收藏';
      b.title = '收藏';
    });
    updateFavBadge();
    renderFavs();
  });
  renderFavs();
  updateFavBadge();
  refreshAll();
  tickClock();
  setInterval(refreshAll, 600000);
  setInterval(tickClock, 1000);
}

init();
