<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { loadAMap } from '../../utils/amap'
import { useTheme } from '../../composables/useTheme'

const { resolved } = useTheme()

const HOME = {
  name: '广西梧州',
  lng: 111.256909,
  lat: 23.431489,
}

const homePlaceText = '梧州'

const loading = ref(true)
const ready = ref(false)
const failed = ref(false)
const expanded = ref(false)

const container = ref(null)

let map = null
let homeMarker = null
let satelliteLayer = null
let navControl = null

watch(resolved, () => {
  if (!map) return
  if (resolved.value === 'dark') {
    map.setMapStyle('amap://styles/dark')
  } else {
    map.setMapStyle('amap://styles/normal')
  }
})

function applyMapStyle() {
  if (!map) return
  if (resolved.value === 'dark') {
    map.setMapStyle('amap://styles/dark')
  } else {
    map.setMapStyle('amap://styles/normal')
  }
}

function ensureHomeMarker() {
  if (!map || homeMarker) return
  const el = document.createElement('div')
  el.className = 'map-pin home-pin'
  el.innerHTML = '<span class="map-pin-dot"></span>'
  homeMarker = new window.AMap.Marker({
    position: [HOME.lng, HOME.lat],
    content: el,
    offset: new window.AMap.Pixel(-7, -7),
    anchor: 'bottom-center',
    zIndex: 200,
  })
  homeMarker.setMap(map)
}

function addNavControl() {
  if (navControl || !map) return
  navControl = new window.AMap.Control.Zoom({ position: 'RB' })
  map.addControl(navControl)
}

function removeNavControl() {
  if (navControl && map) {
    map.removeControl(navControl)
    navControl = null
  }
}

async function toggleExpand() {
  expanded.value = !expanded.value
  await nextTick()
  if (!map) return
  if (expanded.value) {
    map.setPitch(45)
    map.setRotation(-15)
    map.setZoom(14)
    addNavControl()
  } else {
    map.setPitch(0)
    map.setRotation(0)
    map.setZoom(6)
    map.setCenter([HOME.lng, HOME.lat])
    removeNavControl()
  }
}

onMounted(async () => {
  try {
    const AMap = await loadAMap()
    map = new AMap.Map(container.value, {
      viewMode: '3D',
      pitch: 0,
      zoom: 6,
      center: [HOME.lng, HOME.lat],
      mapStyle: resolved.value === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
      features: ['bg', 'road', 'building', 'point'],
    })
    if (import.meta.env.DEV) window.__globeMap = map

    satelliteLayer = new AMap.TileLayer.Satellite()
    map.add(satelliteLayer)

    map.on('complete', () => {
      ensureHomeMarker()
      applyMapStyle()
      loading.value = false
      ready.value = true
    })

    map.on('error', () => {
      if (!ready.value) failed.value = true
    })

    setTimeout(() => {
      if (loading.value) {
        loading.value = false
        ready.value = true
        ensureHomeMarker()
      }
    }, 6000)
  } catch (e) {
    failed.value = true
  }
})

onUnmounted(() => {
  removeNavControl()
  homeMarker?.setMap(null)
  homeMarker = null
  if (map) {
    map.destroy()
    map = null
  }
})
</script>

<template>
  <div
    ref="container"
    class="world-map"
    :class="{ expanded, ready }"
    role="region"
    aria-label="居住地地图"
  >
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>
    <div v-else-if="!ready" class="map-overlay">
      <div class="skeleton-map" aria-hidden="true">
        <span class="sk"></span>
        <span class="sk sk-2"></span>
        <span class="sk sk-3"></span>
      </div>
      <span class="map-loading-dot"></span>
      <span class="overlay-text">地图加载中…</span>
    </div>

    <div class="city-label" aria-hidden="true">
      <div class="city-label-row">
        <span class="city-label-dot home"></span>
        <span class="city-label-text">{{ homePlaceText }}</span>
      </div>
    </div>

    <button v-if="!expanded" class="expand-fab" title="进入全屏" aria-label="进入全屏" @click="toggleExpand">
      <svg viewBox="0 0 24  24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
      </svg>
    </button>

    <button v-else class="map-exit" title="还原" aria-label="缩小" @click="toggleExpand">
      <svg viewBox="0 0 24  24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4l6 6M14 10l6-6M4 20l6-6M14 14l6 6" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.world-map {
  position: relative;
  width: 100%;
  height: 520px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  background: var(--bg-soft);
  transition: border-radius 0.25s ease;
}

.world-map.expanded {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  border-radius: 0;
  border: none;
}

.map-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  background: color-mix(in srgb, var(--bg-soft) 86%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.map-loading-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: map-spin 0.8s linear infinite;
}

@keyframes map-spin {
  to { transform: rotate(360deg); }
}

.skeleton-map {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(220px, 72%);
}

.skeleton-map .sk {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--border) 25%, var(--surface-hover) 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.3s ease-in-out infinite;
  opacity: 0.65;
}

.skeleton-map .sk-2 { width: 78%; }
.skeleton-map .sk-3 { width: 90%; }

@keyframes sk-shimmer {
  to { background-position: -200% 0; }
}

.overlay-text {
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.map-error-emoji {
  font-size: 34px;
  opacity: 0.85;
}

.map-error-main {
  margin: 0;
  font-size: 13.5px;
}

.map-error-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.75;
}

.world-map:not(.ready) .city-label,
.world-map:not(.ready) .expand-fab,
.world-map:not(.ready) .map-exit {
  display: none;
}

.city-label {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 20px 12px 16px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 58%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.city-label-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.city-label-dot {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.city-label-dot.home {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.85);
}

.city-label-text {
  font-size: clamp(17px, 2.2vw, 22px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  color: var(--text);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}

.expand-fab {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 20;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.expand-fab:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
  transform: scale(1.05);
}

.expand-fab svg {
  width: 18px;
  height: 18px;
}

.map-exit {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 30;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.map-exit:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
  transform: scale(1.05);
}

.map-exit svg {
  width: 18px;
  height: 18px;
}

.world-map :deep(.map-pin) {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transform: translateY(-4px);
}

.world-map :deep(.map-pin-dot) {
  position: relative;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--accent);
  border: 2.5px solid var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.world-map :deep(.map-pin-dot)::after {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  animation: map-pin-pulse 2.2s ease-out infinite;
}

@keyframes map-pin-pulse {
  0% { transform: scale(0.55); opacity: 1; }
  100% { transform: scale(1.9); opacity: 0; }
}

.world-map :deep(.home-pin .map-pin-dot) {
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #fbbf24, #f97316);
  border-color: #fff;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.35), 0 4px 12px rgba(249, 115, 22, 0.45);
}

.world-map :deep(.home-pin .map-pin-dot)::after {
  border-color: #fbbf24;
}

.world-map :deep(.amap-logo),
.world-map :deep(.amap-copyright) {
  opacity: 0.7;
}

@media (max-width: 720px) {
  .world-map {
    height: 420px;
  }
  .city-label {
    left: 12px;
    bottom: 12px;
    padding: 8px 16px 8px 12px;
    border-radius: 14px;
    gap: 9px;
  }
  .city-label-text {
    font-size: 20px;
  }
  .map-exit,
  .expand-fab {
    right: 10px;
    bottom: 10px;
  }
}

@media (max-width: 480px) {
  .world-map {
    height: 380px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .world-map :deep(.map-pin-dot)::after {
    animation: none;
  }
}
</style>
