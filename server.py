#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地实时快讯服务（仅使用 Python 标准库，无需安装任何依赖）。

启动: python server.py
浏览器访问 http://127.0.0.1:8000

数据来源（免费公开接口）:
  - 重要消息（按阅读量排序，保留 24 小时）: 财联社电报 (cls.cn)
  - 7x24 快讯: 新浪财经 (zhibo.sina.com.cn)
"""

import hashlib
import json
import os
import socket
import time
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8000"))

CLS_URL = "https://www.cls.cn/v1/roll/get_roll_list"
CLS_PAGE_SIZE = 50
CLS_SEED_PAGES = 16
CLS_STEADY_PAGES = 6
CLS_RETAIN = 86400  # 重要消息保留一天（秒）

SINA_NEWS = (
    "https://zhibo.sina.com.cn/api/zhibo/feed"
    "?page=1&page_size={n}&zhibo_id=152&tag_id=0&dire=f&dpc=1"
)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}

_cache = {}
_cache_lock = Lock()
_cls_store = {}
_cls_lock = Lock()
_seed_lock = Lock()
_seed_done = False


def get_lan_ip():
    """获取本机局域网 IP，失败时回退到 127.0.0.1。"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def http_get(url, referer, timeout=10):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": referer,
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def cached(key, ttl, fetcher):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    data = fetcher()
    with _cache_lock:
        _cache[key] = (time.time(), data)
        stale = [k for k, (ts, _) in _cache.items() if now - ts > 300]
        for k in stale:
            _cache.pop(k, None)
    return data


def cls_sign(params):
    """财联社免密钥签名: sign = md5(sha1(按 key 排序后的参数字符串))。"""
    qs = "&".join(f"{k}={v}" for k, v in sorted(params, key=lambda x: x[0]))
    sha1_hex = hashlib.sha1(qs.encode("utf-8")).hexdigest()
    return hashlib.md5(sha1_hex.encode("utf-8")).hexdigest()


def fetch_cls_page(last_time):
    params = [
        ("appName", "CailianpressWeb"),
        ("last_time", last_time),
        ("os", "web"),
        ("refresh_type", "1"),
        ("rn", str(CLS_PAGE_SIZE)),
        ("sv", "7.7.5"),
    ]
    qs = urllib.parse.urlencode(params + [("sign", cls_sign(params))])
    raw = http_get(CLS_URL + "?" + qs, "https://www.cls.cn/")
    data = json.loads(raw.decode("utf-8", "replace"))
    return data.get("data", {}).get("roll_data") or []


def upsert_cls(roll):
    now = time.time()
    with _cls_lock:
        for it in roll:
            ctime = int(it.get("ctime") or 0)
            rid = it.get("id")
            if ctime <= 0 or rid is None or now - ctime > CLS_RETAIN:
                continue
            text = (it.get("content") or "").strip()
            title = (it.get("title") or "").strip()
            _cls_store[rid] = {
                "id": rid,
                "ctime": ctime,
                "time": datetime.fromtimestamp(ctime).strftime("%m-%d %H:%M"),
                "text": text or title,
                "title": title,
                "reading_num": int(it.get("reading_num") or 0),
                "level": str(it.get("level") or ""),
                "url": f"https://www.cls.cn/detail/{rid}",
            }
        for rid in [r for r, v in _cls_store.items() if now - v["ctime"] > CLS_RETAIN]:
            _cls_store.pop(rid, None)


def refresh_cls():
    global _seed_done
    do_seed = False
    with _seed_lock:
        if not _seed_done:
            do_seed = True
            _seed_done = True
    pages = CLS_SEED_PAGES if do_seed else CLS_STEADY_PAGES
    last = ""
    for _ in range(pages):
        roll = fetch_cls_page(last)
        if not roll:
            break
        upsert_cls(roll)
        ctimes = [int(x.get("ctime") or 0) for x in roll if x.get("ctime")]
        if not ctimes:
            break
        oldest = min(ctimes)
        if oldest < time.time() - CLS_RETAIN:
            break
        last = str(oldest)
    with _cls_lock:
        items = list(_cls_store.values())
    items.sort(key=lambda x: x["reading_num"], reverse=True)
    return {"items": items[:20], "total": len(items), "source": "财联社"}


def fetch_news():
    raw = http_get(SINA_NEWS.format(n=40), "https://finance.sina.com.cn")
    data = json.loads(raw.decode("utf-8", "replace"))
    feed = data["result"]["data"]["feed"]["list"]
    items = []
    for it in feed:
        docurl = it.get("docurl") or ""
        try:
            ext = json.loads(it.get("ext") or "{}")
            if ext.get("docurl"):
                docurl = ext["docurl"]
        except Exception:
            pass
        tags = [
            t.get("name")
            for t in (it.get("tag") or [])
            if t.get("name")
            and any(ch.isalnum() or "\u4e00" <= ch <= "\u9fff" for ch in t["name"])
        ]
        items.append(
            {
                "id": it.get("id"),
                "text": (it.get("rich_text") or "").strip(),
                "time": it.get("create_time") or "",
                "tags": tags,
                "url": docurl,
            }
        )
    return {"items": items, "count": len(items)}


class Handler(BaseHTTPRequestHandler):
    server_version = "NewsServer/1.0"

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            if path in ("/", "/index.html"):
                return self.send_file("index.html")
            if path.startswith("/static/"):
                return self.send_file(path[len("/static/") :])
            if path == "/api/cls":
                return self.send_json(cached("cls", 60, refresh_cls))
            if path == "/api/news":
                return self.send_json(cached("news", 20, fetch_news))
            self.send_error(404, "Not Found")
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=502)

    def send_file(self, rel):
        rel = rel.replace("\\", "/")
        base = os.path.abspath(STATIC_DIR)
        full = os.path.abspath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(base) or not os.path.isfile(full):
            return self.send_error(404, "Not Found")
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as fp:
            data = fp.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8", "replace")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args))


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ReusableThreadingHTTPServer((HOST, PORT), Handler)
    lan_ip = get_lan_ip()
    print("=" * 52)
    print("  实时快讯 · 重要消息  已启动")
    print(f"  本机访问:   http://127.0.0.1:{PORT}")
    print(f"  局域网访问: http://{lan_ip}:{PORT}")
    print("  按 Ctrl+C 停止服务")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
