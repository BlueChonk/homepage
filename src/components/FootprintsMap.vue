<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { Map as MaplibreMap, Marker, AttributionControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from '../composables/useTheme'
import { FOOTPRINTS } from '../data/footprints'
import '../utils/maplibreWorker'

const { resolved } = useTheme()

/* 瓦片源（多源自动切换）
   优先使用矢量底图：加载后可移除所有地名标注，呈现干净的“点亮城市”效果；
   高德栅格瓦片仅作兜底（其地名已烘焙进图片，无法单独移除） */
const PROVIDERS = [
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
let labelsAdded = false
const labelMarkers = []

/* 生成覆盖市区范围的圆形色块（以城市中心为圆心、半径 r km） */
function circlePolygon(lng, lat, radiusKm, segments = 48) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const R = 6371
  const pts = []
  for (let i = 0; i < segments; i++) {
    const brng = (i / segments) * 2 * Math.PI
    const lat1 = toRad(lat)
    const lng1 = toRad(lng)
    const d = radiusKm / R
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    )
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      )
    pts.push([toDeg(lng2), toDeg(lat2)])
  }
  pts.push(pts[0])
  return pts
}

/* 真实行政边界：优先加载 GeoAtlas 数据（public/geo/{adcode}.json），失败则回退圆形色块 */
async function fetchRealFeatures() {
  const base = import.meta.env.BASE_URL || '/'
  const out = []
  for (const f of FOOTPRINTS) {
    try {
      const res = await fetch(`${base}geo/${f.adcode}.json`, { cache: 'no-cache' })
      const data = await res.json()
      const feat = data.features?.[0]
      if (feat?.geometry) {
        out.push({
          type: 'Feature',
          properties: { name: f.name },
          geometry: feat.geometry,
        })
        continue
      }
    } catch {
      /* 继续走回退 */
    }
    return null
  }
  return out
}

function circleFeatures() {
  return FOOTPRINTS.map((f) => ({
    type: 'Feature',
    properties: { name: f.name },
    geometry: {
      type: 'Polygon',
      coordinates: [circlePolygon(f.lng, f.lat, f.r)],
    },
  }))
}

/* 点亮城市：整个行政区边界填充醒目橙色（亮/暗主题均突出） */
function addAreas(features) {
  if (!map || map.getSource('footprint-areas')) return
  map.addSource('footprint-areas', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })
  map.addLayer({
    id: 'footprint-fill',
    type: 'fill',
    source: 'footprint-areas',
    paint: {
      'fill-color': '#ff9f1a',
      'fill-opacity': 0.62,
    },
  })
  map.addLayer({
    id: 'footprint-line',
    type: 'line',
    source: 'footprint-areas',
    paint: {
      'line-color': '#ffe3b3',
      'line-width': 1.5,
      'line-opacity': 0.95,
    },
  })
}

/* 移除底图自带的地名标注图层（矢量底图可用；高德栅格兜底时无此图层） */
function stripLabels() {
  if (!map) return
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && map.getLayer(layer.id)) {
      map.removeLayer(layer.id)
    }
  }
}

/* 城市边界只拉取一次，主题切换 / 换底图后复用 */
let featuresPromise = null

function getFootprintFeatures() {
  if (!featuresPromise) {
    featuresPromise = (async () => {
      let features = await fetchRealFeatures()
      if (!features) features = circleFeatures()
      return features
    })()
  }
  return featuresPromise
}

/* 样式加载（含换底图 / 主题切换）后重新铺上染色与城市标记 */
async function applyFootprints() {
  if (!map) return
  stripLabels()
  const features = await getFootprintFeatures()
  addAreas(features)
  addLabels()
  fitFootprints()
}

/* 自动框住所有足迹城市 */
function fitFootprints() {
  if (!map || !FOOTPRINTS.length) return
  const bounds = new LngLatBounds()
  FOOTPRINTS.forEach((m) => bounds.extend([m.lng, m.lat]))
  map.fitBounds(bounds, { padding: 64, duration: 0, maxZoom: 7 })
}

/* 点 + 图：城市中心一个橙色圆点，旁边标注城市名；区域由填充色块表示 */
function addLabels() {
  if (!map || labelsAdded) return
  labelsAdded = true
  for (const f of FOOTPRINTS) {
    const el = document.createElement('div')
    el.className = 'footprint-label'
    const dot = document.createElement('span')
    dot.className = 'fp-dot'
    const name = document.createElement('span')
    name.className = 'fp-name'
    name.textContent = f.name
    el.append(dot, name)
    const mk = new Marker({ element: el, anchor: 'center' })
      .setLngLat([f.lng, f.lat])
      .addTo(map)
    labelMarkers.push(mk)
  }
}

onMounted(() => {
  map = new MaplibreMap({
    container: container.value,
    style: styleUrl(),
    center: [113.9, 22.6],
    zoom: 6,
    renderWorldCopies: false,
    attributionControl: false,
    failIfMajorPerformanceCaveat: false,
  })
  if (import.meta.env.DEV) window.__fpMap = map
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right')
  map.on('style.load', applyFootprints)
  map.on('load', () => {
    clearTimeout(loadTimer)
    loading.value = false
    tileErrors = 0
    applyFootprints()
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
})

watch([resolved, providerIndex], () => {
  const p = PROVIDERS[providerIndex.value]
  if (map && !failed.value && p && !p.style) {
    map.setStyle(styleUrl(), { diff: false })
  }
})

onUnmounted(() => {
  clearTimeout(loadTimer)
  labelMarkers.forEach((mk) => mk.remove())
  labelMarkers.length = 0
  if (map?.getLayer('footprint-line')) map.removeLayer('footprint-line')
  if (map?.getLayer('footprint-fill')) map.removeLayer('footprint-fill')
  if (map?.getSource('footprint-areas')) map.removeSource('footprint-areas')
  map?.remove()
  map = null
  providerIndex.value = 0
})
</script>

<template>
  <div
    ref="container"
    class="footprints-map"
    :class="{ 'dark-tiles': darkFilter }"
    role="region"
    aria-label="足迹地图"
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
  </div>
</template>

<style scoped>
.footprints-map {
  position: relative;
  width: 100%;
  height: 400px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
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

/* 点 + 图：城市中心圆点 + 城市名 */
.footprints-map :deep(.footprint-label) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  white-space: nowrap;
  pointer-events: none;
}
.footprints-map :deep(.fp-dot) {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: #ff9f1a;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px rgba(255, 159, 26, 0.35);
}
.footprints-map :deep(.fp-name) {
  line-height: 1;
}

.footprints-map :deep(.maplibregl-ctrl-attrib) {
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-tertiary);
  font-size: 10px;
}
.footprints-map :deep(.maplibregl-ctrl-attrib a) {
  color: var(--accent);
}

@media (max-width: 720px) {
  .footprints-map {
    height: 320px;
  }
}
@media (max-width: 480px) {
  .footprints-map {
    height: 280px;
  }
}
.footprints-map.dark-tiles :deep(.maplibregl-canvas) {
  filter: invert(1) hue-rotate(180deg) brightness(0.9) saturate(0.85);
}
</style>
