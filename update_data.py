import argparse
import json
import os
import re
import time
import requests
import urllib3
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 關閉 verify=False 產生的大量終端機警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://www.pilio.idv.tw/lto539/list.asp"
DATA_FILE = "data.json"
DEFAULT_MAX_PAGES = 55        # 約 1,100 期（約 3.5 年）；每頁約 20 期
MIN_BACKFILL_RECORDS = 1000   # 低於此筆數時自動執行歷史補抓
REQUEST_DELAY_SEC = 0.6       # 換頁間隔，降低被目標站封鎖風險


def create_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    return session


def parse_period_date(raw_text: str):
    """將 Pilio 常見日期格式統一轉為 YYYY/MM/DD（如 '04/24 26(五)' 或 '2026/04/24'）"""
    # 格式 1：明確含 4 碼西元年 (YYYY/MM/DD 或 YYYY. MM/DD)
    m = re.search(r"(\d{4})[.\-/\s]+(\d{1,2})/(\d{1,2})", raw_text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2007 <= y <= 2099 and 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}/{mo:02d}/{d:02d}"

    # 格式 2：MM/DD<br>YY(週)，例如 "04/24 26(五)" 或 "10/2226(四)"
    m = re.search(r"(\d{1,2})/(\d{1,2})\D*?(\d{2})\s*[（(]", raw_text)
    if m:
        mo, d, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"20{yy:02d}/{mo:02d}/{d:02d}"

    return None


def parse_page(html: str):
    soup = BeautifulSoup(html, "html.parser")
    entries = []

    for row in soup.find_all("tr"):
        # 優先以語意化 class 定位，若版面不同則退回前兩欄
        td_date = row.find("td", class_="date-cell")
        td_nums = row.find("td", class_="number-cell")
        if not (td_date and td_nums):
            tds = row.find_all("td")
            if len(tds) < 2:
                continue
            td_date, td_nums = tds[0], tds[1]

        raw_date = td_date.get_text(separator=" ", strip=True)
        raw_nums = td_nums.get_text(separator=" ", strip=True)

        if "," not in raw_nums:
            continue

        period = parse_period_date(raw_date)
        if not period:
            continue

        nums_int = [int(n) for n in re.findall(r"\d+", raw_nums)]
        if len(nums_int) == 5 and all(1 <= n <= 39 for n in nums_int) and len(set(nums_int)) == 5:
            nums_str = [f"{n:02d}" for n in sorted(nums_int)]
            entries.append({"period": period, "nums": nums_str})

    return entries


def load_existing_data(filepath: str):
    if not os.path.exists(filepath):
        return {}, True

    with open(filepath, "r", encoding="utf-8") as f:
        try:
            raw_list = json.load(f)
        except json.JSONDecodeError:
            return {}, True

    # 偵測是否為舊版無年份格式 (MM/DD)，若是則強制重建
    has_legacy_format = any(
        not re.match(r"^\d{4}/\d{2}/\d{2}$", str(item.get("period", "")))
        for item in raw_list
    )
    if has_legacy_format:
        print("偵測到舊版 MM/DD 期別格式，自動切換為全量重建模式 (YYYY/MM/DD)。")
        return {}, True

    data_map = {item["period"]: item for item in raw_list}
    need_backfill = len(data_map) < MIN_BACKFILL_RECORDS
    return data_map, need_backfill


def fetch_and_save(max_pages: int = DEFAULT_MAX_PAGES, force_full: bool = False):
    data_map, auto_backfill = load_existing_data(DATA_FILE)
    is_full_mode = force_full or auto_backfill

    if force_full:
        print(f"啟動強制全量爬取模式，目標頁數：{max_pages} 頁。")
    elif auto_backfill:
        print(f"現有資料 {len(data_map)} 筆（低於 {MIN_BACKFILL_RECORDS} 筆），啟動歷史補抓模式（最多 {max_pages} 頁）。")
    else:
        print(f"現有資料 {len(data_map)} 筆，啟動每日增量更新模式。")

    session = create_session()
    added_count = 0

    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}?indexpage={page}&orderby=new"
        try:
            resp = session.get(url, timeout=15, verify=False)
            resp.encoding = "big5"
            page_entries = parse_page(resp.text)
        except Exception as e:
            print(f"[第 {page} 頁] 抓取失敗：{e}")
            break

        if not page_entries:
            print(f"[第 {page} 頁] 未解析出有效資料，停止翻頁。")
            break

        page_new = 0
        for entry in page_entries:
            if entry["period"] not in data_map:
                data_map[entry["period"]] = entry
                page_new += 1
                added_count += 1

        print(f"[第 {page:02d}/{max_pages} 頁] 解析 {len(page_entries)} 筆，新增 {page_new} 筆（累計 {len(data_map)} 筆）")

        # 增量模式下，若整頁皆已存在則提前結束
        if not is_full_mode and page_new == 0:
            print("已銜接至現有歷史資料，提前結束增量更新。")
            break

        if page < max_pages:
            time.sleep(REQUEST_DELAY_SEC)

    if added_count == 0 and os.path.exists(DATA_FILE) and not auto_backfill:
        print("目前沒有新的開獎資料需要更新。")
        return

    # 嚴格依 YYYY/MM/DD 由舊到新排序
    sorted_data = sorted(data_map.values(), key=lambda x: x["period"])

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_data, f, ensure_ascii=False, indent=4)

    date_range = f"{sorted_data[0]['period']} ~ {sorted_data[-1]['period']}" if sorted_data else "無資料"
    print(f"更新完成！新增 {added_count} 期，總計 {len(sorted_data)} 期（區間：{date_range}）。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="今彩 539 多頁歷史資料爬蟲")
    parser.add_argument("--pages", type=int, default=DEFAULT_MAX_PAGES, help="最大爬取頁數（預設 55 頁）")
    parser.add_argument("--full", action="store_true", help="強制爬滿指定頁數（不提前中止）")
    args = parser.parse_args()

    fetch_and_save(max_pages=args.pages, force_full=args.full)
