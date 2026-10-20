/* ============================================================
   LikoLiko 静态版 · 数据源配置
   换数据源只需要改这个文件。
   ============================================================ */
window.LikoConfig = {
  /* 资源版本号：改了 styles.css / js/*.js 之后，把这里和 index.html 里的 ?v= 一起改，
     这样浏览器和 CDN 都会重新拉取，不会用旧版本。 */
  version: '1.1.0',

  /* 数据源列表：按顺序尝试，第一个成功的就用它。
     每一项可以是字符串 URL，也可以是 { name, url }。
     支持任意直接返回 JSON 数组的地址（API 或 .json 文件都可以）。 */
  sources: [
    { name: '主数据源 · API', url: 'http://v.earture.org:52277/api/reports' },
    { name: '静态 JSON · 277.json', url: 'http://v.earture.org:52277/277.json' },
    { name: '内置快照 · data/reports.json', url: './data/reports.json' }
  ],

  /* 缓存策略：
     cacheBust = true  → 每次请求带 ?t=时间戳 + cache:'no-store'，永远拿最新数据（默认）
     cacheBust = false → 带 ?v=<dataVersion>，CDN 可以缓存，只有改 dataVersion 时才刷新 */
  cacheBust: true,
  dataVersion: '1.1.0',

  /* 如果 JSON 顶层不是数组，会尝试这些字段里的数组（兼容 {"data": [...]} 这类格式） */
  dataKeys: ['data', 'reports', 'items', 'list', 'results', 'records'],

  /* 单次搜索最多返回多少个片段 */
  maxResults: 40,

  /* 主题 logo */
  logos: {
    liko: './assets/liko.png',
    kloa: './assets/kloa.png'
  }
};
