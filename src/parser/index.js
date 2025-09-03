const cheerio = require('cheerio');

// 欄位鍵名映射（把中文表頭轉成穩定 key）
const HEADER_KEY_MAP = {
  '類別': 'category',
  '領域': 'domain',
  '科目名稱': 'course_cell',
  '必選修': 'req_type',
  '科目群': 'group',
  '開課單位': 'offered_by',
  '須修學分': 'required_credits_group',
  '實修學分': 'earned_credits_group',
  '實修項目': 'items_count_group',
  '已修畢': 'completed_group',
  '科目學分': 'course_credits',
  '實得學分': 'earned_credits_course',
  // 最後一欄空白就忽略
};

// === Utils: 尋找目標 table（依你的 CSS 類別與屬性） ===
function findTargetTable($) {
  let $table = $('table.table.table-responsive[border="1"]').first();
  if ($table.length) return $table;
  $table = $('table[border]').first();
  if ($table.length) return $table;
  return $('table').first();
}

// 解析「標題」與「表頭」
function getDeptTitle($, $table) {
  // 第一個 thead 的 h3 通常是「資訊管理學系」
  const t = $table.find('thead h3').first().text().trim();
  return t || null; 
}

function findHeaderFromThead($, $table) {
  // 掃所有 thead 直到找到包含「類別」「科目名稱」的那一列
  let headers = [];
  $table.find('thead tr').each((_, tr) => {
    const ths = $(tr).find('th');
    if (!ths.length) return;
    const texts = ths.map((_, th) => $(th).text().replace(/\s+/g,'').trim()).get();
    if (texts.includes('類別') && texts.includes('科目名稱')) {
      headers = texts;
    }
  });
  // 後續以這組欄位順序為準（常為 13 欄，最後一欄是空白）
  return headers;
}

// 展開 rowspan
function normalizeRowsByRowspan($, $tbody, logicalColCount) {
  const out = [];
  const spanCarry = Array(logicalColCount).fill(null); // { text, html, remain }

  $tbody.find('tr').each((_, tr) => {
    const rowText = Array(logicalColCount).fill('');
    const rowHtml = Array(logicalColCount).fill('');
    const occupied = Array(logicalColCount).fill(false); // ★ 新增：獨立紀錄是否已佔用

    // 1) 先灌入上方帶下來的 rowspan 值（即使是空字串也算佔位）
    for (let i = 0; i < logicalColCount; i++) {
      if (spanCarry[i] && spanCarry[i].remain > 0) {
        rowText[i] = spanCarry[i].text;
        rowHtml[i] = spanCarry[i].html;
        occupied[i] = true;                 // ★ 關鍵：空字也視為佔用
        spanCarry[i].remain--;
        if (spanCarry[i].remain === 0) spanCarry[i] = null;
      }
    }

    // 2) 本列的 <td>/<th> 逐一放到「下一個尚未佔用」的欄位
    let cursor = 0;
    const cells = $(tr).find('td,th');

    cells.each((_, td) => {
      while (cursor < logicalColCount && occupied[cursor]) cursor++;

      const $td = $(td);
      const text = $td.text().replace(/\s+/g, ' ').trim();
      const html = $td.html() || '';

      rowText[cursor] = text;
      rowHtml[cursor] = html;
      occupied[cursor] = true;             // ★ 標記佔用

      const rs = parseInt($td.attr('rowspan') || '1', 10);
      if (rs > 1) {
        spanCarry[cursor] = { text, html, remain: rs - 1 };
      }

      const cs = parseInt($td.attr('colspan') || '1', 10);
      // 若有 colspan，後續欄位也標記為佔用（即便是空字）
      for (let k = 1; k < cs; k++) {
        while (cursor + 1 < logicalColCount && occupied[cursor + 1]) cursor++;
        if (cursor + 1 < logicalColCount) {
          rowText[cursor + 1] = '';
          rowHtml[cursor + 1] = '';
          occupied[cursor + 1] = true;     // ★ 佔位
        }
        cursor++;
      }

      cursor++;
    });

    out.push({ texts: rowText, htmls: rowHtml });
  });

  return out;
}



// 科目名稱欄位的精細解析（抓課號/課名/歷次修課紀錄）
function parseCourseCell($, tdHtml) {
  // 直接用 cheerio 再 parse 一次這個欄位的 HTML，讀 <span> 與顏色
  const $$ = cheerio.load(`<td>${tdHtml}</td>`);
  const spans = $$('span');

  // 第一個黑字通常是原科目名：[課號]課名
  let baseCode = null, baseName = null;
  const base = spans.first().text().trim();
  const m1 = base.match(/\[(.+?)\](.+)/);
  if (m1) { baseCode = m1[1].trim(); baseName = m1[2].trim(); }

  // 後續每個 span 可能是藍/紫/紅，形如：(1121)[課號]課名(學分)
  const records = [];
  spans.slice(1).each((_, el) => {
    const $s = $$(el);
    const color = String(($s.attr('style') || '').toLowerCase());
    const txt = $s.text().trim();

    const mm = txt.match(/\((\d{3,4}[12])\)\[(.+?)\](.+?)\(([\d.]+)\)/);
    if (mm) {
      let status = 'other';
      if (color.includes('#0000ff')) status = 'taken';     // 藍：已選修
      if (color.includes('#b94fff')) status = 'enrolled';  // 紫：修課中
      records.push({
        term: mm[1], code: mm[2].trim(), name: mm[3].trim(),
        credits: parseFloat(mm[4]), color, status, raw: txt
      });
    } else {
      // 有些自由選修是暗紅色字型，直接保留原文
      records.push({ term: null, code: null, name: null, credits: null, color, status:'other', raw: txt });
    }
  });

  return { code: baseCode, name: baseName, records };
}


// 主解析器（只吃第一個 <tbody>，並產出漂亮 JSON）
function parseCoursesTable($, $table) {
  const title = getDeptTitle($, $table);
  const headers = findHeaderFromThead($, $table);
  const logicalColCount = headers.length || 13;

  const $tbody = $table.find('tbody').first(); // 只抓主要清單那個滾動 tbody
  if (!$tbody.length) return { meta:{title}, columns: [], data: [], summary:{} };

  // 先展開 rowspan，得到每列完整欄位
  let rows = normalizeRowsByRowspan($, $tbody, logicalColCount);
  const keyOrder = headers.map(h => HEADER_KEY_MAP[h] || null);

  // 兼容舊版 rows（若還是純陣列，就包成 {texts, htmls}）
  if (rows.length && Array.isArray(rows[0])) {
    rows = rows.map(arr => ({ texts: arr, htmls: Array(logicalColCount).fill('') }));
  }

  // 找出「科目名稱」欄位索引
  const courseCellIdx = Math.max(0, keyOrder.indexOf('course_cell'));

  // 將列轉成物件
  const data = rows.map((row) => {
    const obj = {};

    // 依表頭鍵名塞值（用 row.texts）
    row.texts.forEach((val, i) => {
      const key = keyOrder[i];
      if (!key) return;
      obj[key] = val ?? '';
    });

    // 已修畢：布林
    obj.completed_group = /(✔|✓)/.test(String(obj.completed_group || ''));

    // 數字欄位：轉成 number 或 null（會處理 <span style="color:red">0</span> 這種）
    ['required_credits_group','earned_credits_group','items_count_group','course_credits','earned_credits_course']
      .forEach(k => {
        const v = obj[k];
        if (v === '' || v == null) { obj[k] = null; return; }
        const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
        obj[k] = Number.isFinite(n) ? n : null;
      });

    // 科目欄：同時保留純文字與 HTML，並做解析
    obj.course_raw_text = row.texts[courseCellIdx] || '';
    obj.course_raw_html = row.htmls[courseCellIdx] || '';

    obj.course = parseCourseCell(obj.course_raw_html || '');
    // 補強：確保 obj.course 存在
    // 確保 obj.course 存在
    if (!obj.course || typeof obj.course !== 'object') obj.course = {};

    if (!obj.course.code || !obj.course.name) {
      const s = (obj.course_raw_text || '').trim();
      // 抓「第一個 [代碼] 和其後的科目名稱」：
      //  - 代碼：[] 內任意字元（通常是數字）
      //  - 名稱：一路吃到「(數字...」之前（如 (1121)、(3.0)），否則吃到字串結尾
      //  - 不錨定開頭，允許前面有 (學期) 之類的東西 (1131)
      const m = s.match(/\[([^\]]+)\]\s*([\s\S]+?)(?=\s*\(\s*\d|\s*$)/);

      if (m) {
        // 1) code：取 [] 內內容（去空白）
        if (!obj.course.code) obj.course.code = m[1].trim();

        // 2) name：取捕捉到的名稱（去頭尾空白）
        if (!obj.course.name) obj.course.name = m[2].trim();
      }
    }

    delete obj.course_cell;
    return obj;
  });

  // 取最下方 thead 的「畢業總學分數」（簡要摘要）
  const summary = {};
  $table.find('thead').each((_, th) => {
    const txt = $(th).text().replace(/\s+/g,' ').trim();
    const m = txt.match(/畢業總學分數.*?(\d+)\s*\/\s*(\d+)/);
    if (m) summary.graduation_total = { earned: parseInt(m[1],10), required: parseInt(m[2],10) };
    // 也抓幾個主類別（可依需要擴充）
    [
      '全校共同課程','通識領域課程','基礎院本課程','學系專業課程','自由選修'
    ].forEach(cat => {
      const r = new RegExp(cat + '.*?(\\d+)\\s*\\/\\s*(\\d+)');
      const mm = txt.match(r);
      if (mm) {
        summary[cat] = { earned: parseInt(mm[1],10), required: parseInt(mm[2],10) };
      }
    });
  });

  return {
    meta: { title },
    columns: headers.map(h => ({ title: h, key: HEADER_KEY_MAP[h] || null })),
    count: data.length,
    data,
    summary
  };
}

function parseHtmlToJson(html) {
    const $ = cheerio.load(html);
    const $table = findTargetTable($);
    if (!$table.length) throw new Error('找不到目標表格');
    return parseCoursesTable($, $table);
}


module.exports = { parseHtmlToJson };