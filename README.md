# Cecilia's Homepage

Cecilia 的个人主页，基于 Vue 3 + Vite 的静态网站，集个人介绍、日志博客、音乐播放、相册展示与交互地图于一体。

在线访问：<https://cecilia4412.github.io/homepage/>

## 功能特性

- **个人介绍**：About 页展示个人简介与技能
- **日志博客**：Markdown 日志（markdown-it + Shiki 语法高亮），支持日期归档；`scripts/update-readme.mjs` 自动把最近动态同步到 README
- **音乐播放**：内置播放器、歌词同步、随机音效，支持沉浸式体验
- **相册展示**：AlbumView 相册浏览
- **交互地图**：GlobeMap（maplibre-gl WebGL 3D 球面）与 FootprintsMap（高德地图足迹 / 居住地）
- **更多模块**：记录 Records、游戏 GameView、聊天输入 ChatComposer、明暗主题切换、彩蛋组件（CialloGreet / PhoebePoke）

## 最近动态

<!-- LOGS:START -->
<!-- 此区块由 scripts/update-readme.mjs 自动生成，请勿手动编辑 -->
**2026-08-14**
一整天基本都泡在 [musicgrove](https://github.com/cecilia4412/musicgrove) 这个桌面音乐下载播放器上，从搭架子到换框架，一路折腾到打包。先用 Electron 把功能全部撸齐了：多源搜索与下载：移植 musicdl，聚合 QQ / 网易云 / 酷我 / 咪咕 / 千千等音源，解析下载地址；QQ 登录：扫码 + Cookie 登录，修复 Cookie 解析，同步"我喜欢"歌单；数据持久化：迁到 SQLite，登录态、播放列表、下载历史、搜索历史都落库…

**2026-08-13**
从零开始造了一个 Electron 桌面版音乐播放下载器 [musicgrove](https://github.com/cecilia4412/musicgrove)。最开始是照着几个开源项目（[AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer)、[go-music-dl](https://github.com/guohuiyuan/go-music-dl)、[musicdl](https://github.com/CharlesPik…

**2026-08-12**
在 [homepage](https://github.com/cecilia4412/homepage) 上完成了「居住地 Residence」和「足迹 Footprints」两张地图。一开始试过三种地图方案：WebGL 3D 球面（maplibre-gl）、纯静态分块渲染（WorldMap）、高德 JS API 直接渲染。试下来高德国内数据完整、中文标注清晰、API 调用简单，最后把另外两个砍了——界面清爽，代码也少了近一千行。上午做到一半，小区跳闸停电，从中午十二点一直停到晚上十一点半来电。停得干干净净…

**2026-08-11**
给 Codex + deepseek-v4-flash 模型，便宜又好用，比腾讯混元 Hy3 效果好太多了，把 [cecilia-shiraseijo](https://github.com/cecilia4412/cecilia-shiraseijo) 从纯静态页面迁到 npm + Vite，顺手做了预渲染和字体子集化——页面不再白屏，字体不再跨域，首屏肉眼可见地变快。

**2026-08-10**
参加 AI 工程师（服务器本地化部署）岗位面试，聊得很舒服，收获硬件侧落地 AI 本地化服务的实操思路。复盘：对于服务器本地化部署模型方面，自己的经验大多停留在售前模型部署调参，K8s 运维、线上排障、长期服务稳定性这一块实操不足，岗位并不适配。本来就是过来探探岗位门槛，算是完成一次摸底😡。

**2026-08-09**
把 [homepage](https://github.com/cecilia4412/homepage) 推倒重做，这回换成 Vue 3 + Vite，组件化、路由、播放器一次到位。中途被黑屏坑了一把——md-editor-v3 v5 早就把 MdPreview.config 挪成独立导出的 config，旧写法照抄下来，顶层 await 一炸，整个应用直接不挂载。排查半天，元凶一行代码。

**2026-08-08**
折腾部署平台的一天。[Cloudflare Pages](https://pages.cloudflare.com/)、阿里云 [ESA](https://www.aliyun.com/product/esa)、腾讯 [EdgeOne Makers](https://console.cloud.tencent.com/edgeone/makers)，一家一家都部署过一遍。三家各有各的脾气，最后还是留在了 EdgeOne Makers。Cloudflare Pages:搭配 Worker 代理 R2 对象存储…

**2026-08-07**
浅（并不）玩了五小时 [《Fate/stay night REMASTERED》](https://store.steampowered.com/app/2396980/Fatestay_night_REMASTERED/)。太棒了，太好玩了！
<!-- LOGS:END -->

[查看全部日志 →](https://cecilia4412.github.io/homepage/)

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | Vue 3 · Vite · Ant Design Vue |
| 渲染 | markdown-it · Shiki · @shikijs/transformers |
| 地图 | maplibre-gl（3D 球面）· 高德 JS API（足迹 / 居住地） |
| 脚本 | Node.js（日志抓取、README 同步、S3 上传辅助） |

## 项目结构

```
homepage/
├── src/
│   ├── components/       # About / Album / Music / Maps / Game 等视图组件
│   ├── composables/      # usePlayer / useLyrics / useTheme / useShiki 等
│   ├── data/             # 足迹等静态数据
│   └── utils/            # maplibre worker 等
├── public/               # 静态资源与 daily-log.md
├── template/             # 主题模板
├── scripts/              # 日志抓取 / README 同步 / manifest 生成
└── .github/workflows/    # 自动更新 README 日志的 CI
```

## 开发

```bash
npm install
npm run dev       # 启动开发服务器（predev 自动抓取最新日志）
npm run build     # 构建到 dist/
npm run logs      # 抓取日志并同步 README「最近动态」
```

## 部署

托管于 GitHub Pages：<https://cecilia4412.github.io/homepage/>

## 许可

MIT
