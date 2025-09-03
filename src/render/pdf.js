const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const puppeteer = require('puppeteer');


Handlebars.registerHelper('fmtPair', (a, b) => `${a} / ${b}`);


module.exports = async function renderPdf(data) {
    const tpl = fs.readFileSync(path.join(__dirname, '../../templates/checklist.hbs'), 'utf8');
    const html = Handlebars.compile(tpl)(data);
    
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
        <div style="font-size:10px; color:#555; width:100%; padding:0 14mm;">
        <span>資管系畢業學分自我檢核表</span>
        <span style="float:right">第 <span class="pageNumber"></span> / <span class="totalPages"></span> 頁</span>
        </div>`
    });
    await browser.close();
    return pdf;
};