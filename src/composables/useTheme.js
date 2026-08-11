import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'cecilia-theme-mode'
const VALID_MODES = ['light', 'dark', 'system']

const mode = ref('system')
const systemDark = ref(false)

let initialized = false
let mqlHandler = null

function getResolvedMode(raw) {
  return raw === 'system' ? (systemDark.value ? 'dark' : 'light') : raw
}

function apply() {
  const root = document.documentElement
  const isDark = getResolvedMode(mode.value) === 'dark'
  root.dataset.theme = isDark ? 'dark' : 'light'
  root.classList.toggle('dark', isDark)
}

function setMode(next) {
  if (!VALID_MODES.includes(next)) return
  mode.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 隐私模式等场景下忽略 */
  }
  apply()
}

/**
 * 单例初始化：无论多少个组件调用 useTheme，系统主题监听只注册一次。
 * 未实际挂载（SSR/测试）时不访问 localStorage / matchMedia。
 */
function ensureInit() {
  if (initialized) return
  initialized = true
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  let saved = 'system'
  try {
    saved = localStorage.getItem(STORAGE_KEY) || 'system'
  } catch {
    saved = 'system'
  }
  if (VALID_MODES.includes(saved)) mode.value = saved

  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mql.matches
  mqlHandler = (e) => {
    systemDark.value = e.matches
    apply()
  }
  if (mql.addEventListener) mql.addEventListener('change', mqlHandler)
  else mql.addListener(mqlHandler)

  watch(mode, apply)
  apply()
}

ensureInit()

export function useTheme() {
  return {
    mode,
    resolved: computed(() => getResolvedMode(mode.value)),
    setMode,
    apply,
  }
}
