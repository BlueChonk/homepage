/**
 * 随机播放一组一次性音效，并保证连续两次不重复。
 *
 * 实现要点：每次点击都新建 Audio 实例，而不是复用同一个元素。
 * 复用元素时若 readyState 尚未就绪，设置 currentTime 会抛异常，
 * 且 play() 在上一次播放未结束时不会重新触发。
 */
export function useRandomSound(sources) {
  let lastIndex = -1

  function pick() {
    if (sources.length === 0) return -1
    if (sources.length === 1) return 0

    let index = Math.floor(Math.random() * sources.length)
    while (index === lastIndex) {
      index = Math.floor(Math.random() * sources.length)
    }
    return index
  }

  function play() {
    const index = pick()
    if (index < 0) return null

    lastIndex = index
    const audio = new Audio(sources[index])
    // 浏览器在用户未交互前会拒绝自动播放，静默忽略即可
    audio.play().catch(() => {})
    return audio
  }

  return { play }
}
