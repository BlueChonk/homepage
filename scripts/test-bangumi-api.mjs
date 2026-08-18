/**
 * Bangumi API 测试脚本
 *
 * 测试流程：
 * 1. 用 BANGUMI_TOKEN 调用 /v0/me 获取当前用户信息（无需 USERNAME）
 * 2. 用获取到的 username 拉取收藏列表
 * 3. 验证番剧/漫画/游戏数据能否正常获取
 *
 * 用法：
 *   node scripts/test-bangumi-api.mjs           # 自动读取 .env
 *   BANGUMI_TOKEN=xxx node scripts/test-bangumi-api.mjs  # 手动指定
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 简易 .env 加载器
const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim()
    }
  }
}

// 代理支持（CI/沙箱环境自动检测）
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
if (proxyUrl) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent({ uri: proxyUrl }))
    console.log(`[proxy] 使用代理: ${proxyUrl}`)
  } catch {
    console.warn('[proxy] 检测到代理但 undici 未安装，跳过代理配置')
  }
}

const BANGUMI_API = 'https://api.bgm.tv'
const TOKEN = process.env.BANGUMI_TOKEN || ''
const UA = 'cecilia4412/homepage (https://github.com/cecilia4412/homepage)'

async function main() {
  if (!TOKEN) {
    console.error('❌ BANGUMI_TOKEN 未设置！请在 .env 中配置或通过环境变量传入')
    process.exit(1)
  }

  console.log('=== Step 1: 用 Token 获取当前用户信息 (/v0/me) ===')
  console.log(`  API: ${BANGUMI_API}/v0/me`)
  console.log(`  Token: ${TOKEN.substring(0, 8)}...${TOKEN.substring(TOKEN.length - 4)}`)

  let username = ''
  let uid = 0

  try {
    const res = await fetch(`${BANGUMI_API}/v0/me`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': UA,
        Accept: 'application/json',
      },
    })
    console.log(`  HTTP Status: ${res.status}`)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`  ❌ 请求失败: ${res.status} ${res.statusText}`)
      console.error(`  响应: ${errorText.substring(0, 300)}`)
      process.exit(1)
    }

    const data = await res.json()
    console.log(`  ✅ 成功获取用户信息:`)
    console.log(`    username: ${data.username}`)
    console.log(`    uid: ${data.id}`)
    console.log(`    nickname: ${data.nickname}`)
    console.log(`    avatar: ${data.avatar?.large || '(无)'}`)

    username = data.username
    uid = data.id
  } catch (e) {
    console.error(`  ❌ 网络请求失败: ${e.message}`)
    if (e.cause) console.error(`  原因: ${e.cause.message || e.cause.code || e.cause}`)
    process.exit(1)
  }

  // Step 2: 拉取各类收藏
  console.log('\n=== Step 2: 拉取收藏列表 ===')

  const subjectTypes = [
    { label: '番剧', value: 2 },
    { label: '漫画', value: 1 },
    { label: '游戏', value: 4 },
  ]

  const collectionTypes = [
    { label: '想看', value: 1 },
    { label: '看过', value: 2 },
    { label: '在看', value: 3 },
  ]

  let totalAll = 0

  for (const st of subjectTypes) {
    console.log(`\n  --- ${st.label} (subject_type=${st.value}) ---`)
    for (const ct of collectionTypes) {
      const url = `${BANGUMI_API}/v0/users/${username}/collections?subject_type=${st.value}&type=${ct.value}&limit=50&offset=0`
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            'User-Agent': UA,
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          console.error(`    ${ct.label}: HTTP ${res.status} ${res.statusText}`)
          continue
        }

        const data = await res.json()
        const count = data.total || 0
        const items = data.data || []
        totalAll += count
        console.log(`    ${ct.label} (type=${ct.value}): ${count} 条`)

        // 显示第一条详细信息
        if (items.length > 0) {
          const first = items[0]
          const s = first.subject || {}
          console.log(`      示例: ${s.name_cn || s.name} (score=${s.score}, date=${s.date})`)
        }
      } catch (e) {
        console.error(`    ${ct.label}: 请求失败 - ${e.message}`)
      }
    }
  }

  // Step 3: 总结
  console.log('\n=== 总结 ===')
  console.log(`  Token 认证: ✅ 成功`)
  console.log(`  用户名: ${username} (uid=${uid})`)
  console.log(`  收藏总数: ${totalAll} 条`)
  console.log(`  结论: 只需 BANGUMI_TOKEN 即可，无需 BANGUMI_USERNAME`)
  console.log(`  脚本应先调用 /v0/me 获取 username，再拉取收藏`)
}

main().catch(e => {
  console.error('测试脚本异常:', e)
  process.exit(1)
})
