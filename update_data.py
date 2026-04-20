import requests
from bs4 import BeautifulSoup
import json
import os

def fetch_and_save():
    url = "https://www.pilio.idv.tw/lto539/list.asp"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        # 抓取 35 期資料
        response = requests.get(url, headers=headers, timeout=15, verify=False)
        response.encoding = 'big5'
        soup = BeautifulSoup(response.text, 'html.parser')
        
        data_list = []
        rows = soup.find_all('tr')
        
        for row in rows:
            tds = row.find_all('td')
            if len(tds) >= 2:
                col1 = tds[0].get_text(strip=True)
                col2 = tds[1].get_text(strip=True)
                
                if "," in col2 and len(col2.split(',')) == 5:
                    import re
                    date_match = re.search(r'(\d{2}/\d{2})', col1)
                    display_date = date_match.group(1) if date_match else col1
                    nums = [n.strip() for n in col2.split(',') if n.strip().isdigit()]
                    
                    if len(nums) == 5:
                        data_list.append({"period": display_date, "nums": nums})
            
            if len(data_list) >= 35: break

        # 轉成由舊到新
        final_data = data_list[::-1]

        # 儲存為 JSON 檔案
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False, indent=4)
            
        print("資料更新成功，已寫入 data.json")

    except Exception as e:
        print(f"更新失敗: {e}")

if __name__ == "__main__":
    fetch_and_save()