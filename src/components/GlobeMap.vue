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
  lng: 111.256909,
  lat: 23.431489,
}

/* 中文地名标注：全国主要城市 + 全部足迹城市。
   MapLibre 对 CJK 字符默认走本地字体渲染（localIdeographFontFamily），
   因此无需额外的中文字形服务器即可显示中文。 */
const ZH_CITIES = [
  ['北京', 116.4074, 39.9042],
  ['上海', 121.4737, 31.2304],
  ['广州', 113.2644, 23.1291],
  ['深圳', 114.0579, 22.5431],
  ['佛山', 113.1219, 23.0215],
  ['东莞', 113.7518, 23.0205],
  ['贺州', 111.5667, 24.4036],
  ['南宁', 108.3669, 22.817],
  ['梧州', 111.2789, 23.4769],
  ['岑溪', 110.9981, 22.9181],
  ['香港', 114.1694, 22.3193],
  ['澳门', 113.5491, 22.1987],
  ['台北', 121.5654, 25.033],
  ['杭州', 120.1551, 30.2741],
  ['南京', 118.7969, 32.0603],
  ['武汉', 114.3054, 30.5931],
  ['成都', 104.0665, 30.5723],
  ['重庆', 106.5516, 29.563],
  ['西安', 108.9398, 34.3416],
  ['长沙', 112.9388, 28.2282],
  ['郑州', 113.6254, 34.7466],
  ['青岛', 120.3826, 36.0671],
  ['天津', 117.201, 39.0842],
  ['大连', 121.6147, 38.914],
  ['厦门', 118.0894, 24.4798],
  ['昆明', 102.8329, 24.8801],
  ['贵阳', 106.6302, 26.647],
  ['兰州', 103.8343, 36.0611],
  ['乌鲁木齐', 87.6168, 43.8256],
  ['拉萨', 91.1409, 29.6456],
  ['哈尔滨', 126.5349, 45.8038],
  ['沈阳', 123.4315, 41.8057],
  ['长春', 125.3235, 43.8171],
  ['石家庄', 114.5149, 38.0428],
  ['太原', 112.5489, 37.8706],
  ['济南', 117.1201, 36.6512],
  ['合肥', 117.2272, 31.8206],
  ['南昌', 115.8582, 28.6829],
  ['福州', 119.2965, 26.0745],
  ['海口', 110.1989, 20.0444],
  ['三亚', 109.5119, 18.2528],
  ['桂林', 110.29, 25.2736],
  ['柳州', 109.4159, 24.3264],
  ['珠海', 113.5767, 22.2707],
  ['中山', 113.392, 22.5176],
  ['惠州', 114.4162, 23.1118],
]

/* 访客城市英文名 -> 中文名（IP 定位返回的常见城市） */
const CITY_EN_ZH = {
  beijing: '北京', shanghai: '上海', guangzhou: '广州', shenzhen: '深圳',
  foshan: '佛山', dongguan: '东莞', hezhou: '贺州', nanning: '南宁',
  wuzhou: '梧州', cenxi: '岑溪', hongkong: '香港', macau: '澳门',
  hangzhou: '杭州', nanjing: '南京', wuhan: '武汉', chengdu: '成都',
  chongqing: '重庆', xian: '西安', changsha: '长沙', zhengzhou: '郑州',
  qingdao: '青岛', tianjin: '天津', dalian: '大连', xiamen: '厦门',
  kunming: '昆明', guiyang: '贵阳', lanzhou: '兰州', urumqi: '乌鲁木齐',
  lasa: '拉萨', harbin: '哈尔滨', shenyang: '沈阳', changchun: '长春',
  shijiazhuang: '石家庄', taiyuan: '太原', jinan: '济南', hefei: '合肥',
  nanchang: '南昌', fuzhou: '福州', haikou: '海口', sanya: '三亚',
  guilin: '桂林', liuzhou: '柳州', zhuhai: '珠海', zhongshan: '中山',
  huizhou: '惠州', taibei: '台北', taipei: '台北',
}

function cityZhName(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/[\u4e00-\u9fff]/.test(s)) return s
  return CITY_EN_ZH[s.toLowerCase().replace(/[^a-z]/g, '')] || ''
}

/* 省/州规范化：去掉“省/市/自治区”等后缀，只保留主体名称 */
function cleanRegion(r) {
  return String(r || '')
    .trim()
    .replace(/(壮族|回族|维吾尔)自治区$|自治区$|省$|市$/, '')
}

/* 由坐标反推最近的城市：IP 定位只给了坐标、没给城市名时使用
   （例如访客与站主相距仅 1.3km，必然同属梧州） */
function inferCityFromCoords(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return ''
  let best = ''
  let bestDist = Infinity
  for (const [name, clng, clat] of ZH_CITIES) {
    const d = haversineKm(lat, lng, clat, clng)
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return bestDist <= 35 ? best : ''
}

/* 访客城市名解析：中文名 → 坐标反推最近城市 → 原始名 → 访客 */
function resolveVisitorCity(v) {
  if (!v) return ''
  /* 名称与坐标一致性校验：若城市名对应的已知城市中心离实际坐标过远（>50km），
     说明名称来自其他来源（如 GPS 覆盖了 IP 坐标），应以坐标反推为准 */
  const zh = cityZhName(v.city)
  if (zh && v.lat != null) {
    const hit = ZH_CITIES.find(([cn]) => cn === zh)
    if (hit && haversineKm(v.lat, v.lng, hit[2], hit[1]) > 50) {
      return inferCityFromCoords(v.lng, v.lat) || zh
    }
  }
  return (
    zh ||
    (v.lat != null ? inferCityFromCoords(v.lng, v.lat) : '') ||
    (v.city ? String(v.city).trim() : '') ||
    '访客'
  )
}

/* 瓦片源（多源自动切换）
   首选高德栅格底图：中文地名最全（市区、道路、POI 等自带中文标注）；
   高德不可用时再回退矢量底图（Carto / OpenFreeMap）。 */
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
const locating = ref(true)
const ready = ref(false)
const failed = ref(false)
const providerIndex = ref(0)
const expanded = ref(false)
const fullscreenReady = ref(false)
const visitor = ref(null)
const distanceKm = ref(null)

/* 左下角地名：只显示城市名（不写省） */
const homePlaceText = '梧州'
const visitorPlaceText = computed(() => {
  const v = visitor.value
  if (!v || v.lat == null) return ''
  const city = (resolveVisitorCity(v) || String(v.city || '')).replace(/[市地区盟]$/, '')
  return city || String(v.country || '').trim() || '访客'
})

let loadTimer = 0
let tileErrors = 0
let map = null
let homeMarker = null
let visitorMarker = null
let routeLabelMarker = null
let visitorRenderQueued = false
let fsRevealTimer = 0

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
function dashedRoute(coords, dash = 7, gap = 6) {
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
        'line-width': 4,
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

/* ===== 虚线可见性标准 =====
   两点在屏幕上的距离占地图外框高度（上下宽度）的 40%～50%（超出 50% 则缩小），
   并且“两个点 + 整条虚线”必须完整显示在地图框内（留边距），
   不满足就迭代缩放（太短放大、太长缩小），直到达标（上限 zoom 17）。 */
const LINE_RATIO_MIN = 0.4
const LINE_RATIO_MAX = 0.5
const CAMERA_MARGIN = 56
const LINE_MAX_ZOOM = 17
const CAMERA_MAX_ITER = 8

/* 左下角城市标签面板的“禁区”：默认视图下圆点/虚线不得与其重叠 */
function labelZone(rect) {
  if (expanded.value) return null
  return {
    left: 16,
    top: rect.height - 46 - 108,
    right: 16 + 240,
    bottom: rect.height - 46,
    gap: 14,
  }
}

/* 视野求解器：以“两点 + 虚线采样点”的屏幕包围盒为准，迭代调整缩放与居中 */
function settleCamera(routeCoords) {
  if (!map || !routeCoords?.length) return
  const rect = map.getContainer().getBoundingClientRect()
  const targetMin = rect.height * LINE_RATIO_MIN
  const targetMax = rect.height * LINE_RATIO_MAX
  const fitW = Math.max(rect.width - CAMERA_MARGIN * 2, 1)
  const fitH = Math.max(rect.height - CAMERA_MARGIN * 2, 1)
  const zone = labelZone(rect)
  let guard = 0
  while (guard++ < CAMERA_MAX_ITER) {
    const pts = routeCoords.map(([lng, lat]) => map.project([lng, lat]))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const bboxW = maxX - minX
    const bboxH = maxY - minY
    const p0 = pts[0]
    const pN = pts[pts.length - 1]
    const dist = Math.hypot(pN.x - p0.x, pN.y - p0.y)
    const bboxFits = bboxW <= fitW && bboxH <= fitH
    const spanOk = dist >= targetMin && dist <= targetMax
    /* 与左下角标签面板重叠则平移避开 */
    let dx = 0
    let dy = 0
    const overlapX = zone && minX < zone.right && maxX > zone.left
    const overlapY = zone && maxY > zone.top && minY < zone.bottom
    const zoneClear = !(overlapX && overlapY)
    if (overlapX && overlapY) {
      const dxRight = zone.right + zone.gap - minX
      const dyUp = zone.top - zone.gap - maxY
      dx = dxRight > 0 ? dxRight : 0
      dy = dyUp > 0 ? dyUp : 0
    }
    if (bboxFits && spanOk && zoneClear) break
    let dz = 0
    /* 虚线太短 → 放大细化；超过外框 15% → 缩小控制 */
    if (dist < targetMin) dz = Math.log2(targetMin / Math.max(dist, 1))
    else if (dist > targetMax) dz = Math.log2(targetMax / dist)
    /* 有内容超出框外 → 缩小，保证全部可见（优先于长度标准） */
    if (!bboxFits) {
      const dzOutW = bboxW > fitW ? Math.log2(fitW / bboxW) : 0
      const dzOutH = bboxH > fitH ? Math.log2(fitH / bboxH) : 0
      dz = Math.min(dz, dzOutW, dzOutH)
    }
    const nextZoom = Math.min(LINE_MAX_ZOOM, Math.max(2, map.getZoom() + dz))
    /* 画面内容往右/上平移 dx/dy，需把视野中心往相反方向移动 */
    const center = map.unproject([(minX + maxX) / 2 - dx, (minY + maxY) / 2 - dy])
    map.jumpTo({ center, zoom: nextZoom })
  }
}

/* ===== 默认视野：站主与访客两点 + 连接虚线一同可见，且虚线长度达标 ===== */
function fitBoth() {
  if (!map) return
  const v = visitor.value
  if (expanded.value && v && v.lat != null) {
    const a = [HOME.lng, HOME.lat]
    const b = [v.lng, v.lat]
    const bounds = new LngLatBounds()
    bounds.extend(a)
    bounds.extend(b)
    /* 以两点为基准起步，再交给迭代求解器保证“两点 + 虚线”全部可见 */
    map.fitBounds(bounds, { padding: CAMERA_MARGIN, maxZoom: LINE_MAX_ZOOM, minZoom: 2, duration: 0 })
    settleCamera(greatCircle(HOME.lat, HOME.lng, v.lat, v.lng))
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

/* ===== 全屏渲染分辨率：高 DPI 屏幕（2x/3x）全屏地球像素量巨大，
   限制到 1.5x 可显著降低 GPU 负担，视觉几乎无差别 ===== */
const FULLSCREEN_MAX_DPR = 1.5

function applyPixelRatio() {
  if (!map) return
  const dpr = window.devicePixelRatio || 1
  map.setPixelRatio(expanded.value ? Math.min(dpr, FULLSCREEN_MAX_DPR) : dpr)
}

/* 移除矢量底图自带的（英文）地名标注，只保留我们自己的中文标注 */
function stripLabels() {
  if (!map) return
  for (const layer of map.getStyle().layers) {
    if (
      layer.type === 'symbol' &&
      layer.id !== 'zh-city-labels' &&
      map.getLayer(layer.id)
    ) {
      map.removeLayer(layer.id)
    }
  }
}

/* 中文城市标注数据：静态城市 + 访客所在城市（若已定位） */
function cityLabelData() {
  const features = ZH_CITIES.map(([name, lng, lat]) => ({
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  }))
  const v = visitor.value
  if (expanded.value && v && v.lat != null) {
    features.push({
      type: 'Feature',
      properties: { name: resolveVisitorCity(v) },
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
    })
  }
  return { type: 'FeatureCollection', features }
}

/* 添加中文地名图层（样式加载后调用；stripLabels 之后添加，避免被误删） */
function addCityLabels() {
  if (!map || map.getLayer('zh-city-labels')) return
  /* 高德底图自带完整中文地名，跳过自定义标注层避免重名 */
  if (PROVIDERS[providerIndex.value]?.name === 'amap') return
  if (!map.getSource('zh-cities')) {
    map.addSource('zh-cities', {
      type: 'geojson',
      data: cityLabelData(),
    })
  }
  map.addLayer({
    id: 'zh-city-labels',
    type: 'symbol',
    source: 'zh-cities',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 5, 12, 9, 14],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-anchor': 'top',
      'text-offset': [0, 0.7],
      'text-padding': 4,
    },
    paint: {
      'text-color': resolved.value === 'dark' ? '#e5ecf6' : '#23303f',
      'text-halo-color':
        resolved.value === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(255, 255, 255, 0.92)',
      'text-halo-width': 1.4,
    },
  })
}

/* 访客定位成功后刷新中文标注（含访客城市） */
function updateCityLabels() {
  if (!map) return
  addCityLabels()
  map.getSource('zh-cities')?.setData(cityLabelData())
}

/* 全屏内容全部就绪（定位 + 虚线 + 距离 + 渲染完成）后再揭示；
   样式/瓦片异常时兜底最多等待 8 秒 */
function scheduleFullscreenReveal() {
  if (!expanded.value || fullscreenReady.value) return
  clearTimeout(fsRevealTimer)
  const done = () => {
    if (expanded.value) fullscreenReady.value = true
  }
  if (map) map.once('idle', done)
  fsRevealTimer = setTimeout(done, 8000)
}

/* 渲染访客相关内容（绿点 + 虚线 + 距离标签 + 视野）；样式未就绪时由调用方挂起重试 */
function renderVisitorContent() {
  if (!map) return
  if (!map.isStyleLoaded()) {
    visitorRenderQueued = true
    return
  }
  visitorRenderQueued = false
  updateCityLabels()
  /* 默认视图不展示访客；仅全屏时添加绿点、虚线连线与视野 */
  if (!expanded.value || !visitor.value?.lat) return
  addVisitorMarker()
  addRoute()
  fitBoth()
  scheduleFullscreenReveal()
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
    /* 中文优先：ipip.net 返回中文省市（HTTPS + CORS），能看到国内真实出口 IP */
    {
      url: 'https://myip.ipip.net',
      decode: async (res) => await res.text(),
      parse: (text) => {
        /* 注意：响应末尾带换行，JS 正则的 . 不匹配换行符，需先 trim */
        const s = String(text || '').trim()
        const m = s.match(/来自于[:：]\s*(.+)$/)
        if (!m) return null
        const parts = m[1].trim().split(/[\s\u3000]+/).filter(Boolean)
        if (!parts.length) return null
        const country = parts[0] || ''
        const region = cleanRegion(parts[1] || '') || parts[1] || ''
        const city = String(parts[2] || '').replace(/[市地区盟]$/, '')
        const zh = cityZhName(city) || city
        const hit = ZH_CITIES.find(([cn]) => cn === zh)
        if (!hit) return null
        return { lat: hit[2], lng: hit[1], city: zh, region, country, source: 'ip' }
      },
    },
    /* 中文优先：pconline（HTTPS，GBK 编码）返回中文省市；城市在中文字典里时直接取坐标 */
    {
      url: 'https://whois.pconline.com.cn/ipJson.jsp?json=true',
      decode: async (res) =>
        JSON.parse(new TextDecoder('gbk').decode(await res.arrayBuffer())),
      parse: (d) => {
        if (!d || !d.city) return null
        const city = String(d.city).replace(/[市地区盟]$/, '')
        const zh = cityZhName(city) || city
        const hit = ZH_CITIES.find(([cn]) => cn === zh)
        return hit
          ? { lat: hit[2], lng: hit[1], city: zh, region: d.pro, country: '中国', source: 'ip' }
          : null
      },
    },
    /* 中文优先：ip-api.com 的 lang=zh-CN 返回中文城市名（仅 http，https 下会自动跳过） */
    {
      url: 'http://ip-api.com/json/?lang=zh-CN',
      parse: (d) =>
        d && d.status === 'success' && d.lat != null
          ? {
              lat: d.lat,
              lng: d.lon,
              city: String(d.city || '').replace(/[市地区盟]$/, '') || d.city,
              region: d.regionName,
              country: d.country,
              source: 'ip',
            }
          : null,
    },
    {
      url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: (d) => {
        const lat = parseFloat(d && d.latitude)
        const lng = parseFloat(d && d.longitude)
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, city: d.city, region: d.region, country: d.country, source: 'ip' }
          : null
      },
    },
    {
      url: 'https://ipwho.is/',
      parse: (d) => (d && d.success && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region, country: d.country, source: 'ip' }
        : null),
    },
    {
      url: 'https://freeipapi.com/api/json',
      parse: (d) => (d && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.cityName, region: d.regionName, country: d.countryName, source: 'ip' }
        : null),
    },
    {
      url: 'https://ipinfo.io/json',
      parse: (d) => {
        if (!d || !d.loc) return null
        const [lat, lng] = d.loc.split(',').map(Number)
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, city: d.city, region: d.region, country: d.country, source: 'ip' }
          : null
      },
    },
    {
      url: 'https://ipapi.co/json/',
      parse: (d) => (d && d.latitude != null
        ? { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region, country: d.country_name, source: 'ip' }
        : null),
    },
  ]
  /* IP 接口并行请求，取第一个成功结果（避免串行等待拖慢定位） */
  const settled = await Promise.allSettled(
    probes.map(async (p) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      try {
        const res = await fetch(p.url, { signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok) return null
        const data = p.decode ? await p.decode(res) : await res.json()
        return p.parse(data)
      } finally {
        clearTimeout(timer)
      }
    })
  )
  const hit = settled.find((r) => r.status === 'fulfilled' && r.value)
  if (hit) visitor.value = hit.value

  /* 浏览器 GPS 精确定位：拿到坐标后清空 IP 城市名，由坐标反推，避免名称/坐标矛盾 */
  await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve()
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          city: '',
          source: 'gps',
        }
        const ip = visitor.value
        /* GPS（网络定位）与 IP 定位差异过大时（例如代理/机房出口），保留更可信的 IP 结果 */
        if (ip && ip.lat != null && haversineKm(ip.lat, ip.lng, gps.lat, gps.lng) > 200) {
          resolve()
          return
        }
        visitor.value = gps
        resolve()
      },
      () => resolve(),
      { timeout: 8000, maximumAge: 600000 }
    )
  })
}

/* ===== 就绪展示：骨架屏期间不显示地图内容，
   等“定位完成 + 地图渲染完成”后才一次性展示最终正确结果 ===== */
let revealTimer = 0

function maybeReveal() {
  if (ready.value) return
  if (loading.value || locating.value) return
  if (map) {
    if (expanded.value && visitor.value?.lat != null) {
      addVisitorMarker()
      addRoute()
    }
    /* 先完成视野求解（同步、单次绘制），再展示，避免露出中间状态 */
    fitBoth()
  }
  ready.value = true
}

function startRevealTimer() {
  clearTimeout(revealTimer)
  revealTimer = setTimeout(() => {
    /* 兜底：最多等待 12 秒，避免网络异常时骨架屏卡死 */
    loading.value = false
    locating.value = false
    maybeReveal()
  }, 12000)
}

/* ===== 视图控制：默认只展示站主；全屏才定位访客并展示两点连线与距离 ===== */
async function toggleExpand() {
  expanded.value = !expanded.value
  await nextTick()
  applyPixelRatio()
  if (expanded.value) {
    /* 进入全屏：3D 地球 + 可交互；定位完成后显示绿点、虚线与距离 */
    fullscreenReady.value = false
    setInteractions(true)
    addNavControl()
    map?.setProjection({ type: 'globe' })
    map?.setPitch(32)
    if (visitor.value?.lat != null) {
      renderVisitorContent()
    } else {
      map.flyTo({ center: [HOME.lng, HOME.lat], zoom: 6, pitch: 32, duration: 1800 })
      if (!locating.value) {
        locating.value = true
        locateVisitor().then(() => {
          locating.value = false
          /* 定位失败/超时：直接揭示当前可显示的内容 */
          if (!visitor.value?.lat) scheduleFullscreenReveal()
        })
      }
    }
    /* 兜底：即使访客渲染被样式重建挂起，idle 后就绪也会揭示 */
    scheduleFullscreenReveal()
  } else {
    /* 退出全屏：恢复 2D 静态视图，只保留站主，移除访客相关显示 */
    clearTimeout(fsRevealTimer)
    fullscreenReady.value = false
    removeNavControl()
    setInteractions(false)
    map?.setProjection({ type: 'mercator' })
    map?.setPitch(0)
    removeRoute()
    visitorMarker?.remove()
    visitorMarker = null
    updateCityLabels()
    map.flyTo({ center: [HOME.lng, HOME.lat], zoom: 6, pitch: 0, duration: 1600 })
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
    /* 限制瓦片缓存，避免 globe 模式旋转时内存无限膨胀 */
    maxTileCacheSize: 128,
  })
  if (import.meta.env.DEV) window.__globeMap = map
  if (import.meta.env.DEV) {
    window.__setGlobeVisitor = (v) => {
      visitor.value = v
    }
  }
  /* 版权标注：高德要求保留，移至左上角，避免与左下角城市标签重叠 */
  map.addControl(new AttributionControl({ compact: true }), 'top-left')
  map.on('load', () => {
    clearTimeout(loadTimer)
    tileErrors = 0
    ensureHomeMarker()
    if (expanded.value && visitor.value?.lat != null) addVisitorMarker()
    applySky()
    applyPixelRatio()
    /* 去掉底图英文标注，换成中文城市标注 */
    stripLabels()
    addCityLabels()
    /* 默认 2D 静态视图；全屏状态才启用 3D 与交互 */
    map.setProjection({ type: expanded.value ? 'globe' : 'mercator' })
    map.setPitch(expanded.value ? 32 : 0)
    setInteractions(expanded.value)
    if (expanded.value) {
      addNavControl()
    } else {
      removeNavControl()
    }
    /* 默认视图只显示站主；全屏时再补访客点与虚线 */
    if (expanded.value && visitor.value?.lat != null) addRoute()
    visitorRenderQueued = false
    fitBoth()
  })
  /* 瓦片全部渲染完成才算“地图渲染完成” */
  map.on('idle', () => {
    loading.value = false
    maybeReveal()
    /* 样式重建期间定位完成的访客，等就绪后补渲染 */
    if (visitorRenderQueued) renderVisitorContent()
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
  startRevealTimer()
  /* 默认视图不定位访客；仅在进入全屏后按需定位 */
  locating.value = false
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
  if (map?.getLayer('zh-city-labels')) {
    map.setPaintProperty(
      'zh-city-labels',
      'text-color',
      resolved.value === 'dark' ? '#e5ecf6' : '#23303f'
    )
    map.setPaintProperty(
      'zh-city-labels',
      'text-halo-color',
      resolved.value === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(255, 255, 255, 0.92)'
    )
  }
})

watch(visitor, () => {
  updateDistance()
  if (!map) return
  /* 进入全屏时的投影/样式重建期间 isStyleLoaded 可能短暂为 false，
     先挂起，等 idle 就绪后再补渲染，避免访客内容被跳过 */
  if (!map.isStyleLoaded()) {
    visitorRenderQueued = true
    return
  }
  renderVisitorContent()
})

onUnmounted(() => {
  clearTimeout(loadTimer)
  clearTimeout(revealTimer)
  clearTimeout(fsRevealTimer)
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
    :class="{ expanded, 'dark-tiles': darkFilter, ready, 'fullscreen-ready': fullscreenReady }"
    role="region"
    aria-label="居住地地图"
  >
    <div v-if="failed" class="map-overlay">
      <div class="map-error-emoji">🗺️</div>
      <p class="map-error-main">地图暂时加载失败</p>
      <p class="map-error-hint">请检查网络后刷新页面</p>
    </div>
    <!-- 全屏加载：定位 + 虚线连线 + 距离标注 + 渲染全部完成后才展示 -->
    <div v-else-if="expanded && !fullscreenReady" class="map-overlay">
      <div class="skeleton-map" aria-hidden="true">
        <span class="sk"></span>
        <span class="sk sk-2"></span>
        <span class="sk sk-3"></span>
      </div>
      <span class="map-loading-dot"></span>
      <span class="overlay-text">{{ locating ? '正在定位访客位置…' : '正在渲染地球…' }}</span>
    </div>
    <!-- 骨架屏：定位完成 + 地图渲染完成前不展示地图内容 -->
    <div v-else-if="!ready" class="map-overlay">
      <div class="skeleton-map" aria-hidden="true">
        <span class="sk"></span>
        <span class="sk sk-2"></span>
        <span class="sk sk-3"></span>
      </div>
      <span class="map-loading-dot"></span>
      <span class="overlay-text">地图渲染中…</span>
    </div>

    <!-- 左下角：默认只显示站主省+市；全屏后再显示访客省+市 -->
    <div class="city-label" aria-hidden="true">
      <div class="city-label-row">
        <span class="city-label-dot home"></span>
        <span class="city-label-text">{{ homePlaceText }}</span>
      </div>
      <div v-if="expanded" class="city-label-row">
        <span class="city-label-dot visitor"></span>
        <span class="city-label-text visitor-text">{{ visitorPlaceText || (locating ? '定位中…' : '访客') }}</span>
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
/* 全屏加载期间：隐藏未完成的结果（左下角城市标签等），只留骨架屏与缩小按钮 */
.world-map.expanded:not(.fullscreen-ready) .city-label {
  display: none;
}

/* 左下角：站主（黄点）与访客（绿点）两个城市；玻璃拟态 + 亮/暗主题自适应 */
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
.city-label-dot.visitor {
  background: #22c55e;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.8);
}
.city-label-text {
  font-size: clamp(17px, 2.2vw, 22px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  color: var(--text);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}
.city-label-text.visitor-text {
  color: var(--text-secondary);
  text-shadow: none;
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
html[data-theme="dark"] .city-label-text.visitor-text {
  color: #a7f3d0;
  text-shadow: 0 0 14px rgba(34, 197, 94, 0.45);
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
