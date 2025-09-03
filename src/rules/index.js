const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');


const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/rules.json'), 'utf8'));


function bucketByCategory(category) {
if (!category) return 'other';
const hit = cfg.categoryBuckets.find(b => category.includes(b.match));
return hit ? hit.bucket : 'other';
}

function applyRules(parsed) {
const data = parsed.data.map(x => ({ ...x }));


// 計算各桶學分（以 earned_credits_course 優先，否則以 course_credits）
const totals = { common: 0, general: 0, foundation: 0, major: 0, free: 0, other: 0 };
let peCredits = 0; let serviceCount = 0;


data.forEach(row => {
const bucket = bucketByCategory(row.category);
const earned = (row.earned_credits_course ?? row.course_credits ?? 0) || 0;
totals[bucket] = (totals[bucket] || 0) + (Number.isFinite(earned) ? earned : 0);


const cname = (row.course && row.course.name) || '';
const rawText = (row.course_raw_html || '').replace(/<[^>]+>/g, '');


if (cfg.pe.keywords.some(k => cname.includes(k) || rawText.includes(k))) {
peCredits += Number.isFinite(earned) ? earned : 0;
}
if (cfg.service.keywords.some(k => cname.includes(k) || rawText.includes(k))) {
serviceCount += 1;
}
});


const summary = {
generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
byBucket: totals,
pe: { earned: peCredits, required: cfg.pe.requiredCredits, passed: peCredits >= cfg.pe.requiredCredits },
service: { count: serviceCount, required: cfg.service.requiredTimes, passed: serviceCount >= cfg.service.requiredTimes },
requiredMin: cfg.requiredMin,
electiveMin: cfg.electiveMin,
generalMin: cfg.generalMin,
graduationTotalMin: cfg.graduationTotalMin
};


const flatTotal = Object.values(totals).reduce((a, b) => a + b, 0);
summary.graduation = { earned: flatTotal, required: cfg.graduationTotalMin, passed: flatTotal >= cfg.graduationTotalMin };


return { ...parsed, ruleSummary: summary };
}


module.exports = { applyRules };