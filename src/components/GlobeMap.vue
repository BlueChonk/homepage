<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import {
  Map as MaplibreMap,
  Marker,
  AttributionControl,
  NavigationControl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from '../composables/useTheme'
import '../utils/maplibreWorker'

const { resolved } = useTheme()

/* 精确居住地仅保留在代码内部，页面不展示任何地址文字：
   广西壮族自治区梧州市龙圩区龙圩镇广信路215号 */
const HOME = {
  name: '广西梧州',
  lng: 111.256909,
  lat: 23.431489,
}

/* 底图：仅使用高德栅格（中文地名最全），不再配置其他底图源 */
function amapStyle() {
  return {
    version: 8,
    sources: {
      amap: {
        type: 'raster',
        tiles: [
          'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
          'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
          'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
          'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: '© 高德地图',
      },
    },
    layers: [
      {
        id: 'amap',
        type: 'raster',
        source: 'amap',
        paint: { 'raster-fade-duration': 0 },
      },
    ],
  }
}

const loading = ref(true)
const ready = ref(false)
const failed = ref(false)
const expanded = ref(false)

/* 左下角地名：只显示城市名（不写省） */
const homePlaceText = '梧州'

let map = null
let homeMarker = null

const container = ref(null)

/* 高德为浅色栅格，暗色主题时给画布加反色滤镜 */
const darkFilter = computed(() => resolved.value === 'dark')

function applySky() {
  if (!map) return
  const dark = resolved.value === 'dark'
  const inverted = darkFilter.value
  const palette = inverted
    ? { sky: '#cfe8ff', horizon: '#eaf4ff', fog: '#ffffff' }
    : dark
      ? { sky: '#0b1020', horizon: '#2b3a5c', fog: '#0b1020' }
      : { sky: '#cfe8ff', horizon: '#eaf4ff', fog: '#ffffff' }
  map.setSky({
    'atmosphere-blend': 1,
    'sky-color': palette.sky,
    'horizon-color': palette.horizon,
    'fog-color': palette.fog,
  })
}

/* ===== 默认视野：始终聚焦站主所在城市 ===== */
function fitBoth() {
  if (!map) return
  map.flyTo({
    center: [HOME.lng, HOME.lat],
    zoom: 6,
    pitch: expanded.value ? 32 : 0,
    duration: 1600,
  })
}

/* ===== 交互开关：未全屏时禁止一切拖拽 / 缩放 / 旋转 ===== */
function setInteractions(enabled) {
  if (!map) return
  const handlers = [
    'dragPan',
    'dragRotate',
    'scrollZoom',
    'boxZoom',
    'doubleClickZoom',
    'touchZoomRotate',
    'touchPitch',
    'keyboard',
  ]
  for (const name of handlers) {
    const handler = map[name]
    if (handler && typeof handler[enabled ? 'enable' : 'disable'] === 'function') {
      handler[enabled ? 'enable' : 'disable']()
    }
  }
}

/* ===== 右上角缩放/角度控件：仅全屏时出现 ===== */
let navControl = null

function addNavControl() {
  if (navControl || !map) return
  navControl = new NavigationControl({
    visualizePitch: true,
    showCompass: true,
    showZoom: true,
  })
  map.addControl(navControl, 'top-right')
}

function removeNavControl() {
  if (navControl && map) {
    map.removeControl(navControl)
    navControl = null
  }
}

/* ===== 全屏渲染分辨率：高 DPI 屏幕（2x/3x）全屏地球像素量巨大，
   限制到 1.5x 可显著降低 GPU 负担，视觉几乎无差别 ===== */
const FULLSCREEN_MAX_DPR = 1.5

function applyPixelRatio() {
  if (!map) return
  const dpr = window.devicePixelRatio || 1
  map.setPixelRatio(expanded.value ? Math.min(dpr, FULLSCREEN_MAX_DPR) : dpr)
}

/* ===== 标记：仅圆点，不带文字 ===== */
function addHomeMarker() {
  const el = document.createElement('div')
  el.className = 'map-pin home-pin'
  el.innerHTML = '<span class="map-pin-dot"></span>'
  homeMarker = new Marker({ element: el, anchor: 'bottom' })
    .setLngLat([HOME.lng, HOME.lat])
    .addTo(map)
}

function ensureHomeMarker() {
  if (map && !homeMarker) addHomeMarker()
}

/* ===== 就绪展示：底图样式解析完成即可展示（瓦片随后异步加载） ===== */
let revealTimer = 0

function maybeReveal() {
  if (ready.value || loading.value) return
  if (map) fitBoth()
  ready.value = true
}

function startRevealTimer() {
  clearTimeout(revealTimer)
  revealTimer = setTimeout(() => {
    /* 兜底：最多等待 12 秒，避免网络异常时骨架屏卡死 */
    loading.value = false
    maybeReveal()
  }, 12000)
}

/* ===== 视图控制：默认 2D 聚焦站主；全屏 3D 地球仅做放大 ===== */
async function toggleExpand() {
  expanded.value = !expanded.value
  await nextTick()
  applyPixelRatio()
  if (expanded.value) {
    setInteractions(true)
    addNavControl()
    map?.setProjection({ type: 'globe' })
    map?.setPitch(32)
  } else {
    removeNavControl()
    setInteractions(false)
    map?.setProjection({ type: 'mercator' })
    map?.setPitch(0)
  }
  fitBoth()
}

onMounted(() => {
  map = new MaplibreMap({
    container: container.value,
    style: amapStyle(),
    center: [HOME.lng, HOME.lat],
    zoom: 6,
    pitch: 0,
    projection: { type: 'mercator' },
    renderWorldCopies: false,
    attributionControl: false,
    failIfMajorPerformanceCaveat: false,
    /* 限制瓦片缓存，避免 globe 模式旋转时内存无限膨胀 */
    maxTileCacheSize: 128,
  })
  if (import.meta.env.DEV) window.__globeMap = map
  /* 版权标注：高德要求保留，移至左上角，避免与左下角城市标签重叠 */
  map.addControl(new AttributionControl({ compact: true }), 'top-left')
  map.on('load', () => {
    ensureHomeMarker()
    applySky()
    applyPixelRatio()
    /* 默认 2D 静态视图；全屏状态才启用 3D 与交互 */
    map.setProjection({ type: expanded.value ? 'globe' : 'mercator' })
    map.setPitch(expanded.value ? 32 : 0)
    setInteractions(expanded.value)
    if (expanded.value) {
      addNavControl()
    } else {
      removeNavControl()
    }
    /* 样式解析完成即可展示，避免长时间等待瓦片导致的骨架屏 */
    loading.value = false
    maybeReveal()
  })
  /* 兜底：idle 后仍未展示时再放行一次 */
  map.on('idle', () => {
    loading.value = false
    maybeReveal()
  })
  map.on('error', (e) => {
    if (failed.value) return
    const err = e?.error
    /* 瓦片偶发错误不影响底图；仅当样式加载失败时标记失败 */
    if (e.source || e.tile) return
    if (err && !map.loaded() && !failed.value) failed.value = true
  })
  startRevealTimer()
})

watch(resolved, () => {
  applySky()
})

onUnmounted(() => {
  clearTimeout(revealTimer)
  homeMarker?.remove()
  map?.remove()
  map = null
})
</script>

<template>
  <div
    ref="container"
    class="world-map"
    :class="{ expanded, 'dark-tiles': darkFilter, ready }"
    role="region"
    aria-label="居住地地图"
  >
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>
    <!-- 骨架屏：底图渲染完成前不展示地图内容 -->
    <div v-else-if="!ready" class="map-overlay">
      <div class="skeleton-map" aria-hidden="true">
        <span class="sk"></span>
        <span class="sk sk-2"></span>
        <span class="sk sk-3"></span>
      </div>
      <span class="map-loading-dot"></span>
      <span class="overlay-text">地图渲染中…</span>
    </div>

    <!-- 左下角：站主所在城市 -->
    <div class="city-label" aria-hidden="true">
      <div class="city-label-row">
        <span class="city-label-dot home"></span>
        <span class="city-label-text">{{ homePlaceText }}</span>
      </div>
    </div>

    <!-- 默认：右下角仅一个全屏按钮；全屏：仅一个缩小按钮 -->
    <button v-if="!expanded" class="expand-fab" title="进入全屏" aria-label="进入全屏" @click="toggleExpand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
      </svg>
    </button>

    <button v-else class="map-exit" title="还原" aria-label="缩小" @click="toggleExpand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
  /* 地球周围的空间背景：亮色为淡蓝天空，暗色为星空 */
  background: linear-gradient(180deg, #b9d8f5 0%, #e3f1fc 55%, #f4f9fe 100%);
  transition: border-radius 0.25s ease;
}
html[data-theme="dark"] .world-map {
  background:
    radial-gradient(circle 1.2px at 18% 24%, rgba(255, 255, 255, 0.75), transparent 100%),
    radial-gradient(circle 1.6px at 62% 12%, rgba(255, 255, 255, 0.55), transparent 100%),
    radial-gradient(circle 1px at 82% 55%, rgba(255, 255, 255, 0.45), transparent 100%),
    radial-gradient(circle 1px at 38% 78%, rgba(255, 255, 255, 0.5), transparent 100%),
    radial-gradient(circle 1.2px at 9% 82%, rgba(255, 255, 255, 0.4), transparent 100%),
    radial-gradient(circle 1.6px at 92% 88%, rgba(255, 255, 255, 0.35), transparent 100%),
    linear-gradient(180deg, #0d1628 0%, #070c18 55%, #04060d 100%);
}

/* 放大扩展：铺满整个视口 */
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

/* 骨架屏期间：隐藏地图上的浮层内容，避免展示未就绪的错误状态 */
.world-map:not(.ready) .city-label,
.world-map:not(.ready) .expand-fab,
.world-map:not(.ready) .map-exit {
  display: none;
}

/* 左下角：站主所在城市；玻璃拟态 + 亮/暗主题自适应 */
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
html[data-theme="dark"] .city-label {
  background: color-mix(in srgb, #0b1224 58%, transparent);
  border-color: rgba(148, 163, 184, 0.28);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
html[data-theme="dark"] .city-label-text {
  color: #f2f6ff;
  text-shadow:
    0 2px 14px rgba(79, 110, 247, 0.6),
    0 0 28px rgba(79, 110, 247, 0.28);
}

/* 右下角全屏按钮（默认视图） */
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

/* ===== 全屏右下角缩小按钮 ===== */
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

/* ===== 标记：纯圆点，不显示文字 ===== */
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

/* ===== 控件配色 ===== */
.world-map :deep(.maplibregl-ctrl-group) {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.world-map :deep(.maplibregl-ctrl-group button) {
  background: var(--surface);
  color: var(--text-secondary);
}
.world-map :deep(.maplibregl-ctrl-group button:hover) {
  background: var(--surface-hover);
}
.world-map :deep(.maplibregl-ctrl-attrib) {
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-tertiary);
  font-size: 10px;
}
.world-map :deep(.maplibregl-ctrl-attrib a) {
  color: var(--accent);
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

.world-map.dark-tiles :deep(.maplibregl-canvas) {
  filter: invert(1) hue-rotate(180deg) brightness(0.9) saturate(0.85);
}
</style>
