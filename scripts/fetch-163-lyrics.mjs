import { writeFileSync } from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TARGETS = [
  {
    id: 1869883866,
    out: 'D:/Projects/homepage/public/music/ReoNa - Believer.lrc',
    title: 'Believer',
    artist: 'ReoNa',
  },
  {
    id: 1869883864,
    out: 'D:/Projects/homepage/public/music/ReoNa - ジュブナイル (少年).lrc',
    title: 'ジュブナイル (少年)',
    artist: 'ReoNa',
  },
];

async function getLyric(id) {
  const url = `https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1&csrf_token=`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://music.163.com/',
      Cookie: 'os=pc; appver=2.9.7',
    },
  });
  if (!res.ok) throw new Error('lyric status ' + res.status);
  return res.json();
}

const CREDIT_RE =
  /作词|作曲|编曲|制作人|混音|录音|监制|翻译|翻译组|出品|OP[:：]|SP[:：]|by[:：]|词曲|编曲|和声|发行|企划|统筹|吉他|贝斯|鼓/;

function parseTimed(text) {
  const out = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || CREDIT_RE.test(line)) continue;
    let lastIndex = 0;
    const stamps = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fs = m[3] || '';
      const frac =
        fs.length === 1 ? parseInt(fs, 10) / 10 : fs.length === 2 ? parseInt(fs, 10) / 100 : parseInt(fs, 10) / 1000;
      stamps.push(+(min * 60 + sec + frac).toFixed(3));
      lastIndex = re.lastIndex;
    }
    if (stamps.length) {
      const content = line.slice(lastIndex).trim();
      for (const t of stamps) out.push({ time: t, text: content });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function mergeBilingual(lrc, tly) {
  const jp = parseTimed(lrc);
  const cn = parseTimed(tly);
  const cnByTime = new Map();
  for (const l of cn) {
    if (!cnByTime.has(l.time) || l.text.length > cnByTime.get(l.time).length) cnByTime.set(l.time, l);
  }
  const rows = [];
  const seen = new Set();
  for (const l of jp) {
    const key = l.time.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    let trans = cnByTime.get(l.time);
    if (!trans) {
      // 允许 ±0.3s 容差匹配
      for (const [t, v] of cnByTime) {
        if (Math.abs(t - l.time) <= 0.3) {
          trans = v;
          break;
        }
      }
    }
    rows.push({ time: l.time, jp: l.text, cn: trans ? trans.text : '' });
  }
  return rows.sort((a, b) => a.time - b.time);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

for (const t of TARGETS) {
  const data = await getLyric(t.id);
  const rows = mergeBilingual(data?.lrc?.lyric || '', data?.tlyric?.lyric || '');
  const lines = [
    `[ti:${t.title}]`,
    `[ar:${t.artist}]`,
    `[al:月姫 -A piece of blue glass moon- THEME SONG E.P.]`,
    `[by:homepage · 网易云音乐]`,
    `[offset:0]`,
    '',
  ];
  let bilingual = 0;
  for (const r of rows) {
    const ts = formatTime(r.time);
    lines.push(`[${ts}]${r.jp}`);
    if (r.cn) {
      lines.push(`[${ts}]${r.cn}`);
      bilingual++;
    }
  }
  writeFileSync(t.out, lines.join('\n') + '\n', 'utf8');
  console.log(
    `saved: ${t.out} | rows=${rows.length} bilingual=${bilingual} jpOnly=${rows.length - bilingual}`
  );
}
