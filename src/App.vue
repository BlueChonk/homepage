<script setup>
import { ref, computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { ConfigProvider, theme } from 'ant-design-vue'
import AppHeader from './components/AppHeader.vue'
import HomeView from './views/HomeView.vue'
import AboutView from './views/AboutView.vue'

import LogView from './views/LogView.vue'
import MusicView from './views/MusicView.vue'
import BangumiView from './views/BangumiView.vue'
import { usePlayer } from './composables/usePlayer'
import { useTheme } from './composables/useTheme'

const { resolved: themeResolved } = useTheme()
const themeAlgorithm = computed(() =>
  themeResolved.value === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
)

const activeView = ref('home')

function onNavigate(key) {
  activeView.value = key
}

const scrollable = computed(
  () => ['home', 'about', 'log', 'bangumi'].includes(activeView.value)
)

/* ===== 子页面 ref，用于调用 reload ===== */
const viewRef = shallowRef(null)

/* ===== 下拉刷新：阻止浏览器原生刷新，改为重载当前页面数据 ===== */
const pullRefreshing = ref(false)
let pullStartY = 0
let pullDistance = 0
let isPulling = false
const PULL_THRESHOLD = 70 // 触发重载的下拉阈值(px)

function onTouchStart(e) {
  const body = e.currentTarget
  if (body.scrollTop <= 0) {
    pullStartY = e.touches[0].clientY
    isPulling = true
  } else {
    isPulling = false
  }
}

function onTouchMove(e) {
  if (!isPulling) return
  const body = e.currentTarget
  if (body.scrollTop > 0) {
    isPulling = false
    pullDistance = 0
    pullRefreshing.value = false
    return
  }
  pullDistance = e.touches[0].clientY - pullStartY
  if (pullDistance > 0) {
    // 阻止原生下拉刷新
    e.preventDefault()
    pullRefreshing.value = pullDistance > PULL_THRESHOLD
  }
}

function onTouchEnd() {
  if (!isPulling) return
  isPulling = false
  if (pullDistance > PULL_THRESHOLD) {
    // 触发当前页面重载
    reloadCurrent()
  }
  pullDistance = 0
  pullRefreshing.value = false
}

async function reloadCurrent() {
  // 下拉刷新：重新请求当前页面，强制跳过缓存
  window.location.reload()
}

onMounted(() => {
  usePlayer().load()

  const body = document.querySelector('.app-body')
  if (body) {
    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: false })
    body.addEventListener('touchend', onTouchEnd, { passive: true })
  }
})

onUnmounted(() => {
  const body = document.querySelector('.app-body')
  if (body) {
    body.removeEventListener('touchstart', onTouchStart)
    body.removeEventListener('touchmove', onTouchMove)
    body.removeEventListener('touchend', onTouchEnd)
  }
})
</script>

<template>
  <ConfigProvider :theme="{ algorithm: themeAlgorithm, token: { colorPrimary: '#4f6ef7' } }">
    <div class="app-shell">
      <AppHeader :active="activeView" @navigate="onNavigate" />

      <div class="app-body" :class="{ scrollable }">
        <!-- 下拉刷新指示器 -->
        <Transition name="pull-fade">
          <div v-if="pullRefreshing" class="pull-indicator">
            <span class="pull-spinner" />
            <span class="pull-text">刷新中…</span>
          </div>
        </Transition>

        <HomeView v-if="activeView === 'home'" ref="viewRef" @navigate="onNavigate" />
        <AboutView v-else-if="activeView === 'about'" ref="viewRef" />
        
        <MusicView v-else-if="activeView === 'music'" ref="viewRef" />
        <LogView v-else-if="activeView === 'log'" ref="viewRef" />
        <BangumiView v-else-if="activeView === 'bangumi'" ref="viewRef" />
      </div>
    </div>
  </ConfigProvider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: hidden;
  background: var(--bg);
}

.app-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow-x: hidden;
  overflow-y: hidden;
  position: relative;
}

.app-body > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 100%;
}

.app-body.scrollable {
  display: block;
  overflow-y: auto;
  /* 阻止浏览器原生下拉刷新 */
  overscroll-behavior-y: contain;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.app-body.scrollable::-webkit-scrollbar {
  width: 9px;
}
.app-body.scrollable::-webkit-scrollbar-track {
  background: transparent;
}
.app-body.scrollable::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.app-body.scrollable::-webkit-scrollbar-thumb:hover {
  background: var(--accent-strong);
  background-clip: padding-box;
  border: 2px solid transparent;
}
.app-body.scrollable {
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}

/* ===== 下拉刷新指示器 ===== */
.pull-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-tertiary);
}
.pull-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: pull-spin 0.6s linear infinite;
}
@keyframes pull-spin {
  to { transform: rotate(360deg); }
}
.pull-text {
  letter-spacing: 0.05em;
}

.pull-fade-enter-active,
.pull-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.pull-fade-enter-from,
.pull-fade-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
