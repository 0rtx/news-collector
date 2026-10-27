#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 GitHub Actions 中运行：抓取新闻数据并写入 docs/data/*.json。

三个数据源：
  - 新浪财经 7x24 快讯 -> docs/data/news.json
  - 财联社电报（按阅读量） -> docs/data/cls.json
  - 东方财富上市公司公告 -> docs/data/ann.json

每次运行会读取上一次的数据文件并合并、剔除超过 24 小时的内容，实现全天累积。
"""

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, "docs", "data")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def http_get(url, referer, timeout=15):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Referer": referer, "Accept": "*/*"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def load_json(name, default):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def save_json(name, obj):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def cls_sign(params):
    qs = "&".join(f"{k}={v}" for k, v in sorted(params, key=lambda x: x[0]))
    sha1_hex = hashlib.sha1(qs.encode("utf-8")).hexdigest()
    return hashlib.md5(sha1_hex.encode("utf-8")).hexdigest()


def fetch_cls_page(last_time, rn=50):
    params = [
        ("appName", "CailianpressWeb"),
        ("last_time", last_time),
        ("os", "web"),
        ("refresh_type", "1"),
        ("rn", str(rn)),
        ("sv", "7.7.5"),
    ]
    qs = urllib.parse.urlencode(params + [("sign", cls_sign(params))])
    raw = http_get("https://www.cls.cn/v1/roll/get_roll_list?" + qs, "https://www.cls.cn/")
    data = json.loads(raw.decode("utf-8", "replace"))
    return data.get("data", {}).get("roll_data") or []


def update_cls():
    existing = load_json("cls.json", {"items": []})
    store = {str(x["id"]): x for x in existing.get("items", [])}
    now = time.time()
    last = ""
    for _ in range(8):
        try:
            roll = fetch_cls_page(last)
        except Exception:
            break
        if not roll:
            break
        cts = []
        for it in roll:
            ctime = int(it.get("ctime") or 0)
            if ctime <= 0:
                continue
            cts.append(ctime)
            rid = it.get("id")
            if rid is None or now - ctime > 86400:
                continue
            text = (it.get("content") or "").strip()
            title = (it.get("title") or "").strip()
            store[str(rid)] = {
                "id": rid,
                "ctime": ctime,
                "time": datetime.fromtimestamp(ctime, TZ).strftime("%m-%d %H:%M"),
                "text": text or title,
                "reading_num": int(it.get("reading_num") or 0),
                "level": str(it.get("level") or ""),
                "url": f"https://www.cls.cn/detail/{rid}",
            }
        if not cts:
            break
        oldest = min(cts)
        if oldest < now - 86400:
            break
        last = str(oldest)
    items = [v for v in store.values() if now - v["ctime"] <= 86400]
    items.sort(key=lambda x: x["reading_num"], reverse=True)
    save_json(
        "cls.json",
        {"updated": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"), "items": items[:30]},
    )


def fetch_sina_page(page, n=100):
    url = (
        f"https://zhibo.sina.com.cn/api/zhibo/feed"
        f"?page={page}&page_size={n}&zhibo_id=152&tag_id=0&dire=f&dpc=1"
    )
    raw = http_get(url, "https://finance.sina.com.cn")
    data = json.loads(raw.decode("utf-8", "replace"))
    return data["result"]["data"]["feed"]["list"]


def parse_sina_item(it):
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
    return {
        "id": it.get("id"),
        "text": (it.get("rich_text") or "").strip(),
        "time": it.get("create_time") or "",
        "tags": tags,
        "url": docurl,
    }


def update_sina():
    existing = load_json("news.json", {"items": []})
    store = {x["id"]: x for x in existing.get("items", [])}
    for page in range(1, 10):
        try:
            feed = fetch_sina_page(page)
        except Exception:
            break
        for it in feed:
            item = parse_sina_item(it)
            if item["id"] is not None:
                store[item["id"]] = item
    cutoff = (datetime.now(TZ) - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    items = [v for v in store.values() if v["time"] >= cutoff]
    items.sort(key=lambda x: x["time"], reverse=True)
    save_json(
        "news.json",
        {"updated": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"), "items": items},
    )


def update_ann():
    existing = load_json("ann.json", {"items": []})
    store = {x["id"]: x for x in existing.get("items", [])}
    url = (
        "https://np-anotice-stock.eastmoney.com/api/security/ann"
        "?sr=-1&page_size=40&page_index=1&ann_type=A&client_source=web&f_node=0&s_node=0"
    )
    raw = http_get(url, "https://data.eastmoney.com/")
    data = json.loads(raw.decode("utf-8", "replace"))
    for it in (data.get("data") or {}).get("list") or []:
        codes = it.get("codes") or []
        name = codes[0].get("short_name", "") if codes else ""
        code = codes[0].get("stock_code", "") if codes else ""
        cols = it.get("columns") or []
        category = cols[0].get("column_name", "") if cols else ""
        art = it.get("art_code") or ""
        date = (it.get("notice_date") or "")[:10]
        if not art:
            continue
        store[art] = {
            "id": art,
            "title": (it.get("title") or "").strip(),
            "name": name,
            "code": code,
            "category": category,
            "date": date,
            "time": (it.get("display_time") or "")[:16],
            "url": f"https://pdf.dfcfw.com/pdf/H2_{art}_1.pdf",
        }
    cutoff = (datetime.now(TZ) - timedelta(hours=24)).strftime("%Y-%m-%d")
    items = [v for v in store.values() if v["date"] >= cutoff]
    items.sort(key=lambda x: x["time"], reverse=True)
    save_json(
        "ann.json",
        {"updated": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"), "items": items},
    )


def main():
    for fn in (update_sina, update_cls, update_ann):
        try:
            fn()
            print(f"{fn.__name__}: OK")
        except Exception as exc:  # noqa: BLE001
            print(f"{fn.__name__}: FAILED ({exc})")


if __name__ == "__main__":
    main()
