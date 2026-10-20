'use strict';

/* ============================================================
   LikoLiko 静态版前端（无服务端）
   - 数据源在 js/config.js 里配置：先试第一个，失败自动切到下一个（如 .json 文件）
   - 浏览器获取一次 JSON → 本地解析 → 本地检索
   - 每次请求都带 ?t=时间戳 + cache: 'no-store'，避免拿到缓存的旧版本
   ============================================================ */

const CONFIG = window.LikoConfig || {};

const LOGO = CONFIG.logos || { liko: './assets/liko.png', kloa: './assets/kloa.png' };

const LOGO_ALT = {
  liko: 'Liko 主题 logo · 虚拟主播名场面搜索',
  kloa: 'Kloa 主题 logo · 虚拟主播名场面搜索',
};

const state = {
  theme: 'liko',
  query: '',
  type: null,
  streamer: null,
};

const localIndex = { ready: false, index: null, reports: 0, segments: 0 };
let activeSource = null;

const $ = (sel) => document.querySelector(sel);
const resultsEl = $('#results');
const emptyEl = $('#empty');
const statusEl = $('#status-text');
const suggestEl = $('#suggest');
const input = $('#q');

/* ---------------- 数据源 ---------------- */
function normalizeSources(list) {
  const arr = Array.isArray(list) && list.length ? list : [];
  return arr
    .map((s) => (typeof s === 'string' ? { name: s, url: s } : { name: s.name || s.url, url: s.url }))
    .filter((s) => s && s.url);
}

const sources = normalizeSources(CONFIG.sources);

/* 缓存失效：默认每次带时间戳；若 cacheBust=false 则用版本号，便于 CDN 缓存 */
function sourceUrl(url) {
  const sep = url.includes('?') ? '&' : '?';
  if (CONFIG.cacheBust === false) {
    const v = CONFIG.dataVersion || CONFIG.version || '';
    return v ? `${url}${sep}v=${encodeURIComponent(v)}` : url;
  }
  return `${url}${sep}t=${Date.now()}`;
}

/* 兼容 [ ... ] 或 { data: [...] } 之类的包装 */
function normalizeData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`不是合法 JSON：${err.message}`);
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of CONFIG.dataKeys || ['data', 'reports', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  throw new Error('JSON 顶层不是数组，也没有 data/reports/items 之类的数组字段');
}

/* 流式下载，按字节更新进度，避免页面看起来卡住 */
async function fetchText(url) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      if (body && body.error) detail = `：${body.error}`;
    } catch (_) {
      /* 响应不是 JSON，忽略 */
    }
    throw new Error(`HTTP ${res.status}${detail}`);
  }

  const total = Number(res.headers.get('content-length')) || 0;
  let text = '';

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      received += value.length;
      const kb = (received / 1024).toFixed(1);
      const totalKb = total ? ` / ${(total / 1024).toFixed(1)} KB` : '';
      setProgress(total ? Math.min(1, received / total) : null, `正在下载直播数据 ${kb} KB${totalKb}`);
    }
  } else {
    text = await res.text();
    setProgress(1, '数据下载完成');
  }

  return text;
}

/* 依次尝试配置里的数据源，失败自动切下一个 */
async function loadReports() {
  if (!sources.length) throw new Error('config.js 里没有配置任何数据源');

  const errors = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    setProgress(null, `正在连接数据源 ${i + 1}/${sources.length}：${src.name}`);
    try {
      const text = await fetchText(sourceUrl(src.url));
      const reports = normalizeData(text);
      if (!reports.length) throw new Error('数据为空（0 条直播）');
      activeSource = src;
      return reports;
    } catch (err) {
      errors.push(`${src.name} → ${err.message}`);
      if (i < sources.length - 1) {
        setProgress(null, `数据源 ${src.name} 失败（${err.message}），切换到下一个…`);
      }
    }
  }
  throw new Error(`所有数据源都不可用：${errors.join(' | ')}`);
}

/* ---------------- 主题 ---------------- */
function setLogo(img, src, alt) {
  if (!img) return;
  if (alt) img.alt = alt;
  if (img.getAttribute('src') === src) return;

  img.classList.add('is-swapping');
  const next = new Image();
  next.onload = () => {
    img.src = src;
    img.classList.remove('is-swapping');
  };
  next.onerror = () => img.classList.remove('is-swapping');
  next.src = src;
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  const src = LOGO[theme] || LOGO.liko;
  setLogo($('#logo'), src, LOGO_ALT[theme] || LOGO_ALT.liko);
  setLogo($('#hero-logo'), src, LOGO_ALT[theme] || LOGO_ALT.liko);

  document.querySelectorAll('.theme-opt').forEach((btn) => {
    const active = btn.dataset.themeValue === theme;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  moveThumb();
  try { localStorage.setItem('likoliko-theme', theme); } catch (e) { /* ignore */ }
}

function moveThumb() {
  const switchEl = document.querySelector('.theme-switch');
  const thumb = document.querySelector('.theme-thumb');
  const active = switchEl && switchEl.querySelector('.theme-opt.is-active');
  if (!thumb || !active) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

document.querySelectorAll('.theme-opt').forEach((btn) => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeValue));
});

try {
  const saved = localStorage.getItem('likoliko-theme');
  if (saved === 'kloa' || saved === 'liko') state.theme = saved;
} catch (e) { /* ignore */ }
applyTheme(state.theme);
window.addEventListener('resize', moveThumb);

/* ---------------- 工具 ---------------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(text, terms) {
  let html = escapeHtml(text);
  for (const term of terms || []) {
    const t = escapeHtml(term).trim();
    if (!t) continue;
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = html.replace(re, `<mark>${t}</mark>`);
  }
  return html;
}

/* 网页链接：t 是秒（PC），start_progress 是毫秒（B 站 App 识别） */
function webTsHref(url, seconds) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${seconds}&start_progress=${seconds * 1000}`;
}

/* 把正文里的时间戳自动变成可点击的跳转（多 P 视频必须带 p，否则落在 P1） */
function linkifyTimestamps(html, url, bvid, part) {
  if (!url) return html;
  const p = Number(part) > 1 ? `p=${Number(part)}&` : '';
  return html.replace(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g, (m, h, mnt, s) => {
    const seconds = (Number(h) || 0) * 3600 + Number(mnt) * 60 + (s ? Number(s) : 0);
    // App 深链接的 p 不被识别（多 P 只定位 P1），提示文字在卡片下方的 app-hint 里
    const app = bvid
      ? ` data-app="bilibili://video/${escapeHtml(bvid)}?${p}start_progress=${seconds * 1000}"`
      : '';
    return `<a class="inline-ts"${app} href="${escapeHtml(webTsHref(url, seconds))}" target="_blank" rel="noopener">${m}</a>`;
  });
}

function skeleton(count = 6) {
  resultsEl.innerHTML = Array.from({ length: count }, () => '<div class="skeleton"></div>').join('');
  emptyEl.hidden = true;
}

/* ---------------- 渲染结果 ---------------- */
function render(results) {
  if (!results.length) {
    resultsEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  resultsEl.innerHTML = results.map((r, i) => {
    const tsLabel = r.timeLabel || '直播片段';
    const meta = [
      r.endLabel ? `<span class="date">时长 ${r.endLabel}</span>` : '',
      r.videoTitle ? `<a class="video-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.videoTitle)}</a>` : '',
    ].filter(Boolean).join('');

    const kw = (r.matched || []).map((k) => `<span>${escapeHtml(k)}</span>`).join('');

    /* 手机端：时间戳按钮优先唤起 B 站 App（App 未安装时自动回退到网页）
       多 P：App 深链接只定位 P1，按钮下面提示"手动切到对应 P 后再点一次" */
    const deep = typeof r.appLink === 'string' && r.appLink.startsWith('bilibili://');
    const appAttr = deep ? ` data-app="${escapeHtml(r.appLink)}"` : '';
    const partLabel = r.partLabel || `P${r.part}`;
    const appHint = deep && Number(r.part) > 1
      ? `<span class="app-hint">多 P 视频：App 深链接只能定位 P1，打开后手动切到 ${escapeHtml(partLabel)}，再返回点击一次时间戳即可定位</span>`
      : '';
    const appLink = deep
      ? `<span class="app-open">
           <a class="app-link" href="${escapeHtml(r.appLink)}" title="在 B 站 App 中打开">
             <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8" stroke="currentColor" stroke-width="2"/></svg>
             App 打开
           </a>
           ${appHint}
         </span>`
      : '';

    return `
      <article class="card tag-${r.type}" style="--i:${i}">
        <div class="card-head">
          <span class="tag tag-${r.type}">${escapeHtml(r.tagLabel)}</span>
          <span class="streamer">${escapeHtml(r.streamer)}</span>
          ${r.date ? `<span class="date">${escapeHtml(r.date)}</span>` : ''}
          ${r.partLabel ? `<span class="part">${escapeHtml(r.partLabel)} / ${r.parts}P</span>` : ''}
        </div>
        <h3 class="card-title">${highlight(r.title || '', r.matched)}</h3>
        <p class="card-snippet">${linkifyTimestamps(highlight(r.snippet || '', r.matched), r.url, r.videoId, r.part)}</p>
        <div class="card-meta">
          <a class="ts-link"${appAttr} href="${escapeHtml(r.link)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            ${escapeHtml(tsLabel)}
          </a>
          ${appLink}
          ${meta}
          ${kw ? `<div class="kw">${kw}</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

/* ---------------- 手机端：时间戳唤起 B 站 App ---------------- */
const IS_TOUCH = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

resultsEl.addEventListener('click', (e) => {
  if (!IS_TOUCH) return;
  const a = e.target.closest('a[data-app]');
  if (!a) return;

  const app = a.dataset.app;
  const web = a.href;
  // 只有真正的 App 深链接才尝试唤起，其它（多 P 网页链接）正常打开
  if (!app || !app.startsWith('bilibili://')) return;

  e.preventDefault();
  try {
    window.location.href = app; // 唤起 B 站 App，start_progress 单位为毫秒
  } catch (err) {
    window.location.href = web;
    return;
  }
  /* App 未安装 / 未唤起时（页面仍然可见）回退到网页版 */
  setTimeout(() => { if (!document.hidden) window.location.href = web; }, 900);
});

/* ---------------- 加载进度 ---------------- */
const loadingEl = $('#loading');
const fillEl = $('#loading-fill');
const loadTextEl = $('#loading-text');
const retryBtn = $('#loading-retry');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setProgress(fraction, text) {
  loadingEl.hidden = false;
  loadingEl.classList.remove('is-error');
  retryBtn.hidden = true;
  if (fraction === null || fraction === undefined) {
    loadingEl.classList.add('is-indeterminate');
    fillEl.style.width = '0';
  } else {
    loadingEl.classList.remove('is-indeterminate');
    fillEl.style.width = `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%`;
  }
  loadTextEl.textContent = text;
}

function showLoadError(message) {
  loadingEl.hidden = false;
  loadingEl.classList.add('is-error');
  loadingEl.classList.remove('is-indeterminate');
  fillEl.style.width = '100%';
  loadTextEl.textContent = message;
  retryBtn.hidden = false;
}

function hideProgress() {
  loadingEl.hidden = true;
}

/* 浏览器端解析 + 建索引，全程带进度提示 */
async function buildLocalIndex() {
  try {
    const reports = LikoParser.dedupeReports(await loadReports()); // 多 P 数据同一视频多条记录，按 bvid+part 去重
    setProgress(1, '数据下载完成，正在解析…');
    await sleep(80);

    const known = LikoParser.collectKnownNames(reports);
    const segments = [];
    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      if (report && report.report) segments.push(...LikoParser.parseReport(report, known));
      setProgress((i + 1) / reports.length, `已解析 ${i + 1} / ${reports.length} 场直播 · ${segments.length} 个片段`);
      await sleep(0); // 让浏览器有机会渲染进度
    }

    setProgress(1, `正在建立索引 ${segments.length} 个片段…`);
    await sleep(80);

    const idx = new LikoSearch.SearchIndex();
    idx.build(segments);
    localIndex.index = idx;
    localIndex.ready = true;
    localIndex.reports = reports.length;
    localIndex.segments = segments.length;

    hideProgress();
    renderFacets({
      ...idx.facets(),
      reports: reports.length,
      segments: segments.length,
      source: activeSource ? `${activeSource.name} (${activeSource.url})` : '未知数据源',
    });
    statusEl.textContent = `索引就绪：${reports.length} 场直播 / ${segments.length} 个片段`;
    search();
  } catch (err) {
    showLoadError(`加载失败：${err.message}`);
    statusEl.textContent = `数据加载失败：${err.message}`;
    resultsEl.innerHTML = '';
    emptyEl.hidden = true;
  }
}

retryBtn.addEventListener('click', () => buildLocalIndex());

/* ---------------- 搜索 ---------------- */
function search() {
  skeleton();

  if (!localIndex.ready) {
    statusEl.textContent = '索引尚未建立，请稍候…';
    return;
  }

  const terms = LikoSearch.parseQuery(state.query);
  const all = localIndex.index.search(state.query, { type: state.type, streamer: state.streamer });
  const limit = Number(CONFIG.maxResults) || 40;
  const results = all.slice(0, limit).map((r) => LikoSearch.toResult(r, terms));

  statusEl.textContent = results.length
    ? `找到 ${all.length} 个片段（浏览器本地检索，关键词自动匹配，含别名）`
    : '没有匹配片段';
  render(results);
}

let debounceTimer = null;
input.addEventListener('input', () => {
  state.query = input.value.trim();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    search();
    loadSuggestions(state.query);
  }, 320);
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.query = input.value.trim();
  search();
});

function loadSuggestions(q) {
  let list = [];
  try {
    list = localIndex.ready ? localIndex.index.suggest(q, 10) : [];
  } catch (e) {
    list = [];
  }
  list = list.slice(0, 10);
  if (!list.length) {
    suggestEl.hidden = true;
    return;
  }
  suggestEl.hidden = false;
  suggestEl.innerHTML = list.map((s) => `<button type="button">${escapeHtml(s)}</button>`).join('');
  suggestEl.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      input.value = b.textContent;
      state.query = b.textContent;
      search();
    });
  });
}

/* ---------------- 筛选 ---------------- */
function renderFacets(data) {
  const typeGroup = $('#type-filters');
  const typeLabels = { summary: '直播总结', highlight: '名场面', commentary: '辛辣锐评' };
  typeGroup.innerHTML =
    `<button class="chip is-on" data-type="">全部</button>` +
    (data.types || []).map((t) => `<button class="chip" data-type="${t.name}">${typeLabels[t.name] || t.name}<span class="count">${t.count}</span></button>`).join('');
  typeGroup.querySelectorAll('.chip').forEach((b) => {
    b.addEventListener('click', () => {
      state.type = b.dataset.type || null;
      typeGroup.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
      search();
    });
  });

  const streamerGroup = $('#streamer-filters');
  streamerGroup.innerHTML =
    `<button class="chip is-on" data-streamer="">所有主播</button>` +
    (data.streamers || []).map((s) => `<button class="chip" data-streamer="${escapeHtml(s.name)}">${escapeHtml(s.name)}<span class="count">${s.count}</span></button>`).join('');
  streamerGroup.querySelectorAll('.chip').forEach((b) => {
    b.addEventListener('click', () => {
      state.streamer = b.dataset.streamer || null;
      streamerGroup.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
      search();
    });
  });

  $('#footer-stats').textContent = `数据源 ${data.source} · ${data.reports} 场直播 · ${data.segments} 个片段`;
  $('#footer-updated').textContent = `索引更新于 ${new Date().toLocaleString('zh-CN')} · 静态版不自动更新，点“重新加载数据”获取最新`;
}

$('#refresh-btn').addEventListener('click', () => {
  statusEl.textContent = '重新获取数据…';
  buildLocalIndex();
});

/* 快捷键：/ 聚焦搜索，Esc 清空 */
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
  if (e.key === 'Escape' && document.activeElement === input) {
    input.value = '';
    state.query = '';
    search();
  }
});

/* ---------------- 启动 ---------------- */
if (!sources.length) {
  showLoadError('未配置数据源：请编辑 js/config.js 的 sources 列表');
  statusEl.textContent = '未配置数据源';
} else {
  buildLocalIndex();
}
