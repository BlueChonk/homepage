import { ref, computed, onMounted, onUnmounted } from 'vue'

/* ---- 类型定义 ---- */
/**
 * @typedef {Object} LogEntry
 * @property {string} date       - 日期 (YYYY-MM-DD)
 * @property {string} title      - 日志标题
 * @property {string[]} tags     - 标签数组
 * @property {string} body       - Markdown 正文
 * @property {number} wordCount  - 字数
 * @property {string} file       - 原始文件名
 */

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

/* useLog：消费 log.jsonl（结构化 JSON Lines）
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

  /* 数据：日志列表 */
  /** @type {import('vue').Ref<LogEntry[]>} */
  const myLogs = ref([])
  const logLoading = ref(true)
  const visibleLogs = computed(() =>
    limit > 0 ? myLogs.value.slice(0, limit) : myLogs.value
  )

  async function loadLogs() {
    logLoading.value = true
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}log.jsonl`, { cache: 'no-cache' })
      const text = await res.text()
      myLogs.value = text.trim().split('\n').map((line) => JSON.parse(line))
    } catch (e) {
      console.error('读取 log.jsonl 失败：', e)
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
