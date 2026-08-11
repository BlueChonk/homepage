/**
 * MapLibre GL 工作线程修复：
 * maplibre-gl 内部用 `new URL('./maplibre-gl-worker.mjs', import.meta.url)`
 * 定位 worker，但 Vite 预打包或 Rollup 打包时该文件不会被一并产出，
 * 导致 worker 加载失败 -> GeoJSON/矢量图层（足迹染色、虚线连线）不渲染。
 *
 * 这里用 Vite 的 `?worker&url` 让 Vite 自行打包 worker（含其依赖），
 * 并在创建地图之前用 setWorkerUrl 指向正确地址。
 */
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)

export { maplibreWorkerUrl }
