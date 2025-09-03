const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel } = require('docx');



module.exports = async function renderDocx(data) {
    const rows = [
        new TableRow({ children: [
            new TableCell({ children: [new Paragraph('類別')], width: { size: 12, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph('領域')] }),
            new TableCell({ children: [new Paragraph('科目')] }),
            new TableCell({ children: [new Paragraph('必/選')] }),
            new TableCell({ children: [new Paragraph('群')] }),
            new TableCell({ children: [new Paragraph('開課單位')] }),
            new TableCell({ children: [new Paragraph('科目學分')] }),
            new TableCell({ children: [new Paragraph('實得學分')] })
        ]})
    ];


    data.data.forEach(r => {
        rows.push(new TableRow({ children: [
            new TableCell({ children: [new Paragraph(r.category || '')] }),
            new TableCell({ children: [new Paragraph(r.domain || '')] }),
            new TableCell({ children: [new Paragraph(`${(r.course && r.course.code) || ''} ${(r.course && r.course.name) || ''}`)] }),
            new TableCell({ children: [new Paragraph(r.req_type || '')] }),
            new TableCell({ children: [new Paragraph(r.group || '')] }),
            new TableCell({ children: [new Paragraph(r.offered_by || '')] }),
            new TableCell({ children: [new Paragraph(String(r.course_credits ?? ''))] }),
            new TableCell({ children: [new Paragraph(String(r.earned_credits_course ?? ''))] })
        ]}));
    });


    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ text: '資管系畢業學分自我檢核表', heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: `產製時間：${data.ruleSummary.generatedAt}` }),
                new Paragraph({ text: '' }),
                new Paragraph({ text: `全校共同：${data.ruleSummary.byBucket.common}` }),
                new Paragraph({ text: `通識：${data.ruleSummary.byBucket.general}` }),
                new Paragraph({ text: `基礎院本：${data.ruleSummary.byBucket.foundation}` }),
                new Paragraph({ text: `系專業：${data.ruleSummary.byBucket.major}` }),
                new Paragraph({ text: `自由選修：${data.ruleSummary.byBucket.free}` }),
                new Paragraph({ text: `體育：${data.ruleSummary.pe.earned}/${data.ruleSummary.pe.required}` }),
                new Paragraph({ text: `服務學習：${data.ruleSummary.service.count}/${data.ruleSummary.service.required}` }),
                new Paragraph({ text: `畢業總學分：${data.ruleSummary.graduation.earned}/${data.ruleSummary.graduation.required}` }),
                new Paragraph({ text: '' }),
                new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
            ]
        }]
    });

    return await Packer.toBuffer(doc);
};