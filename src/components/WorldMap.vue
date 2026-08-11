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
import { FOOTPRINTS } from '../data/footprints'

const { resolved } = useTheme()

/* ===== 站主家乡：中国广西梧州市龙圩区龙圩镇广信路 215 号 =====
   坐标采用与高德瓦片一致的 GCJ-02 坐标系，保证标记与街道精确对齐 */
const HOME = {
  name: 'Wuzhou · Guangxi, China',
  short: 'Wuzhou, Guangxi',
  address: 'Guangxin Road 215, Longxu Town, Longxu District, Wuzhou, Guangxi, China',
  lng: 111.2573,
  lat: 23.4312,
}

/* 瓦片源（多源自动切换：国内优先，避免单一源访问受限导致黑屏） */
const PROVIDERS = [
  {
    name: 'amap',
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
const expanded = ref(false)
const visitor = ref(null)
const distanceKm = ref(null)

let loadTimer = 0
let tileErrors = 0
let map = null
let markersAdded = false
let homeMarker = null
let visitorMarker = null

const container = ref(null)

function styleUrl() {
  const p = PROVIDERS[providerIndex.value]
  if (p.style) return p.style()
  return resolved.value === 'dark' ? p.dark : p.light
}

/* 高德为浅色栅格，暗色主题时给画布加反色滤镜 */
const darkFilter = computed(
  () => resolved.value === 'dark' && PROVIDERS[providerIndex.value]?.name === 'amap'
)

function applySky() {
  if (!map) return
  const dark = resolved.value === 'dark'
  map.setSky({
    'atmosphere-blend': 1,
    'sky-color': dark ? '#0b1020' : '#cfe8ff',
    'horizon-color': dark ? '#2b3a5c' : '#eaf4ff',
    'fog-color': dark ? '#0b1020' : '#ffffff',
  })
}

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

/* ===== 距离计算（Haversine 公式，单位 km） ===== */
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

const distanceText = computed(() => {
  if (distanceKm.value === null) return ''
  const km = distanceKm.value
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-US')} km`
})

function updateDistance() {
  if (visitor.value?.lat != null) {
    distanceKm.value = haversineKm(HOME.lat, HOME.lng, visitor.value.lat, visitor.value.lng)
  }
}

/* ===== 标记 ===== */
function addHomeMarker() {
  const el = document.createElement('div')
  el.className = 'map-pin home-pin'
  el.title = HOME.address
  el.innerHTML = `
    <span class="map-pin-dot"></span>
    <span class="map-pin-label">${HOME.short}</span>
  `
  homeMarker = new Marker({ element: el, anchor: 'bottom' })
    .setLngLat([HOME.lng, HOME.lat])
    .addTo(map)
}

function addVisitorMarker() {
  const v = visitor.value
  if (!v || v.lat == null || !map) return
  const label = v.city && v.country ? `${v.city}, ${v.country}` : 'You'
  const el = document.createElement('div')
  el.className = 'map-pin visitor-pin'
  el.innerHTML = `
    <span class="map-pin-dot"></span>
    <span class="map-pin-label">${label}</span>
  `
  visitorMarker?.remove()
  visitorMarker = new Marker({ element: el, anchor: 'bottom' })
    .setLngLat([v.lng, v.lat])
    .addTo(map)
}

function addMarkers() {
  if (!map || markersAdded) return
  markersAdded = true
  for (const m of FOOTPRINTS) {
    const el = document.createElement('div')
    el.className = 'map-pin'
    el.innerHTML = `
      <span class="map-pin-dot"></span>
      <span class="map-pin-label">${m.name}</span>
    `
    new Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map)
  }
  addHomeMarker()
}

/* ===== 访客定位：IP 兜底 + 浏览器精确定位 ===== */
async function locateVisitor() {
  try {
    const res = await fetch('https://ipwho.is/')
    const d = await res.json()
    if (d && d.success) {
      visitor.value = {
        lat: d.latitude,
        lng: d.longitude,
        city: d.city,
        country: d.country,
        source: 'ip',
      }
      updateDistance()
      addVisitorMarker()
    }
  } catch {
    try {
      const res = await fetch('https://ipapi.co/json/')
      const d = await res.json()
      if (d && d.latitude != null) {
        visitor.value = {
          lat: d.latitude,
          lng: d.longitude,
          city: d.city,
          country: d.country_name,
          source: 'ip',
        }
        updateDistance()
        addVisitorMarker()
      }
    } catch {
      /* 网络不可用时等待浏览器定位 */
    }
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        visitor.value = {
          ...(visitor.value || {}),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps',
        }
        updateDistance()
        addVisitorMarker()
      },
      () => {
        /* 用户拒绝或定位失败：保留 IP 定位结果 */
      },
      { timeout: 8000, maximumAge: 600000 }
    )
  }
}

/* ===== 视图控制 ===== */
function goHome() {
  map?.flyTo({
    center: [HOME.lng, HOME.lat],
    zoom: 13,
    pitch: 55,
    bearing: 0,
    duration: 2200,
  })
}

function goWorld() {
  map?.flyTo({
    center: [HOME.lng, 26],
    zoom: 1.6,
    pitch: 22,
    bearing: -12,
    duration: 2200,
  })
}

function goVisitor() {
  const v = visitor.value
  if (v && v.lat != null) {
    map?.flyTo({ center: [v.lng, v.lat], zoom: 5.5, pitch: 40, duration: 2200 })
  }
}

async function toggleExpand() {
  expanded.value = !expanded.value
  await nextTick()
  map?.resize()
}

onMounted(() => {
  map = new MaplibreMap({
    container: container.value,
    style: styleUrl(),
    center: [HOME.lng, 27.5],
    zoom: 3.5,
    pitch: 35,
    bearing: -8,
    projection: { type: 'globe' },
    renderWorldCopies: false,
    attributionControl: false,
    failIfMajorPerformanceCaveat: false,
  })
  map.addControl(
    new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }),
    'top-right'
  )
  map.addControl(new AttributionControl({ compact: true }), 'bottom-left')
  container.value?.classList.toggle('dark-tiles', darkFilter.value)
  map.on('load', () => {
    clearTimeout(loadTimer)
    loading.value = false
    tileErrors = 0
    addMarkers()
    applySky()
  })
  map.on('error', (e) => {
    if (failed.value) return
    const err = e?.error
    if (e.source || e.tile) {
      tileErrors++
      if (tileErrors >= 12) tryNextProvider()
      return
    }
    if (err && !map.loaded() && !failed.value) tryNextProvider()
  })
  armLoadTimer()
  locateVisitor()
})

watch([resolved, providerIndex], () => {
  const p = PROVIDERS[providerIndex.value]
  container.value?.classList.toggle('dark-tiles', darkFilter.value)
  applySky()
  if (map && !failed.value && p && !p.style) {
    map.setStyle(styleUrl(), { diff: false })
  }
})

onUnmounted(() => {
  clearTimeout(loadTimer)
  visitorMarker?.remove()
  homeMarker?.remove()
  map?.remove()
  map = null
  markersAdded = false
  providerIndex.value = 0
})
</script>

<template>
  <div
    ref="container"
    class="world-map"
    :class="{ expanded }"
    role="region"
    aria-label="3D 地球与足迹"
  >
    <div v-if="loading" class="map-overlay">
      <span class="map-loading-dot"></span>
      <span>地球加载中…</span>
    </div>
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>

    <!-- 右下角信息卡：家乡地址 + 访客距离 + 视图控制 -->
    <aside class="map-card">
      <div class="map-card-head">
        <span class="map-card-title">My Home · 我的家乡</span>
        <button class="map-card-icon" :title="expanded ? '还原' : '放大扩展'" @click="toggleExpand">
          <svg v-if="!expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l6 6M14 10l6-6M4 20l6-6M14 14l6 6" />
          </svg>
        </button>
      </div>
      <p class="map-card-addr" :title="HOME.address">{{ HOME.address }}</p>
      <p class="map-card-now">
        <span class="now-dot"></span>
        Now at: {{ HOME.name }}
      </p>

      <div v-if="distanceKm !== null && visitor" class="map-card-visitor">
        <span class="you-dot"></span>
        <span class="you-text">
          You · {{ visitor.city || 'your location' }}<template v-if="visitor.country">, {{ visitor.country }}</template>
          <b>{{ distanceText }} away</b>
        </span>
      </div>
      <p v-else class="map-card-hint">允许定位后，将显示你与家乡的距离</p>

      <div class="map-card-actions">
        <button @click="goHome">家乡</button>
        <button @click="goWorld">世界</button>
        <button v-if="visitor && visitor.lat != null" @click="goVisitor">我的位置</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.world-map {
  position: relative;
  width: 100%;
  height: 460px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 1.5px) 0 0 / 26px 26px,
    var(--bg-soft);
  transition: border-radius 0.25s ease;
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

/* ===== 右下角信息卡 ===== */
.map-card {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 20;
  width: min(320px, calc(100% - 28px));
  padding: 12px 14px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--text);
}
.map-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.map-card-title {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.map-card-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.map-card-icon:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.map-card-icon svg {
  width: 14px;
  height: 14px;
}
.map-card-addr {
  margin: 8px 0 4px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.map-card-now {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.now-dot,
.you-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
.map-card-visitor {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
  border: 1px solid var(--accent-border);
}
.you-dot {
  margin-top: 4px;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}
.you-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.you-text b {
  display: block;
  font-size: 13px;
  color: var(--accent-strong);
}
.map-card-hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.map-card-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.map-card-actions button {
  flex: 1 1 auto;
  padding: 7px 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.map-card-actions button:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

/* ===== 标记 ===== */
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

/* 家乡标记：金色强调 + 更大的脉冲 */
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
.world-map :deep(.home-pin .map-pin-label) {
  color: #fff;
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  border-color: rgba(255, 255, 255, 0.4);
}

/* 访客标记：绿色 */
.world-map :deep(.visitor-pin .map-pin-dot) {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.3);
}
.world-map :deep(.visitor-pin .map-pin-dot)::after {
  border-color: #22c55e;
}
.world-map :deep(.visitor-pin .map-pin-label) {
  color: #15803d;
  border-color: rgba(34, 197, 94, 0.45);
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
    height: 380px;
  }
  .map-card {
    right: 10px;
    bottom: 10px;
    width: min(290px, calc(100% - 20px));
  }
}
@media (max-width: 480px) {
  .world-map {
    height: 340px;
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
