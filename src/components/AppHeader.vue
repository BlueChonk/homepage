<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { Menu } from 'ant-design-vue'
import { usePlayer } from '../composables/usePlayer'
import { useTheme } from '../composables/useTheme'

const props = defineProps({
  active: { type: String, default: 'home' },
})
const emit = defineEmits(['navigate'])

const items = [
  { key: 'records', label: '记录' },
  { key: 'album', label: '相册' },
  { key: 'music', label: '音乐' },
  { key: 'about', label: '关于' },
]

const { currentTrack, playing, progress, volume, toggle, next, seek, setVolume, load } = usePlayer()
onMounted(() => load())

const volOpen = ref(false)
const volDragging = ref(false)

function onVolSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setVolume(Math.max(0, Math.min(1, ratio)))
}

function onVolDragStart(e) {
  volDragging.value = true
  onVolSeek(e)
  window.addEventListener('mousemove', onVolDragMove)
  window.addEventListener('mouseup', onVolDragEnd)
  e.preventDefault()
}

function onVolDragMove(e) {
  if (!volDragging.value) return
  const track = document.querySelector('.nav-mini-vol-pop .vol-track')
  if (!track) return
  const rect = track.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setVolume(Math.max(0, Math.min(1, ratio)))
}

function onVolDragEnd() {
  volDragging.value = false
  window.removeEventListener('mousemove', onVolDragMove)
  window.removeEventListener('mouseup', onVolDragEnd)
}

function closeVol() {
  volOpen.value = false
}

function onClick({ key }) {
  emit('navigate', key)
}

function onBrand() {
  emit('navigate', 'home')
}

const { mode, resolved, setMode } = useTheme()
const themeOpen = ref(false)
const themeOptions = [
  { key: 'light', label: '亮色' },
  { key: 'dark', label: '暗色' },
  { key: 'system', label: '跟随系统' },
]

function onThemeSelect(key) {
  setMode(key)
  themeOpen.value = false
}

function onThemeToggle() {
  themeOpen.value = !themeOpen.value
}

function closeThemeMenu() {
  themeOpen.value = false
}

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) binding.value()
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

onUnmounted(() => {
  themeOpen.value = false
  volOpen.value = false
})
</script>

<template>
  <header class="topnav">
    <!-- 左侧品牌 -->
    <div class="nav-left">
      <a class="brand" href="#" @click.prevent="onBrand">
        <img class="brand-avatar" src="/avatar.jpg" alt="Cecilia" />
        <span class="brand-text">
          <span class="brand-name">Cecilia's</span>
          <span class="brand-suffix">Home</span>
        </span>
      </a>
    </div>

    <!-- 中间导航：绝对居中，不与左右两侧内容互相挤压 -->
    <div class="nav-wrap">
      <Menu
        mode="horizontal"
        :selected-keys="[active === 'home' ? '' : active]"
        :items="items"
        class="nav-menu"
        @click="onClick"
      />
    </div>

    <!-- 右侧：迷你播放器（最右）+ 主题切换 -->
    <div class="nav-right">
      <div v-if="currentTrack" class="nav-mini" :class="{ playing }">
        <button class="nav-mini-disc" :class="{ spinning: playing }" :title="currentTrack.title" @click="toggle">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </button>

        <div class="nav-mini-title" :title="currentTrack.title">
          <span class="nav-mini-name">{{ currentTrack.title }}</span>
          <span v-if="currentTrack.artist" class="nav-mini-artist">— {{ currentTrack.artist }}</span>
        </div>

        <div class="nav-mini-bar" @click="seek">
          <div class="nav-mini-fill" :style="{ width: progress + '%' }"></div>
        </div>

        <button class="nav-mini-btn nav-mini-play" @click="toggle" :title="playing ? '暂停' : '播放'">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>

        <button class="nav-mini-btn nav-mini-next" @click="next" title="下一首">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
        </button>

        <div class="nav-mini-vol" v-click-outside="closeVol">
          <button class="nav-mini-btn" @click.stop="volOpen = !volOpen" title="音量">
            <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
            <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
          </button>
          <div v-if="volOpen" class="nav-mini-vol-pop" @mousedown.stop>
            <div class="vol-track" @mousedown.prevent="onVolDragStart">
              <div class="vol-fill" :style="{ height: volume * 100 + '%' }"></div>
              <div class="vol-knob" :style="{ bottom: 'calc(' + volume * 100 + '% - 5px)' }"></div>
            </div>
            <span class="vol-pct">{{ Math.round(volume * 100) }}</span>
          </div>
        </div>
      </div>

      <div class="theme-switcher" v-click-outside="closeThemeMenu">
        <button
          class="theme-btn"
          :title="'主题：' + themeOptions.find((o) => o.key === mode)?.label"
          @click.stop="onThemeToggle"
        >
          <svg v-if="resolved === 'light'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2a1 1 0 100-2H2a1 1 0 100 2zm18 0h2a1 1 0 100-2h-2a1 1 0 100 2zM11 2v2a1 1 0 102 0V2a1 1 0 10-2 0zm0 18v2a1 1 0 102 0v-2a1 1 0 10-2 0zM5.99 4.58a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41l-1.41-1.41zm1.41-10.96a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41zM7.4 18.39a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>

        <Transition name="theme-drop">
          <div v-if="themeOpen" class="theme-dropdown">
            <button
              v-for="opt in themeOptions"
              :key="opt.key"
              class="theme-option"
              :class="{ active: mode === opt.key }"
              @click="onThemeSelect(opt.key)"
            >
              <svg v-if="opt.key === 'light'" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2a1 1 0 100-2H2a1 1 0 100 2zm18 0h2a1 1 0 100-2h-2a1 1 0 100 2zM11 2v2a1 1 0 102 0V2a1 1 0 10-2 0zm0 18v2a1 1 0 102 0v-2a1 1 0 10-2 0zM5.99 4.58a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41l-1.41-1.41zm1.41-10.96a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41zM7.4 18.39a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41z" />
              </svg>
              <svg v-else-if="opt.key === 'dark'" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-8 10a8 8 0 018-8v16a8 8 0 01-8-8z" />
              </svg>
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topnav {
  position: sticky;
  top: 0;
  z-index: 60;
  flex-shrink: 0;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  /* 与内容区完全一致的配色，保证导航与各模块视觉统一 */
  background: var(--bg-gradient), var(--bg);
}

/* Markdown --- 分割线：两端渐隐的横线 + 中央菱形，紧跟导航栏下方 */
.topnav::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -9px;
  height: 10px;
  pointer-events: none;
  z-index: 70;
  background:
    radial-gradient(circle 2.5px at 50% 1px, var(--text-tertiary) 0 100%, transparent 100%) no-repeat,
    linear-gradient(90deg, transparent 0%, var(--border) 18%, var(--border) 82%, transparent 100%) no-repeat 0 2px / 100% 1px;
}

/* 左侧品牌 */
.nav-left {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  cursor: pointer;
}
.brand-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
}
.brand-text {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--text);
  white-space: nowrap;
}
.brand-name {
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.brand-suffix {
  margin-left: 6px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}
.brand:hover {
  opacity: 0.85;
}

/* 中间导航：相对整个 header 绝对居中 */
.nav-wrap {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  max-width: calc(100vw - 380px);
}
.nav-menu {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 6px;
  line-height: 40px;
  height: auto;
  box-shadow: var(--shadow-sm);
  /* 菜单按内容自然宽度排版，禁止收缩触发 AntD 溢出折叠（会出现多余的竖排指示器） */
  min-width: max-content;
}
.nav-menu :deep(.ant-menu-item) {
  height: 40px;
  line-height: 40px;
  padding: 0 18px;
  margin: 0 2px;
  flex-shrink: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  border-inline-start: none !important;
  border-inline-end: none !important;
}
.nav-menu :deep(.ant-menu-item)::after,
.nav-menu :deep(.ant-menu-item-divider),
.nav-menu :deep(.ant-menu-item-selected)::after {
  display: none !important;
}
.nav-menu :deep(.ant-menu-item:hover) {
  background: var(--surface-hover);
  color: var(--text);
}
.nav-menu :deep(.ant-menu-item-selected) {
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-weight: 600;
}
/* 溢出折叠指示器在空间充足时完全隐藏（不占位、不显示） */
.nav-menu :deep(.ant-menu-overflow-item-rest) {
  display: none !important;
}

/* 右侧：播放器 + 主题按钮（主题按钮在最右，播放器在其左侧） */
.nav-right {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
}

/* ---- 主题切换 ---- */
.theme-switcher {
  position: relative;
  display: flex;
  align-items: center;
}
.theme-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, color 0.2s, background 0.2s, transform 0.2s;
  box-shadow: var(--shadow-sm);
}
.theme-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.theme-btn svg {
  width: 17px;
  height: 17px;
}
.theme-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 132px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}
.theme-dropdown::after {
  content: "";
  position: absolute;
  top: -6px;
  right: 12px;
  transform: rotate(45deg);
  width: 11px;
  height: 11px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  border-top: 1px solid var(--border);
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13.5px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}
.theme-option:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.theme-option.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.theme-option svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}
.theme-drop-enter-active,
.theme-drop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.theme-drop-enter-from,
.theme-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---- 迷你播放器（QQ 音乐风格胶囊外框） ---- */
.nav-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  overflow: visible;
}
.nav-mini-disc {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  transition: color 0.18s ease;
}
.nav-mini-disc:hover {
  color: var(--accent);
}
.nav-mini-disc.spinning {
  animation: mini-spin 6s linear infinite;
  color: var(--accent);
}
@keyframes mini-spin {
  to { transform: rotate(360deg); }
}
.nav-mini-disc svg {
  width: 14px;
  height: 14px;
}
.nav-mini-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}
.nav-mini-artist {
  color: var(--text-tertiary);
  font-weight: 300;
}
.nav-mini-bar {
  flex: 0 0 auto;
  width: 54px;
  height: 3px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  overflow: hidden;
}
.nav-mini-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  transition: width 0.15s linear;
}
.nav-mini-btn {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.nav-mini-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}
.nav-mini-btn svg {
  width: 14px;
  height: 14px;
}
/* 播放按钮：QQ 音乐式圆形渐变胶囊，始终可见 */
.nav-mini-btn.nav-mini-play {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-soft);
}
.nav-mini-btn.nav-mini-play:hover {
  filter: brightness(1.08);
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
}

/* 音量弹层：向下弹出（QQ 音乐风格），右侧对齐，避免被导航栏上方边界裁切 */
.nav-mini-vol {
  position: relative;
  display: flex;
  align-items: center;
}
.nav-mini-vol-pop {
  position: absolute;
  top: calc(100% + 12px);
  right: -6px;
  width: 42px;
  padding: 16px 0 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 95;
}
.nav-mini-vol-pop::after {
  content: "";
  position: absolute;
  top: -6px;
  right: 10px;
  transform: rotate(45deg);
  width: 11px;
  height: 11px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  border-top: 1px solid var(--border);
}
.nav-mini-vol-pop .vol-track {
  position: relative;
  width: 5px;
  height: 90px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
}
.nav-mini-vol-pop .vol-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, var(--accent-strong), var(--accent));
  border-radius: 999px;
}
.nav-mini-vol-pop .vol-knob {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}
.nav-mini-vol-pop .vol-pct {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* 响应式：窗口变窄 → 播放器保持完整外框，只隐藏次要元素，播放/音量始终可用 */
@media (max-width: 1280px) {
  .nav-wrap { max-width: calc(100vw - 420px); }
}
@media (max-width: 1120px) {
  .nav-mini-title,
  .nav-mini-bar { display: none; }
}
@media (max-width: 940px) {
  .nav-mini-next { display: none; }
}
@media (max-width: 760px) {
  .nav-mini { padding: 4px 6px 4px 4px; }
  .nav-mini-disc { width: 28px; height: 28px; }
  .nav-mini-btn.nav-mini-play { width: 30px; height: 30px; }
  .nav-wrap { max-width: calc(100vw - 220px); }
}
@media (max-width: 600px) {
  .topnav { padding: 0 14px; gap: 8px; height: 58px; }
  .brand-text { display: none; }
  .nav-wrap { max-width: calc(100vw - 150px); }
  .nav-menu :deep(.ant-menu-item) { padding: 0 12px; }
  .nav-right { gap: 8px; }
  .nav-mini-disc { display: none; }
  .nav-mini { padding: 4px; }
  .theme-btn { width: 32px; height: 32px; }
  .theme-btn svg { width: 15px; height: 15px; }
}
@supports (padding-top: env(safe-area-inset-top)) {
  .topnav {
    padding-left: max(14px, env(safe-area-inset-left));
    padding-right: max(14px, env(safe-area-inset-right));
  }
}
@media (max-width: 460px) {
  .nav-menu :deep(.ant-menu-item) { padding: 0 9px; font-size: 13px; }
  .nav-wrap { max-width: calc(100vw - 126px); }
}

/* ===== 手机端导航：菜单横向滚动，避免与右侧迷你播放器/主题按钮重叠 ===== */
@media (max-width: 760px) {
  .nav-left { flex: 0 0 auto; }
  .nav-right { flex: 0 0 auto; }
  .nav-wrap {
    position: static;
    transform: none;
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .nav-wrap::-webkit-scrollbar {
    display: none;
  }
  /* 菜单保持自然宽度：AntD 溢出检测不会激活，杜绝 "•••" 指示器与条目丢失 */
  .nav-menu {
    min-width: max-content;
    margin: 0 auto;
    /* 取消胶囊外框：避免在导航栏中间留下大块空白，菜单项以浮动药丸形态居中 */
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }
}
</style>
