/* 高德 JS API v2 加载器
 * - 通过 loadAMap() 返回 Promise，拿到全局 AMap 构造器
 * - Key / 安全密钥(JSCode) 由 .env 提供（VITE_AMAP_*），不硬编码进仓库
 * - 仅需把这套文件的占位值替换成你自己的高德 Key 即可
 */
// 高德 Web端(JS API) Key
// 取值优先级：构建期注入的 __AMAP_API_KEY__（EdgeOne 控制台环境变量 AMAP_API_KEY）
// → 本地 .env 的 VITE_AMAP_KEY（开发时用）
const AMAP_KEY = (
  __AMAP_API_KEY__ || import.meta.env.VITE_AMAP_KEY || ''
).trim()
// 高德安全密钥（jscode），未开启「联合鉴权」时可为空
const AMAP_SECURITY_JS_CODE = (import.meta.env.VITE_AMAP_SECURITY_JS_CODE || '').trim()

let amapPromise = null

export function loadAMap() {
  if (!amapPromise) {
    amapPromise = new Promise((resolve, reject) => {
      if (window.AMap) return resolve(window.AMap)
      if (!AMAP_KEY) return reject(new Error('未配置高德 Key（请设置 .env 的 VITE_AMAP_KEY，或 EdgeOne 环境变量 AMAP_API_KEY）'))

      // 使用安全密钥(jscode)时必须先于脚本注入配置
      if (AMAP_SECURITY_JS_CODE) {
        window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_JS_CODE }
      }

      const script = document.createElement('script')
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}`
      script.async = true
      script.onerror = () => reject(new Error('高德地图脚本加载失败'))
      script.onload = () => {
        window.AMap ? resolve(window.AMap) : reject(new Error('未拿到 AMap 对象，请检查 Key 与安全域名'))
      }
      document.head.appendChild(script)
    })
  }
  return amapPromise
}