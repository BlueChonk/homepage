/* 高德 JS API v2 加载器
 * - 通过 loadAMap() 返回 Promise，拿到全局 AMap 构造器
 * - Key / 安全密钥(JSCode) 由 .env 提供（VITE_AMAP_*），不硬编码进仓库
 * - 仅需把这套文件的占位值替换成你自己的高德 Key 即可
 */
// 高德 Web端(JS API) Key；留空时使用占位值（会导致加载失败并提示，需自行填写）
const AMAP_KEY = (import.meta.env.VITE_AMAP_KEY || 'YOUR_AMAP_WEB_JS_KEY').trim()
// 高德安全密钥（jscode），未开启「联合鉴权」时可为空
const AMAP_SECURITY_JS_CODE = (import.meta.env.VITE_AMAP_SECURITY_JS_CODE || '').trim()

let amapPromise = null

export function loadAMap() {
  if (!amapPromise) {
    amapPromise = new Promise((resolve, reject) => {
      if (window.AMap) return resolve(window.AMap)

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