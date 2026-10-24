# 录播报告库（静态导出）

生成时间: 10/25/2026, 6:12:14 AM
报告数: 39

整个目录可以直接上传到任何静态托管（GitHub Pages / Cloudflare Pages / nginx / 对象存储），
不需要后端：

- `index.html` 报告库首页（带搜索)
- `reports/BVxxxx.html` 每份报告的页面：报告全文 + 带时间戳的转录
- `markdown/BVxxxx.md` 原始 Markdown
- `assets/` 样式、搜索脚本与标题图

时间戳链接指向 B站，PC 端用 `?t=<秒>`，手机端 app 用 `start_progress=<毫秒>`。

本地预览：在 liklo 后台点「生成静态报告库」，页面会同时在本机 3120 端口提供预览。
