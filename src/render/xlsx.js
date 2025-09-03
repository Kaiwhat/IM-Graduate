const ExcelJS = require('exceljs');


module.exports = async function renderXlsx(data) {
    const wb = new ExcelJS.Workbook();
    const sum = wb.addWorksheet('Summary');
    sum.addRows([
        ['產製時間', data.ruleSummary.generatedAt],
        ['全校共同', data.ruleSummary.byBucket.common],
        ['通識', data.ruleSummary.byBucket.general],
        ['基礎院本', data.ruleSummary.byBucket.foundation],
        ['系專業', data.ruleSummary.byBucket.major],
        ['自由選修', data.ruleSummary.byBucket.free],
        ['體育', `${data.ruleSummary.pe.earned}/${data.ruleSummary.pe.required}`],
        ['服務學習', `${data.ruleSummary.service.count}/${data.ruleSummary.service.required}`],
        ['畢業總學分', `${data.ruleSummary.graduation.earned}/${data.ruleSummary.graduation.required}`]
    ]);


    const ws = wb.addWorksheet('Courses');
    ws.addRow(['類別','領域','科目代碼','科目名稱','必/選','群','開課單位','科目學分','實得學分']);
    data.data.forEach(r => ws.addRow([
        r.category || '',
        r.domain || '',
        (r.course && r.course.code) || '',
        (r.course && r.course.name) || '',
        r.req_type || '',
        r.group || '',
        r.offered_by || '',
        r.course_credits ?? '',
        r.earned_credits_course ?? ''
    ]));

    return await wb.xlsx.writeBuffer();
};