<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import HomeView from './HomeView.vue'

/* 滚动进度条 + 回到顶部 */
const scrollProgress = ref(0)
const showBackTop = ref(false)
const shellRef = ref(null)

function updateProgress() {
  const el = shellRef.value
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  const max = scrollHeight - clientHeight
  scrollProgress.value = max > 0 ? (scrollTop / max) * 100 : 0
  showBackTop.value = scrollTop > 300
}

function onScroll() {
  updateProgress()
}

function backToTop() {
  shellRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

/* 移动端兜底：同时监听 window scroll */
function onWindowScroll() {
  const el = shellRef.value
  if (!el) return
  // 如果 app-shell 没有滚动（scrollHeight <= clientHeight），使用 window.scrollY
  if (el.scrollHeight <= el.clientHeight) {
    const max = document.documentElement.scrollHeight - window.innerHeight
    if (max > 0) {
      scrollProgress.value = (window.scrollY / max) * 100
      showBackTop.value = window.scrollY > 300
    }
  }
}

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
})
</script>

<template>
  <ConfigProvider :theme="{ token: { colorPrimary: '#4f6ef7' } }">
    <!-- 滚动进度条 -->
    <div class="scroll-progress" :style="{ width: scrollProgress + '%' }" />
    <!-- 回到顶部 -->
    <button
      class="back-top-btn"
      :class="{ visible: showBackTop }"
      @click="backToTop"
      aria-label="回到顶部"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </button>
    <div class="app-shell" ref="shellRef" @scroll="onScroll">
      <HomeView />
    </div>
  </ConfigProvider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg);
  /* 阻止浏览器原生下拉刷新 */
  overscroll-behavior-y: contain;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}

/* 滚动进度条 */
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  z-index: 100;
  transition: width 0.1s linear;
  pointer-events: none;
}

/* 回到顶部按钮 */
.back-top-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease, border-color 0.15s ease, color 0.15s ease;
  z-index: 90;
  box-shadow: var(--shadow-md);
  pointer-events: none;
}
.back-top-btn.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.back-top-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

/* 自定义滚动条 */
.app-shell::-webkit-scrollbar {
  width: 9px;
}
.app-shell::-webkit-scrollbar-track {
  background: transparent;
}
.app-shell::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.app-shell::-webkit-scrollbar-thumb:hover {
  background: var(--accent-strong);
  background-clip: padding-box;
  border: 2px solid transparent;
}
</style>
