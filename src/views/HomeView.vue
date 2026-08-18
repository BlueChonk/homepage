<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import PhoebePoke from '../components/PhoebePoke.vue'
import CialloGreet from '../components/CialloGreet.vue'
import AppFooter from '../components/AppFooter.vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import { useLog } from '../composables/useLog'
import { useNotes } from '../composables/useNotes'

const emit = defineEmits(['navigate'])
function viewAllLogs() {
  emit('navigate', 'log')
}
function viewAllNotes() {
  emit('navigate', 'notes')
}

/* 日志时间线：只显示最近 2 条 */
const { logTitle, myLogs, logLoading, visibleLogs, onLogRendered } = useLog(2)

/* 笔记预览：只显示最近 2 篇 */
const { notes, notesLoading, visibleNotes } = useNotes(2)

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

    <!-- Note 笔记预览（最近 2 篇） -->
    <section class="my-note">
      <div class="my-note-head">
        <h2 class="my-note-title">
          Note
          <span v-if="notes.length" class="my-note-count">{{ notes.length }}</span>
        </h2>
        <button class="my-note-toggle" type="button" @click="viewAllNotes">ALL</button>
      </div>
      <div class="my-note-list">
        <article
          v-for="note in visibleNotes"
          :key="note.id"
          class="my-note-card"
          @click="viewAllNotes"
        >
          <h3 class="my-note-card-title">
            <span class="my-note-card-bar" aria-hidden="true"></span>
            <span class="my-note-card-text">{{ note.title }}</span>
          </h3>
          <div class="my-note-card-meta">
            <span v-if="note.date" class="my-note-card-date">{{ note.date }}</span>
            <span v-if="note.wordCount" class="my-note-card-words">{{ note.wordCount.toLocaleString('en-US') }} 字</span>
          </div>
          <div v-if="note.excerpt" class="my-note-card-excerpt">
            <MarkdownPreview :source="note.excerpt" variant="note-excerpt" class="my-note-card-excerpt-md" />
          </div>
          <span class="my-note-card-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </article>
        <div v-if="!notesLoading && notes.length === 0" class="my-note-empty">暂无笔记</div>
      </div>
      <p v-show="notesLoading" class="my-note-loading">加载中…</p>
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
  .my-note-card { padding: 16px 14px 14px; }
  .my-note-card-title { font-size: 14px; }
  .my-note-card-chevron {
    right: 12px;
    width: 30px;
    height: 30px;
  }
  .my-note-card-text { padding-right: 38px; }
  .my-note-card-excerpt { padding-right: 38px; }
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

/* ===== Note 笔记预览模块 ===== */
.my-note {
  width: 100%;
  max-width: 860px;
  margin: 44px auto 0;
  padding: 0 20px;
  text-align: left;
}
.my-note-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
}
.my-note-title {
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
.my-note-count {
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
.my-note-toggle {
  cursor: pointer;
  border: none;
  background: none;
  color: var(--text-tertiary);
  font-size: 12px;
  letter-spacing: .05em;
  font-family: inherit;
  transition: color .15s ease;
}
.my-note-toggle:hover {
  color: var(--accent);
}
.my-note-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.my-note-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 22px 26px 20px;
  cursor: pointer;
  transition: all 0.22s ease;
  overflow: hidden;
}
.my-note-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.my-note-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text);
  margin-bottom: 8px;
  transition: color 0.2s ease;
  overflow-wrap: anywhere;
}
.my-note-card-bar {
  flex: 0 0 auto;
  width: 4px;
  height: 1.1em;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  box-shadow: 0 0 8px var(--accent-soft);
}
.my-note-card-text {
  min-width: 0;
  overflow-wrap: anywhere;
  padding-right: 44px;
}
.my-note-card:hover .my-note-card-title {
  color: var(--accent-strong);
}
.my-note-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.my-note-card-date {
  color: var(--text-tertiary);
}
.my-note-card-words {
  display: inline-flex;
  align-items: center;
  color: var(--text-tertiary);
}
.my-note-card-words::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border);
  margin-right: 10px;
}
.my-note-card-excerpt {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
  padding-right: 44px;
  overflow-wrap: anywhere;
}
.my-note-card-excerpt-md :deep(.md-render-inner) {
  background: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.my-note-card-excerpt-md :deep(.md-render-inner > :first-child) { margin-top: 0; }
.my-note-card-excerpt-md :deep(.md-render-inner > :last-child) { margin-bottom: 0; }
.my-note-card-excerpt-md :deep(.md-render-inner p) { margin: 0; }
.my-note-card-excerpt-md :deep(.md-render-inner a) {
  color: var(--accent-strong);
  text-decoration: none;
  border-bottom: 1px solid var(--accent-border);
}
.my-note-card-excerpt-md :deep(.md-render-inner strong),
.my-note-card-excerpt-md :deep(.md-render-inner code) {
  color: var(--text);
}
.my-note-card-chevron {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease,
    transform 0.2s ease, box-shadow 0.2s ease;
}
.my-note-card-chevron svg {
  width: 15px;
  height: 15px;
}
.my-note-card:hover .my-note-card-chevron {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border-color: transparent;
  box-shadow: 0 4px 14px var(--accent-soft);
  transform: translateY(-50%) translateX(2px);
}
.my-note-empty,
.my-note-loading {
  padding: 10px 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .my-note {
    max-width: 100%;
    padding: 0 4px 0 0;
  }
}
@media (max-width: 440px) {
  .my-note {
    max-width: 100%;
    padding: 0 2px 0 0;
  }
  .my-note-card { padding: 18px 18px 16px; }
  .my-note-card-title { font-size: 15px; }
}
</style>
