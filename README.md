# IM-GradChecklist (初版)


一鍵：上傳 HTML → 解析 → 規則檢核 → 下載 PDF / DOCX / XLSX。


## 安裝與啟動
```bash
npm i
npm start
```

開啟：

產生器頁：http://localhost:3000/upload.html

網頁版檢視：http://localhost:3000/viewer.html

健康檢查：http://localhost:3000/health 

## 使用
1. 在「產生器」或「網頁版檢視」頁，選擇校務系統存檔的 .html 檔。
2. 先解析看看是否正確；在網頁版檢視頁可用搜尋/篩選、看群組列合併的視覺表格。
3. 需要正式文件時按「下載檢核表」選 PDF / DOCX / XLSX。

> PDF 需要字型支援中文（建議安裝 Noto Sans CJK）。若在 Linux / Docker 中，請安裝相應字型套件。

## 規則設定（config/rules.json）
依資管系修業規定更新門檻（必修/選修/通識/體育/服務學習等）

## 已知限制
- 合併儲存格（rowspan）已展開；若來源表格樣式差異大，可能需微調 parser。
- 「修課中/已修畢」狀態顏色判定依來源 HTML 樣式，若學校改版需更新。