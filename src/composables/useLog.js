import { ref, computed, onMounted, onUnmounted } from 'vue'

/* 日志按日期排序：新日期在前 */
function dateKey(date) {
  const m = String(date || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''
}

/* 解析 log.md：以 "# 日期" 为分隔，标题下的连续文本作为该日正文。 */
function parseLog(md) {
  const logs = []
  let cur = null
  const flush = () => {
    if (cur) {
      cur.text = cur.text.trim()
      logs.push(cur)
    }
  }
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) {
      flush()
      cur = { date: m[1], text: '' }
    } else if (cur) {
      cur.text += line + '\n'
    }
  }
  flush()
  return logs
}

/* 日志正文外链：一律新标签页打开 */
function externalizeLogLinks(a) {
  const href = a.getAttribute('href') || ''
  if (!/^https?:\/\//i.test(href)) return
  let external = true
  try {
    const u = new URL(href, location.href)
    external = u.origin !== location.origin
  } catch {
    external = true
  }
  if (external) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
}

/* 动态模块：数据来自 public/log.md（由 scripts/gen-feed.mjs 合并 public/log/*.md 生成）。
   limit > 0 时只显示最近 limit 条；不传或 0 则显示全部。 */
export function useLog(limit = 0) {
  /* 标题轮播 */
  const logTitles = ['Log', 'Logs', 'Updates', 'Posts']
  const logTitle = ref('Log')
  let logTitleTimer = null
  let logTitleIdx = 0
  let logCharIdx = 0
  let logDeleting = false

  function cycleLogTitle() {
    const cur = logTitles[logTitleIdx]
    if (!logDeleting) {
      logCharIdx++
      logTitle.value = cur.slice(0, logCharIdx)
      if (logCharIdx >= cur.length) {
        logDeleting = true
        logTitleTimer = setTimeout(cycleLogTitle, 1800)
        return
      }
    } else {
      logCharIdx--
      logTitle.value = cur.slice(0, logCharIdx)
      if (logCharIdx <= 0) {
        logDeleting = false
        logTitleIdx = (logTitleIdx + 1) % logTitles.length
      }
    }
    logTitleTimer = setTimeout(cycleLogTitle, logDeleting ? 40 : 90)
  }

  /* 数据 */
  const myLogs = ref([])
  const logLoading = ref(true)
  const visibleLogs = computed(() =>
    limit > 0 ? myLogs.value.slice(0, limit) : myLogs.value
  )

  async function loadLogs() {
    logLoading.value = true
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}log.md`, { cache: 'no-cache' })
      const md = await res.text()
      myLogs.value = parseLog(md).sort((a, b) =>
        dateKey(b.date).localeCompare(dateKey(a.date))
      )
    } catch (e) {
      console.error('读取 log.md 失败：', e)
      myLogs.value = []
    } finally {
      logLoading.value = false
    }
  }

  onMounted(() => {
    logTitleTimer = setTimeout(cycleLogTitle, 600)
    loadLogs()
  })

  onUnmounted(() => {
    clearTimeout(logTitleTimer)
  })

  function onLogRendered(e) {
    const root = e.currentTarget
    if (!root) return
    root.querySelectorAll('a[href]').forEach(externalizeLogLinks)
  }

  return { logTitle, myLogs, logLoading, visibleLogs, onLogRendered, loadLogs }
}
