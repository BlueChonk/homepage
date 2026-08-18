#!/usr/bin/env python3
"""
QQ音乐歌单解析脚本

用法：
  python3 scripts/parse-qq-playlist.py <歌单ID> [输出文件名]

示例：
  python3 scripts/parse-qq-playlist.py 7813925785
  python3 scripts/parse-qq-playlist.py 9765169551 other.jsonl

输出 JSONL 格式（与 public/music.jsonl 兼容）：
  每行一首歌，包含 API 返回的全部字段 + 构造的封面/链接 URL。
  核心字段：title, artist, duration, songmid, albummid, cover, ...

同时输出歌单元信息文件（同名 .info.json）：
  歌单名、创建者、封面、描述、播放数等。

依赖：无第三方依赖，仅需 Python 3 标准库。
网络：自动读取 HTTP_PROXY / HTTPS_PROXY 环境变量。
"""
import json
import os
import sys
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# QQ 音乐图片 CDN 前缀
IMG_CDN = "https://y.gtimg.cn/music/photo_new"


def fetch_url(url, headers=None, data=None):
    """通过代理发起 HTTP 请求"""
    proxy_handler = urllib.request.ProxyHandler({
        "http": os.environ.get("HTTP_PROXY", "http://127.0.0.1:18080"),
        "https": os.environ.get("HTTPS_PROXY", "http://127.0.0.1:18080"),
    })
    opener = urllib.request.build_opener(proxy_handler)

    req_headers = {"User-Agent": UA, "Referer": "https://y.qq.com/", "Accept": "application/json"}
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, headers=req_headers, data=data)
    resp = opener.open(req, timeout=25)
    return resp.read().decode("utf-8")


def album_cover(albummid, size=300):
    """由 albummid 构造专辑封面 URL"""
    if not albummid:
        return ""
    return f"{IMG_CDN}/T002R{size}x{size}M000{albummid}.jpg"


def singer_photo(singermid, size=300):
    """由 singermid 构造歌手照片 URL"""
    if not singermid:
        return ""
    return f"{IMG_CDN}/T001R{size}x{size}M000{singermid}.jpg"


def song_url(songmid):
    """由 songmid 构造歌曲页面 URL"""
    if not songmid:
        return ""
    return f"https://y.qq.com/n/ryqq/songDetail/{songmid}"


def album_url(albummid):
    """由 albummid 构造专辑页面 URL"""
    if not albummid:
        return ""
    return f"https://y.qq.com/n/ryqq/albumDetail/{albummid}"


def normalize_song(s):
    """将 API 返回的原始歌曲对象规范化，保留全部字段并补充构造字段。

    方案一字段名带 song 前缀（songname/songmid/songid），
    方案二字段名无前缀（name/mid/id），统一映射。
    """
    # 方案一 / 方案二 字段映射
    title = (s.get("songname") or s.get("name") or "").strip()
    songmid = s.get("songmid") or s.get("mid") or ""
    songid = s.get("songid") or s.get("id") or 0

    # 歌手列表：保留完整结构 + 拼接名 + 照片 URL
    singers_raw = s.get("singer", [])
    singers = []
    for x in singers_raw:
        mid = x.get("mid", "")
        singers.append({
            "id": x.get("id", 0),
            "mid": mid,
            "name": x.get("name", ""),
            "photo": singer_photo(mid),
        })
    artist = "、".join(x["name"] for x in singers if x["name"])

    albummid = s.get("albummid") or s.get("albumMid") or ""
    albumid = s.get("albumid") or s.get("albumId") or 0

    duration = int(s.get("interval", 0) or 0)

    # 构造字段
    cover = album_cover(albummid)

    # 组装完整歌曲对象（保留 API 全部原始字段 + 构造字段）
    song = {
        # —— 核心字段（前端直接使用）——
        "title": title,
        "artist": artist,
        "duration": duration,
        "cover": cover,

        # —— 歌曲标识 ——
        "songmid": songmid,
        "songid": songid,
        "songorig": s.get("songorig") or s.get("orig") or "",
        "songtype": s.get("songtype", 0),
        "strMediaMid": s.get("strMediaMid") or "",

        # —— 专辑信息 ——
        "albumid": albumid,
        "albummid": albummid,
        "albumname": (s.get("albumname") or s.get("albumName") or "").strip(),
        "albumdesc": (s.get("albumdesc") or s.get("albumDesc") or "").strip(),
        "albumPic": album_cover(albummid, 800),
        "albumUrl": album_url(albummid),

        # —— 歌手信息 ——
        "singers": singers,

        # —— 视频 ——
        "vid": s.get("vid") or "",

        # —— 文件大小（字节）——
        "size128": s.get("size128", 0),
        "size320": s.get("size320", 0),
        "sizeflac": s.get("sizeflac", 0),
        "sizeape": s.get("sizeape", 0),
        "sizeogg": s.get("sizeogg", 0),

        # —— 付费/版权 ——
        "pay": s.get("pay") or {},
        "preview": s.get("preview") or {},
        "isonly": s.get("isonly", 0),

        # —— 其他元数据 ——
        "label": s.get("label", 0),
        "rate": s.get("rate", 0),
        "stream": s.get("stream", 0),
        "switch": s.get("switch", 0),
        "alertid": s.get("alertid", 0),
        "msgid": s.get("msgid", 0),
        "belongCD": s.get("belongCD", 0),
        "cdIdx": s.get("cdIdx", 0),

        # —— 构造链接 ——
        "songUrl": song_url(songmid),
    }

    # 保留 API 中未映射的额外字段（防止遗漏）
    mapped_keys = {
        "songname", "name", "songmid", "mid", "songid", "id",
        "songorig", "orig", "songtype", "strMediaMid",
        "albummid", "albumMid", "albumid", "albumId",
        "albumname", "albumName", "albumdesc", "albumDesc",
        "singer", "interval", "vid",
        "size128", "size320", "sizeflac", "sizeape", "sizeogg",
        "pay", "preview", "isonly",
        "label", "rate", "stream", "switch", "alertid", "msgid",
        "belongCD", "cdIdx",
    }
    for k, v in s.items():
        if k not in mapped_keys and k not in song:
            song[k] = v

    return song


def extract_playlist_info(cd):
    """提取歌单元信息"""
    return {
        "dissname": cd.get("dissname") or cd.get("title") or "",
        "dissid": cd.get("dissid", ""),
        "disstid": cd.get("disstid", ""),
        "desc": (cd.get("desc") or "").strip(),
        "logo": cd.get("logo") or "",
        "nick": cd.get("nick") or cd.get("nickname") or "",
        "headurl": cd.get("headurl") or "",
        "songnum": cd.get("songnum") or cd.get("total_song_num", 0),
        "visitnum": cd.get("visitnum", 0),
        "buynum": cd.get("buynum", 0),
        "cmtnum": cd.get("cmtnum", 0),
        "scoreavage": cd.get("scoreavage", 0),
        "scoreusercount": cd.get("scoreusercount", 0),
        "tags": cd.get("tags") or [],
        "ctime": cd.get("ctime", 0),
        "mtime": cd.get("mtime", 0),
    }


def fetch_playlist_classic(disstid):
    """方案一：c.y.qq.com 经典接口（最稳定）"""
    url = (
        f"https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?"
        f"disstid={disstid}&type=1&json=1&utf8=1&onlysong=0&nosign=1&g_tk=5381"
        f"&loginUin=0&hostUin=0&format=json&inCharset=GB2312&outCharset=utf-8"
        f"&notice=0&platform=yqq&needNewCode=0"
    )
    print("  [方案一] GET c.y.qq.com ...")
    raw = fetch_url(url)
    text = raw.strip()

    # 处理 JSONP 回调包裹
    if text.startswith("jsonCallback"):
        text = text[text.index("(") + 1 : text.rindex(")")]

    obj = json.loads(text)
    if obj.get("code") != 0 or not obj.get("cdlist"):
        raise Exception(f"方案一 cdlist 为空, code={obj.get('code')}")

    cd = obj["cdlist"][0]
    songs = [normalize_song(s) for s in cd.get("songlist", [])]
    info = extract_playlist_info(cd)

    return {"playlistName": info["dissname"], "songs": songs, "songCount": cd.get("songnum", len(songs)), "info": info}


def fetch_playlist_new(disstid):
    """方案二：u.y.qq.com POST 接口（备用）"""
    url = "https://u.y.qq.com/cgi-bin/musicu.fcg"
    body = json.dumps({
        "comm": {"cv": 4747474, "ct": 24, "format": "json", "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "platform": "yqq.json", "needNewCode": 1, "uin": "0"},
        "playlist": {
            "method": "GetPlaylistDetail",
            "module": "music.playlist.PlaylistDetailServer",
            "param": {"id": int(disstid), "n": 1000, "order": 5},
        },
    }).encode("utf-8")

    print("  [方案二] POST u.y.qq.com ...")
    raw = fetch_url(url, headers={"Content-Type": "application/json"}, data=body)
    obj = json.loads(raw)

    data = obj.get("playlist", {}).get("data")
    if not data or not data.get("songlist"):
        code = obj.get("playlist", {}).get("code")
        raise Exception(f"方案二 songlist 为空, code={code}")

    songs = [normalize_song(s) for s in data["songlist"]]
    info = extract_playlist_info(data)

    return {"playlistName": info["dissname"], "songs": songs, "songCount": len(songs), "info": info}


def main():
    if len(sys.argv) < 2:
        print("用法: python3 scripts/parse-qq-playlist.py <歌单ID> [输出文件名]")
        print("示例: python3 scripts/parse-qq-playlist.py 7813925785 music.jsonl")
        sys.exit(1)

    disstid = sys.argv[1]
    out_name = sys.argv[2] if len(sys.argv) > 2 else "music.jsonl"

    # 输出到 public/ 目录（与 music.jsonl 同级）
    public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
    out_path = os.path.join(public_dir, out_name)

    print(f"{'=' * 60}")
    print(f"解析歌单 {disstid}")
    print(f"{'=' * 60}")

    result = None
    try:
        result = fetch_playlist_classic(disstid)
        print("  ✅ 方案一成功")
    except Exception as e1:
        print(f"  ⚠️ 方案一失败: {e1}")
        try:
            result = fetch_playlist_new(disstid)
            print("  ✅ 方案二成功")
        except Exception as e2:
            print(f"  ❌ 方案二也失败: {e2}")
            sys.exit(1)

    name = result["playlistName"]
    songs = result["songs"]
    count = result["songCount"]
    info = result["info"]

    print(f"  歌单名: {name}")
    print(f"  创建者: {info.get('nick', '')}")
    print(f"  歌单声称歌曲数: {count}")
    print(f"  实际解析歌曲数: {len(songs)}")
    print(f"  访问数: {info.get('visitnum', 0)}")

    # 写入歌单元信息
    info_path = out_path.rsplit(".", 1)[0] + ".info.json"
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print(f"  歌单信息已写入: {info_path}")

    # 写入 JSONL
    with open(out_path, "w", encoding="utf-8") as f:
        for s in songs:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"  歌曲数据已写入: {out_path}")

    # 打印前10条
    print(f"\n  前10条数据:")
    for i, s in enumerate(songs[:10], 1):
        mm = s["duration"] // 60
        ss = s["duration"] % 60
        print(f"    {i:02d}. {s['title']} — {s['artist']} ({mm:02d}:{ss:02d})")
        print(f"        封面: {s['cover']}")
        print(f"        专辑: {s['albumname']} (mid={s['albummid']})")
        if s["vid"]:
            print(f"        MV: {s['vid']}")


if __name__ == "__main__":
    main()
