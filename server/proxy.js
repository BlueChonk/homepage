/**
 * HTTP(S) 出站代理支持（Node 原生，无第三方依赖）。
 *
 * 当环境变量 HTTP_PROXY / HTTPS_PROXY 存在时，为 https 请求建立 CONNECT 隧道，
 * 为 http 请求做绝对路径转发。沙箱/受限网络常通过 egress 代理出网；
 * 普通环境未设置代理时返回 null，走 Node 默认直连。
 */
import http from 'http'
import https from 'https'
import tls from 'tls'
import net from 'net'

function resolveProxy(protocol) {
  if (protocol === 'http:') {
    return process.env.HTTP_PROXY || process.env.http_proxy
  }
  return process.env.HTTPS_PROXY || process.env.https_proxy
}

function buildTunnel(protocol) {
  const proxyUrl = resolveProxy(protocol)
  if (!proxyUrl) return null
  const p = new URL(proxyUrl)
  if (!p.port || !p.hostname) return null

  if (protocol === 'http:') {
    // http 转发：以绝对 URI 请求代理，再透传
    const agent = new http.Agent({ keepAlive: false })
    agent.createConnection = (opts, cb) => {
      const sock = net.connect(p.port, p.hostname)
      sock.on('connect', () => cb(null, sock))
      sock.on('error', cb)
    }
    return agent
  }

  // https：CONNECT 隧道，再在隧道内 TLS 握手
  const agent = new https.Agent()
  agent.createConnection = (opts, cb) => {
    const host = opts.host
    const port = opts.port || 443
    const sock = net.connect(p.port, p.hostname, () => {
      sock.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: keep-alive\r\n\r\n`
      )
    })
    let buf = ''
    const onData = (d) => {
      buf += d.toString('latin1')
      const idx = buf.indexOf('\r\n\r\n')
      if (idx === -1) return
      sock.removeListener('data', onData)
      const status = parseInt(buf.slice(9, 12), 10)
      if (status === 200) {
        try {
          const tlsSocket = tls.connect({ socket: sock, servername: host, host }, () => cb(null, tlsSocket))
          tlsSocket.on('error', () => sock.destroy())
        } catch (e) {
          sock.destroy(e)
        }
      } else {
        sock.destroy(new Error('Proxy CONNECT failed: ' + buf.slice(0, 40)))
      }
    }
    sock.on('data', onData)
    sock.on('error', (e) => cb(e))
  }
  return agent
}

let cachedHttps = null
let cachedHttp = null

export function httpsProxyAgent() {
  if (cachedHttps === null) cachedHttps = buildTunnel('https:') ?? undefined
  return cachedHttps
}

export function httpProxyAgent() {
  if (cachedHttp === null) cachedHttp = buildTunnel('http:') ?? undefined
  return cachedHttp
}