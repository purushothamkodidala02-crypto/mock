// Standalone Node.js test script for Question Paper Extractor
const fs = require('fs');

// Mock window object for node execution
global.window = {};
require('./js/extractor.js');
require('./js/samples.js');

console.log("=== TESTING QUESTION PAPER EXTRACTOR ===");

const sample = window.SAMPLE_QUESTION_PAPERS.ts_police;
console.log("Input Sample:", sample.title);

const result = window.extractorEngine.extract(sample.text, { images: sample.images });

console.log("\n--- EXTRACTION SUMMARY ---");
console.log("Success:", result.success);
console.log("Title:", result.metadata.title);
console.log("Subject:", result.metadata.subject);
console.log("Duration:", result.metadata.duration);
console.log("Max Marks (Stated):", result.metadata.maxMarks);
console.log("Total Calculated Marks:", result.stats.totalCalculatedMarks);
console.log("Total Questions Extracted:", result.stats.totalQuestions);
console.log("MCQ Count:", result.stats.mcqCount);
console.log("Answer Key Found:", result.answerKeyFound);

console.log("\n--- DIAGRAM / IMAGE QUESTIONS CHECK ---");
['52', '55', '58'].forEach(num => {
  const q = result.questions.find(x => x.questionNumber === num);
  console.log(`Q${num}: Image Attached = ${Boolean(q?.image)}, Text = "${q?.questionText.substring(0, 45)}..."`);
});

console.log("\n--- FIRST 5 EXTRACTED QUESTIONS ---");
result.questions.slice(0, 5).forEach((q, i) => {
  console.log(`\n[Question ${q.questionNumber}] (${q.marks} Mark, Type: ${q.type})`);
  console.log("Text:", q.questionText);
  console.log("Options:", q.options.map(o => `(${o.key}) ${o.text}`).join(' | '));
  console.log("Correct Answer Key:", q.correctAnswer || "None");
});

console.log("\n--- VERIFYING USER SCREENSHOT ISSUES (Q199 & Q200) ---");
const q199 = result.questions.find(x => x.questionNumber === '199');
const q200 = result.questions.find(x => x.questionNumber === '200');
const q205 = result.questions.find(x => x.questionNumber === '205');

if (!q199) throw new Error("TEST FAILED: Question 199 was not extracted!");
console.log(`✓ Q199 Extracted: options count = ${q199.options.length} (Expected: 4)`);
if (q199.options.length !== 4) throw new Error(`TEST FAILED: Q199 has ${q199.options.length} options instead of 4!`);
if (!q199.questionText.includes("Operation Rahat")) throw new Error("TEST FAILED: Q199 question stem missing statements!");
if (!q199.questionText.includes("కింది వ్యాఖ్యలను")) throw new Error("TEST FAILED: Q199 Telugu text dropped!");
console.log("✓ Q199 statements and Telugu text preserved in question stem.");
console.log("  Options:", q199.options.map(o => `(${o.key}) ${o.text}`).join(' | '));

if (!q200) throw new Error("TEST FAILED: Question 200 was not extracted!");
if (q205) console.warn("Notice: Separate question 205 exists:", q205.questionNumber);
console.log(`✓ Q200 Extracted: options count = ${q200.options.length} (Expected: 4)`);
if (q200.options.length !== 4) throw new Error(`TEST FAILED: Q200 has ${q200.options.length} options instead of 4!`);
if (!q200.questionText.includes("H.M. Patel")) throw new Error("TEST FAILED: Q200 question stem missing match table!");
if (!q200.questionText.includes("కింది వాటిని జతపరచుము")) throw new Error("TEST FAILED: Q200 Telugu text dropped!");
console.log("✓ Q200 match table and Telugu text preserved in question stem.");
console.log("  Options:", q200.options.map(o => `(${o.key}) ${o.text}`).join(' | '));

console.log("\n--- TESTING GEMINI HANDLER SANITIZER ON RAW AI OUTPUT ---");
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};
require('./js/gemini-handler.js');
const rawAITestQ199 = {
  questionNumber: "199",
  questionText: "Consider the following statements:",
  options: [
    { key: "A", text: "Operation Rahat, 2015 was commanded by Gen V.K. Singh." },
    { key: "B", text: "Operation Rahat is a rescue mission to evacuate Indian civilians from Syria." },
    { key: "C", text: "INS Sumitra was deployed in Operation Rahat." },
    { key: "1", text: "a & c" },
    { key: "2", text: "a & b" },
    { key: "3", text: "b & c" },
    { key: "4", text: "a, b & c" }
  ]
};
const sanitizedAITestQ199 = window.geminiHandler.sanitizeAIExtractedQuestion(rawAITestQ199, null);
if (sanitizedAITestQ199.options.length !== 4) throw new Error(`Gemini Sanitizer Failed on Q199: got ${sanitizedAITestQ199.options.length} options`);
if (!sanitizedAITestQ199.questionText.includes("Operation Rahat")) throw new Error("Gemini Sanitizer Failed: statements missing in stem");
console.log("✓ Gemini Sanitizer correctly reduced Q199 from 7 options to 4 options and moved statements to stem.");

const rawAITestQ200 = {
  questionNumber: "205", // simulated OCR misread of 200 through watermark
  questionText: "Match the following Minister with Union Government:",
  options: [
    { key: "A", text: "H.M. Patel (i) Finance Minister, N F Government" },
    { key: "B", text: "Indrajit Gupta (ii) Defence Minister, NDA-I" },
    { key: "C", text: "Madhu Dandavate (iii) Finance Minister, Janata Government" },
    { key: "D", text: "George Fernandes (iv) Home Minister, UF Government" },
    { key: "1", text: "a-ii, b-iv, c-i, d-iii" },
    { key: "2", text: "a-iv, b-iii, c-i, d-ii" },
    { key: "3", text: "a-iv, b-ii, c-i, d-iii" },
    { key: "4", text: "a-iii, b-iv, c-i, d-ii" }
  ]
};
const sanitizedAITestQ200 = window.geminiHandler.sanitizeAIExtractedQuestion(rawAITestQ200, { questionNumber: "199" });
// The extractor preserves original printed question numbers (requirement 6); gap detection handles discrepancies.
// Q205 stays 205 because silent renumbering hides extraction errors. Validation flags the gap instead.
if (sanitizedAITestQ200.options.length !== 4) throw new Error(`Gemini Sanitizer Failed on Q200: got ${sanitizedAITestQ200.options.length} options`);
if (!sanitizedAITestQ200.questionText.includes("H.M. Patel")) throw new Error("Gemini Sanitizer Failed: match table missing in stem");
console.log(`✓ Gemini Sanitizer preserved source question number ${sanitizedAITestQ200.questionNumber} and reduced 8 options to 4 options.`);

const rawAITestQ1 = {
  questionNumber: "1",
  questionText: "How did most people regard early motor cars? (1) జర్మనీ మరియు ఫ్రాన్స్‌లలో పెట్రోల్‌తో నడిచే అంతర్గత దహన యంత్రాన్ని ఉత్పత్తి చేయడానికి మొదటి విజయవంతమైన ప్రయత్నాలు జరిగాయి...",
  options: [
    { key: "1", text: "Not better than horse-driven engines" },
    { key: "2", text: "A mere joke, or as rather dangerous playthings" },
    { key: "3", text: "A mere scientific experiment" },
    { key: "4", text: "A cumbersome vehicle" }
  ]
};
const sanitizedAITestQ1 = window.geminiHandler.sanitizeAIExtractedQuestion(rawAITestQ1, null);
if (sanitizedAITestQ1.questionText.includes("జర్మనీ")) {
  throw new Error("Gemini Sanitizer Failed: Q1 still has spurious Telugu passage bleed in stem!");
}
if (sanitizedAITestQ1.questionText !== "How did most people regard early motor cars?") {
  throw new Error(`Gemini Sanitizer Failed: Q1 text mismatch: "${sanitizedAITestQ1.questionText}"`);
}
console.log("✓ Gemini Sanitizer correctly stripped spurious Telugu passage bleed '(1) జర్మనీ మరియు...' from Q1 stem.");

console.log("\n=== ALL TESTS PASSED SUCCESSFULLY ===");
process.exit(0);

