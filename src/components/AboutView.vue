<script setup>
import { ref, h, onMounted, onUnmounted, nextTick, watch } from 'vue'
import MarkdownPreview from './MarkdownPreview.vue'
import PhoebePoke from './PhoebePoke.vue'
import CialloGreet from './CialloGreet.vue'
import AppFooter from './AppFooter.vue'
import GlobeMap from './GlobeMap.vue'
import FootprintsMap from './FootprintsMap.vue'

const phrases = [
  '热爱二次元的技术宅',
  '前端 / 全栈开发者',
  '美食与摄影爱好者',
  '开源社区贡献者',
]
const typed = ref('')
let p = 0
let c = 0
let timer = null
let deleting = false

function tick() {
  const cur = phrases[p]
  if (!deleting) {
    c++
    typed.value = cur.slice(0, c)
    if (c >= cur.length) {
      deleting = true
      timer = setTimeout(tick, 1600)
      return
    }
  } else {
    c--
    typed.value = cur.slice(0, c)
    if (c <= 0) {
      deleting = false
      p = (p + 1) % phrases.length
    }
  }
  timer = setTimeout(tick, deleting ? 45 : 95)
}

onMounted(() => {
  timer = setTimeout(tick, 400)
})
onUnmounted(() => clearTimeout(timer))

const hobbies = []

/* 我的日志模块：极简风格（log-minimal 风格），仅记日期，点击 HIDE/SHOW 显隐 */
const logHidden = ref(true)
function toggleLog() {
  logHidden.value = !logHidden.value
}

/* 我的日志模块：数据来自 public/daily-log.md，运行时读取。
   格式：每个日志用日期作为一级标题（# YYYY-MM-DD），正文跟在其后；
   新增/修改日志只需编辑该 md 文件，无需改动组件或重新构建。 */
const myLogs = ref([])
const logLoading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}daily-log.md`, { cache: 'no-cache' })
    const md = await res.text()
    myLogs.value = parseDailyLog(md)
  } catch (e) {
    console.error('读取 daily-log.md 失败：', e)
    myLogs.value = []
  } finally {
    logLoading.value = false
  }
})

/* 解析 daily-log.md：以 "# 日期" 为分隔，标题下的连续文本作为该日正文。 */
function parseDailyLog(md) {
  const logs = []
  let cur = null
  const flush = () => {
    if (cur) {
      cur.text = cur.text.trim()
      logs.push(cur)
    }
  }
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) {
      flush()
      cur = { date: m[1], text: '' }
    } else if (cur) {
      cur.text += line + '\n'
    }
  }
  flush()
  return logs
}

/* ===== 日志正文外链：一律新标签页打开（与记录一致） =====
   MarkdownPreview 渲染完成后派发 md-rendered，这里给所有跨域 http(s) 外链
   注入 target="_blank" rel="noopener noreferrer"，站内相对链接/锚点保持不变。 */
function externalizeLogLinks(a) {
  const href = a.getAttribute('href') || ''
  if (!/^https?:\/\//i.test(href)) return
  let external = true
  try {
    const u = new URL(href, location.href)
    external = u.origin !== location.origin
  } catch (e) {
    external = true
  }
  if (external) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
}

function onLogRendered(e) {
  const root = e.currentTarget
  if (!root) return
  root.querySelectorAll('a[href]').forEach(externalizeLogLinks)
}

watch(myLogs, () => {
  // 渲染由 MarkdownPreview 的 md-rendered 事件驱动，无需此处手动处理
})
onUnmounted(() => {})
</script>

<template>
  <div class="home-page">
    <!-- hero -->
    <section class="hero">
      <div class="avatar-ring">
        <img src="/avatar.jpg" alt="Cecilia" draggable="false" />
      </div>
      <div class="badge">技术二次元宅</div>

      <h1 class="title">Hi，我是 Cecilia</h1>

      <!-- 打字文字 + Ciallo + 菲比：一个整体 -->
      <div class="hero-unit">
        <div class="hero-text">
          <p class="typed"><span>{{ typed }}</span><i class="caret" /></p>
          <CialloGreet />
        </div>
        <PhoebePoke class="phoebe-inline" />
      </div>
    </section>

    <!-- 我的日志：竖向时间线，避免横向分割线与页脚 --- 重复堆叠 -->
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          Daily Log
          <span v-if="myLogs.length" class="my-log-count">{{ myLogs.length }}</span>
        </h2>
        <button class="my-log-toggle" type="button" @click="toggleLog">
          {{ logHidden ? 'SHOW' : 'HIDE' }}
        </button>
      </div>
      <ul v-show="!logHidden" class="my-log-list">
        <li v-for="(log, i) in myLogs" :key="i" class="my-log-item">
          <span class="my-log-time">{{ log.date }}</span>
          <span class="my-log-dash" aria-hidden="true">──</span>
          <div class="my-log-body">
            <MarkdownPreview class="my-log-md" :source="log.text" variant="log" @md-rendered="onLogRendered" />
          </div>
        </li>
        <li v-if="!logLoading && myLogs.length === 0" class="my-log-empty">
          暂无日志
        </li>
      </ul>
      <p v-show="!logHidden && logLoading" class="my-log-loading">加载中…</p>
    </section>

    <!-- 3D 地球 + 居住地：独立模块，位于 Daily Log 与 Footprints 之间 -->
    <section class="my-globe">
      <div class="my-globe-head">
        <h2 class="my-globe-title">Residence</h2>
      </div>
      <GlobeMap />
    </section>

    <!-- 足迹：到访过的城市列表 -->
    <section class="my-footprints">
      <div class="my-footprints-head">
        <h2 class="my-footprints-title">Footprints</h2>
      </div>
      <FootprintsMap />
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.home-page {
  position: relative;
  min-height: 100%;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 48px 24px 0;
  text-align: center;
  font-family: inherit;
}
/* hero 占满剩余空间：头像/描述垂直居中，页脚沉到最底部 */
.hero {
  flex: 1 1 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 菲比与打字文字 + Ciallo 组成一个水平整体，整体垂直居中 */
.hero-unit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(20px, 4vw, 48px);
  margin-top: 8px;
}
.phoebe-inline {
  flex-shrink: 0;
}
.hero-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}
/* 缩小内联菲比 */
.phoebe-inline :deep(.poke-fig img) {
  width: 100px;
}
@media (max-width: 640px) {
  .hero-unit {
    flex-direction: column;
    gap: 16px;
  }
  .phoebe-inline :deep(.poke-fig img) { width: 88px; }
  .my-log { padding: 0 6px; }
  .my-log-item { gap: 12px; }
  .my-log-time { flex-basis: 92px; }
}
@media (max-width: 440px) {
  .home-page { padding: 32px 16px 0; }
  .my-log-time { flex-basis: 84px; }
  .my-log-item { gap: 12px; }
}

.avatar-ring {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  padding: 4px;
  background: conic-gradient(from 180deg, var(--accent), var(--accent-strong), #7c5cff, var(--accent));
  animation: spin 12s linear infinite;
  margin-bottom: 22px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.avatar-ring img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #15151c;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.badge {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  font-size: 13px;
  margin-bottom: 16px;
}

.title {
  font-size: clamp(28px, 5vw, 46px);
  font-weight: 700;
  margin: 0 0 10px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.typed {
  font-size: clamp(15px, 2.4vw, 20px);
  color: var(--text-secondary);
  min-height: 30px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.caret {
  width: 2px;
  height: 20px;
  background: var(--accent);
  display: inline-block;
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}

.hobby-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 760px;
  margin-top: 52px;
}
.hobby-card {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.hobby-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent-border);
}
.hobby-icon {
  font-size: 24px;
  color: var(--accent);
}
.hobby-name {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.hobby-desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ===== 我的日志：竖向时间线（无横向分割线，避免与页脚 --- 重复） ===== */
.my-log {
  width: 100%;
  max-width: 860px;
  margin: 44px auto 0;
  padding: 0 20px;
  text-align: left;
}
.my-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
}
.my-log-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--accent);
}
.my-log-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.my-log-toggle {
  cursor: pointer;
  border: none;
  background: none;
  color: var(--text-tertiary);
  font-size: 12px;
  letter-spacing: .05em;
  font-family: inherit;
  transition: color .15s ease;
}
.my-log-toggle:hover {
  color: var(--accent);
}

.my-log-list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
}
.my-log-item {
  display: flex;
  gap: 12px;
  padding: 9px 0;
  align-items: flex-start;
}
.my-log-time {
  flex: 0 0 104px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  letter-spacing: .03em;
  white-space: nowrap;
  padding-top: 1px;
}
.my-log-dash {
  flex: 0 0 auto;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-tertiary);
  user-select: none;
}
.my-log-body {
  flex: 1 1 auto;
  min-width: 0;
}
.my-log-md {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.my-log-md :deep(.md-render-inner) {
  background: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC',
    'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.my-log-md :deep(.md-render-inner > :first-child) {
  margin-top: 0;
}
.my-log-md :deep(.md-render-inner > :last-child) {
  margin-bottom: 0;
}
.my-log-md :deep(.md-render-inner h1),
.my-log-md :deep(.md-render-inner h2),
.my-log-md :deep(.md-render-inner h3),
.my-log-md :deep(.md-render-inner h4) {
  color: var(--text);
  font-family: Georgia, 'Times New Roman', 'Songti SC', serif;
  margin: 1.3em 0 0.5em;
}
.my-log-md :deep(.md-render-inner h1) { font-size: 1.4em; }
.my-log-md :deep(.md-render-inner h2) { font-size: 1.25em; }
.my-log-md :deep(.md-render-inner h3) { font-size: 1.1em; }
/* 行内代码沿用记录样式：暖陶土底 + 强调色文字 */
.my-log-md :deep(.md-render-inner :not(pre) > code) {
  background: var(--md-inline-code-bg);
  color: var(--md-inline-code-fg);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
}
.my-log-md :deep(.md-render-inner a) {
  color: var(--accent-strong);
  text-decoration: none;
  border-bottom: 1px solid var(--accent-border);
}
.my-log-md :deep(.md-render-inner a:hover) {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.my-log-md :deep(.md-render-inner a[target="_blank"])::after {
  content: "↗";
  margin-left: 3px;
  font-size: 0.78em;
  color: var(--text-tertiary);
}
.my-log-md :deep(.md-render-inner blockquote) {
  margin: 0.8em 0;
  padding: 6px 14px;
  border-left: 3px solid var(--accent);
  background: var(--bg-soft);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}
.my-log-md :deep(.md-render-inner pre.shiki),
.my-log-md :deep(.md-render-inner .shiki) {
  background: var(--md-code-bg) !important;
  border: 1px solid var(--md-code-border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
}
.my-log-loading,
.my-log-empty {
  padding: 10px 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ===== 3D 地球 + 居住地模块 ===== */
.my-globe {
  width: 100%;
  max-width: 860px;
  margin: 44px auto 0;
  padding: 0 20px;
  text-align: left;
}
.my-globe-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 14px;
}
.my-globe-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--accent);
}

/* ===== 足迹城市列表 ===== */
.my-footprints {
  width: 100%;
  max-width: 860px;
  margin: 44px auto 0;
  padding: 0 20px;
  text-align: left;
}
.my-footprints-head {
  padding-bottom: 14px;
}
.my-footprints-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--accent);
}
</style>
