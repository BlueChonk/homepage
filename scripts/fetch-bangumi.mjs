/**
 * Bangumi 用户名解析脚本
 *
 * 以前这里会在构建/启动时把用户的番剧/漫画/游戏收藏全部拉取到 public/bangumi.jsonl，
 * 导致进入 Bangumi 页面时一次性渲染上千条卡片、构建也被拖慢。
 *
 * 现在改为「按需分页」：
 *  - 构建期只做一次轻量请求，调用 /v0/me 解析出 username，输出 public/bangumi-config.json；
 *  - 前端 BangumiView 在用户进入页面时，再通过公网 API https://api.bgm.tv/v0/users/{username}/collections
 *    按 limit/offset 分页拉取（查看公开收藏无需 token），一次只渲染当前页，彻底避免卡死。
 *
 * 用法：
 *   node scripts/fetch-bangumi.mjs
 *
 * 环境变量：
 *   BANGUMI_USERNAME  — 可选，覆盖默认 Bangumi 用户名（公开信息，非敏感）
 *   不再依赖 Access Token（已从项目中移除，改用公开用户名直连，无需密钥）
 *
 * API 文档: https://bangumi.github.io/api/
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 代理支持（CI/沙箱环境自动检测 HTTPS_PROXY）
const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
if (_proxyUrl) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent({ uri: _proxyUrl }))
    console.log(`[bangumi] 使用代理: ${_proxyUrl}`)
  } catch {
    console.warn('[bangumi] 检测到代理但 undici 未安装，直连模式可能失败')
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT = path.resolve(__dirname, '..', 'public', 'bangumi-config.json')

const BANGUMI_API = 'https://api.bgm.tv'

/* 默认公开用户名；可用环境变量 BANGUMI_USERNAME 覆盖。 */
const DEFAULT_USERNAME = '799398'

const UA = 'cecilia4412/homepage (https://github.com/cecilia4412/homepage)'

/**
 * 解析用户名：优先 BANGUMI_USERNAME，否则回退到默认公开用户名。
 * 用户名是公开信息，查看公开收藏无需凭证。
 */
async function resolveUsername() {
  if (process.env.BANGUMI_USERNAME) return process.env.BANGUMI_USERNAME.trim()
  return DEFAULT_USERNAME
}

/**
 * 主函数：解析用户名 → 写入 public/bangumi-config.json
 * 前端读取该文件决定调用哪个用户的收藏接口。
 */
export async function fetchBangumi() {
  let username
  try {
    username = await resolveUsername()
  } catch (e) {
    console.warn(`[bangumi] ${e.message}`)
    username = ''
  }

  const config = { username }
  fs.writeFileSync(OUTPUT, JSON.stringify(config, null, 2) + '\n')

  if (username) {
    console.log(`[bangumi] 用户名解析成功: ${username} → public/bangumi-config.json`)
  } else {
    console.warn('[bangumi] 解析用户名失败，Bangumi 页面可能无法加载')
  }
}

// 直接运行（Windows 下 process.argv[1] 是普通路径而非 file: URL，改为判断脚本文件名）
if (process.argv[1] && (process.argv[1].endsWith('fetch-bangumi.mjs') || /fetch-bangumi\.mjs$/i.test(process.argv[1]))) {
  fetchBangumi()
    .catch((e) => {
      console.error('[bangumi] 解析失败:', e)
      process.exit(1)
    })
}