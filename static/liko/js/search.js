/* 同一份源码在 Node 与浏览器都能用：浏览器端挂到 window.LikoSearch */
(function () {
'use strict';

/**
 * 轻量全文索引（无依赖）。
 *
 * - 英文/数字按词切分
 * - 中文按 bigram（二字组合）切分，无需分词库
 * - 查询自动扩展别名（来自 name_fixes，例如 "克啊" -> "克罗雅"）
 * - BM25 排序，标题权重高于正文
 */

const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]+/g;
const ASCII_RE = /[a-z0-9]+/g;

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;
const STREAMER_WEIGHT = 2;
const ALIAS_WEIGHT = 0.6;

function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const out = [];
  for (const m of s.match(ASCII_RE) || []) out.push(m);
  for (const run of s.match(CJK_RE) || []) {
    if (run.length <= 2) {
      out.push(run);
    } else {
      for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2));
    }
  }
  return out;
}

/** 把用户输入拆成"检索项"，每项可能对应多个 token。 */
function parseQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const terms = raw.split(/[\s,;|]+/).filter(Boolean);
  return terms.map((term) => {
    const tokens = tokenize(term);
    return { term, tokens: tokens.length ? tokens : [term.toLowerCase()] };
  });
}

class SearchIndex {
  constructor() {
    this.docs = [];
    this.postings = new Map(); // token -> Map(docId -> tf)
    this.docLengths = [];
    this.avgLength = 0;
    this.aliases = new Map(); // token -> Set(expansions)
    this.hotKeywords = [];
  }

  build(segments) {
    this.docs = segments;
    this.postings = new Map();
    this.docLengths = [];
    this.aliases = new Map();
    let total = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const weighted = [
        seg.title || '',
        seg.title || '',
        seg.title || '',
        seg.streamer || '',
        seg.streamer || '',
        seg.videoTitle || '',
        seg.english || '',
        seg.text || '',
      ].join(' ');

      const tokens = tokenize(weighted);
      this.docLengths[i] = tokens.length;
      total += tokens.length;

      const map = new Map();
      for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
      for (const [token, tf] of map) {
        let posting = this.postings.get(token);
        if (!posting) {
          posting = new Map();
          this.postings.set(token, posting);
        }
        posting.set(i, tf);
      }
    }

    this.avgLength = this.docs.length ? total / this.docs.length : 0;
    this.buildAliases(segments);
    this.hotKeywords = this.collectHotKeywords(segments);
  }

  /** name_fixes 里的错误写法与正确写法互为别名 */
  buildAliases(segments) {
    const groups = new Map();
    for (const seg of segments) {
      for (const fix of seg.aliases || []) {
        const a = fix.wrong.toLowerCase();
        const b = fix.correct.toLowerCase();
        if (!groups.has(a)) groups.set(a, new Set());
        if (!groups.has(b)) groups.set(b, new Set());
        groups.get(a).add(b);
        groups.get(b).add(a);
      }
    }
    for (const [token, set] of groups) {
      const expanded = new Set();
      for (const other of set) {
        for (const t of tokenize(other)) expanded.add(t);
      }
      expanded.delete(token);
      if (expanded.size) this.aliases.set(token, expanded);
    }
  }

  collectHotKeywords(segments) {
    const freq = new Map();
    for (const seg of segments) {
      const src = `${seg.title || ''} ${seg.streamer || ''}`;
      for (const run of String(src).match(CJK_RE) || []) {
        if (run.length >= 2 && run.length <= 8) freq.set(run, (freq.get(run) || 0) + 1);
      }
    }
    return [...freq.entries()]
      .filter(([w, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([w]) => w);
  }

  expand(term) {
    const out = new Map(); // token -> weight
    for (const t of term.tokens) out.set(t, 1);
    for (const t of term.tokens) {
      const more = this.aliases.get(t);
      if (more) for (const a of more) if (!out.has(a)) out.set(a, ALIAS_WEIGHT);
    }
    return out;
  }

  search(query, filters = {}) {
    const terms = parseQuery(query);
    const typeFilter = filters.type ? String(filters.type) : null;
    const streamerFilter = filters.streamer ? String(filters.streamer) : null;

    const N = this.docs.length;
    const scores = new Map();

    if (!terms.length) {
      // 无关键词时：按时间倒序展示名场面
      for (let i = 0; i < N; i++) {
        const d = this.docs[i];
        if (typeFilter && d.type !== typeFilter) continue;
        if (streamerFilter && d.streamer !== streamerFilter) continue;
        scores.set(i, 0);
      }
      return this.rank(scores, terms, null, filters);
    }

    const expanded = terms.map((t) => this.expand(t));

    for (const tokens of expanded) {
      for (const [token, weight] of tokens) {
        const posting = this.postings.get(token);
        if (!posting) continue;
        const df = posting.size;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        for (const [docId, tf] of posting) {
          const dl = this.docLengths[docId];
          const norm = K1 * (1 - B + (B * dl) / (this.avgLength || 1));
          const s = idf * weight * ((tf * (K1 + 1)) / (tf + norm));
          scores.set(docId, (scores.get(docId) || 0) + s);
        }
      }
    }

    return this.rank(scores, terms, { typeFilter, streamerFilter }, filters);
  }

  rank(scores, terms, filters, opts) {
    const results = [];
    for (const [docId, score] of scores) {
      const doc = this.docs[docId];
      if (filters && filters.typeFilter && doc.type !== filters.typeFilter) continue;
      if (filters && filters.streamerFilter && doc.streamer !== filters.streamerFilter) continue;
      if (opts && opts.type && doc.type !== opts.type) continue;
      if (opts && opts.streamer && doc.streamer !== opts.streamer) continue;
      results.push({ doc, score });
    }

    if (terms.length) {
      // 全词命中加分；名场面加分
      results.sort((a, b) => {
        const bonus = (r) => {
          let extra = 0;
          if (r.doc.type === 'highlight') extra += 1.5;
          if (r.doc.type === 'commentary') extra += 0.8;
          if (r.doc.start !== null) extra += 0.5;
          return extra;
        };
        return b.score + bonus(b) - (a.score + bonus(a));
      });
    } else {
      const priority = { highlight: 3, commentary: 2, summary: 1 };
      results.sort((a, b) => {
        const p = priority[b.doc.type] - priority[a.doc.type];
        if (p !== 0) return p;
        const da = (b.doc.date || '').localeCompare(a.doc.date || '');
        if (da !== 0) return da;
        return (b.doc.start || 0) - (a.doc.start || 0);
      });
    }

    return results.map((r) => ({
      doc: r.doc,
      score: r.score,
      matched: matchedTerms(r.doc, terms),
    }));
  }

  suggest(query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return this.hotKeywords;
    const out = new Set();
    for (const token of tokenize(q)) {
      const posting = this.postings.get(token);
      if (!posting) continue;
      for (const docId of posting.keys()) {
        const t = this.docs[docId].title;
        if (t && t.length <= 40) out.add(t);
        if (out.size >= limit) break;
      }
    }
    return [...out].slice(0, limit);
  }

  facets() {
    const streamers = new Map();
    const types = new Map();
    const videos = new Set();
    for (const d of this.docs) {
      streamers.set(d.streamer, (streamers.get(d.streamer) || 0) + 1);
      types.set(d.type, (types.get(d.type) || 0) + 1);
      videos.add(`${d.videoId}|${d.part || 1}`);
    }
    return {
      streamers: [...streamers.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      types: [...types.entries()].map(([name, count]) => ({ name, count })),
      videos: videos.size,
      segments: this.docs.length,
    };
  }
}

/** 找出片段里实际命中了哪些用户输入，用于高亮与关键词标签 */
function matchedTerms(doc, terms) {
  const hay = `${doc.title || ''} ${doc.text || ''} ${doc.videoTitle || ''} ${doc.streamer || ''}`.toLowerCase();
  const matched = [];
  for (const term of terms) {
    if (hay.includes(term.term.toLowerCase())) matched.push(term.term);
    else {
      for (const t of term.tokens) {
        if (hay.includes(t)) {
          matched.push(term.term);
          break;
        }
      }
    }
  }
  return matched;
}

/** 生成带上下文的高亮片段 */
function makeSnippet(text, terms, window = 160) {
  const t = String(text || '');
  if (!t) return '';
  const lower = t.toLowerCase();
  const positions = [];
  for (const term of terms) {
    const needles = [term.term.toLowerCase(), ...term.tokens];
    for (const needle of needles) {
      if (!needle) continue;
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        positions.push(idx);
        idx = lower.indexOf(needle, idx + 1);
        if (positions.length > 40) break;
      }
    }
  }
  if (!positions.length) return t.slice(0, window * 2).trim();

  positions.sort((a, b) => a - b);
  const windows = [];
  for (const p of positions) {
    const start = Math.max(0, p - window);
    const end = Math.min(t.length, p + window);
    const last = windows[windows.length - 1];
    if (last && start <= last.end) last.end = end;
    else windows.push({ start, end });
    if (windows.length >= 3) break;
  }
  return windows.map((w) => t.slice(w.start, w.end).replace(/\s+/g, ' ').trim()).join(' … ');
}

/**
 * 把排名结果转换成前端需要的扁平结构。
 * 服务端（/api/search）与浏览器本地索引（3110 前端解析模式）共用同一份逻辑。
 */
function toResult(r, terms) {
  const doc = r.doc;
  return {
    id: doc.id,
    videoId: doc.videoId,
    videoTitle: doc.videoTitle,
    url: doc.videoUrl,
    link: doc.link,
    appLink: doc.appLink,
    part: doc.part || 1,
    parts: doc.parts || 1,
    partLabel: doc.partLabel || null,
    startMs: doc.start === null || doc.start === undefined ? null : doc.start * 1000,
    streamer: doc.streamer,
    english: doc.english,
    date: doc.date,
    type: doc.type,
    tagLabel: doc.tagLabel,
    title: doc.title || doc.videoTitle,
    timeLabel: doc.timeLabel,
    endLabel: doc.endLabel,
    start: doc.start,
    end: doc.end,
    snippet: makeSnippet(doc.text, terms),
    matched: r.matched,
    score: Number((r.score || 0).toFixed(4)),
  };
}

/* 浏览器里没有 module，挂到全局；Node 里正常导出 */
const SEARCH_API = { SearchIndex, parseQuery, tokenize, makeSnippet, matchedTerms, toResult };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SEARCH_API;
} else {
  window.LikoSearch = SEARCH_API;
}
})();
