import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico)$/i
const AUDIO_RE = /\.(mp3|wav|ogg|flac|m4a|aac)$/i
const MD_RE = /\.md$/i

const TARGETS = [
  { folder: 'album', kind: 'image' },
  { folder: 'records', kind: 'records' },
  { folder: 'music', kind: 'audio', out: 'music-manifest.jsonl' },
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

function extractTitle(file, fallback) {
  try {
    const text = readFileSync(file, 'utf8')
    const m = text.match(/^#\s+(.+)$/m)
    if (m) return m[1].trim()
  } catch {
    /* ignore */
  }
  return fallback
}

// 字数：中文字符逐字计数 + 英文/数字按词计数
function countWords(md) {
  const cjk = (md.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const words = (md.match(/[A-Za-z0-9_]+/g) || []).length
  return cjk + words
}

// 去掉行内的 markdown 语法，得到纯文本（统一卡片摘要的显示规格）
function cleanExcerptLine(line) {
  let s = String(line || '').trim()
  // 块引用 / 无序 / 有序列表前缀
  s = s.replace(/^>\s?/, '')
  s = s.replace(/^[-*+]\s+/, '')
  s = s.replace(/^\d+[.、)]\s+/, '')
  // 链接 -> 文字，行内代码 / 加粗 / 斜体去掉标记
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/`([^`]*)`/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  // 简单 HTML 标签
  s = s.replace(/<[^>]+>/g, '')
  return s.trim()
}

// 从 markdown 文件提取日期、简介、分类。
// 摘要规则：跳过代码围栏与其中的内容，优先取正文首段；
// 无正文段落时依次回退到块引用、代码块首条有效命令，避免出现裸的 ```bash。
function extractMeta(file) {
  let date = ''
  let excerpt = ''
  let category = '记录'
  try {
    const raw = readFileSync(file, 'utf-8')
    const lines = raw.split('\n')
    let inFence = false
    let firstPlain = ''
    let firstQuote = ''
    let firstCode = ''
    for (const line of lines) {
      const t = line.trim()
      // 代码围栏：跳过围栏标记与内部所有行
      if (/^```/.test(t)) {
        inFence = !inFence
        continue
      }
      if (inFence) {
        // 记录代码块内第一条“有效”命令行（跳过注释与空行），供无正文文档回退
        if (!firstCode && t && !/^(#|\/\/)/.test(t)) firstCode = t
        continue
      }
      if (!t || /^#{1,6}\s/.test(t) || /^---$/.test(t)) continue
      // 尝试提取日期
      if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(t) && !date) { date = t.match(/^\d{4}[-/]\d{2}[-/]\d{2}/)[0] }
      if (!firstPlain) {
        // 块引用/提示语不算正文首段，仅作回退
        if (/^>/.test(t)) {
          if (!firstQuote) firstQuote = t
          continue
        }
        firstPlain = t
      }
    }
    const rawExcerpt = firstPlain || firstQuote || firstCode || ''
    excerpt = rawExcerpt ? cleanExcerptLine(rawExcerpt).slice(0, 180) : ''
    // 尝试从 frontmatter 或内容中提取分类
    const catMatch = raw.match(/(?:category|分类)[:\s]+(.+?)(?:\n|$)/i)
    if (catMatch) category = catMatch[1].trim()
  } catch { /* ignore */ }
  return { date, excerpt, category }
}

function generate(target) {
  const dir = join(PUBLIC_DIR, target.folder)
  if (!existsSync(dir)) {
    console.warn(`跳过：目录不存在 -> ${dir}`)
    return
  }

  const files = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile())

  let lines
  if (target.kind === 'records') {
    lines = files
      .filter((n) => MD_RE.test(n))
      .map((name) => {
        const filePath = join(dir, name)
        const { date, excerpt, category } = extractMeta(filePath)
        const raw = readFileSync(filePath, 'utf-8')
        return {
          id: name,
          file: `/records/${name}`,
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

  const outName = target.out || `${target.folder}-manifest.jsonl`
  const outFile = join(PUBLIC_DIR, outName)
  const content = lines.map((o) => JSON.stringify(o)).join('\n')
  writeFileSync(outFile, content + (lines.length ? '\n' : ''))
  console.log(`已生成 ${outName}，共 ${lines.length} 条`)
}

for (const t of TARGETS) generate(t)
