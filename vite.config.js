import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  build: {
    // 跳过 Vite 清空 dist 的整目录删除，避免被本机“批量删除保护”拦截导致构建失败；
    // 输出文件均带内容哈希，旧文件不影响站点使用，可定期手动清理。
    emptyOutDir: false,
  },
  plugins: [
    vue(),
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
    // 音乐：public/music/*.mp3|flac… → public/music-manifest.jsonl
    manifestPlugin({
      dir: 'music',
      outFile: 'music-manifest.jsonl',
      urlBase: '/music',
      test: (f) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f),
      // 「歌手 - 歌名.mp3」拆成 artist / title
      mapItem: (name, url) => {
        const base = name.replace(/\.[^.]+$/, '')
        const m = base.match(/^(.+?)\s+-\s+(.+)$/)
        // 同名 .lrc 存在时，附带 lyric 字段（用于歌词同步显示）
        const lyricName = base + '.lrc'
        const lyric = fs.existsSync(path.resolve(__dirname, 'public', 'music', lyricName))
          ? `/music/${encodeURIComponent(lyricName)}`
          : ''
        // 同名封面图（jpg/png/webp/avif/gif）存在时，附带 cover 字段（沉浸式背景 + 唱片封面）
        const coverExt = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].find((ext) =>
          fs.existsSync(path.resolve(__dirname, 'public', 'music', `${base}.${ext}`))
        )
        const cover = coverExt ? `/music/${encodeURIComponent(`${base}.${coverExt}`)}` : ''
        return {
          name,
          url,
          title: m ? m[2].trim() : base,
          artist: m ? m[1].trim() : '',
          ...(lyric ? { lyric } : {}),
          ...(cover ? { cover } : {}),
        }
      },
    }),
    // 记录：public/records/*.md → public/records-manifest.jsonl
    // 输出结构兼容 RecordsView：{ id, file, title, category, date, excerpt }
    // file 保留原始文件名（不编码），由 RecordsView 用 encodeURI 统一编码
    manifestPlugin({
      dir: 'records',
      outFile: 'records-manifest.jsonl',
      urlBase: '/records',
      test: (f) => /\.md$/i.test(f),
      titleOf: (n) => n.replace(/\.md$/i, ''),
      mapItem: (name, _url) => {
        const filePath = path.resolve(__dirname, 'public', 'records', name)
        let date = ''
        let excerpt = ''
        let category = '记录'
        try {
          const raw = fs.readFileSync(filePath, 'utf-8')
          // 提取标题后的第一段作为简介（跳过空行和分隔线）
          const lines = raw.split('\n')
          let bodyStart = false
          let firstPara = ''
          for (const line of lines) {
            const t = line.trim()
            if (!t || /^#{1,3}\s/.test(t) || /^---$/.test(t)) continue
            if (!bodyStart && !firstPara) { firstPara = t; continue }
            if (firstPara && !bodyStart) { bodyStart = true }
            // 尝试从 frontmatter 或首行提取日期
            if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(t) && !date) { date = t.match(/^\d{4}[-/]\d{2}[-/]\d{2}/)[0] }
          }
          excerpt = firstPara ? firstPara.slice(0, 180) : ''
          // 尝试从文件内容推断分类
          const catMatch = raw.match(/(?:category|分类)[:\s]+(.+?)(?:\n|$)/i)
          if (catMatch) category = catMatch[1].trim()
        } catch { /* ignore */ }
        return {
          id: name,
          file: `/records/${name}`,
          title: name.replace(/\.md$/i, ''),
          category,
          date,
          excerpt,
        }
      },
    }),
  ],
  base: './',
})
