<script setup>
import { ref, computed, onMounted } from 'vue'
import { ConfigProvider, Menu, theme } from 'ant-design-vue'
import AppHeader from './components/AppHeader.vue'
import HomeView from './views/HomeView.vue'
import AboutView from './views/AboutView.vue'
import AlbumView from './views/AlbumView.vue'
import NoteView from './views/NoteView.vue'
import LogView from './views/LogView.vue'
import MusicView from './components/MusicView.vue'
import { usePlayer } from './composables/usePlayer'
import { useTheme } from './composables/useTheme'

const { resolved: themeResolved } = useTheme()
const themeAlgorithm = computed(() =>
  themeResolved.value === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
)

// 顶部导航栏的选择：home(点 logo) / 记录 / 相册 / 音乐 / 关于我
const activeView = ref('home')

function onNavigate(key) {
  activeView.value = key
}

// 主页(home)与关于我(about)、相册(album)等整页内容，需要随导航区滚动
const scrollable = computed(
  () => ['home', 'about', 'album', 'notes', 'log'].includes(activeView.value)
)

// 应用启动即加载音乐清单，使后台播放（单例 Audio）随时可用，不受模块切换影响
onMounted(() => usePlayer().load())
</script>

<template>
  <ConfigProvider :theme="{ algorithm: themeAlgorithm, token: { colorPrimary: '#4f6ef7' } }">
    <div class="app-shell">
      <!-- (1) 顶部导航模块：始终在最上方，不被覆盖（使用 AntD Menu 组件） -->
      <AppHeader :active="activeView" @navigate="onNavigate" />

      <!-- (2) 导航下方的内容区，随导航选择切换 -->
      <div class="app-body" :class="{ scrollable }">
        <HomeView v-if="activeView === 'home'" @navigate="onNavigate" />
        <AboutView v-else-if="activeView === 'about'" />
        <AlbumView v-else-if="activeView === 'album'" />
        <MusicView v-else-if="activeView === 'music'" />
        <NoteView v-else-if="activeView === 'notes'" />
        <LogView v-else-if="activeView === 'log'" />
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

/* 内容区占满导航栏下方所有空间 */
.app-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow-x: hidden;
  overflow-y: hidden;
}

.app-body > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 100%;
}

/* home / about / music 等长内容页面可滚动 */
.app-body.scrollable {
  display: block;
  overflow-y: auto;
  box-sizing: border-box;
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
</style>
