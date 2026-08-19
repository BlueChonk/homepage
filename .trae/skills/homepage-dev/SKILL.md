---
name: "homepage-dev"
description: "Homepage personal site project conventions and structure guide. Invoke when modifying any file in this Vue 3 + Vite project, adding features, fixing bugs, or doing refactoring."
---

# Homepage 项目开发规范

## 技术选型

### 整体架构

个人主页项目，纯前端 SPA（单页应用），无后端服务器。所有数据通过 Vite 构建期插件从本地文件扫描生成 JSONL/MD 清单，运行时前端 fetch 加载。音乐播放通过第三方公共 API 实时解析，不依赖本地音频文件。

### 前端框架与构建

| 选型 | 版本 | 选型理由 |
|------|------|----------|
| **Vue 3** | ^3.5.13 | Composition API + `<script setup>` 语法，轻量、响应式天然适合内容驱动的个人站 |
| **Vite 6** | ^6.0.5 | 极快的 dev/build，原生 ESM，插件机制用于构建期自动生成数据清单；`base: './'` 适配子路径部署 |
| **@vitejs/plugin-vue** | ^5.2.1 | Vue SFC 编译，官方标配 |

不使用 vue-router：页面少（5 个视图），用 `App.vue` 中 `activeView` ref + `v-if/v-else-if` 手动切换即可，避免路由库的额外体积和 hash/history 模式配置。

### UI 与样式

| 选型 | 版本 | 选型理由 |
|------|------|----------|
| **Ant Design Vue 4** | ^4.2.6 | 仅使用 `ConfigProvider`（主题注入）+ `Menu`（导航菜单），不引入表单/表格等重组件，按需加载控制体积 |
| **@ant-design/icons-vue** | ^7.0.1 | 导航栏图标 |
| **原生 CSS** | - | 不用 Tailwind/UnoCSS，全局 CSS 变量（`:root` + `html[data-theme="dark"]`）管理主题色，组件内 `<style scoped>` + `:deep()` 穿透 |

### 主题系统

- `useTheme.js`：单例模式，三态切换（light / dark / system），`localStorage` 持久化
- `index.html` 内联首帧脚本：在 Vue 挂载前读取 `localStorage` 设置 `data-theme`，避免暗色用户看到白色闪烁（FOUC）
- Ant Design Vue 通过 `ConfigProvider` 的 `algorithm`（`darkAlgorithm` / `defaultAlgorithm`）同步主题
- Shiki 代码高亮双主题（`github-dark` / `github-light`），CSS `color-scheme` 自动切换

### Markdown 渲染

| 选型 | 版本 | 选型理由 |
|------|------|----------|
| **markdown-it** | ^15.0.0 | 流式解析，插件生态丰富，比 marked 更灵活 |
| **@shikijs/markdown-it** | ^4.4.3 | Shiki 集成 markdown-it 的官方桥接，每行渲染为独立 `.line` 节点，避免行号错位 |
| **shiki** | ^4.4.3 | VS Code 同款 TextMate 语法高亮，双主题输出，按需加载 18 种常用语言控制体积 |
| **markdown-it-anchor** | ^9.2.1 | 标题锚点生成，支持中文 slug，重复标题自动追加序号 |

`useShiki.js` 单例缓存 highlighter，`MarkdownPreview.vue` 封装渲染逻辑，通过 `variant` prop 区分日志/摘要等场景。

### 音乐播放

| 选型 | 方式 | 选型理由 |
|------|------|----------|
| **MetingJS 公共 API** | `https://api.i-meto.com/meting/api` | 免费公共接口，根据歌名+歌手搜索 QQ 音乐，返回真实播放 URL、封面、歌词 |
| **原生 Audio API** | `new Audio()` 单例 | 不依赖 Howler.js 等封装，单例 Audio 元素全生命周期复用，切换视图不中断播放 |

`usePlayer.js` 核心：歌曲清单来自 `music.jsonl`（构建期由 Node.js 脚本从 QQ 音乐歌单拉取），播放时实时调 MetingJS API 解析音频 URL（有 30 分钟缓存 + 失效自动重试）。歌词同步由 `useLyrics.js` 处理。

### 数据生成（构建期）

| 脚本/插件 | 语言 | 选型理由 |
|-----------|------|----------|
| `parse-qq-playlist.mjs` | Node.js ESM | QQ 音乐 API 返回 JSONP/JSON，通过 fetch 拉取，两种方案 fallback |
| `gen-feed.mjs` | Node.js ESM | 日志合并逻辑简单，用 Node 原生 `fs` 即可，与 Vite 插件同进程调用 |
| `md-meta.mjs` | Node.js ESM | Markdown 元数据提取（标题/日期/摘要/分类/字数），正则解析，无需 remark/front-matter 库 |

数据格式选用 **JSONL**（JSON Lines，每行一个独立 JSON 对象）而非 JSON 数组：流式友好，前端 `split('\n').map(JSON.parse)` 即可解析，文件 append 不需重写整个数组。

### 部署

双分支部署（dev 开发版 / main 正式版）：

- **main 分支**：生产正式版，由 **腾讯云 EdgeOne** 云端构建部署，注入 `AMAP_API_KEY`/`BANGUMI_TOKEN` 等环境变量。仅当 dev 验证稳定后才推进。
- **dev 分支**：开发版，用 **GitHub Actions**（`.github/workflows/deploy.yml`）自动构建并发布到 GitHub Pages（`https://cecilia4412.github.io/homepage/`），每一次 push 到 dev 都触发部署。
- `base: './'`：相对路径，适配子路径部署
- `emptyOutDir: false`：跳过 Vite 清空 dist 目录，避免批量删除保护拦截
- 静态资源全部本地化（favicon、图标、音效），不依赖外链 CDN
- Bangumi 页面为「按需分页」，不在构建期拉取全部收藏数据；构建期只解析用户名生成 `public/bangumi-config.json`

### 依赖体积控制策略

- Ant Design Vue 按需引入（仅 ConfigProvider + Menu）
- Shiki 按需加载语言（18 种常用语言 + 别名映射）
- 不引入 vue-router、pinia、axios 等非必需库
- 构建产物 chunk 超 500KB 警告可忽略（主要是 maplibre-gl）

## 目录结构

```
src/
├── App.vue                 # 根组件：导航切换 + 路由（非 vue-router，用 activeView ref）
├── main.js                 # 入口
├── style.css               # 全局样式 + CSS 变量（亮/暗主题）
├── views/                  # 页面级视图（以 View.vue 结尾）
│   ├── HomeView.vue        # 首页：头像、打字机、Log 最近2条
│   ├── LogView.vue         # 全部日志
│   ├── MusicView.vue       # 音乐播放器
│   └── AboutView.vue       # 关于我
├── components/             # 通用可复用组件（不以 View 结尾）
│   ├── AppHeader.vue       # 顶部导航栏（含迷你播放器、音量、主题切换）
│   ├── AppFooter.vue       # 页脚
│   ├── MarkdownPreview.vue # Markdown 渲染（variant: log/note-excerpt/...）
│   ├── CialloGreet.vue     # Ciallo 问候语
│   └── PhoebePoke.vue      # 菲比戳一戳
├── composables/            # 逻辑复用（以 use 开头）
│   ├── usePlayer.js        # 音乐播放器（单例 Audio，MetingJS 解析）
│   ├── useLyrics.js        # 歌词同步
│   ├── useLog.js           # 日志数据加载（limit 参数控制条数）
│   ├── useTheme.js         # 亮/暗主题
│   ├── useRandomSound.js   # 随机音效
│   └── useShiki.js         # Shiki 代码高亮
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
| `qq-music:sync` | 歌单 ID（默认 7813925785） | `public/music.jsonl` + `public/music.info.json` | 调用 Node.js 脚本拉取 QQ 音乐歌单 |
| `log:merge` | `public/log/*.md` | `public/log.md` | 合并日志文件，按日期倒序 |

### .gitignore 中的自动生成文件（勿手动编辑）

```
public/log.md
```

注意：`public/music.jsonl` 和 `public/music.info.json` **未** 被 gitignore，会提交到仓库。

### 导航机制

不使用 vue-router，而是 `App.vue` 中用 `activeView` ref + `v-if/v-else-if` 切换视图。导航 key 对应关系：

| key | 视图 | 可滚动 |
|-----|------|--------|
| `home` | HomeView | ✅ |
| `log` | LogView | ✅ |
| `music` | MusicView | ❌（自带内部滚动） |
| `about` | AboutView | ✅ |

AppHeader.vue 的导航菜单项 key 必须与 App.vue 的 `v-else-if` 匹配。`scrollable` computed 列表需同步更新。

## 日志规范（public/log/）

- 文件名：`YYYY-MM-DD.md`（正则 `/^\d{4}-\d{2}-\d{2}\.md$/`）
- **正文不写 `# 日期` 标题**，直接写内容
- 日期由文件名提取，`gen-feed.mjs` 合并时自动在正文前加 `# 日期`（前端解析依赖此格式）
- 文件按日期倒序排列（最新在前）

## 音乐规范

- 数据来源：`public/music.jsonl`（由 `scripts/parse-qq-playlist.mjs` 生成）
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

- 默认工作分支：**dev**（本地 `git checkout dev`）。**所有代码改动均先提交并推送到 dev**，不要直接推 main。
- 存在两条分支：`main`（正式版，EdgeOne 部署）与 `dev`（开发版，GitHub Actions 部署）。
- Commit message 格式：`<type>: <描述>`
  - `feat:` 新功能
  - `refactor:` 重构
  - `fix:` 修复
  - `chore:` 杂项
- 大改动**分块提交**（按逻辑拆分为多个 commit）
- 推送前确保 build 通过

### 主动推送策略（dev-first）

当经过多次修改或大量代码变更后，**应主动触发代码推送**，不要积累过多未提交的改动。推送时遵循以下原则：

1. **始终推送 dev**：所有改动都提交到 `dev` 并 `git push origin dev`。dev 每次 push 都会自动触发 GitHub Actions 构建部署到 Pages。
2. **分块推送**：按功能模块或逻辑变更拆分为多个独立 commit，逐个推送，不要一次性把所有改动堆在一个 commit 里
   - 例：同时改了播放器、bangumi、日志三个模块 → 拆成三个 commit 分别推送
3. **触发时机**：以下情况应主动推送
   - 完成一个完整功能点或修复一个 bug 后
   - 连续修改超过 3 个文件后
   - 单次会话中进行了多轮迭代修改后
   - 用户明确要求推送时
4. **推送前检查**：每次推送前运行 `npm run build` 确保无报错
5. **commit 粒度**：一个 commit 只做一件事，message 清晰描述本次变更内容

### 推进到 main（正式发布，需稳定后才触发）

**不要每次改动都推 main。** 只有当 dev 分支已经多次推送且 GitHub Actions 部署均无错误（连续 2+ 次成功）、改动验证稳定后，才按正规流程推进一次 main。流程：

1. **确认 dev 干净且已推送**：`git status` 无未提交改动，`git push origin dev` 已同步。
2. **切换到 main 并同步远端**：
   ```bash
   git checkout main
   git fetch origin
   git pull --rebase origin main
   ```
3. **合并 dev 到 main 并解决冲突**：
   ```bash
   git merge origin/dev --no-ff
   # 若报冲突：逐个打开冲突文件（<<<<<<< / ======= / >>>>>>>），保留正确内容后重新提交
   # 不能用 --no-edit 或跳过冲突；解决后 git add <files> && git commit
   ```
4. **构建验证**：`npm run build`，确认无报错再推。
5. **推送 main 触发 EdgeOne 部署**：`git push origin main`。
6. **切回开发分支**：`git checkout dev`，继续后续开发。

> 若合并冲突较多或不想用 rebase，也可用 PR 方式：`gh pr create -B main -H dev` 在 GitHub 上走 Code Review + Merge（解决冲突）后再合并到 main。

## 脚本说明（scripts/）

| 脚本 | 用途 |
|------|------|
| `parse-qq-playlist.mjs` | QQ 音乐歌单解析（全量字段 + 封面 URL 构造 + 歌单信息） |
| `gen-feed.mjs` | 日志合并（导出 `mergeLogs`/`logDir`/`logOut`，兼容旧名 `mergeFeeds`/`feedsDir`） |
| `md-meta.mjs` | Markdown 元数据提取（标题/日期/摘要/分类/字数） |
| `generate-manifest.mjs` | 独立清单生成（手动运行 `npm run gen:manifest`） |

## 环境变量

| 变量 | 用途 | 注入方式 |
|------|------|----------|
| `QQ_PLAYLIST_ID` | QQ 音乐歌单 ID | 可选，默认 `7813925785` |
| `HTTPS_PROXY` / `HTTP_PROXY` | 代理 | Node.js 脚本读取，无则直连 |

## 常见注意事项

1. **新增 View 组件时**：同步更新 `App.vue`（import + v-else-if + scrollable 列表）和 `AppHeader.vue`（导航菜单项）
2. **新增 composable 时**：以 `use` 开头，放在 `src/composables/`，导出函数
3. **import 路径**：从 `views/` 引用 composable 用 `../composables/`，从 `components/` 引用同样用 `../composables/`（两者同级）
4. **不要在 components/ 创建子目录**：保持扁平结构
5. **不要手动编辑 .jsonl 和 log.md**：这些是自动生成的
6. **日志文件不写日期标题**：日期从文件名获取
