---
name: "homepage-dev"
description: "Homepage personal site project conventions and structure guide. Invoke when modifying any file in this Vue 3 + Vite project, adding features, fixing bugs, or doing refactoring."
---

# Homepage 项目开发规范

## 技术栈

- **框架**: Vue 3 (Composition API, `<script setup>`)
- **构建**: Vite 6 (`base: './'`)
- **UI 库**: Ant Design Vue 4（仅用 ConfigProvider + Menu）
- **Markdown**: @shikijs/markdown-it + shiki（代码高亮）
- **地图**: maplibre-gl（3D 地球，optimizeDeps 需 exclude）
- **音乐**: MetingJS API（QQ音乐在线播放，非本地文件）
- **部署**: EdgeOne（云端构建，环境变量注入）

## 目录结构

```
src/
├── App.vue                 # 根组件：导航切换 + 路由（非 vue-router，用 activeView ref）
├── main.js                 # 入口
├── style.css               # 全局样式 + CSS 变量（亮/暗主题）
├── views/                  # 页面级视图（以 View.vue 结尾）
│   ├── HomeView.vue        # 首页：头像、打字机、Log 最近2条、Note 最近2篇、3D 地球
│   ├── LogView.vue         # 全部日志
│   ├── NoteView.vue        # 全部笔记
│   ├── AlbumView.vue       # 相册
│   ├── MusicView.vue       # 音乐播放器
│   └── AboutView.vue       # 关于我
├── components/             # 通用可复用组件（不以 View 结尾）
│   ├── AppHeader.vue       # 顶部导航栏（含迷你播放器、音量、主题切换）
│   ├── AppFooter.vue       # 页脚
│   ├── MarkdownPreview.vue # Markdown 渲染（variant: note/note-excerpt/log/...）
│   ├── HomeMap.vue         # 3D 地球组件
│   ├── CialloGreet.vue     # Ciallo 问候语
│   └── PhoebePoke.vue      # 菲比戳一戳
├── composables/            # 逻辑复用（以 use 开头）
│   ├── usePlayer.js        # 音乐播放器（单例 Audio，MetingJS 解析）
│   ├── useLyrics.js        # 歌词同步
│   ├── useLog.js           # 日志数据加载（limit 参数控制条数）
│   ├── useNotes.js         # 笔记数据加载（limit 参数控制条数）
│   ├── useTheme.js         # 亮/暗主题
│   ├── useRandomSound.js   # 随机音效
│   └── useShiki.js         # Shiki 代码高亮
└── utils/
    └── amap.js             # 高德地图工具
```

### 文件归属规则

- **`views/`**: 以 `View.vue` 结尾的页面级组件，**必须**放在此目录
- **`components/`**: 可复用的非页面级组件，**不以** View 结尾
- **`composables/`**: 逻辑复用 hook，**以 `use` 开头**，camelCase 命名
- **`utils/`**: 纯工具函数
- 组件目录**保持扁平**，不再创建子目录（如 audio/、common/ 等）

## 数据流与自动生成机制

### Vite 插件（vite.config.js）

构建/dev 启动时自动运行的插件，生成文件均在 `.gitignore` 中：

| 插件 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `qq-music:sync` | 歌单 ID（默认 7813925785） | `public/music.jsonl` + `public/music.info.json` | 调用 Python 脚本拉取 QQ 音乐歌单 |
| `log:merge` | `public/log/*.md` | `public/log.md` | 合并日志文件，按日期倒序 |
| `manifest:album` | `public/album/*.{jpg,png,...}` | `public/album.jsonl` | 扫描图片生成清单 |
| `manifest:note` | `public/note/*.md` | `public/note.jsonl` | 扫描笔记，提取标题/日期/摘要/字数 |

### .gitignore 中的自动生成文件（勿手动编辑）

```
public/album.jsonl
public/note.jsonl
public/log.md
```

注意：`public/music.jsonl` 和 `public/music.info.json` **未** 被 gitignore，会提交到仓库。

### 导航机制

不使用 vue-router，而是 `App.vue` 中用 `activeView` ref + `v-if/v-else-if` 切换视图。导航 key 对应关系：

| key | 视图 | 可滚动 |
|-----|------|--------|
| `home` | HomeView | ✅ |
| `log` | LogView | ✅ |
| `notes` | NoteView | ✅ |
| `album` | AlbumView | ✅ |
| `music` | MusicView | ❌（自带内部滚动） |
| `about` | AboutView | ✅ |

AppHeader.vue 的导航菜单项 key 必须与 App.vue 的 `v-else-if` 匹配。`scrollable` computed 列表需同步更新。

## 日志规范（public/log/）

- 文件名：`YYYY-MM-DD.md`（正则 `/^\d{4}-\d{2}-\d{2}\.md$/`）
- **正文不写 `# 日期` 标题**，直接写内容
- 日期由文件名提取，`gen-feed.mjs` 合并时自动在正文前加 `# 日期`（前端解析依赖此格式）
- 文件按日期倒序排列（最新在前）

## 笔记规范（public/note/）

- 文件名：`<标题>.md`，中文标题即可
- Markdown 正文顶部可用 frontmatter 或一级标题作为标题
- `md-meta.mjs` 负责提取标题、日期、摘要、分类
- 输出到 `note.jsonl` 的结构：`{ id, file, title, category, date, excerpt, wordCount }`

## 音乐规范

- 数据来源：`public/music.jsonl`（由 `scripts/parse-qq-playlist.py` 生成）
- 每首歌包含全量 API 字段：title, artist, duration, cover, songmid, albummid, singers, vid, pay, size* 等
- 播放时 `usePlayer.js` 通过 MetingJS API 实时解析音频 URL（URL 有时效，缓存 30 分钟）
- 封面：`cover` 字段（由 albummid 构造 CDN URL）或 MetingJS 返回的 `onlineCover`（优先）
- 歌单 ID 通过环境变量 `QQ_PLAYLIST_ID` 可覆盖

## 样式规范

- 全局 CSS 变量定义在 `src/style.css` 的 `:root` 和 `html[data-theme="dark"]` 中
- 主题通过 `useTheme.js` 管理，`html` 标签上的 `data-theme` 属性切换
- 组件内样式用 `<style scoped>`，需要穿透时用 `:deep()`
- 共享样式块（多视图复用）放在 `style.css` 全局，用语义化 class（如 `.my-log-*`）
- 字体：系统字体栈，中文用 PingFang SC / Microsoft YaHei

## 构建与验证

- **改动后必须运行 `npm run build` 验证无报错**
- build 会自动运行所有 Vite 插件（生成 jsonl/log.md/music.jsonl）
- `emptyOutDir: false`（跳过清空 dist，避免批量删除保护）
- chunk 大小超 500KB 的警告可忽略（maplibre-gl 较大）

## Git 规范

- 分支：`main`
- Commit message 格式：`<type>: <描述>`
  - `feat:` 新功能
  - `refactor:` 重构
  - `fix:` 修复
  - `chore:` 杂项
- 大改动**分块提交**（按逻辑拆分为多个 commit）
- 推送前确保 build 通过

## 脚本说明（scripts/）

| 脚本 | 用途 |
|------|------|
| `parse-qq-playlist.py` | QQ 音乐歌单解析（全量字段 + 封面 URL 构造 + 歌单信息） |
| `gen-feed.mjs` | 日志合并（导出 `mergeLogs`/`logDir`/`logOut`，兼容旧名 `mergeFeeds`/`feedsDir`） |
| `md-meta.mjs` | Markdown 元数据提取（标题/日期/摘要/分类/字数） |
| `generate-manifest.mjs` | 独立清单生成（手动运行 `npm run gen:manifest`） |
| `gen-thumbs.ps1` | 相册缩略图生成（PowerShell） |
| `fetch-163-lyrics.mjs` | 网易云歌词抓取（工具） |
| `probe-cdn.mjs` | CDN 探测（调试用） |
| `diagnose-music.mjs` | 音乐诊断（调试用） |
| `test-music.mjs` | 音乐测试（调试用） |
| `_shiki_test.mjs` | Shiki 高亮测试（调试用） |

## 环境变量

| 变量 | 用途 | 注入方式 |
|------|------|----------|
| `AMAP_API_KEY` | 高德地图 Key | EdgeOne 云端构建注入，`define` 烘焙进产物 |
| `QQ_PLAYLIST_ID` | QQ 音乐歌单 ID | 可选，默认 `7813925785` |
| `HTTP_PROXY` / `HTTPS_PROXY` | 代理 | Python 脚本读取，默认 `http://127.0.0.1:18080` |

## 常见注意事项

1. **新增 View 组件时**：同步更新 `App.vue`（import + v-else-if + scrollable 列表）和 `AppHeader.vue`（导航菜单项）
2. **新增 composable 时**：以 `use` 开头，放在 `src/composables/`，导出函数
3. **import 路径**：从 `views/` 引用 composable 用 `../composables/`，从 `components/` 引用同样用 `../composables/`（两者同级）
4. **不要在 components/ 创建子目录**：保持扁平结构
5. **不要手动编辑 .jsonl 和 log.md**：这些是自动生成的
6. **日志文件不写日期标题**：日期从文件名获取
