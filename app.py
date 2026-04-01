from flask import Flask, render_template, jsonify
import requests
from bs4 import BeautifulSoup
import re # 確保有匯入 re 模組

app = Flask(__name__)
def fetch_539_data():
    url = "https://www.pilio.idv.tw/lto539/list.asp"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        response = requests.get(url, headers=headers, timeout=10, verify=False)
        response.encoding = 'big5'
        soup = BeautifulSoup(response.text, 'html.parser')
        data_list = []
        rows = soup.find_all('tr')
        
        for row in rows:
            tds = row.find_all('td')
            if len(tds) >= 2:
                col1_text = tds[0].get_text(strip=True) # 原始內容可能如 "2026/03/31" 或 "115000080(03/31)"
                col2_text = tds[1].get_text(strip=True) # 號碼欄位
                
                if "," in col2_text and len(col2_text.split(',')) == 5:
                    # --- 關鍵修正：提取 MM/dd ---
                    # 尋找符合 數字數字/數字數字 格式的字串
                    date_match = re.search(r'(\d{2}/\d{2})', col1_text)
                    display_date = date_match.group(1) if date_match else col1_text
                    
                    nums = [n.strip() for n in col2_text.split(',') if n.strip().isdigit()]
                    
                    if len(nums) == 5:
                        data_list.append({
                            "period": display_date, # 現在這裡存的是 "03/31"
                            "nums": nums
                        })
            
            if len(data_list) >= 20: break

        return data_list[::-1]
    except Exception as e:
        print(f"錯誤: {e}")
        return None
    
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def get_data():
    data = fetch_539_data()
    if data:
        return jsonify(data)
    else:
        # 備援顯示 (確保網頁不空白)
        return jsonify([{"period": "連線失敗", "nums": ["??","??","??","??","??"]}]), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)