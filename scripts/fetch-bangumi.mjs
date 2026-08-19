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
 *   BANGUMI_USERNAME  — 直接指定 Bangumi 用户名（推荐，无需 token）
 *   BANGUMI_TOKEN     — 或提供 Access Token，脚本会自动通过 /v0/me 解析用户名
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
const TOKEN = process.env.BANGUMI_TOKEN || ''

const UA = 'cecilia4412/homepage (https://github.com/cecilia4412/homepage)'

/**
 * 优先使用 BANGUMI_USERNAME；否则用 Token 调用 /v0/me 解析用户名。
 */
async function resolveUsername() {
  if (process.env.BANGUMI_USERNAME) return process.env.BANGUMI_USERNAME.trim()
  if (!TOKEN) return ''

  const res = await fetch(`${BANGUMI_API}/v0/me`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': UA,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`获取用户信息失败: HTTP ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return data.username
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
    console.warn('[bangumi] 未配置 BANGUMI_USERNAME/BANGUMI_TOKEN，请在构建环境配置后在 Bangumi 页面按需加载')
  }
}

// 直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBangumi().catch((e) => {
    console.error('[bangumi] 解析失败:', e)
    process.exit(1)
  })
}