/**
 * Bangumi 收藏数据拉取脚本
 *
 * 从 Bangumi API (api.bgm.tv) 获取用户的收藏列表，
 * 按条目类型（番剧/漫画/游戏）和收藏状态（想看/在看/看过）拉取全部数据，
 * 输出为 public/bangumi.jsonl，供前端 BangumiView 动态加载。
 *
 * 用法：
 *   node scripts/fetch-bangumi.mjs
 *
 * 环境变量：
 *   BANGUMI_TOKEN     — Bangumi Access Token（必填，只需 token 即可）
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
const OUTPUT = path.resolve(__dirname, '..', 'public', 'bangumi.jsonl')

const BANGUMI_API = 'https://api.bgm.tv'
const TOKEN = process.env.BANGUMI_TOKEN || ''

const UA = 'cecilia4412/homepage (https://github.com/cecilia4412/homepage)'

/* 条目类型: 1=书籍(含漫画), 2=动画(番剧), 4=游戏 */
const SUBJECT_TYPES = {
  anime: 2,
  manga: 1,
  game: 4,
}

/* 收藏类型: 1=想看, 2=看过(已完成), 3=在看(在追) */
const COLLECTION_TYPES = {
  wish: 1,
  done: 2,
  doing: 3,
}

const SUBJECT_TYPE_LABELS = {
  2: 'anime',
  1: 'manga',
  4: 'game',
}

const COLLECTION_TYPE_LABELS = {
  1: 'wish',
  2: 'done',
  3: 'doing',
}

/**
 * 延迟函数，避免请求过于频繁
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 获取用户收藏列表（分页拉取全部）
 *
 * @param {number} subjectType - 条目类型 (1/2/4)
 * @param {number} collectionType - 收藏类型 (1/2/3)
 * @returns {Promise<Array>} 收藏记录数组
 */
async function fetchCollections(username, subjectType, collectionType) {
  const results = []
  const limit = 50 // API 最大限制
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const url = `${BANGUMI_API}/v0/users/${username}/collections?subject_type=${subjectType}&type=${collectionType}&limit=${limit}&offset=${offset}`

    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'User-Agent': UA,
          Accept: 'application/json',
        },
      })

      if (!resp.ok) {
        console.error(
          `[bangumi] HTTP ${resp.status}: ${resp.statusText} (subject_type=${subjectType}, type=${collectionType}, offset=${offset})`
        )
        break
      }

      const json = await resp.json()
      total = json.total || 0
      results.push(...(json.data || []))
      console.log(
        `[bangumi] ${SUBJECT_TYPE_LABELS[subjectType]}/${COLLECTION_TYPE_LABELS[collectionType]}: ${results.length}/${total}`
      )

      if ((json.data || []).length < limit) break
      offset += limit
      await sleep(300) // 请求间隔，避免触发限流
    } catch (e) {
      console.error(
        `[bangumi] 请求失败 (subject_type=${subjectType}, type=${collectionType}, offset=${offset}):`,
        e.message
      )
      break
    }
  }

  return results
}

/**
 * 将原始 API 数据映射为精简的 JSONL 记录
 */
function mapItem(item) {
  const s = item.subject || {}
  const images = s.images || {}
  return {
    subject_id: item.subject_id,
    type: SUBJECT_TYPE_LABELS[item.subject_type] || 'other',
    collection: COLLECTION_TYPE_LABELS[item.type] || 'other',
    rate: item.rate || 0,
    comment: item.comment || '',
    tags: item.tags || [],
    ep_status: item.ep_status || 0,
    vol_status: item.vol_status || 0,
    updated_at: item.updated_at || '',
    name: s.name || '',
    name_cn: s.name_cn || '',
    summary: s.short_summary || '',
    date: s.date || '',
    eps: s.eps || 0,
    volumes: s.volumes || 0,
    score: s.score || 0,
    rank: s.rank || 0,
    image: images.common || images.large || images.medium || '',
  }
}

/**
 * 用 Token 获取当前用户名
 * 调用 /v0/me 端点，无需手动配置 BANGUMI_USERNAME
 */
async function getUsername() {
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
 * 主函数：拉取所有类型和状态的收藏，输出 JSONL
 */
export async function fetchBangumi() {
  if (!TOKEN) {
    console.warn('[bangumi] BANGUMI_TOKEN 未设置，跳过拉取')
    return
  }

  // 用 Token 获取用户名
  let username
  try {
    username = await getUsername()
    console.log(`[bangumi] Token 认证成功，用户名: ${username}`)
  } catch (e) {
    console.warn(`[bangumi] ${e.message}，跳过拉取`)
    return
  }

  console.log(`[bangumi] 开始拉取用户 ${username} 的收藏数据...`)

  const allItems = []

  // 遍历 3 种条目类型 × 3 种收藏状态
  for (const [stKey, stVal] of Object.entries(SUBJECT_TYPES)) {
    for (const [ctKey, ctVal] of Object.entries(COLLECTION_TYPES)) {
      const items = await fetchCollections(username, stVal, ctVal)
      allItems.push(...items.map(mapItem))
      await sleep(200)
    }
  }

  // 写入 JSONL
  const lines = allItems.map((o) => JSON.stringify(o))
  fs.writeFileSync(OUTPUT, lines.join('\n') + (lines.length ? '\n' : ''))

  // 统计
  const stats = allItems.reduce((acc, item) => {
    const key = `${item.type}/${item.collection}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  console.log(`[bangumi] 完成！共 ${allItems.length} 条记录 → public/bangumi.jsonl`)
  console.log('[bangumi] 分布:', JSON.stringify(stats))
}

// 直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBangumi().catch((e) => {
    console.error('[bangumi] 拉取失败:', e)
    process.exit(1)
  })
}
