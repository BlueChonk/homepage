# cecilia4412.github.io

cecilia 的个人主页 + 技术博客，基于 **Astro** 构建的纯静态站点，由 GitHub Pages 托管。

**在线访问**：<https://cecilia4412.github.io>

## 技术栈

- **Astro 5** — 内容驱动的静态站点，默认零 JS
- **React 岛**（`@astrojs/react`）— 仅音乐播放器等交互组件按需 hydrate
- **Markdown 内容集合** — 技术文档作为博客文章管理，支持 frontmatter（标题 / 日期 / 标签 / 摘要）
- **GitHub Pages** 部署，构建产物输出到 `dist/`

## 仓库结构

```
cecilia4412.github.io/
├── astro.config.mjs         # Astro 配置（站点地址、React 集成、外链新标签）
├── package.json             # 依赖与脚本
├── tsconfig.json
├── public/                  # 原样拷贝的静态资源（不参与打包）
│   ├── music/               #   播放列表与音频（playlist.json）
│   ├── audio/               #   戳菲比语音
│   └── image/               #   图片
├── src/
│   ├── content.config.ts    # 博客内容集合 schema（zod 校验 frontmatter）
│   ├── content/blog/        # 博客文章（Markdown + frontmatter）
│   ├── data/site.ts         # 站点内容数据（社交 / 项目 / 技能等）
│   ├── layouts/             # 基础布局（含导航 / 页脚 / 光斑 / 音乐 / 滚动入场）
│   ├── components/          # Nav / Hero / About / Projects / BlogPreview / Music(React 岛)
│   ├── styles/              # 全局样式 + 博客样式
│   └── pages/               # 路由：首页、/blog、/blog/[slug]、标签页、rss.xml
├── LICENSE
└── README.md
```

## 开发

```bash
npm install
npm run dev      # 开发服务器 http://localhost:4321
npm run build    # 产物输出到 dist/
npm run preview  # 本地预览构建产物
```

## 页面内容

- **Hero**：GitHub 头像、打字机轮播简介、戳菲比互动、社交链接（GitHub / Bilibili / Steam / ModelScope / 邮箱）
- **关于我**：求职向技能分组 + 简历里不会写的硬核彩蛋
- **项目仓库**：bert-from-scratch-zh、asr-study、deploy-notes、fastmcp-study 的卡片式导航
- **技术博客**：7 篇部署笔记（Docker / FRP / MinIO / HTTPS / 向量模型），每篇独立文章页，支持标签页聚合与 RSS 订阅

## 部署

站点构建为纯静态文件，输出在 `dist/`。请配置 GitHub Pages 的 Build 步骤运行 `npm install && npm run build`，并以 `dist/` 作为发布目录。

详见 [LICENSE](LICENSE)，基于 MIT 协议。
