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

// 「學系專業課程」中，兩個次領域擇一達 24 學分；其餘（含另一次領域全部 + 超過 24 的部分）→ 系專業選修
const MAJOR_REALLOCATION = {
  category: '學系專業課程',
  subA: '資訊技術與系統開發次領域',
  subB: '資訊管理與決策科學次領域',
  threshold: 24,
  targetDomain: '系專業選修',
  countOnlyEarned: true, // 只重分類已取得學分（實得>0）
  tiePrefer: '資訊技術與系統開發次領域' // 若兩邊都達門檻且相同分數，優先這個
};

// ===Utils: 尋找目標 table===
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

// 透過標題 <h6> 文字「學號」、「姓名」來自動取得後方的 <span> 內容
function getStudentInfo($) {
  // 取得所有 <h6>
  let $h6List = $('h6');

  // 若不到兩個，直接返回
  if ($h6List.length < 2) return null;

  // ➜ 對應你的 DOM 結構：
  // h6 → parent → parent → next sibling span
  function getSpanTextFromH6($h6) {
    return $h6.parent().parent().next().text().trim();
  }

  const studentId = getSpanTextFromH6($h6List.eq(0));
  const studentName = getSpanTextFromH6($h6List.eq(1));
  const studentClass = getSpanTextFromH6($h6List.eq(2));

  return { studentId, studentName, studentClass };
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

function reassignMajorSubdomains(rows) {
  const cfg = MAJOR_REALLOCATION;
  const isMajor = r => (r.category || '').trim() === cfg.category;
  const isSubA  = r => (r.domain || '').trim() === cfg.subA;
  const isSubB  = r => (r.domain || '').trim() === cfg.subB;
  const earnedOf = r => Number(r.earned_credits_course) || 0;

  const majorRows = rows.filter(isMajor);
  const rowsA = majorRows.filter(isSubA);
  const rowsB = majorRows.filter(isSubB);

  const sum = arr => arr.reduce((acc, r) => acc + earnedOf(r), 0);
  const aEarn = sum(rowsA);
  const bEarn = sum(rowsB);

  // 決定哪個次領域當作「完成」者
  let chosen = null;
  if (aEarn >= cfg.threshold || bEarn >= cfg.threshold) {
    if (aEarn === bEarn) chosen = cfg.tiePrefer;
    else chosen = aEarn > bEarn ? cfg.subA : cfg.subB;
  }

  let movedCount = 0, movedCredits = 0;
  if (chosen) {
    // 1) 被選中的次領域：保留達到門檻所需的前幾門（依原始順序）；其餘（超過門檻）改掛「系專業選修」
    const keepRows = (chosen === cfg.subA ? rowsA : rowsB);
    let acc = 0;
    keepRows.forEach(r => {
      const e = earnedOf(r);
      const canCount = cfg.countOnlyEarned ? e > 0 : true;
      if (!canCount) return;  // 修課中(0分)保留原領域，不動
      if (acc >= cfg.threshold) {
        r.domain_reassigned_from = r.domain;
        r.domain = cfg.targetDomain;
        movedCount++; movedCredits += e;
      } else {
        acc += e; // 還在湊 24 的區間，保留原次領域
      }
    });

    // 2) 另一次領域：所有已取得學分的課，直接改掛「系專業選修」
    const otherRows = chosen === cfg.subA ? rowsB : rowsA;
    otherRows.forEach(r => {
      const e = earnedOf(r);
      const canCount = cfg.countOnlyEarned ? e > 0 : true;
      if (!canCount) return;
      r.domain_reassigned_from = r.domain;
      r.domain = cfg.targetDomain;
      movedCount++; movedCredits += e;
    });
  }

  return {
    enabled: true,
    chosen,                                  // 被選中的次領域（或 null=尚未達門檻）
    threshold: cfg.threshold,
    totals: { [cfg.subA]: aEarn, [cfg.subB]: bEarn },
    movedCount, movedCredits,
    target: cfg.targetDomain
  };
}




// 主解析器（吃 <tbody>，並產出漂亮 JSON）
function parseCoursesTable($, $table) {
  const studentInfo = getStudentInfo($);
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

  // ★ 新增：套用次領域重分類
  let subdomainReassignment = null;
  try {
    subdomainReassignment = reassignMajorSubdomains(data);
  } catch (e) {
    subdomainReassignment = { enabled: true, error: String(e) };
  }

  // 取最下方 thead 的「畢業總學分數」
  const summary = {};
  $table.find('thead').each((_, th) => {
    const txt = $(th).text().replace(/\s+/g,' ').trim();
    const m = txt.match(/畢業總學分數.*?(\d+)\s*\/\s*(\d+)/);
    if (m) summary.graduation_total = { earned: parseInt(m[1],10), required: parseInt(m[2],10) };
    // 也抓幾個主類別（可依需要擴充）
    [
      '全校共同課程','通識領域課程','基礎院本課程','學系專業課程','自由選修'
    ].forEach(cat => {
      const r = new RegExp(cat + '.*?(\\d+(?:\\.\\d+)?)\\s*\\/\\s*(\\d+(?:\\.\\d+)?)');
      const mm = txt.match(r);
      if (mm) {
        summary[cat] = { earned: parseFloat(mm[1]), required: parseFloat(mm[2]) };
      }
    });
  });

  const lectureTd = $table.find('td').filter((_, el) => {
    return $(el).text().includes('通識講座');
  }).first();

  const EnglishTestTd = $table.find('td').filter((_, el) => {
    return $(el).text().includes('英文能力：');
  }).first();

  if (lectureTd.length > 0) {
    summary.lecture = lectureTd.text().trim();
  }

  if (EnglishTestTd.length > 0) {
    summary.english = EnglishTestTd.text().trim();
  }

  return {
    meta: { title, studentInfo },
    columns: headers.map(h => ({ title: h, key: HEADER_KEY_MAP[h] || null })),
    count: data.length,
    data,
    summary,
    subdomainReassignment // ★ 回傳 meta，方便你在 viewer 或除錯使用
  };
}

function parseHtmlToJson(html) {
    const $ = cheerio.load(html);
    const $table = findTargetTable($);
    if (!$table.length) throw new Error('找不到目標表格');
    return parseCoursesTable($, $table);
}


module.exports = { parseHtmlToJson };