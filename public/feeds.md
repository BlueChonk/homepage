# 2026-08-14

一整天基本都泡在 [musicgrove](https://github.com/cecilia4412/musicgrove) 这个桌面音乐下载播放器上，从搭架子到换框架，一路折腾到打包。

先用 Electron 把功能全部撸齐了：
- **多源搜索与下载**：移植 musicdl，聚合 QQ / 网易云 / 酷我 / 咪咕 / 千千等音源，解析下载地址
- **QQ 登录**：扫码 + Cookie 登录，修复 Cookie 解析，同步"我喜欢"歌单
- **数据持久化**：迁到 SQLite，登录态、播放列表、下载历史、搜索历史都落库
- **播放器**：歌词同步、沉浸式全屏（唱片 + 滚动歌词）、垂直音量滑块、顺序 / 单曲 / 随机
- **下载管理**：队列分组折叠 + 下载历史 Tab；目录选择器带地址栏和面包屑导航
- **界面**：多源搜索面板在线试听、加入播放列表；喜欢页分页加载 + 回到顶部；主界面最近播放、搜索历史下拉；设置页可打开下载文件夹
- **整体统一为 DeepSeek 浅色主题**，localStorage 持久化🔒

功能都做完了，一打包就露馅：Electron 的 exe 直逼 **149MB**，那个即插即用的单文件 exe 更是坑——点开要等老半天才进加载页，启动体验稀烂。

于是动了换框架的念头。对比下来 Tauri 底层是 Rust、Wails 底层是 Go，两个都拉了 demo 试了试，包体都落在 **20-30MB**，比 Electron 那个 149MB 瘦了不知道多少倍。最后敲定用 **Wails** 重写 musicgrove，当前打包已经压到 **58MB**，启动快了一大截，顺带把深色模式删了、固定成浅色。

# 2026-08-13

从零开始造了一个 Electron 桌面版音乐播放下载器 [musicgrove](https://github.com/cecilia4412/musicgrove)。

最开始是照着几个开源项目（[AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer)、[go-music-dl](https://github.com/guohuiyuan/go-music-dl)、[musicdl](https://github.com/CharlesPikachu/musicdl)）的思路搭架子，打算 Python Flask 后端做下载服务、Electron 做前端壳子分离部署；后来索性把后端整个重写成 TypeScript，塞进 Electron 单包架构里，把 musicdl 里面几个国内音乐源也改成 TS 实现，API、下载、存储一条龙打包在本地，不用开两个服务，干净不少。

# 2026-08-12

在 [homepage](https://github.com/cecilia4412/homepage) 上完成了「居住地 Residence」和「足迹 Footprints」两张地图。

一开始试过三种地图方案：WebGL 3D 球面（maplibre-gl）、纯静态分块渲染（WorldMap）、高德 JS API 直接渲染。试下来高德国内数据完整、中文标注清晰、API 调用简单，最后把另外两个砍了——界面清爽，代码也少了近一千行。

上午做到一半，小区跳闸停电，从中午十二点一直停到晚上十一点半来电。停得干干净净，干脆跑去奶茶店蹭免费空调和免费充电插座，一坐就是大半天。来电后摸了半小时代码，洗洗睡了。

# 2026-08-11

给 Codex + deepseek-v4-flash 模型，便宜又好用，比腾讯混元 Hy3 效果好太多了，把 [cecilia-shiraseijo](https://github.com/cecilia4412/cecilia-shiraseijo) 从纯静态页面迁到 npm + Vite，顺手做了预渲染和字体子集化——页面不再白屏，字体不再跨域，首屏肉眼可见地变快。

# 2026-08-10

参加 AI 工程师（服务器本地化部署）岗位面试，聊得很舒服，收获硬件侧落地 AI 本地化服务的实操思路。
复盘：对于服务器本地化部署模型方面，自己的经验大多停留在售前模型部署调参，K8s 运维、线上排障、长期服务稳定性这一块实操不足，岗位并不适配。本来就是过来探探岗位门槛，算是完成一次摸底😡。

# 2026-08-09

把 [homepage](https://github.com/cecilia4412/homepage) 推倒重做，这回换成 Vue 3 + Vite，组件化、路由、播放器一次到位。中途被黑屏坑了一把——`md-editor-v3` v5 早就把 `MdPreview.config` 挪成独立导出的 `config`，旧写法照抄下来，顶层 await 一炸，整个应用直接不挂载。排查半天，元凶一行代码。

# 2026-08-08

折腾部署平台的一天。[Cloudflare Pages](https://pages.cloudflare.com/)、阿里云 [ESA](https://www.aliyun.com/product/esa)、腾讯 [EdgeOne Makers](https://console.cloud.tencent.com/edgeone/makers)，一家一家都部署过一遍。三家各有各的脾气，最后还是留在了 EdgeOne Makers。
- `Cloudflare Pages`:搭配 Worker 代理 R2 对象存储，对外出网流量不计费；但 R2 免费层有存储与 API 调用额度限制。海外访问体验优秀，但没有国内节点，大陆访问需要魔法，不适合面向国内的站点。
- `阿里云 ESA`：入口难找，产品命名晦涩迷惑，模块繁多，不读文档很难分清各个功能定位；文档完整性不足。实际部署操作倒还算简单，用是能用，但跟 `EdgeOne Makers` 对比差点意思，整体上手体验比较折磨。
- `腾讯 EdgeOne Makers`：群友推荐尝试，实际体验很舒服。项目列表自带预览截图，会直接读取展示站点 favicon；HTTPS、自定义域名配置简单，配套教程完善，还自带AI爬虫防护、人机校验页等开箱即用的安全能力。

# 2026-08-07

浅（并不）玩了五小时 [《Fate/stay night REMASTERED》](https://store.steampowered.com/app/2396980/Fatestay_night_REMASTERED/)。太棒了，太好玩了！

# 2026-08-06

翻了翻 GitHub 上的热门项目 [nanobot](https://github.com/HKUDS/nanobot) 源码，顺着 LLM Provider 初始化往下读，过消息总线、上下文构建，追踪到 AgentLoop 调度外壳与内部 AgentRunner 的完整 Agent 循环。

# 2026-08-04

把电脑和手机统统从浅色模式改成了深色模式。以前用浅色，感觉我的眼睛每天都在喊救命；现在嘛，黑灯瞎火地写代码，舒服得一批。

# 2026-08-03

在 NVIDIA GeForce RTX 5060 显卡上分别部署了语音识别模型 [Paraformer-large](https://www.modelscope.cn/models/iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8358-tensorflow1/summary) 和 [SenseVoiceSmall](https://www.modelscope.cn/models/iic/SenseVoiceSmall)，对着 7.7w+ 条 [train_audio](https://tianchi.aliyun.com/competition/entrance/532322/information) 音频数据做了批量推理。成绩单如下：

- **Paraformer-large**：CER 稳稳落在 `0.14–0.16`，像个不紧不慢的老实人。
- **SenseVoiceSmall**：CER 杀到 `0.11–0.13`，明显更猛一点。

结论：都挺能打，但 SenseVoiceSmall 这次略胜一筹。

# 2026-08-02

翻了翻官方 `qwen_asr` 包，别有洞天。`utils.py` 的 `normalize_audio_input` 一个函数对音频预处理：单声道+16k 重采样+[-1,1]峰值归一化。`Qwen3ForcedAligner` 按中/日/韩/空格语种各写一套分词，做字级时间戳对齐。`Qwen3ASRModel` 还管上下文、强制语言、流式识别，底下 transformers/vllm 双后端，外加三个 CLI。"归一化→转录→对齐"一条龙。

# 2026-08-01

基于本机（NVIDIA GeForce RTX 5060 显卡）根据 [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) 配置 qwen3-tts 的 conda 环境，用 [Qwen3-TTS-12Hz-1.7B-Base](https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base) 对从 [鸣潮库街区](https://wiki.kurobbs.com/mc/item/1309523456688947200) 下载的菲比音频进行克隆，生成一段菲比朗读出师表，整体效果不错，但推理速度稳定在15-25秒/段，太慢了。

# 2026-07-29

看了很多群友的 blog 都是 [Astro](https://astro.build/) 开发的，于是尝试用了一下，静态站确实清爽了不少。

# 2026-07-28

[homepage](https://github.com/cecilia4412/homepage) 诞生的日子。`Initial commit`，一个空仓库，外加一个 React CDN 版的 `index.html`。万事开头，随便。
