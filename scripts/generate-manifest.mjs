import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico)$/i
const AUDIO_RE = /\.(mp3|wav|ogg|flac|m4a|aac)$/i

/* ---- Zod Schema 定义 ---- */
const AudioManifestSchema = z.object({
  kind: z.literal('audio'),
  name: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  lyric: z.string().optional(),
  cover: z.string().optional(),
})

const ImageManifestSchema = z.object({
  kind: z.literal('image'),
  name: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  thumb: z.string().optional(),
})

const ManifestEntrySchema = z.discriminatedUnion('kind', [
  AudioManifestSchema,
  ImageManifestSchema,
])

const TARGETS = []

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

// 规范化：空字符串 → undefined，保证输出字段一致
function clean(entry) {
  const out = {}
  for (const [k, v] of Object.entries(entry)) {
    if (v === '' || v == null) continue
    out[k] = v
  }
  return out
}

function generate(target) {
  const dir = join(PUBLIC_DIR, target.folder)
  if (!existsSync(dir)) {
    console.warn(`[manifest] 跳过（目录不存在）: ${target.folder}`)
    return
  }

  const files = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile())

  const rawEntries =
    target.kind === 'audio'
      ? files
          .filter((n) => AUDIO_RE.test(n))
          .sort((a, b) => a.localeCompare(b, 'zh'))
          .map((name) => {
            const { artist, title } = parseAudioName(name)
            const base = name.replace(/\.[^.]+$/, '')
            const lyricName = base + '.lrc'
            const lyric = existsSync(join(dir, lyricName)) ? toUrl(target.folder, lyricName) : ''
            const coverExt = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].find((ext) =>
              existsSync(join(dir, `${base}.${ext}`))
            )
            const cover = coverExt ? toUrl(target.folder, `${base}.${coverExt}`) : ''
            return clean({
              kind: 'audio',
              name,
              url: toUrl(target.folder, name),
              title,
              artist,
              lyric,
              cover,
            })
          })
      : files
          .filter((n) => IMG_RE.test(n))
          .sort()
          .map((name) => {
            const base = name.replace(/\.[^.]+$/, '')
            const thumb = existsSync(join(dir, 'thumbs', `${base}.jpg`))
              ? toUrl(target.folder, `thumbs/${base}.jpg`)
              : ''
            return clean({
              kind: 'image',
              name,
              url: toUrl(target.folder, name),
              title: base,
              thumb,
            })
          })

  // Schema 校验
  const validEntries = []
  for (const entry of rawEntries) {
    const result = ManifestEntrySchema.safeParse(entry)
    if (!result.success) {
      console.warn(`[manifest] ⚠ ${target.folder}/${entry.name ?? '?'} 校验失败:`)
      for (const err of result.error.errors) {
        console.warn(`     ${err.path.join('.')}: ${err.message}`)
      }
      console.warn(`     跳过该条目`)
      continue
    }
    validEntries.push(result.data)
  }

  const outName = target.out || `${target.folder}.jsonl`
  const outFile = join(PUBLIC_DIR, outName)
  const content = validEntries.map((o) => JSON.stringify(o)).join('\n')
  writeFileSync(outFile, content + (validEntries.length ? '\n' : ''))
  console.log(`[manifest] 生成 ${outName}，共 ${validEntries.length} 条`)
}

for (const t of TARGETS) generate(t)
