#!/usr/bin/env python3
"""
QQ音乐歌单解析脚本

用法：
  python3 scripts/parse-qq-playlist.py <歌单ID> [输出文件名]

示例：
  python3 scripts/parse-qq-playlist.py 7813925785
  python3 scripts/parse-qq-playlist.py 9765169551 other.jsonl

输出 JSONL 格式（与 public/music.jsonl 兼容）：
  {"title": "歌名", "artist": "歌手", "duration": 时长秒数}

依赖：无第三方依赖，仅需 Python 3 标准库。
网络：自动读取 HTTP_PROXY / HTTPS_PROXY 环境变量。
"""
import json
import os
import sys
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


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
    songs = []
    for s in cd.get("songlist", []):
        title = (s.get("songname") or "").strip()
        artist = "、".join(x.get("name", "") for x in s.get("singer", []))
        duration = int(s.get("interval", 0) or 0)
        songs.append({"title": title, "artist": artist, "duration": duration})

    return {"playlistName": cd.get("dissname", ""), "songs": songs, "songCount": cd.get("songnum", len(songs))}


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

    songs = []
    for s in data["songlist"]:
        title = (s.get("name") or "").strip()
        artist = "、".join(x.get("name", "") for x in s.get("singer", []))
        duration = int(s.get("interval", 0) or 0)
        songs.append({"title": title, "artist": artist, "duration": duration})

    return {"playlistName": data.get("title", ""), "songs": songs, "songCount": len(songs)}


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

    print(f"  歌单名: {name}")
    print(f"  歌单声称歌曲数: {count}")
    print(f"  实际解析歌曲数: {len(songs)}")

    # 写入 JSONL
    with open(out_path, "w", encoding="utf-8") as f:
        for s in songs:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"  已写入: {out_path}")

    # 打印前10条
    print(f"\n  前10条数据:")
    for i, s in enumerate(songs[:10], 1):
        mm = s["duration"] // 60
        ss = s["duration"] % 60
        print(f"    {i:02d}. {s['title']} — {s['artist']} ({mm:02d}:{ss:02d})")


if __name__ == "__main__":
    main()
