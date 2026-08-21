---
title: Astro 5 凭什么把 Lighthouse 干到 100
date: 2026-08-10
category: 前端
tags: [astro, performance, lighthouse, static-site]
summary: 从 Vue SPA 迁移到 Astro 的实践记录，首屏加载从 1.8MB 降到近乎为零。
---

个人站之前用 Vue 3 + Vite 做的 SPA，功能很丰富，但有个致命问题——首屏要下载近 1.8MB 的 JS。

## 痛点

SPA 架构下，即使是纯文字内容，也需要：

1. 下载 HTML 壳
2. 下载 Vue runtime + 组件代码
3. 执行 JS 挂载
4. 最后才渲染内容

用户看到白屏的时间 = 步骤 1-3 的总耗时。

## 转向 Astro

Astro 的岛屿架构完美解决了这个问题：

- 默认输出零 JS 的静态 HTML
- 只有需要交互的部分（如播放器、地图）才加载 JS
- 框架无关，可以混用 React / Vue / Svelte 组件

## 实测对比

| 指标 | Vue SPA | Astro |
|------|---------|-------|
| 首屏 JS | 1.8MB | ~0KB |
| Lighthouse 性能 | 72 | 100 |
| 首屏可见时间 | 2.1s | 0.3s |

## 迁移建议

不是所有站都适合纯静态。**内容密集**的页面（博客、文档、笔记）用 Astro 效果最好；**交互密集**的模块（播放器、地图）保持为 Vue 岛屿。混合方案最香。
