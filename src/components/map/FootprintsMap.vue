<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { loadAMap } from '../../utils/amap'

const FOOTPRINTS = []

/* 居住地：把这里改成你的具体坐标（高德 GCJ02） */
const HOME = { name: '家', lng: 113.2644, lat: 23.1291 }

const loading = ref(true)
const failed = ref(false)
const emptyState = ref(false)
const container = ref(null)
let map = null
let districtLayer = null
let homeMarker = null

const hasFootprints = FOOTPRINTS.length > 0

const R = 6371
const toRad = (d) => (d * Math.PI) / 180
function kmBetween(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function fitBounds(AMap) {
  const bounds = new AMap.Bounds()
  if (hasFootprints) {
    const pts = FOOTPRINTS
    let target = pts
    if (pts.length > 3) {
      const MAX_KM = 450
      let best = []
      for (const a of pts) {
        const near = pts.filter((b) => kmBetween(a.lat, a.lng, b.lat, b.lng) <= MAX_KM)
        if (near.length > best.length) best = near
      }
      if (best.length >= Math.max(4, Math.ceil(pts.length / 2))) target = best
    }
    target.forEach((f) => bounds.extend(new AMap.LngLat(f.lng, f.lat)))
  }
  bounds.extend(new AMap.LngLat(HOME.lng, HOME.lat))
  map.setBounds(bounds, false, [32, 32, 32, 32])
}

onMounted(async () => {
  try {
    const AMap = await loadAMap()
    map = new AMap.Map(container.value, {
      zoom: 6,
      center: [113.9, 22.6],
      viewMode: '2D',
    })

    if (hasFootprints) {
      districtLayer = new AMap.DistrictLayer.SubDistrict({
        adcode: FOOTPRINTS.map((f) => String(f.adcode)),
        level: 'city',
        depth: 2,
        lineWidth: 1,
        lineJoin: 'round',
        fillColor: '#ff9f1a',
        fillOpacity: 0.55,
        strokeColor: '#ffd88a',
        strokeOpacity: 0.95,
      })
      districtLayer.setMap(map)
    }

    homeMarker = new AMap.Marker({
      position: [HOME.lng, HOME.lat],
      title: HOME.name,
      content: '<div class="fp-home">🏠</div>',
    })
    homeMarker.setMap(map)

    fitBounds(AMap)
    if (!hasFootprints) emptyState.value = true
    loading.value = false
  } catch (e) {
    failed.value = true
  }
})

onUnmounted(() => {
  districtLayer?.setMap(null)
  homeMarker?.setMap(null)
  map?.destroy()
  map = null
})
</script>

<template>
  <div ref="container" class="footprints-map" role="region" aria-label="足迹地图">
    <div v-if="loading" class="map-overlay">
      <span class="map-loading-dot"></span>
      <span>地图加载中…</span>
    </div>
    <div v-else-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请确认已配置高德 Key 并在控制台加好安全域名</p>
    </div>
    <div v-else-if="emptyState" class="map-overlay">
      <div class="map-error-emoji">📍</div>
      <p class="map-error-main">暂无足迹数据</p>
      <p class="map-error-hint">编辑 FOOTPRINTS 列表添加去过的城市</p>
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
  background: #eef0f2;
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
/* 居住地圆形标记 */
.fp-home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 18px;
  background: #fff;
  border: 2px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.footprints-map :deep(.amap-logo),
.footprints-map :deep(.amap-copyright) {
  opacity: 0.7;
}
</style>