import { useEffect, useRef, useState } from 'react'

// 播放列表运行期从 public/music/playlist.json 动态加载。
// 加歌只需把 mp3/flac 丢进 public/music 并在 playlist.json 补一条，无需改代码。
// FALLBACK 仅在 fetch 失败（如本地 file:// 打开）时兜底，保证页面不空。
const FALLBACK = [
  {
    title: '听妈妈的话',
    artist: '周杰伦',
    src: '/music/ting-ma-ma-de-hua.flac',
  },
]

// 播放器专用 SVG 图标（与全站 Icons.astro 风格一致的 24 视口单色图标）
const ICON_PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  next: 'M6 18l8.5-6L6 6v12zM16 6h2v12h-2z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  mute: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  chevronDown: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  chevronUp: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z',
  note: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
}

function SvgIcon({ name, size = 18 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

function fmt(t) {
  if (!t || Number.isNaN(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// 隔离高频进度更新：只让进度条/时间重渲染，不触发整个播放器与播放列表重绘。
function ProgressBar({ current, duration, onSeek }) {
  const pct = duration ? (current / duration) * 100 : 0
  const style = { '--p': `${pct}%` }
  return (
    <div className="progress">
      <span className="time">{fmt(current)}</span>
      <input
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={current}
        onChange={onSeek}
        className="seek"
        style={style}
        aria-label="播放进度"
        aria-valuetext={`${fmt(current)} / ${fmt(duration)}`}
      />
      <span className="time">{fmt(duration)}</span>
    </div>
  )
}

export default function Music({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const isFull = variant === 'full'
  const audioRef = useRef(null)
  const [list, setList] = useState(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [open, setOpen] = useState(false) // 展开 / 收起（仅 compact 浮窗使用）

  // 动态加载播放列表
  useEffect(() => {
    let alive = true
    fetch('/music/playlist.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!alive) return
        setList(Array.isArray(data) && data.length ? data : FALLBACK)
      })
      .catch(() => alive && setList(FALLBACK))
    return () => {
      alive = false
    }
  }, [])

  const tracks = list || FALLBACK
  const track = tracks[index]

  // 切换曲目：重新加载并在播放态下自动续播；越界时回正
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.load()
    if (playing) audio.play().catch(() => {})
    if (index > tracks.length - 1) setIndex(0)
  }, [index, tracks.length, playing])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => {})
    else {
      audio.pause()
      setPlaying(false)
    }
  }

  const select = (i) => {
    if (i === index) {
      audioRef.current.currentTime = 0
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {})
      return
    }
    setIndex(i)
    setPlaying(true)
  }
  const next = () => setIndex((i) => (i + 1) % tracks.length)
  const prev = () => setIndex((i) => (i - 1 + tracks.length) % tracks.length)

  const onTime = () => setCurrent(audioRef.current.currentTime)
  const onMeta = () => setDuration(audioRef.current.duration)
  const onEnded = () => next()

  const seek = (e) => {
    const val = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = val
    setCurrent(val)
  }

  const volPct = muted ? 0 : volume

  // full 版常驻展开；compact 浮窗按 open 状态折叠
  const showBody = isFull || open
  const wrapClass = `mini-player ${isFull ? 'full' : open ? 'open' : 'collapsed'}`

  return (
    <div className={wrapClass}>
      {/* 常驻标题栏：黑胶 + 曲名 + 播放/暂停 + 展开收起 */}
      <div className="mp-bar">
        {!isFull && (
          <button
            className="mp-expand"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? '收起播放器' : '展开播放器'}
            aria-expanded={open}
          >
            {open ? <SvgIcon name="chevronDown" size={14} /> : <SvgIcon name="chevronUp" size={14} />}
          </button>
        )}

        <div className={`mp-vinyl ${playing ? 'spin' : ''}`}>
          <span className="mp-core" />
        </div>

        <div className="mp-meta" onClick={() => !isFull && setOpen(true)}>
          <span className="mp-title">{track.title}</span>
          <span className="mp-artist">{track.artist}</span>
        </div>

        <button
          className="mp-play"
          onClick={toggle}
          aria-label={playing ? '暂停' : '播放'}
          aria-pressed={playing}
        >
          {playing ? <SvgIcon name="pause" size={16} /> : <SvgIcon name="play" size={16} />}
        </button>
      </div>

      {showBody && (
        <div className="mp-body">
          <div className="mp-now">
            <span className="mp-now-title">{track.title}</span>
            <span className="mp-now-artist">{track.artist}</span>
            {playing && (
              <div className="eq" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
              </div>
            )}
          </div>

          <ProgressBar current={current} duration={duration} onSeek={seek} />

          <div className="mp-controls">
            <button className="mp-ctrl" onClick={prev} aria-label="上一首"><SvgIcon name="prev" /></button>
            <button
              className="mp-ctrl play"
              onClick={toggle}
              aria-label={playing ? '暂停' : '播放'}
              aria-pressed={playing}
            >
              {playing ? <SvgIcon name="pause" size={20} /> : <SvgIcon name="play" size={20} />}
            </button>
            <button className="mp-ctrl" onClick={next} aria-label="下一首"><SvgIcon name="next" /></button>

            <div className="mp-vol">
              <button
                className="mp-ctrl sm"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted || volume === 0 ? '取消静音' : '静音'}
                aria-pressed={muted}
              >
                {muted || volume === 0 ? <SvgIcon name="mute" size={16} /> : <SvgIcon name="volume" size={16} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volPct}
                onChange={(e) => {
                  setVolume(Number(e.target.value))
                  setMuted(false)
                }}
                className="vol-slider mp-vol-slider"
                style={{ '--p': `${volPct * 100}%` }}
                aria-label="音量"
                aria-valuetext={`${Math.round(volPct * 100)}%`}
              />
            </div>
          </div>

          <ul className="mp-list">
            {tracks.map((t, i) => (
              <li
                key={t.src}
                className={`mp-item ${i === index ? 'active' : ''}`}
                onClick={() => select(i)}
              >
                <span className="mp-idx">{i === index && playing ? <SvgIcon name="note" size={12} /> : i + 1}</span>
                <span className="mp-li-title">{t.title}</span>
                <span className="mp-li-artist">{t.artist}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <audio
        ref={audioRef}
        src={track.src}
        onTimeUpdate={onTime}
        onLoadedMetadata={onMeta}
        onEnded={onEnded}
        preload="metadata"
      />
    </div>
  )
}
