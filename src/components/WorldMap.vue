<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { Map as MaplibreMap, Marker, AttributionControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from '../composables/useTheme'

const { resolved } = useTheme()

/* ===== 标记点：在这里增删坐标即可，地图会自动缩放定位 =====
   lng = 经度（东经为正），lat = 纬度（北纬为正） */
const MARKERS = [
  { lng: 113.2644, lat: 23.1291, label: '广州', note: '广州' },
  { lng: 114.0579, lat: 22.5431, label: '深圳', note: '深圳' },
  { lng: 113.1219, lat: 23.0215, label: '佛山', note: '佛山' },
  { lng: 113.7518, lat: 23.0205, label: '东莞', note: '东莞' },
  { lng: 111.5667, lat: 24.4036, label: '贺州', note: '贺州' },
  { lng: 121.4737, lat: 31.2304, label: '上海', note: '上海' },
  { lng: 116.4074, lat: 39.9042, label: '北京', note: '北京' },
  { lng: 108.3669, lat: 22.817, label: '南宁', note: '南宁' },
  { lng: 111.2789, lat: 23.4769, label: '梧州', note: '梧州' },
  { lng: 110.9981, lat: 22.9181, label: '岑溪', note: '岑溪' },
]

/* 免费矢量瓦片（多源自动切换：国内优先，避免单一源访问受限导致黑屏） */
const PROVIDERS = [
  {
    name: 'amap',
    // 高德栅格瓦片：国内可直连；暗色主题下对画布做反色滤镜
    style: () => ({
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
          attribution: '© 高德地图',
        },
      },
      layers: [
        { id: 'amap-bg', type: 'background', paint: { 'background-color': '#eef0f2' } },
        { id: 'amap', type: 'raster', source: 'amap' },
      ],
    }),
  },
  {
    name: 'carto',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  {
    name: 'openfreemap',
    dark: 'https://tiles.openfreemap.org/styles/dark',
    light: 'https://tiles.openfreemap.org/styles/positron',
  },
]

const loading = ref(true)
const failed = ref(false)
const providerIndex = ref(0)
let loadTimer = 0
let tileErrors = 0

function styleUrl() {
  const p = PROVIDERS[providerIndex.value]
  if (p.style) return p.style()
  return resolved.value === 'dark' ? p.dark : p.light
}

/* 高德为浅色栅格，暗色主题时给画布加反色滤镜 */
const darkFilter = computed(
  () => resolved.value === 'dark' && PROVIDERS[providerIndex.value]?.name === 'amap'
)

function armLoadTimer() {
  clearTimeout(loadTimer)
  loadTimer = setTimeout(() => {
    if (!failed.value) tryNextProvider()
  }, 12000)
}

function tryNextProvider() {
  if (failed.value || !map) return
  providerIndex.value++
  tileErrors = 0
  if (providerIndex.value >= PROVIDERS.length) {
    failed.value = true
    loading.value = false
    return
  }
  loading.value = true
  armLoadTimer()
}

const container = ref(null)
let map = null
let markersAdded = false

function addMarkers() {
  if (!map || markersAdded) return
  markersAdded = true
  for (const m of MARKERS) {
    const el = document.createElement('div')
    el.className = 'map-pin'
    el.innerHTML = `
      <span class="map-pin-dot"></span>
      <span class="map-pin-label">${m.label}</span>
    `
    new Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map)
  }
  // 让地图自动框住所有标记点
  if (MARKERS.length) {
    const bounds = new LngLatBounds()
    MARKERS.forEach((m) => bounds.extend([m.lng, m.lat]))
    map.fitBounds(bounds, { padding: 64, duration: 0, maxZoom: 8 })
  }
}

onMounted(() => {
  map = new MaplibreMap({
    container: container.value,
    style: styleUrl(),
    center: [113.9, 22.6],
    zoom: 6,
    attributionControl: false,
    failIfMajorPerformanceCaveat: false,
  })
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right')
  container.value?.classList.toggle('dark-tiles', darkFilter.value)
  map.on('load', () => {
    clearTimeout(loadTimer)
    loading.value = false
    tileErrors = 0
    addMarkers()
  })
  map.on('error', (e) => {
    if (failed.value) return
    const err = e?.error
    if (e.source || e.tile) {
      // 瓦片连续失败说明当前源不可用（如网络受限），累计到阈值后换源
      tileErrors++
      if (tileErrors >= 12) tryNextProvider()
      return
    }
    // 仅在地图尚未加载完成时，样式级错误（无 source/tile）触发换源；
    // 加载完成后出现的字体/资源错误一律忽略，避免反复重载
    if (err && !map.loaded() && !failed.value) tryNextProvider()
  })
  armLoadTimer()
})

/* 主题切换时无缝换底图（标记点保留） */
watch([resolved, providerIndex], () => {
  const p = PROVIDERS[providerIndex.value]
  container.value?.classList.toggle('dark-tiles', darkFilter.value)
  if (map && !failed.value && p && !p.style) {
    map.setStyle(styleUrl(), { diff: false })
  }
})

onUnmounted(() => {
  clearTimeout(loadTimer)
  map?.remove()
  map = null
  markersAdded = false
  providerIndex.value = 0
})
</script>

<template>
  <div ref="container" class="world-map" role="region" aria-label="世界地图足迹">
    <div v-if="loading" class="map-overlay">
      <span class="map-loading-dot"></span>
      <span>地图加载中…</span>
    </div>
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>
  </div>
</template>

<style scoped>
.world-map {
  position: relative;
  width: 100%;
  height: 400px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  /* 加载/失败时显示主题化点阵，而不是一片黑 */
  background:
    radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 1.5px) 0 0 / 26px 26px,
    var(--bg-soft);
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

/* 自定义标记：强调色脉冲圆点 + 悬浮标签（动态创建，用 :deep 命中） */
.world-map :deep(.map-pin) {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transform: translateY(-4px);
}
.world-map :deep(.map-pin-dot) {
  position: relative;
  width: 14px;
  height: 14px;
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
.world-map :deep(.map-pin-label) {
  margin-top: 6px;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
}

/* 导航控件配色跟随主题 */
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
    height: 300px;
  }
}
@media (max-width: 480px) {
  .world-map {
    height: 250px;
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
