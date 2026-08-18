import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractTitle, countWords, extractMeta } from './scripts/md-meta.mjs'
import { mergeFeeds, feedsDir } from './scripts/gen-feed.mjs'
import { fetchBangumi } from './scripts/fetch-bangumi.mjs'
import { syncPlaylist } from './scripts/parse-qq-playlist.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* QQ音乐歌单解析：拉取歌单并写入 public/music.jsonl
   - dev 启动时执行一次（configureServer）
   - 构建时执行一次（buildStart）
   - 歌单 ID 通过环境变量 QQ_PLAYLIST_ID 覆盖，默认 7813925785 */
const QQ_PLAYLIST_ID = process.env.QQ_PLAYLIST_ID || '7813925785'
async function syncQQPlaylist() {
  try {
    await syncPlaylist(QQ_PLAYLIST_ID)
  } catch (e) {
    console.error('[qq-music] 歌单同步失败:', e.message)
  }
}

/* 通用：扫描 public/<dir> 下的文件，生成 <name>.jsonl（JSON Lines，供前端动态加载）
   - outFile: 输出文件名（默认 <dir>.jsonl），写入 public/ 根目录
   - urlBase: 文件对外访问的基础路径（如 /album）
   - test:    判定哪些文件要纳入（默认图片）
   - titleOf: 由文件名生成展示标题
*/
function manifestPlugin({ dir, outFile, urlBase, test, titleOf, mapItem }) {
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
    // 跳过 Vite 清空 dist 的整目录删除，避免被本机"批量删除保护"拦截导致构建失败；
    // 输出文件均带内容哈希，旧文件不影响站点使用，可定期手动清理。
    emptyOutDir: false,
  },
  plugins: [
    vue(),
    // QQ音乐歌单：dev 启动 / 构建时自动拉取歌单写入 public/music.jsonl
    {
      name: 'qq-music:sync',
      async buildStart() {
        await syncQQPlaylist()
      },
      configureServer() {
        syncQQPlaylist()
      },
    },
    // 日志(log)：把 public/log/*.md 合并为 public/log.md；构建/启动/保存时自动重生成
    {
      name: 'log:merge',
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
    // 相册：public/album/*.jpg → public/album.jsonl
    manifestPlugin({
      dir: 'album',
      outFile: 'album.jsonl',
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
    // 音乐：已迁移至 APlayer + Meting API（QQ 音乐），前端直接请求公共 API
    // 笔记：public/note/*.md → public/note.jsonl
    // 输出结构兼容 NoteView：{ id, file, title, category, date, excerpt }
    // file 保留原始文件名（不编码），由 NoteView 用 encodeURI 统一编码
    manifestPlugin({
      dir: 'note',
      outFile: 'note.jsonl',
      urlBase: '/note',
      test: (f) => /\.md$/i.test(f),
      titleOf: (n) => n.replace(/\.md$/i, ''),
      mapItem: (name) => {
        const filePath = path.resolve(__dirname, 'public', 'note', name)
        const { date, excerpt, category } = extractMeta(filePath)
        const raw = fs.readFileSync(filePath, 'utf-8')
        return {
          id: name,
          file: `/note/${name}`,
          title: extractTitle(filePath, name.replace(/\.md$/i, '')),
          category,
          date,
          excerpt,
          wordCount: countWords(raw),
        }
      },
    }),
    // Bangumi 收藏：拉取用户的番剧/漫画/游戏收藏（想看/在看/看过），写入 public/bangumi.jsonl
    {
      name: 'bangumi:sync',
      async buildStart() {
        await fetchBangumi()
      },
      configureServer() {
        fetchBangumi()
      },
    },
  ],
  base: './',
})
