<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import PhoebePoke from '../components/PhoebePoke.vue'
import CialloGreet from '../components/CialloGreet.vue'
import AppFooter from '../components/AppFooter.vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import { Card } from 'ant-design-vue'
import { useLog } from '../composables/useLog'
import { useTheme } from '../composables/useTheme'

const emit = defineEmits(['navigate'])
function viewAllLogs() {
  emit('navigate', 'logs')
}

function resolveUrl(u) {
  if (!u) return ''
  if (/^(https?:)?\/\//i.test(u)) return u
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}

const { resolved: themeResolved } = useTheme()
const socials = computed(() => {
  const isDark = themeResolved.value === 'dark'
  return [
    { icon: isDark ? '/icon/github-dark.svg' : '/icon/github.svg', href: 'https://github.com/BlueChonk', label: 'GitHub' },
    { icon: '/icon/steam.ico', href: 'https://steamcommunity.com/profiles/76561198726425168/', label: 'Steam' },
    { icon: '/icon/bilibili.ico', href: 'https://space.bilibili.com/1920131239', label: '哔哩哔哩' },
  ]
})

/* 日志时间线：只显示最近 2 条 */
const { logTitle, myLogs, logLoading, visibleLogs, onLogRendered, loadLogs } = useLog(2)

async function reload() {
  await loadLogs()
}
defineExpose({ reload })

/* 打字机效果 */
const phrases = [
  '热爱二次元的技术宅',
  '前端 / 全栈开发者',
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
onUnmounted(() => {
  clearTimeout(timer)
})

/* About 工具组 */
const toolGroups = [
  {
    title: '代码全家桶',
    items: [
      { name: 'DSH', desc: '吃白饭的蓝色大肥鱼', icon: '/icon/deepseek.svg', href: 'https://www.deepseek.com/harness/' },
      { name: 'OpenCode', desc: '开源编码智能体', icon: '/icon/opencode.svg', href: 'https://opencode.ai/zh' },
      { name: 'Codex', desc: '脑子里全是哥布林', icon: '/icon/codex.ico', href: 'https://openai.com/codex' },
      { name: 'VS Code', desc: '装完插件重如泰山', icon: '/icon/vscode.ico', href: 'https://code.visualstudio.com/' },
      { name: 'Git', desc: '回滚失败就原地升天', icon: '/icon/git.ico', href: 'https://git-scm.com/' },
      { name: 'DBX', desc: '七十种库一把全拿捏', icon: '/icon/dbx.png', href: 'https://dbxio.com/cn' },
    ],
  },
  {
    title: '环境搬家队',
    items: [
      { name: 'Docker', desc: '打包一时爽排错火葬场', icon: '/icon/docker.ico', href: 'https://www.docker.com/' },
      { name: 'Miniconda', desc: '房间越开越多记不住', icon: '/icon/miniconda.ico', href: 'https://docs.anaconda.net.cn/miniconda/' },
      { name: 'uv', desc: 'Rust 写的飞快包管理器', icon: '/icon/uv.svg', href: 'https://uv.doczh.com/' },
      { name: 'Node.js', desc: '前端后端一把梭', icon: '/icon/nodejs.svg', href: 'https://nodejs.org/' },
      { name: 'Ubuntu', desc: '服务器常驻老油条', icon: '/icon/ubuntu.png', href: 'https://ubuntu.com/' },
    ],
  },
]

const iconFailed = ref({})
const dailyExpanded = ref(false)
function onIconError(name) {
  iconFailed.value = { ...iconFailed.value, [name]: true }
}
function openLink(href) {
  if (href) window.open(href, '_blank', 'noopener')
}
</script>

<template>
  <div class="home-page">
    <!-- hero -->
    <section class="hero">
      <div class="avatar-ring">
        <img src="/avatar.png" alt="BlueChonk" draggable="false" />
      </div>
      <div class="badge">技术二次元宅</div>

      <h1 class="title">Hi，我是 BlueChonk</h1>

      <!-- 联系方式 -->
      <div class="contact-bar">
        <a
          v-for="s in socials"
          :key="s.label"
          :href="s.href"
          target="_blank"
          rel="noopener noreferrer"
          class="contact-chip"
        >
          <img :src="resolveUrl(s.icon)" :alt="s.label" class="contact-chip-icon" />
          <span>{{ s.label }}</span>
        </a>
      </div>

      <!-- 打字文字 + Ciallo + 菲比：一个整体 -->
      <div class="hero-unit">
        <div class="hero-text">
          <p class="typed"><span>{{ typed }}</span><i class="caret" /></p>
          <CialloGreet />
        </div>
        <PhoebePoke class="phoebe-inline" />
      </div>
    </section>

    <!-- About 介绍 -->
    <section class="block">
      <h2 class="block-title">About</h2>
      <div class="about-box">
        <p class="about-intro">
          你好，我是 BlueChonk，一个热爱二次元与技术的全栈开发者。平时喜欢折腾前端工程化、捣鼓各种开发工具。这个站点是我的小角落，用来分享作品、笔记和一些不成熟的想法。
        </p>
      </div>
    </section>

    <!-- Tools -->
    <section class="block">
      <h2 class="block-title">Tools</h2>
      <!-- DSH 使用统计 -->
      <div class="dsh-stats">
        <div class="dsh-stats-title">DSH 使用统计</div>
        <div class="dsh-stats-grid">
          <div class="dsh-stat-item">
            <span class="dsh-stat-num">5</span>
            <span class="dsh-stat-label">使用天数</span>
          </div>
          <div class="dsh-stat-item">
            <span class="dsh-stat-num">507,786,590</span>
            <span class="dsh-stat-label">总 tokens</span>
          </div>
          <div class="dsh-stat-item">
            <span class="dsh-stat-num">82.2%</span>
            <span class="dsh-stat-label">平均缓存命中率</span>
          </div>
        </div>
        <!-- 每日用量 -->
        <div class="dsh-daily">
          <div class="dsh-daily-list" :class="{ 'dsh-daily-expanded': dailyExpanded }">
            <div class="dsh-daily-item">
              <span class="dsh-daily-date">08-22</span>
              <span class="dsh-daily-tokens">40,244,191</span>
              <span class="dsh-daily-cache">98.8%</span>
            </div>
            <div class="dsh-daily-item">
              <span class="dsh-daily-date">08-21</span>
              <span class="dsh-daily-tokens">400,145,325</span>
              <span class="dsh-daily-cache">99.3%</span>
            </div>
            <div class="dsh-daily-item">
              <span class="dsh-daily-date">08-20</span>
              <span class="dsh-daily-tokens">67,313,410</span>
              <span class="dsh-daily-cache">98.1%</span>
            </div>
            <div class="dsh-daily-item">
              <span class="dsh-daily-date">08-16</span>
              <span class="dsh-daily-tokens">25,601</span>
              <span class="dsh-daily-cache">33.1%</span>
            </div>
            <div class="dsh-daily-item">
              <span class="dsh-daily-date">08-15</span>
              <span class="dsh-daily-tokens">58,063</span>
              <span class="dsh-daily-cache">81.9%</span>
            </div>
          </div>
          <span class="dsh-daily-toggle" @click="dailyExpanded = !dailyExpanded">{{ dailyExpanded ? '收起 ↑' : '展开更多 ↓' }}</span>
        </div>
      </div>
      <div
        v-for="g in toolGroups"
        :key="g.title"
        class="tool-group"
      >
        <h3 class="group-title">{{ g.title }}</h3>
        <div class="info-grid">
          <Card
            v-for="t in g.items"
            :key="t.name"
            :bordered="false"
            class="info-card"
            hoverable
            :class="{ 'is-link': t.href }"
            @click="openLink(t.href)"
          >
            <div class="info-row">
              <div class="info-icon-wrap">
                <img
                  v-if="t.icon && !iconFailed[t.name]"
                  class="info-icon"
                  :src="resolveUrl(t.icon)"
                  :alt="t.name"
                  @error="onIconError(t.name)"
                />
                <span v-else class="info-icon-fallback">
                  {{ t.name.slice(0, 1) }}
                </span>
              </div>
              <div class="info-text">
                <div class="info-name">{{ t.name }}</div>
                <div class="info-desc">{{ t.desc }}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>

    <!-- Log 动态时间线 -->
    <section class="block">
      <h2 class="block-title">Log</h2>
      <div class="log-box">
        <div class="my-log-head">
          <span class="my-log-subtitle">最近 2 条</span>
          <button class="my-log-toggle" type="button" @click="viewAllLogs">ALL</button>
        </div>
        <ul class="my-log-list">
          <li v-for="(log, i) in visibleLogs" :key="i" class="my-log-item">
            <span class="my-log-time">{{ log.date }}</span>
            <span class="my-log-dash" aria-hidden="true">──</span>
            <div class="my-log-body">
              <MarkdownPreview class="my-log-md" :source="log.body" variant="log" @md-rendered="onLogRendered" />
            </div>
          </li>
          <li v-if="!logLoading && myLogs.length === 0" class="my-log-empty">
            暂无日志
          </li>
        </ul>
        <p v-show="logLoading" class="my-log-loading">加载中…</p>
      </div>
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
  .home-page { padding: 24px 12px 0; }
  .hero-unit {
    flex-direction: column;
    gap: 16px;
  }
  .phoebe-inline :deep(.poke-fig img) { width: 88px; }
  .avatar-ring {
    width: 108px;
    height: 108px;
    margin-bottom: 16px;
  }
  .badge {
    font-size: 12px;
    padding: 4px 12px;
    margin-bottom: 12px;
  }
}
@media (max-width: 440px) {
  .home-page { padding: 16px 6px 0; }
  .avatar-ring {
    width: 92px;
    height: 92px;
    margin-bottom: 12px;
  }
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

/* contact bar – compact row above Ciallo */
.contact-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 18px 0 22px;
}
.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.contact-chip:hover {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.contact-chip-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.contact-chip span {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

/* blocks */
.block {
  width: 100%;
  max-width: 880px;
  text-align: left;
  margin-top: 36px;
}
.block-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 18px;
}

/* about section */
.about-box {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 12px;
  padding: 20px 22px;
}
.about-intro {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin: 0;
}

/* Log */
.log-box {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 12px;
  padding: 20px 22px;
}

.dsh-stats {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 18px;
}
.dsh-stats-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 12px;
  text-align: left;
}
.dsh-stats-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: relative;
}
.dsh-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dsh-stat-item:nth-child(1) {
  align-items: flex-start;
  flex-shrink: 0;
}
.dsh-stat-item:nth-child(2) {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
.dsh-stat-item:nth-child(3) {
  align-items: flex-end;
  flex-shrink: 0;
}
.dsh-stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.dsh-stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.dsh-daily {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
}
.dsh-daily-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-daily-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  position: relative;
}
/* 超过 3 天自动折叠 */
.dsh-daily-item:nth-child(n+4) {
  display: none;
}
.dsh-daily-expanded .dsh-daily-item:nth-child(n+4) {
  display: flex;
}
.dsh-daily-toggle {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}
.dsh-daily-toggle:hover {
  text-decoration: underline;
}
.dsh-daily-date {
  flex-shrink: 0;
  color: var(--text-secondary);
}
.dsh-daily-tokens {
  color: var(--text);
  font-weight: 500;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
.dsh-daily-cache {
  flex-shrink: 0;
  text-align: right;
  color: var(--accent);
  font-size: 12px;
}

/* tools */
.tool-group {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 16px;
  background: transparent;
  padding: 20px 22px 22px;
  margin-bottom: 18px;
}
.tool-group:last-child {
  margin-bottom: 0;
}
.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin: 0 0 12px;
  text-align: left;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.info-card {
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 14px !important;
  transition: background 0.15s, border-color 0.15s;
}
.info-card:hover {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
.info-card :deep(.ant-card-body) {
  padding: 16px 18px;
}
.info-card.is-link {
  cursor: pointer;
}

/* 工具卡片：图标在左、文字在右，水平排列 */
.info-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.info-icon-wrap {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
}
.info-icon-fallback {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-text {
  min-width: 0;
}
.info-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.info-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Log subtitle */
.my-log-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.my-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.my-log-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.my-log-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 10px;
}
.my-log-toggle {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.my-log-toggle:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}
.my-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.my-log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.my-log-time {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.my-log-dash {
  color: var(--border);
  flex: 0 0 auto;
}
.my-log-body {
  flex: 1 1 auto;
  min-width: 0;
}
.my-log-empty {
  color: var(--text-tertiary);
  font-size: 14px;
}
.my-log-loading {
  color: var(--text-tertiary);
  font-size: 13px;
}

@media (max-width: 768px) {
  .home-page {
    padding: 24px 16px 0;
  }
  .block {
    margin-top: 24px;
  }
  .my-log {
    margin-top: 24px;
  }
}
</style>
