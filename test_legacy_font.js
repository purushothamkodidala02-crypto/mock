const assert = require('assert');
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { localStorage };
require('./js/pdf-handler.js');
require('./js/gemini-handler.js');
require('./js/extractor.js');
const { PaperPatternAnalyzer } = require('./js/paper-analyzer.js');

// Text-layer sequences from page 10 of the user's 2015 paper (Q34/Q35).
const broken = 'INRP µR∂VNSﬂ·µyLRiV≤R∂V INRP Æ™sVV¤À¡Õﬁ©´sV 8 % ÕÿÀ≥œ¡™´sVV';
const broken35 = 'LRiW. 12,000/cÃ¡©´sV xqsLi™´sªRΩ=LS¨sNTP 12 % ryµ≥yLRiﬂ·';
const pdf = window.pdfHandler;
for (const text of [broken, broken35]) {
  assert(pdf.hasLegacyFontCorruption(text));
  assert(pdf.assessPageTextQuality(text).reasons.includes('legacy_font_encoding_corruption'));
  assert.throws(() => window.extractorEngine.extract(text), /legacy-font/);
}
for (const text of ['తెలంగాణ రాష్ట్ర రాజధాని ఏది? హైదరాబాద్',
  'Find ∂f/∂x when x ≤ 4; µ = 2. Café, naïve, Æsir. NTP clock.',
  'The cost price is 2500 rupees. The profit is 8 percent.']) {
  assert.strictEqual(pdf.hasLegacyFontCorruption(text), false);
}
const questions = [{ questionNumber: 34, questionText: 'A shopkeeper ' + broken },
  { questionNumber: 35, questionText: 'Choose the answer', options: [{ text: broken35 }] }];
window.geminiHandler.validateAndFlagQuestions(questions);
assert(questions.every(q => q.needsReview && /legacy-font/.test(q.reviewReason)));
assert.throws(() => new PaperPatternAnalyzer().prepareCrossPaperDigest([{ questions }]), /legacy-font/);

(async () => {
  window.geminiHandler.hasAnyKey = () => true;
  pdf.extractText = async () => ({ numPages: 1, pageTexts: [broken], text: broken });
  window.geminiHandler.extractDirectPDF = async () => 'vision-used';
  window.geminiHandler.extractFromTextWithBatches = async () => { throw Error('Corrupt text reached text extraction'); };
  assert.strictEqual(await window.geminiHandler.extractSmart({ name: 'paper.pdf' }), 'vision-used');
  console.log('Legacy font detection, local blocking, result review, analysis blocking and PDF Vision routing passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
