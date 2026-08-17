import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractTitle, countWords, extractMeta } from './scripts/md-meta.mjs'
import { mergeFeeds, feedsDir } from './scripts/gen-feed.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* 通用：扫描 public/<dir> 下的文件，生成 <name>-manifest.jsonl（JSON Lines，供前端动态加载）
   - outFile: 输出文件名（默认 manifest.jsonl），写入 public/ 根目录
   - urlBase: 文件对外访问的基础路径（如 /album）
   - test:    判定哪些文件要纳入（默认图片）
   - titleOf: 由文件名生成展示标题
*/
function manifestPlugin({ dir, outFile = 'manifest.jsonl', urlBase, test, titleOf, mapItem }) {
  const absDir = path.resolve(__dirname, 'public', dir)
  const outPath = path.resolve(__dirname, 'public', outFile)
  const isImg = (f) => /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(f)

  function gen() {
    try {
      if (!fs.existsSync(absDir)) {
        console.log(`[manifest] 跳过（目录不存在）: public/${dir}`)
        return
      }
      const files = fs
        .readdirSync(absDir)
        .filter((f) => f !== outFile && (test ? test(f) : isImg(f)))
        .sort()
      const list = files.map((name) => {
        // 文件名可能含空格 / 中日文 / 括号，编码后写入 url
        const url = `${urlBase}/${encodeURIComponent(name)}`
        return mapItem ? mapItem(name, url) : { name, url, title: titleOf ? titleOf(name) : name }
      })
      // 输出 JSON Lines：每行一条独立 JSON 对象，无外层 []、无 index
      fs.writeFileSync(outPath, list.map((o) => JSON.stringify(o)).join('\n') + (list.length ? '\n' : ''))
      console.log(`[manifest] public/${dir} → public/${outFile}（${files.length} 条）`)
    } catch (e) {
      console.error(`[manifest] 生成失败 (public/${dir}):`, e)
    }
  }

  return {
    name: `manifest:${dir}`,
    buildStart() {
      gen()
    },
    configureServer(server) {
      gen()
      server.watcher.add(absDir)
      server.watcher.on('all', (_event, file) => {
        if (path.basename(file) === outFile) return
        if (file.startsWith(absDir)) gen()
      })
    },
  }
}

export default defineConfig({
  // 高德 Key：EdgeOne 控制台配置的环境变量 AMAP_API_KEY 会在云端构建时注入到 process.env，
  // 这里在构建期通过 define 把值烘焙进前端产物（浏览器运行时无法直接读服务端环境变量）。
  // 本地可改用 .env 的 VITE_AMAP_KEY，或导出 AMAP_API_KEY 后再 npm run build。
  define: {
    __AMAP_API_KEY__: JSON.stringify(process.env.AMAP_API_KEY || ''),
  },
  optimizeDeps: {
    // maplibre-gl 通过 new URL(..., import.meta.url) 引用其 worker，
    // 预打包时该 worker 不会被生成，导致矢量图层（如足迹染色）无法渲染。
    // 排除预打包，让 Vite 直接以 ESM 方式提供，worker 可正确解析。
    exclude: ['maplibre-gl'],
  },
  build: {
    // 跳过 Vite 清空 dist 的整目录删除，避免被本机“批量删除保护”拦截导致构建失败；
    // 输出文件均带内容哈希，旧文件不影响站点使用，可定期手动清理。
    emptyOutDir: false,
  },
  server: {
    // 在线音乐：把 /api 反代到本地 Node 后端（node server/index.js）。
    // 生产环境需自行部署后端，并用 VITE_API_BASE 指向其地址。
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    vue(),
    // 动态(feeds)：把 public/feeds/*.md 合并为 public/feeds.md；构建/启动/保存时自动重生成
    {
      name: 'feed:merge',
      buildStart() {
        mergeFeeds()
      },
      configureServer(server) {
        mergeFeeds()
        server.watcher.add(feedsDir)
        server.watcher.on('all', (_evt, file) => {
          if (file.startsWith(feedsDir) && file.endsWith('.md')) mergeFeeds()
        })
      },
    },
    // 相册：public/album/*.jpg → public/album-manifest.jsonl
    manifestPlugin({
      dir: 'album',
      outFile: 'album-manifest.jsonl',
      urlBase: '/album',
      titleOf: (n) => n.replace(/\.[^.]+$/, ''),
      mapItem: (name, url) => {
        const base = name.replace(/\.[^.]+$/, '')
        // 缩略图存在时附带 thumb 字段（网格展示用缩略图，点击预览仍用原图）
        const thumb = fs.existsSync(
          path.resolve(__dirname, 'public', 'album', 'thumbs', `${base}.jpg`)
        )
          ? `/album/thumbs/${encodeURIComponent(`${base}.jpg`)}`
          : ''
        return { name, url, title: base, ...(thumb ? { thumb } : {}) }
      },
    }),
    // 音乐：已改为手动维护 public/music-manifest.jsonl（在线 B 站搜索模式）
    // 不再自动扫描 public/music/ 目录生成清单
    // manifestPlugin({
    //   dir: 'music',
    //   outFile: 'music-manifest.jsonl',
    //   urlBase: '/music',
    //   test: (f) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f),
    //   mapItem: (name, url) => {
    //     const base = name.replace(/\.[^.]+$/, '')
    //     const m = base.match(/^(.+?)\s+-\s+(.+)$/)
    //     const lyricName = base + '.lrc'
    //     const lyric = fs.existsSync(path.resolve(__dirname, 'public', 'music', lyricName))
    //       ? `/music/${encodeURIComponent(lyricName)}`
    //       : ''
    //     const coverExt = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].find((ext) =>
    //       fs.existsSync(path.resolve(__dirname, 'public', 'music', `${base}.${ext}`))
    //     )
    //     const cover = coverExt ? `/music/${encodeURIComponent(`${base}.${coverExt}`)}` : ''
    //     return {
    //       name,
    //       url,
    //       title: m ? m[2].trim() : base,
    //       artist: m ? m[1].trim() : '',
    //       ...(lyric ? { lyric } : {}),
    //       ...(cover ? { cover } : {}),
    //     }
    //   },
    // }),
    // 记录：public/records/*.md → public/records-manifest.jsonl
    // 输出结构兼容 RecordsView：{ id, file, title, category, date, excerpt }
    // file 保留原始文件名（不编码），由 RecordsView 用 encodeURI 统一编码
    manifestPlugin({
      dir: 'records',
      outFile: 'records-manifest.jsonl',
      urlBase: '/records',
      test: (f) => /\.md$/i.test(f),
      titleOf: (n) => n.replace(/\.md$/i, ''),
      mapItem: (name) => {
        const filePath = path.resolve(__dirname, 'public', 'records', name)
        const { date, excerpt, category } = extractMeta(filePath)
        const raw = fs.readFileSync(filePath, 'utf-8')
        return {
          id: name,
          file: `/records/${name}`,
          title: extractTitle(filePath, name.replace(/\.md$/i, '')),
          category,
          date,
          excerpt,
          wordCount: countWords(raw),
        }
      },
    }),
  ],
  base: './',
})
