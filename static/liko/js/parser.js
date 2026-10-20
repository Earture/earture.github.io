/* 同一份源码在 Node 与浏览器都能用：浏览器端挂到 window.LikoParser */
(function () {
'use strict';

/**
 * 把一份直播报告（Markdown 文本）拆成可索引的"片段"。
 *
 * 报告结构通常是：
 *   ## 一、直播内容详细总结      -> type: summary     (直播总结)
 *   ## 二、精彩亮点 / 名场面     -> type: highlight   (名场面)
 *   ## 三、辛辣锐评              -> type: commentary  (辛辣锐评)
 *
 * 每个片段以时间戳开头，例如：
 *   **1. [00:28:34] 牛蛙诺亚方舟宣言**
 *   **00:02:31–00:04:57：开场BGM与"好想你"循环**
 *   **5. [01:09:40–01:10:50] 神明大人问要不要给钱**
 */

const DASH = '[–—~〜-]';
const TS = '[0-9:]{4,8}';
const ENTRY_RE = new RegExp(
  '^(?:\\d+\\.\\s*)?(?:\\[(' + TS + ')(?:\\s*' + DASH + '\\s*(' + TS + '))?\\]|(' + TS + ')(?:\\s*' + DASH + '\\s*(' + TS + '))?)[：:]?\\s*(.*)$'
);
const HEADER_RE = /^#{1,4}\s+(.*)$/;

const TAG_LABELS = {
  summary: '直播总结',
  highlight: '名场面',
  commentary: '辛辣锐评',
};

/** "01:09:40" -> 3820 */
function toSeconds(ts) {
  if (!ts) return null;
  const parts = String(ts).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  while (parts.length < 3) parts.unshift(0);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** "3820" -> "01:03:40" */
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function classifySection(title) {
  const t = String(title).toLowerCase();
  if (t.includes('名场面') || t.includes('亮点') || t.includes('精彩')) return 'highlight';
  if (t.includes('锐评') || t.includes('点评') || t.includes('吐槽')) return 'commentary';
  return 'summary';
}

function parseEntryLine(line) {
  let s = String(line).trim();
  if (!s.startsWith('**')) return null;
  s = s.replace(/^\*\*+/, '').replace(/\*\*+$/, '').trim();
  if (!s) return null;

  const m = s.match(ENTRY_RE);
  if (!m) return null;
  const start = m[1] || m[3];
  if (!start) return null;

  return {
    start: toSeconds(start),
    end: toSeconds(m[2] || m[4]),
    title: (m[5] || '').trim() || null,
  };
}

/* 标题里的"上传 UP 主"不是主播本身，例如：
 *   牧场草原神official 上传的 莉蔻Liko 录播
 *   小海獭kiku        上传的 克罗雅Kloa 录播
 * 所以主播名必须从标题里的"真实表演者"识别。 */
const NOISE_BRACKET = /^(无?弹幕|直播|回放|录像|直播回放|直播录像|直播录像|直播)$/;

/**
 * 从标题里识别主播名：
 *   【克罗雅Kloa】【无弹幕】…      -> 克罗雅Kloa
 *   莉蔻Liko  化妆电台 (…)        -> 莉蔻Liko
 * knownNames: english -> 已确认的主播名（由其它标题推断），用于兜底
 */
function extractStreamer(report, knownNames) {
  const title = String(report.title || '');
  const brackets = title.match(/[【\[]([^\]】]{2,24})[】\]]/g) || [];

  // 1) 【中文名拉丁名】 这种括号标注最可靠
  for (const b of brackets) {
    const name = b.slice(1, -1).trim();
    if (!name || NOISE_BRACKET.test(name)) continue;
    if (/[\u4e00-\u9fff]/.test(name) && /[A-Za-z]{2,}/.test(name)) return name;
  }

  // 2) "莉蔻Liko 化妆电台" —— 中文名紧跟拉丁名，出现在标题开头
  const combo = title.match(/([\u4e00-\u9fff]{2,8})\s*([A-Za-z]{2,12})/);
  if (combo) return combo[1] + combo[2];

  // 3) 纯中文的括号名
  for (const b of brackets) {
    const name = b.slice(1, -1).trim();
    if (name && !NOISE_BRACKET.test(name) && /[\u4e00-\u9fff]/.test(name)) return name;
  }

  // 4) 其它同 english 的直播已经确认过名字
  const key = String(report.english || '').trim().toLowerCase();
  if (knownNames && key && knownNames.has(key)) return knownNames.get(key);

  // 5) 兜底：用 english 字段，不用上传 UP 主
  const english = key;
  if (english) return english.charAt(0).toUpperCase() + english.slice(1);
  return report.streamer_name || '未知主播';
}

/** 从标题里抓直播日期，用于展示与按时间排序 */
function extractDate(report) {
  const title = report.title || '';
  const full = title.match(/20\d{2}[-./_](\d{1,2})[-./_](\d{1,2})/);
  if (full) {
    const y = title.match(/20\d{2}/)[0];
    return `${y}-${String(Number(full[1])).padStart(2, '0')}-${String(Number(full[2])).padStart(2, '0')}`;
  }
  const short = title.match(/(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (short) return `20${short[1]}-${String(Number(short[2])).padStart(2, '0')}-${String(Number(short[3])).padStart(2, '0')}`;
  return (report.created_at || '').slice(0, 10) || null;
}

/**
 * 网页链接：t 是秒（PC 端），start_progress 是毫秒（B 站 App 识别）
 *   https://www.bilibili.com/video/BVxxx?t=91&start_progress=91590
 */
function buildUrl(base, seconds) {
  if (!base) return base;
  if (seconds === null || seconds === undefined) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${seconds}&start_progress=${seconds * 1000}`;
}

/** 手机端唤起 B 站 App 的深链接 */
function buildAppUrl(bvid, seconds) {
  if (!bvid) return '';
  const q = seconds === null || seconds === undefined ? '' : `?start_progress=${seconds * 1000}`;
  return `bilibili://video/${bvid}${q}`;
}

/**
 * 主入口：一条 report -> 若干 segment
 * knownNames: english -> 主播名（由所有标题推断，用于标题里没有名字的直播）
 */
function parseReport(report, knownNames) {
  const lines = String(report.report || '').split(/\r?\n/);
  const segments = [];
  let section = 'summary';
  let current = null;

  const flush = () => {
    if (!current) return;
    current.text = current.lines.join('\n').replace(/\s+$/g, '').trim();
    if (current.text || current.title) {
      current.id = segments.length + report.id * 100000;
      segments.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      flush();
      section = classifySection(header[1]);
      continue;
    }

    const entry = parseEntryLine(line);
    if (entry) {
      flush();
      current = {
        type: section,
        tagLabel: TAG_LABELS[section],
        start: entry.start,
        end: entry.end,
        title: entry.title,
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { type: section, tagLabel: TAG_LABELS[section], start: null, end: null, title: null, lines: [line] };
    }
  }
  flush();

  const streamer = extractStreamer(report, knownNames);
  const date = extractDate(report);
  const aliases = parseNameFixes(report.name_fixes);

  for (const seg of segments) {
    seg.videoId = report.bvid || '';
    seg.videoTitle = report.title || '';
    seg.videoUrl = report.url || '';
    seg.streamer = streamer;
    seg.uploader = report.streamer_name || '';
    seg.english = report.english || '';
    seg.date = date;
    seg.duration = report.duration || null;
    seg.aliases = aliases;
    seg.link = buildUrl(report.url, seg.start);
    seg.appLink = buildAppUrl(report.bvid, seg.start);
    seg.timeLabel = formatTime(seg.start);
    seg.endLabel = seg.end ? formatTime(seg.end) : null;
  }

  return segments;
}

function parseNameFixes(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((x) => x && x.wrong && x.correct)
      .map((x) => ({ wrong: String(x.wrong).trim(), correct: String(x.correct).trim(), count: Number(x.count) || 0 }))
      .filter((x) => x.wrong && x.correct && x.wrong !== x.correct);
  } catch (err) {
    return [];
  }
}

/**
 * 先扫一遍所有标题，建立 english -> 主播名 的映射。
 * 这样即使某条录播的标题里没有主播名，也能用同一主播其它直播里确认过的名字。
 */
function collectKnownNames(reports) {
  const map = new Map();
  for (const report of reports || []) {
    if (!report || !report.title) continue;
    const name = extractStreamer(report);
    const key = String(report.english || '').trim().toLowerCase();
    if (!key || !name) continue;
    if (name === (report.streamer_name || '') || name === '未知主播') continue;
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

/* 浏览器里没有 module，直接挂到全局；Node 里正常导出 */
const API = {
  parseReport,
  parseNameFixes,
  collectKnownNames,
  extractStreamer,
  extractDate,
  formatTime,
  toSeconds,
  TAG_LABELS,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.LikoParser = API;
}
})();
