import requests
from bs4 import BeautifulSoup
import json
import os
import re

def fetch_and_save():
    url = "https://www.pilio.idv.tw/lto539/list.asp"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    # 1. 讀取現有資料
    if os.path.exists('data.json'):
        with open('data.json', 'r', encoding='utf-8') as f:
            try:
                final_data = json.load(f)
            except json.JSONDecodeError:
                final_data = []
    else:
        final_data = []

    # 建立已存在期別的索引，方便快速比對
    existing_periods = {item['period'] for item in final_data}

    try:
        response = requests.get(url, headers=headers, timeout=15, verify=False)
        response.encoding = 'big5'
        soup = BeautifulSoup(response.text, 'html.parser')
        
        new_entries = []
        rows = soup.find_all('tr')
        
        for row in rows:
            tds = row.find_all('td')
            if len(tds) >= 2:
                col1 = tds[0].get_text(strip=True)
                col2 = tds[1].get_text(strip=True)
                
                if "," in col2 and len(col2.split(',')) == 5:
                    date_match = re.search(r'(\d{2}/\d{2})', col1)
                    display_date = date_match.group(1) if date_match else col1
                    nums = [n.strip() for n in col2.split(',') if n.strip().isdigit()]
                    
                    # 2. 只有當期別不在既有資料中時，才加入
                    if len(nums) == 5 and display_date not in existing_periods:
                        new_entries.append({"period": display_date, "nums": nums})
        
        if not new_entries:
            print("目前沒有新的開獎資料需要更新。")
            return

        # 3. 合併並排序 (由舊到新)
        # 註：這裡假設資料都在同一年。若跨年，需加入年份邏輯。
        combined_data = final_data + new_entries[::-1]
        
        # 4. 儲存為 JSON 檔案
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, ensure_ascii=False, indent=4)
            
        print(f"更新成功！新增了 {len(new_entries)} 期資料。")

    except Exception as e:
        print(f"更新失敗: {e}")

if __name__ == "__main__":
    fetch_and_save()
