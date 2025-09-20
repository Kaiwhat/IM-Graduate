const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const chardet = require('chardet');
const iconv = require('iconv-lite');
const parser = require('./src/parser');
const rules = require('./src/rules');

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




app.listen(PORT, () => {
    console.log(`IM-GradChecklist running: http://localhost:${PORT}`);
    console.log(`Upload UI: http://localhost:${PORT}/upload.html`);
});