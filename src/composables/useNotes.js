import { ref, computed, onMounted } from 'vue'

/* 解析 JSON Lines */
function parseJsonl(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/* 笔记模块：数据来自 public/note.jsonl（由 vite 插件扫描 public/note/*.md 生成）。
   limit > 0 时只显示最近 limit 条；不传或 0 则显示全部。 */
export function useNotes(limit = 0) {
  const notes = ref([])
  const notesLoading = ref(true)
  const visibleNotes = computed(() =>
    limit > 0 ? notes.value.slice(0, limit) : notes.value
  )

  async function loadNotes() {
    notesLoading.value = true
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}note.jsonl`, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`清单加载失败 (${res.status})`)
      notes.value = parseJsonl(await res.text())
    } catch (e) {
      console.error('读取 note.jsonl 失败：', e)
      notes.value = []
    } finally {
      notesLoading.value = false
    }
  }

  onMounted(loadNotes)

  return { notes, notesLoading, visibleNotes, loadNotes }
}
