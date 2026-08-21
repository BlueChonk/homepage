<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import PhoebePoke from '../components/PhoebePoke.vue'
import CialloGreet from '../components/CialloGreet.vue'
import AppFooter from '../components/AppFooter.vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import { useLog } from '../composables/useLog'
import { useTheme } from '../composables/useTheme'

const emit = defineEmits(['navigate'])
function viewAllLogs() {
  emit('navigate', 'log')
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

/* 暴露 reload 方法供下拉刷新调用 */
async function reload() {
  await loadLogs()
}
defineExpose({ reload })

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
onUnmounted(() => {
  clearTimeout(timer)
})
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

    <!-- Log 动态时间线（最近 2 条） -->
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          {{ logTitle }}
          <span v-if="myLogs.length" class="my-log-count">{{ myLogs.length }}</span>
        </h2>
        <button class="my-log-toggle" type="button" @click="viewAllLogs">ALL</button>
      </div>
      <ul class="my-log-list">
        <li v-for="(log, i) in visibleLogs" :key="i" class="my-log-item">
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
      <p v-show="logLoading" class="my-log-loading">加载中…</p>
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


</style>
