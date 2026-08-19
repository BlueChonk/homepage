# Homepage

个人主页项目，基于 Vue 3 + Vite 构建，集成了首页展示、关于、音乐播放器、日志和 Bangumi 追番收藏等功能。

## 功能特性

- **首页**：个人介绍、打字机动画、最近日志预览
- **关于页**：个人简介与技能展示
- **音乐播放器**：基于 QQ 音乐歌单的在线播放，支持歌词显示（含双语歌词）、播放列表、进度控制
- **日志**：时间线形式的日志记录，长内容自动折叠/展开
- **Bangumi 收藏**：番剧、漫画、游戏收藏记录展示，支持分类筛选与详情查看
- **明暗主题**：支持亮色/暗色主题切换
- **响应式设计**：适配桌面、平板、手机等多种设备

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 | 前端框架（Composition API） |
| Vite | 构建工具 |
| Ant Design Vue | UI 组件库 |
| Shiki | 代码语法高亮 |
| Markdown-it | Markdown 渲染 |

## 项目结构

```
homepage/
├── src/
│   ├── components/          # 通用组件
│   │   ├── AppHeader.vue    # 顶部导航
│   │   ├── AppFooter.vue    # 底部信息
│   │   ├── MarkdownPreview.vue  # Markdown 渲染
│   │   ├── CialloGreet.vue  # Ciallo 打招呼动画
│   │   └── PhoebePoke.vue   # 菲比戳戳互动
│   ├── composables/         # 组合式函数
│   │   ├── usePlayer.js     # 音乐播放器逻辑
│   │   ├── useLyrics.js     # 歌词解析（双语支持）
│   │   ├── useLog.js        # 日志数据加载
│   │   ├── useTheme.js      # 主题切换
│   │   └── useShiki.js      # Shiki 高亮
│   ├── views/               # 页面视图
│   │   ├── HomeView.vue     # 首页
│   │   ├── AboutView.vue    # 关于
│   │   ├── MusicView.vue    # 音乐播放器
│   │   ├── LogView.vue      # 日志
│   │   └── BangumiView.vue  # Bangumi 收藏
│   ├── App.vue              # 根组件
│   ├── main.js              # 入口
│   └── style.css            # 全局样式
├── scripts/                 # 工具脚本
│   ├── fetch-bangumi.mjs    # 拉取 Bangumi 收藏数据
│   ├── parse-qq-playlist.mjs # 解析 QQ 音乐歌单
│   ├── generate-manifest.mjs# 生成清单
│   ├── gen-feed.mjs         # 合并日志 Feed
├── public/                  # 静态资源
│   ├── audio/               # 音效文件
│   ├── log/                 # 日志 Markdown 源文件
│   ├── music.jsonl          # 歌单数据
│   └── bangumi.jsonl        # Bangumi 收藏数据
├── .env.example             # 环境变量模板
└── vite.config.js           # Vite 配置
```

## 快速开始

### 环境要求

- Node.js >= 22

### 安装

```bash
git clone https://github.com/cecilia4412/homepage.git
cd homepage
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并填写相关配置：

```bash
cp .env.example .env
```

| 变量 | 说明 | 必填 |
|------|------|------|
| `BANGUMI_TOKEN` | Bangumi Access Token，用于拉取收藏数据 | 否 |

> Bangumi Token 申请：https://next.bgm.tv/demo/access-token
>
> 只需 Token，无需配置用户名，脚本会自动通过 `/v0/me` 获取。

### 开发

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 生成资源清单

```bash
npm run gen:manifest
```

### 拉取 Bangumi 收藏数据

```bash
BANGUMI_TOKEN=your_token node scripts/fetch-bangumi.mjs
```

## 数据说明

- **日志**：`public/log/` 下的 Markdown 文件，由 `gen-feed.mjs` 合并为 `public/log.md`
- **音乐**：QQ 音乐歌单通过 `parse-qq-playlist.mjs` 解析，输出 `public/music.jsonl`
- **Bangumi**：通过 `fetch-bangumi.mjs` 从 Bangumi API 拉取收藏，输出 `public/bangumi.jsonl`

## 参考文献

- [Vue 3](https://vuejs.org/) — 渐进式 JavaScript 框架
- [Vite](https://vitejs.dev/) — 下一代前端构建工具
- [Ant Design Vue](https://antdv.com/) — 企业级 UI 组件库
- [Shiki](https://shiki.style/) — 基于 TextMate 语法的高亮引擎
- [Bangumi API](https://github.com/bangumi/api) — 番组计划开放 API，用于获取用户收藏数据
- [MetingJS](https://github.com/metowolf/Meting) — 基于 PHP 的音乐数据解析库，本项目使用其公共 API 获取音乐播放地址、封面和歌词

## License

MIT
