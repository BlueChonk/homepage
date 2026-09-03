// 首帧前应用主题，避免暗色用户看到白色闪烁
;(function () {
  try {
    var KEY = 'cecilia-theme-mode'
    var mode = localStorage.getItem(KEY)
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') mode = 'system'
    var dark = mode === 'dark'
    if (mode === 'system') dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    if (dark) root.classList.add('dark')
  } catch (e) {}
})()
