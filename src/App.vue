<script setup>
import { ref, computed, onMounted } from 'vue'
import { ConfigProvider, theme } from 'ant-design-vue'
import AppHeader from './components/AppHeader.vue'
import GlobalPlayer from './components/GlobalPlayer.vue'
import HomeView from './views/HomeView.vue'
import AboutView from './views/AboutView.vue'
import AlbumView from './views/AlbumView.vue'
import NoteView from './views/NoteView.vue'
import LogView from './views/LogView.vue'
import MusicView from './views/MusicView.vue'
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
  () => ['home', 'about', 'album', 'notes', 'log'].includes(activeView.value)
)

onMounted(() => usePlayer().load())
</script>

<template>
  <ConfigProvider :theme="{ algorithm: themeAlgorithm, token: { colorPrimary: '#4f6ef7' } }">
    <div class="app-shell">
      <AppHeader :active="activeView" @navigate="onNavigate" />

      <div class="app-body" :class="{ scrollable }">
        <HomeView v-if="activeView === 'home'" @navigate="onNavigate" />
        <AboutView v-else-if="activeView === 'about'" />
        <AlbumView v-else-if="activeView === 'album'" />
        <MusicView v-else-if="activeView === 'music'" />
        <NoteView v-else-if="activeView === 'notes'" />
        <LogView v-else-if="activeView === 'log'" />
      </div>

      <!-- 全局底部播放器（所有页面可见，支持折叠/展开） -->
      <GlobalPlayer @navigate="onNavigate" />
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
}

.app-body > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 100%;
}

.app-body.scrollable {
  display: block;
  overflow-y: auto;
  box-sizing: border-box;
  /* 底部留出全局播放器的高度 */
  padding-bottom: 56px;
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
