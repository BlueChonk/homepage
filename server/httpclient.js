/**
 * 轻量 HTTP 客户端（基于 Node 原生 http/https），移植自 musicgrove。
 * - 支持 manual 重定向（获取每一步 Set-Cookie），默认 follow
 * - 提供 cookie 收集（从 Set-Cookie 头）
 * - 自动 gzip/deflate 解压
 */
import http from 'http'
import https from 'https'
import { inflateSync, gunzipSync } from 'zlib'
import { httpsProxyAgent, httpProxyAgent } from './proxy.js'

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function parseSetCookie(headerValue) {
  if (!headerValue) return {}
  const first = headerValue.split(';')[0]
  const idx = first.indexOf('=')
  if (idx > 0) {
    return { [first.slice(0, idx).trim()]: first.slice(idx + 1).trim() }
  }
  return {}
}

function collectCookies(setCookieHeaders) {
  const out = {}
  if (setCookieHeaders) {
    for (const c of setCookieHeaders) {
      Object.assign(out, parseSetCookie(c))
    }
  }
  return out
}

function decompress(body, encoding) {
  if (!encoding) return body
  const enc = encoding.toLowerCase()
  try {
    if (enc === 'gzip') return gunzipSync(body)
    if (enc === 'deflate') return inflateSync(body)
  } catch {
    return body
  }
  return body
}

function doRequest(url, options = {}) {
  const { method = 'GET', body, headers = {}, timeout = 30 } = options
  const parsed = new URL(url)
  const mod = parsed.protocol === 'https:' ? https : http
  const reqHeaders = {
    'User-Agent': DEFAULT_UA,
    Accept: '*/*',
    ...headers,
  }
  if (body && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  if (body) {
    reqHeaders['Content-Length'] = String(body.length)
  }

  return new Promise((resolve, reject) => {
    const req = mod.request(
      parsed,
      { method, headers: reqHeaders, timeout: timeout * 1000, agent: parsed.protocol === 'https:' ? httpsProxyAgent() : undefined },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks)
          const enc = res.headers['content-encoding'] || ''
          const bodyBuf = decompress(rawBody, enc)
          const setCookie = res.headers['set-cookie'] || []
          const flatHeaders = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (v != null) flatHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v)
          }
          resolve({
            status: res.statusCode || 0,
            headers: flatHeaders,
            cookies: collectCookies(setCookie),
            body: bodyBuf,
            url: res.url || url,
          })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (err) => reject(err))
    if (body) req.write(body)
    req.end()
  })
}

/**
 * GET 请求。redirect: 'follow' | 'manual'；manual 不跟随重定向（用于收集 3xx Set-Cookie）。
 */
export async function httpGet(url, options = {}) {
  const { headers = {}, redirect = 'follow', timeout = 30 } = options
  let current = url
  let last = null
  for (let i = 0; i < 10; i++) {
    const resp = await doRequest(current, { headers, timeout })
    last = resp
    const status = resp.status
    if (
      redirect === 'follow' &&
      status >= 300 &&
      status < 400 &&
      resp.headers.location
    ) {
      current = new URL(resp.headers.location, current).toString()
      const cookieStr = Object.entries(resp.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
      if (cookieStr) headers['Cookie'] = cookieStr
      continue
    }
    break
  }
  if (!last) throw new Error('no response')
  return {
    status: last.status,
    headers: last.headers,
    cookies: last.cookies,
    text: last.body.toString('utf-8'),
    body: last.body,
    url: last.url,
  }
}

// 远程二进制流元数据探测（HEAD），供流代理设置 content-type 使用
export async function httpHeadMeta(url, headers = {}, timeout = 15) {
  try {
    const resp = await doRequest(url, { method: 'HEAD', headers, timeout })
    return {
      status: resp.status,
      headers: resp.headers,
    }
  } catch {
    return null
  }
}