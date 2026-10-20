# LikoLiko 静态版（可直接上传到静态托管）

这份站点不需要 Node 服务：浏览器打开 `index.html`，直接获取一个 JSON 文件，在浏览器里解析、建索引、搜索。

```
static-site/
  index.html          页面
  styles.css          样式（liko / kloa 两套主题）
  js/config.js        ← 数据源配置，换 JSON 只改这个文件
  js/parser.js        报告 → 片段 解析
  js/search.js        本地全文索引（BM25 + 中文 bigram + 别名扩展）
  js/app.js           前端逻辑
  assets/liko.png     主题 logo
  assets/kloa.png
  data/reports.json   内置数据快照（前两个数据源都失败时兜底）
  serve.js            本地预览用的零依赖静态服务器（可选）
  preview.bat         双击启动本地预览（可选）
```

上传时把 `static-site` 里的内容（整个文件夹）传到托管根目录即可，`index.html` 必须位于根。

---

## 1. 怎么改数据源

打开 `js/config.js`，改 `sources` 列表。**按顺序尝试，第一个成功就用它**，失败自动切到下一个。

```js
window.LikoConfig = {
  sources: [
    { name: '主数据源 · API',      url: 'http://v.earture.org:52277/api/reports' },
    { name: '静态 JSON · 277.json', url: 'http://v.earture.org:52277/277.json' },
    { name: '内置快照',            url: './data/reports.json' }
  ],
  ...
};
```

也可以写成纯字符串：

```js
sources: [
  'https://earture.org/277.json',
  './data/reports.json'
]
```

- 地址可以是 API，也可以是任意 `.json` 文件，只要返回的是数组。
- 相对路径（`./data/reports.json`）相对于站点根目录，所以放在子路径托管也能正常工作。
- 页面底部会显示实际使用的数据源名称，加载失败时进度条里会列出每个源失败的原因，方便排查。

## 2. JSON 格式要求

顶层是数组，数组每一项至少要有 `report`（Markdown 正文），其余字段用于展示：

```json
[
  {
    "id": 1,
    "bvid": "BV11zJd6QEUP",
    "url": "https://www.bilibili.com/video/BV11zJd6QEUP",
    "title": "【克罗雅Kloa】【无弹幕】2026.01.01 直播录像",
    "streamer_name": "小海獭kiku",
    "english": "kloa",
    "duration": 5400,
    "created_at": "2026-01-01T10:00:00Z",
    "report": "## 一、直播内容详细总结\n**1. [00:28:34] 牛蛙诺亚方舟宣言**\n……",
    "name_fixes": "[{\"wrong\":\"克啊\",\"correct\":\"克罗雅\",\"count\":12}]"
  }
]
```

- 主播名从 `title` 里识别（不是上传 UP 主），所以 `title` 里最好带主播名。
- `report` 里的三段标题（`## 一、直播内容详细总结` / `## 二、精彩亮点 / 名场面` / `## 三、辛辣锐评`）决定标签类型。
- 如果顶层不是数组而是 `{ "data": [...] }` 这类包装，会自动尝试 `data / reports / items / list / results / records` 字段。要加别的字段名，改 `config.js` 里的 `dataKeys`。

### 多 P 视频

分 P 视频在数组里每个 P 一条记录，用 `part` / `parts` 区分：

```json
{ "bvid": "BV1WYnc6wEjp", "url": "https://www.bilibili.com/video/BV1WYnc6wEjp?p=2", "part": 2, "parts": 2, "duration": 1375, "report": "…" }
```

- 没有 `part` 字段时，会从 `url` 里的 `?p=` 推断；都没有则按 P1 处理。
- `report` 里的时间戳是相对于所属 P 的，跳转会自动带上 `p=`，不会落在 P1。
- 同一 `bvid + part` 的记录只会索引一次（`duplicate` 标记的重复行会被跳过）。

## 3. 避免拿到缓存的旧版本

**数据 JSON** 默认每次都重新获取：

```js
cacheBust: true,   // 请求带 ?t=<时间戳>，并且 fetch 用 cache: 'no-store'
```

这样浏览器、CDN、托管服务的缓存都会绕过，页面不会显示旧数据。

如果你希望利用 CDN 缓存（数据很大、更新不频繁），改成：

```js
cacheBust: false,
dataVersion: '2026-10-20-1'   // 每次更新数据时改这个值
```

此时请求是 `.../277.json?v=2026-10-20-1`，CDN 可以缓存，只有改 `dataVersion` 才会拿到新内容。

**站点自身的 CSS/JS** 在 `index.html` 里带版本号：

```html
<link rel="stylesheet" href="./styles.css?v=1.0.0" />
<script src="./js/app.js?v=1.0.0"></script>
```

改完文件后把 `1.0.0` 改成 `1.0.1`（同时可改 `config.js` 的 `version`），托管服务与浏览器都会重新拉取。页面里还有 `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">`；更可靠的做法是在托管后台把 `index.html` 的缓存时间设为 0 或 `no-store`。

## 4. 本地预览

```
双击 preview.bat            →  http://localhost:8000
或 node serve.js
或 python -m http.server 8000
```

不要直接双击 `index.html`（file:// 下浏览器通常不允许 fetch 本地 JSON）。

## 5. 常见坑

| 现象 | 原因 / 解决 |
| --- | --- |
| 所有数据源都失败，CORS 报错 | 数据源没有允许跨域：把 JSON 和页面放在同一个域名/站点里（例如上传到同一托管的 `data/277.json`），或在源服务端加 `Access-Control-Allow-Origin: *` |
| 页面是 https，数据是 http 被拦截 | 混合内容会被浏览器阻止：数据源改用 https |
| 数据很大、加载慢 | 静态托管开启 gzip/brotli；或把快照拆成多个文件；页面会显示下载进度（KB） |
| 改代码后页面还是旧样子 | 递增 `index.html` 里的 `?v=`，或硬刷新 Ctrl+F5 |
| 换 logo | 改 `config.js` 的 `logos`，或替换 `assets/liko.png`、`assets/kloa.png`（两个 logo 渲染尺寸统一为 2:1 框，比例不同也不会变小） |

## 6. 与 3110 服务端版的区别

| | 静态版（本目录） | 3110 服务端版 |
| --- | --- | --- |
| 需要 Node | 不需要 | 需要（`node src/server.js internet`） |
| 数据获取 | 浏览器直接 fetch 配置里的 URL，失败自动回退 | 服务端代理 `/api/reports`，带本地缓存兜底 |
| 索引 | 浏览器内建 | 浏览器内建（客户端解析模式） |
| 部署 | 上传 zip 即可 | 需要跑进程 |
