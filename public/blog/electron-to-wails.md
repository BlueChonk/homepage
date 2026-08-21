---
title: 从 Electron 到 Wails：桌面应用框架选型实录
date: 2026-08-14
category: 桌面开发
top: true
tags: [electron, wails, tauri, rust, desktop]
summary: 从 Electron 的 149MB 到 Wails 的 58MB，记录桌面音乐播放器 musicgrove 的框架迁移全过程。
---

最近在折腾一个桌面音乐播放下载器 [musicgrove](https://github.com/BlueChonk/musicgrove)，经历了从 Electron 到 Wails 的框架迁移，踩了不少坑，记录下来。

## 起点：Electron

最初用 Electron 是因为生态成熟，文档多。功能很快撸齐了：

- 多源搜索（QQ / 网易云 / 酷我 / 咪咕 / 千千）
- QQ 扫码登录 + Cookie 同步
- SQLite 持久化
- 歌词同步 + 沉浸式全屏
- 下载管理

但一打包就傻眼了——**149MB**。单文件 exe 启动还要等老半天。

## 对比 Tauri 和 Wails

| 框架 | 底层 | 包体 | 上手难度 |
|------|------|------|----------|
| Electron | Node.js + Chromium | ~150MB | ⭐ 最简 |
| Tauri | Rust | ~20-30MB | ⭐⭐⭐ 需学 Rust |
| Wails | Go | ~20-30MB | ⭐⭐ Go 语法简单 |

最后选了 Wails，Go 语言上手快，包体也瘦。

## 迁移过程

迁移的核心工作是把 Python Flask 后端和 TypeScript 下载逻辑统一用 Go 重写，前端 Vue 代码基本不动，只改了进程通信层。

打包最终压到 **58MB**，启动速度提升了一大截。

## 结论

如果项目对包体敏感，Wails 是个不错的中间选择。Electron 适合快速原型，Tauri 适合追求极致体积和安全性的场景。
