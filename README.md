# Cecilia's Homepage

Cecilia 的个人主页，一个集个人介绍、博客日志、音乐播放、相册展示和交互地图于一体的 Vue 3 静态网站。

## 功能特性

- **个人主页** — 个人信息展示、足迹地图、欢迎动画
- **沉浸式音乐播放器** — 后台播放、歌词同步、唱片封面，支持 `.mp3` / `.flac` / `.wav` / `.ogg` / `.m4a` / `.aac`
- **博客日志** — Markdown 驱动的日常记录和技术笔记，支持代码语法高亮
- **相册** — 图片网格展示，支持缩略图懒加载和全屏预览
- **交互地图** — 居住地 3D 地球、城市足迹地图（基于 MapLibre GL）
- **深色/浅色主题** — 跟随系统偏好，支持手动切换
- **响应式布局** — 适配桌面和移动端

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`) |
| 构建工具 | [Vite](https://vitejs.dev/) |
| UI 组件库 | [Ant Design Vue 4](https://next.antdv.com/) |
| 地图可视化 | [MapLibre GL JS](https://maplibre.org/) |
| Markdown 渲染 | [markdown-it](https://github.com/markdown-it/markdown-it) + [Shiki](https://shiki.style/) 语法高亮 |
| 样式 | CSS 变量驱动的主题系统，支持深色/浅色模式 |
| 部署 | [EdgeOne Pages](https://edgeone.tencent.com/) 静态站点 |

## 项目结构

```
homepage/
├── public/                        # 静态资源
│   ├── album/                     # 相册图片
│   ├── music/                     # 音乐文件（mp3 + lrc + 封面）
│   ├── records/                   # Markdown 日志文章
│   ├── geo/                       # 城市地理边界数据
│   ├── avatar.jpg                 # 头像
│   └── favicon.ico                # 网站图标
├── src/
│   ├── components/                # Vue 组件
│   │   ├── AboutView.vue          # 主页
│   │   ├── AboutMe.vue            # 关于我
│   │   ├── AlbumView.vue          # 相册
│   │   ├── MusicView.vue          # 音乐播放器
│   │   ├── RecordsView.vue        # 日志列表
│   │   ├── MarkdownPreview.vue    # Markdown 渲染
│   │   ├── FootprintsMap.vue      # 足迹地图
│   │   ├── GlobeMap.vue           # 3D 地球
│   │   ├── ChatComposer.vue       # 聊天组件
│   │   └── ...
│   ├── composables/               # 组合式 API 封装
│   │   ├── usePlayer.js           # 音乐播放器逻辑
│   │   ├── useTheme.js            # 主题管理
│   │   └── useLyrics.js           # 歌词同步
│   ├── data/                      # 静态数据
│   ├── App.vue                    # 根组件
│   ├── main.js                    # 入口
│   └── style.css                  # 全局样式
├── scripts/                       # 构建脚本
│   ├── generate-manifest.mjs      # 资源清单自动生成
│   └── md-meta.mjs                # Markdown 元数据提取
├── template/                      # 主题模板
├── index.html
├── vite.config.js
└── package.json
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 本地预览构建结果
npm run preview
```

## 部署

项目为纯静态站点，构建后 `dist/` 目录可直接部署到任何静态托管服务。

```bash
npm run build
```

## 许可

MIT