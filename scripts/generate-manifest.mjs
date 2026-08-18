import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { extractTitle, countWords, extractMeta } from './md-meta.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico)$/i
const AUDIO_RE = /\.(mp3|wav|ogg|flac|m4a|aac)$/i
const MD_RE = /\.md$/i

const TARGETS = [
  { folder: 'album', kind: 'image' },
  { folder: 'note', kind: 'note' },
  { folder: 'music', kind: 'audio', out: 'music-manifest.jsonl' },  // 手动维护，不自动生成
]

// 文件名里可能带空格、中日文、括号，编码后再写入 url，避免部分环境下请求 404
function toUrl(folder, name) {
  return `/${folder}/${encodeURIComponent(name)}`
}

// 「歌手 - 歌名.mp3」拆成 artist / title，没有分隔符时整体作为 title
function parseAudioName(name) {
  const base = name.replace(/\.[^.]+$/, '')
  const m = base.match(/^(.+?)\s+-\s+(.+)$/)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: '', title: base }
}

function generate(target) {
  const dir = join(PUBLIC_DIR, target.folder)
  if (!existsSync(dir)) {
    console.warn(`跳过：目录不存在 -> ${dir}`)
    return
  }

  const files = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile())

  let lines
  if (target.kind === 'note') {
    lines = files
      .filter((n) => MD_RE.test(n))
      .map((name) => {
        const filePath = join(dir, name)
        const { date, excerpt, category } = extractMeta(filePath)
        const raw = readFileSync(filePath, 'utf-8')
        return {
          id: name,
          file: `/note/${name}`,
          title: extractTitle(filePath, name.replace(/\.md$/i, '')),
          category,
          date,
          excerpt,
          wordCount: countWords(raw),
        }
      })
      .sort((a, b) => a.file.localeCompare(b.file))
  } else if (target.kind === 'audio') {
    lines = files
      .filter((n) => AUDIO_RE.test(n))
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .map((name) => {
        const { artist, title } = parseAudioName(name)
        const base = name.replace(/\.[^.]+$/, '')
        // 同名 .lrc 存在时附带 lyric 字段，供前端做歌词同步
        const lyricName = base + '.lrc'
        const lyric = existsSync(join(dir, lyricName))
          ? toUrl(target.folder, lyricName)
          : ''
        // 同名封面图存在时附带 cover 字段（沉浸式背景 + 唱片封面）
        const coverExt = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].find((ext) =>
          existsSync(join(dir, `${base}.${ext}`))
        )
        const cover = coverExt ? toUrl(target.folder, `${base}.${coverExt}`) : ''
        return {
          name,
          url: toUrl(target.folder, name),
          title,
          artist,
          ...(lyric ? { lyric } : {}),
          ...(cover ? { cover } : {}),
        }
      })
  } else {
    lines = files
      .filter((n) => IMG_RE.test(n))
      .sort()
      .map((name) => {
        const base = name.replace(/\.[^.]+$/, '')
        // 缩略图存在时附带 thumb 字段（网格用缩略图，预览用原图）
        const thumb = existsSync(join(dir, 'thumbs', `${base}.jpg`))
          ? toUrl(target.folder, `thumbs/${base}.jpg`)
          : ''
        return {
          name,
          url: toUrl(target.folder, name),
          title: base,
          ...(thumb ? { thumb } : {}),
        }
      })
  }

  const outName = target.out || `${target.folder}.jsonl`
  const outFile = join(PUBLIC_DIR, outName)
  const content = lines.map((o) => JSON.stringify(o)).join('\n')
  writeFileSync(outFile, content + (lines.length ? '\n' : ''))
  console.log(`已生成 ${outName}，共 ${lines.length} 条`)
}

for (const t of TARGETS) generate(t)
