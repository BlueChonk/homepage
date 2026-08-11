<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import {
  Map as MaplibreMap,
  Marker,
  AttributionControl,
  NavigationControl,
  LngLatBounds,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from '../composables/useTheme'
import '../utils/maplibreWorker'

const { resolved } = useTheme()

/* 精确居住地仅保留在代码内部，页面不展示任何地址文字：
   广西壮族自治区梧州市龙圩区龙圩镇广信路215号 */
const HOME = {
  name: '广西梧州',
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
let homeMarker = null
let visitorMarker = null
let routeLabelMarker = null

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

/* ===== 大圆路径插值：两点间沿地球表面的弧线 ===== */
function greatCircle(aLat, aLng, bLat, bLng, segments = 96) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const f1 = toRad(aLat)
  const l1 = toRad(aLng)
  const f2 = toRad(bLat)
  const l2 = toRad(bLng)
  const dl = l2 - l1
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const d = Math.acos(
      Math.max(-1, Math.min(1, Math.sin(f1) * Math.sin(f2) + Math.cos(f1) * Math.cos(f2) * Math.cos(dl)))
    )
    let lat
    let lng
    if (Math.sin(d) < 1e-9) {
      lat = f1 + (f2 - f1) * t
      lng = l1 + dl * t
    } else {
      const A = Math.sin((1 - t) * d) / Math.sin(d)
      const B = Math.sin(t * d) / Math.sin(d)
      const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2)
      const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2)
      const z = A * Math.sin(f1) + B * Math.sin(f2)
      lat = Math.atan2(z, Math.sqrt(x * x + y * y))
      lng = Math.atan2(y, x)
    }
    pts.push([toDeg(lng), toDeg(lat)])
  }
  return pts
}

/* 把大圆路径拆成一段段小线段，用几何方式实现虚线（地球投影下同样生效） */
function dashedRoute(coords, dash = 8, gap = 8) {
  const segments = []
  let i = 0
  while (i < coords.length - 1) {
    const end = Math.min(i + dash, coords.length - 1)
    segments.push(coords.slice(i, end + 1))
    i = end + gap
  }
  return segments.filter((s) => s.length >= 2)
}

/* ===== 虚线连线 + 距离标签 ===== */
function addRoute() {
  const v = visitor.value
  if (!map || !v || v.lat == null) return
  const coords = greatCircle(HOME.lat, HOME.lng, v.lat, v.lng)
  const data = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: dashedRoute(coords),
    },
  }
  if (map.getSource('home-route')) {
    map.getSource('home-route').setData(data)
  } else {
    map.addSource('home-route', { type: 'geojson', data })
    map.addLayer({
      id: 'home-route',
      type: 'line',
      source: 'home-route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': resolved.value === 'dark' ? '#8aa3ff' : '#4f6ef7',
        'line-width': 3.5,
        'line-opacity': 1,
      },
    })
  }
  const mid = coords[Math.floor(coords.length / 2)]
  const el = document.createElement('div')
  el.className = 'route-label'
  el.textContent = distanceText.value
  routeLabelMarker?.remove()
  routeLabelMarker = new Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map)
}

function removeRoute() {
  if (!map) return
  routeLabelMarker?.remove()
  routeLabelMarker = null
  if (map.getLayer('home-route')) map.removeLayer('home-route')
  if (map.getSource('home-route')) map.removeSource('home-route')
}

/* ===== 默认视野：站主与访客两点在地球上一同可见 ===== */
function fitBoth() {
  if (!map) return
  const v = visitor.value
  if (v && v.lat != null) {
    const bounds = new LngLatBounds()
    bounds.extend([HOME.lng, HOME.lat])
    bounds.extend([v.lng, v.lat])
    map.fitBounds(bounds, { padding: 80, maxZoom: 6, minZoom: 2, duration: 1800 })
  } else {
    map.flyTo({
      center: [HOME.lng, HOME.lat],
      zoom: 6,
      pitch: expanded.value ? 32 : 0,
      duration: 1600,
    })
  }
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

function addVisitorMarker() {
  const v = visitor.value
  if (!v || v.lat == null || !map) return
  const el = document.createElement('div')
  el.className = 'map-pin visitor-pin'
  el.innerHTML = '<span class="map-pin-dot"></span>'
  visitorMarker?.remove()
  visitorMarker = new Marker({ element: el, anchor: 'bottom' })
    .setLngLat([v.lng, v.lat])
    .addTo(map)
}

/* ===== 访客定位：IP 多接口兜底（限流/失败自动切换）+ 浏览器精确定位 ===== */
async function locateVisitor() {
  const probes = [
    {
      url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: (d) => {
        const lat = parseFloat(d && d.latitude)
        const lng = parseFloat(d && d.longitude)
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, city: d.city, country: d.country, source: 'ip' }
          : null
      },
    },
    {
      url: 'https://ipwho.is/',
      parse: (d) => (d && d.success && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country, source: 'ip' }
        : null),
    },
    {
      url: 'https://freeipapi.com/api/json',
      parse: (d) => (d && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.cityName, country: d.countryName, source: 'ip' }
        : null),
    },
    {
      url: 'https://ipinfo.io/json',
      parse: (d) => {
        if (!d || !d.loc) return null
        const [lat, lng] = d.loc.split(',').map(Number)
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, city: d.city, country: d.country, source: 'ip' }
          : null
      },
    },
    {
      url: 'https://ipapi.co/json/',
      parse: (d) => (d && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country_name, source: 'ip' }
        : null),
    },
  ]
  for (const p of probes) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(p.url, { signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(timer)
      if (!res.ok) continue
      const v = p.parse(await res.json())
      if (v) {
        visitor.value = v
        break
      }
    } catch {
      /* 该接口不可用，尝试下一个 */
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
      },
      () => {
        /* 用户拒绝或定位失败：保留 IP 定位结果 */
      },
      { timeout: 8000, maximumAge: 600000 }
    )
  }
}

/* ===== 视图控制：默认与全屏均为 3D 地球，默认框住两点 ===== */
async function toggleExpand() {
  expanded.value = !expanded.value
  await nextTick()
  map?.resize()
  if (expanded.value) {
    /* 进入全屏：3D 地球 + 可交互 + 虚线连线与距离 */
    setInteractions(true)
    addNavControl()
    map?.setProjection({ type: 'globe' })
    map?.setPitch(32)
    if (visitor.value?.lat != null) {
      addVisitorMarker()
      addRoute()
      fitBoth()
    } else {
      map.flyTo({ center: [HOME.lng, HOME.lat], zoom: 6, pitch: 32, duration: 1800 })
    }
  } else {
    /* 退出全屏：恢复 2D 静态视图，只保留两点 */
    removeNavControl()
    setInteractions(false)
    map?.setProjection({ type: 'mercator' })
    map?.setPitch(0)
    removeRoute()
    if (visitor.value?.lat != null) {
      addVisitorMarker()
      fitBoth()
    } else {
      map.flyTo({ center: [HOME.lng, HOME.lat], zoom: 6, pitch: 0, duration: 1600 })
    }
  }
}

onMounted(() => {
  map = new MaplibreMap({
    container: container.value,
    style: styleUrl(),
    center: [HOME.lng, HOME.lat],
    zoom: 6,
    pitch: 0,
    projection: { type: 'mercator' },
    renderWorldCopies: false,
    attributionControl: false,
    failIfMajorPerformanceCaveat: false,
  })
  if (import.meta.env.DEV) window.__globeMap = map
  map.addControl(new AttributionControl({ compact: true }), 'bottom-left')
  map.on('load', () => {
    clearTimeout(loadTimer)
    loading.value = false
    tileErrors = 0
    ensureHomeMarker()
    applySky()
    /* 默认 2D 静态视图；全屏状态才启用 3D 与交互 */
    map.setProjection({ type: expanded.value ? 'globe' : 'mercator' })
    map.setPitch(expanded.value ? 32 : 0)
    setInteractions(expanded.value)
    if (expanded.value) {
      addNavControl()
      if (visitor.value?.lat != null) addRoute()
    } else {
      removeNavControl()
    }
    fitBoth()
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
  applySky()
  if (map && !failed.value && p && !p.style) {
    map.setStyle(styleUrl(), { diff: false })
  }
  if (map?.getLayer('home-route')) {
    map.setPaintProperty(
      'home-route',
      'line-color',
      resolved.value === 'dark' ? '#8aa3ff' : '#4f6ef7'
    )
  }
})

watch(visitor, () => {
  updateDistance()
  if (!map || !map.loaded()) return
  addVisitorMarker()
  if (expanded.value) addRoute()
  fitBoth()
})

onUnmounted(() => {
  clearTimeout(loadTimer)
  removeRoute()
  visitorMarker?.remove()
  homeMarker?.remove()
  map?.remove()
  map = null
  providerIndex.value = 0
})
</script>

<template>
  <div
    ref="container"
    class="world-map"
    :class="{ expanded, 'dark-tiles': darkFilter }"
    role="region"
    aria-label="居住地地图"
  >
    <div v-if="loading" class="map-overlay">
      <span class="map-loading-dot"></span>
      <span>地图加载中…</span>
    </div>
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>

    <!-- 左下角：居住城市大字（亮/暗主题自适应） -->
    <div class="city-label" aria-hidden="true">
      <span class="city-label-dot"></span>
      <span class="city-label-text">广西梧州</span>
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

/* 左下角居住城市大字：玻璃拟态 + 亮/暗主题自适应 */
.city-label {
  position: absolute;
  left: 16px;
  bottom: 46px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 20px 10px 15px;
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
.city-label-dot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24, #f97316);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.85);
}
.city-label-text {
  font-size: clamp(22px, 2.8vw, 32px);
  font-weight: 800;
  letter-spacing: 0.14em;
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
.world-map :deep(.visitor-pin .map-pin-dot) {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.3);
}
.world-map :deep(.visitor-pin .map-pin-dot)::after {
  border-color: #22c55e;
}

/* 虚线连线中点的距离标签 */
.world-map :deep(.route-label) {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--accent-border);
  color: var(--accent-strong);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  pointer-events: none;
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
    bottom: 44px;
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
