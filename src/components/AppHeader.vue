<script setup>
import { Menu } from 'ant-design-vue'
import { useTheme } from '../composables/useTheme'

const props = defineProps({
  active: { type: String, default: 'home' },
})
const emit = defineEmits(['navigate'])

const items = [
  { key: 'log', label: 'Log' },
  { key: 'notes', label: 'Note' },
  { key: 'album', label: 'Album' },
  { key: 'music', label: 'Music' },
  { key: 'bangumi', label: 'Bangumi' },
  { key: 'about', label: 'About' },
]

function onClick({ key }) {
  emit('navigate', key)
}

function onBrand() {
  emit('navigate', 'home')
}

const { resolved, setMode } = useTheme()

/* 点击直接切换亮色/暗色（纯图标按钮，无下拉菜单） */
function toggleTheme() {
  setMode(resolved.value === 'dark' ? 'light' : 'dark')
}
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

    <!-- 右侧：主题切换 -->
    <div class="nav-right">
      <div class="theme-switcher">
        <button
          class="theme-btn"
          :title="resolved === 'dark' ? '切换到亮色' : '切换到暗色'"
          :aria-label="resolved === 'dark' ? '切换到亮色' : '切换到暗色'"
          @click="toggleTheme"
        >
          <svg v-if="resolved === 'light'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2a1 1 0 100-2H2a1 1 0 100 2zm18 0h2a1 1 0 100-2h-2a1 1 0 100 2zM11 2v2a1 1 0 102 0V2a1 1 0 10-2 0zm0 18v2a1 1 0 102 0v-2a1 1 0 10-2 0zM5.99 4.58a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 10-1.41 1.41l1.41 1.41a1 1 0 101.41-1.41l-1.41-1.41zm1.41-10.96a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41zM7.4 18.39a1 1 0 10-1.41-1.41l-1.41 1.41a1 1 0 101.41 1.41l1.41-1.41z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>
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
.nav-menu :deep(.ant-menu-overflow-item-rest) {
  display: none !important;
}

/* 右侧：主题按钮 */
.nav-right {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
}

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

@media (max-width: 760px) {
  .nav-wrap { max-width: calc(100vw - 220px); }
}
@media (max-width: 600px) {
  .topnav { padding: 0 14px; gap: 8px; height: 58px; }
  .brand-text { display: none; }
  .nav-wrap { max-width: calc(100vw - 150px); }
  .nav-menu :deep(.ant-menu-item) { padding: 0 12px; }
  .nav-right { gap: 8px; }
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

/* ===== 手机端导航：菜单横向滚动 ===== */
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
  .nav-menu {
    min-width: max-content;
    margin: 0 auto;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }
}
</style>
