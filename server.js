const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const chardet = require('chardet');
const iconv = require('iconv-lite');
const parser = require('./src/parser');
const rules = require('./src/rules');
const renderPdf = require('./src/render/pdf');
const renderDocx = require('./src/render/docx');
const renderXlsx = require('./src/render/xlsx');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));


const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 15 * 1024 * 1024 } });


function readFileSmartEncoding(filePath) {
    const buf = fs.readFileSync(filePath);
    const detected = chardet.detect(buf) || 'UTF-8';
    const isBig5 = /big5/i.test(detected);
    const encoding = isBig5 ? 'Big5' : 'UTF-8';
    return iconv.decode(buf, encoding);
}

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));


// 解析：回 JSON
app.post('/parse', upload.single('htmlFile'), async (req, res) => {
    try {
        let html = null;
        if (req.file) {
            html = readFileSmartEncoding(req.file.path);
            fs.unlink(req.file.path, () => {});
        } else if (req.body && req.body.tableHtml) {
            html = req.body.tableHtml;
        } else {
            return res.status(400).json({ message: '請提供 htmlFile 或 tableHtml' });
        }
        const parsed = parser.parseHtmlToJson(html);
        const withSummary = rules.applyRules(parsed);
        return res.json({ message: '解析成功', ...withSummary });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: '解析失敗', error: String(e) });
    }
});

// 一鍵產出：PDF / DOCX / XLSX
app.post('/generate', upload.single('htmlFile'), async (req, res) => {
    try {
        const format = (req.query.format || req.body.format || 'pdf').toLowerCase();
        let html = null;
        if (req.file) {
            html = readFileSmartEncoding(req.file.path);
            fs.unlink(req.file.path, () => {});
        } else if (req.body && req.body.tableHtml) {
            html = req.body.tableHtml;
        } else {
            return res.status(400).json({ message: '請提供 htmlFile 或 tableHtml' });
        }

        const parsed = parser.parseHtmlToJson(html);
        const data = rules.applyRules(parsed); // 加上 summary 與規則結果

        if (format === 'pdf') {
            const buff = await renderPdf(data);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="checklist.pdf"');
            return res.send(buff);
        }
        if (format === 'docx') {
            const buff = await renderDocx(data, { mergeKeys: ['category','domain'], simulateMerge: true });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', 'attachment; filename="checklist.docx"');
            return res.send(buff);
        }
        if (format === 'xlsx') {
            const buff = await renderXlsx(data);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="checklist.xlsx"');
            return res.send(Buffer.from(buff));
        }
        return res.status(400).json({ message: '不支援的 format，請用 pdf/docx/xlsx' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: '產生失敗', error: String(e) });
    }
});


app.listen(PORT, () => {
    console.log(`IM-GradChecklist running: http://localhost:${PORT}`);
    console.log(`Upload UI: http://localhost:${PORT}/upload.html`);
});