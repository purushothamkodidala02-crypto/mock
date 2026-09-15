// Test suite for Gemini Multi-Key Manager & Multi-Model Question Extractor
const assert = require('assert');

// Mock browser environment for Node
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

global.window = { localStorage: global.localStorage };

// Load gemini-handler.js
require('./js/gemini-handler.js');

console.log('====================================================');
console.log('🧪 RUNNING GEMINI MULTI-KEY & MULTI-MODEL TEST SUITE');
console.log('====================================================\n');

const keyMgr = window.geminiKeyManager;
const handler = window.geminiHandler;

// Test 1: Empty Pool Check
console.log('Test 1: Initializing Key Pool...');
keyMgr.clearAllKeys();
assert.strictEqual(keyMgr.getAllKeys().length, 0, 'Key pool should start empty');
assert.strictEqual(keyMgr.hasKeys(), false, 'hasKeys() should return false when empty');
console.log('  ✓ Initialized empty pool successfully.');

// Test 2: Adding Single Keys
console.log('\nTest 2: Adding Single Keys & Deduplication...');
const res1 = keyMgr.addKey('AIzaSyTestKeyAlpha12345678', 'Primary Key');
assert.strictEqual(res1.success, true, 'Should successfully add valid key');
assert.strictEqual(keyMgr.getAllKeys().length, 1, 'Pool should have 1 key');

// Duplicate check
const dupRes = keyMgr.addKey('AIzaSyTestKeyAlpha12345678', 'Duplicate Key');
assert.strictEqual(dupRes.success, false, 'Should reject duplicate key');
assert.strictEqual(keyMgr.getAllKeys().length, 1, 'Pool size should remain 1');
console.log('  ✓ Single key addition and duplicate prevention verified.');

// Test 3: Bulk Adding Keys
console.log('\nTest 3: Bulk Ingestion of Multiple Keys...');
const bulkText = `
  AIzaSyTestKeyBeta987654321
  AIzaSyTestKeyGamma11223344; AIzaSyTestKeyDelta55667788
  AIzaSyTestKeyAlpha12345678
`;
const bulkRes = keyMgr.addMultipleKeys(bulkText);
assert.strictEqual(bulkRes.added, 3, 'Should add 3 new unique keys');
assert.strictEqual(bulkRes.skipped, 1, 'Should skip 1 duplicate key');
assert.strictEqual(keyMgr.getAllKeys().length, 4, 'Total pool should now have 4 keys');
console.log(`  ✓ Bulk import verified: added ${bulkRes.added} keys, skipped ${bulkRes.skipped} duplicate.`);

// Test 4: Key Rotation & Auto-Failover on HTTP 429
console.log('\nTest 4: Auto-Failover & Rate-Limit (429) Cooldown Tracking...');
keyMgr.setRotationStrategy('auto_failover');

const firstSelection = keyMgr.getNextKey();
assert.ok(firstSelection.key, 'Should retrieve an active key');
const key1 = firstSelection.key;
console.log(`  Active Key selected: "${key1.label}" (${key1.key.substring(0, 10)}...)`);

// Simulate HTTP 429 Quota Exceeded on Key 1
console.log(`  Simulating HTTP 429 Quota Exceeded on "${key1.label}"...`);
keyMgr.recordRateLimit(key1.id, 60000, 'RESOURCE_EXHAUSTED: Quota exceeded for model');

const summaryAfterLimit = keyMgr.getStatusSummary();
assert.strictEqual(summaryAfterLimit.cooldown, 1, 'Exactly 1 key should be in cooldown');
assert.strictEqual(summaryAfterLimit.active, 3, '3 keys should remain active');

// Next key selection should automatically skip Key 1 and pick Key 2!
const secondSelection = keyMgr.getNextKey();
assert.ok(secondSelection.key, 'Should retrieve next active key');
assert.notStrictEqual(secondSelection.key.id, key1.id, 'Must NOT pick the rate-limited key');
console.log(`  ✓ Auto-failover succeeded! Switched automatically to: "${secondSelection.key.label}"`);

// Test 5: Round-Robin Rotation
console.log('\nTest 5: Round-Robin Distribution Strategy...');
keyMgr.setRotationStrategy('round_robin');
const pickedKeys = [];
for (let i = 0; i < 6; i++) {
  const sel = keyMgr.getNextKey();
  if (sel.key) pickedKeys.push(sel.key.id);
}
// Check that multiple different keys were cycled
const uniquePicked = new Set(pickedKeys);
assert.ok(uniquePicked.size > 1, 'Round-robin should cycle through multiple keys');
console.log(`  ✓ Round-robin cycled across ${uniquePicked.size} unique keys over 6 requests.`);

// Test 6: Cooldown Reset
console.log('\nTest 6: Cooldown Reset...');
keyMgr.resetAllCooldowns();
const summaryReset = keyMgr.getStatusSummary();
assert.strictEqual(summaryReset.cooldown, 0, 'All cooldowns should be cleared');
assert.strictEqual(summaryReset.active, 4, 'All 4 keys should be active again');
console.log('  ✓ Reset cooldowns verified: all 4 keys active.');

// Test 7: Supported Models & Selection
console.log('\nTest 7: Supported Gemini Models & Switching...');
const models = handler.supportedModels;
const modelIds = models.map(m => m.id);
assert.ok(modelIds.includes('gemini-2.5-flash'), 'Should support gemini-2.5-flash');
assert.ok(modelIds.includes('gemini-2.5-pro'), 'Should support gemini-2.5-pro');
assert.ok(modelIds.includes('gemini-3.5-flash-lite'), 'Should support gemini-3.5-flash-lite');
assert.ok(modelIds.includes('gemini-3.7-flash'), 'Should support gemini-3.7-flash');

handler.setModelName('gemini-2.5-pro');
assert.strictEqual(handler.getModelName(), 'gemini-2.5-pro', 'Should update active model');
console.log(`  ✓ Active model set to: ${handler.getModelName()}`);

// Test 8: Output Standardizer (Questions & Options)
console.log('\nTest 8: Output Standardizer & Question Parsing...');
const mockGeminiResponse = {
  metadata: {
    title: 'Combined Competitive Exam 2026',
    subject: 'General Studies & Mental Ability',
    maxMarks: 150
  },
  sections: [
    {
      id: 'sec_1',
      title: 'General Studies',
      questions: [
        {
          questionNumber: '1',
          marks: 1,
          type: 'mcq',
          questionText: 'What is the capital of Telangana?',
          options: [
            { key: 'A', text: 'Warangal' },
            { key: 'B', text: 'Hyderabad' },
            { key: 'C', text: 'Nizamabad' },
            { key: 'D', text: 'Karimnagar' }
          ],
          correctAnswer: 'B',
          explanation: 'Hyderabad is the official capital of Telangana state.'
        },
        {
          questionNumber: '2',
          marks: 2,
          type: 'mcq',
          questionText: 'Evaluate the limit $\\lim_{x \\to 0} \\frac{\\sin x}{x}$:',
          options: [
            { key: '1', text: '0' },
            { key: '2', text: '1' },
            { key: '3', text: 'Infinity' },
            { key: '4', text: 'Undefined' }
          ],
          correctAnswer: '2',
          explanation: 'Standard trigonometric limit $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$.'
        }
      ]
    }
  ]
};

const standardized = handler.standardizeGeminiOutput(mockGeminiResponse, 'sample_exam.pdf', {
  modelUsed: 'gemini-2.5-flash',
  keyUsed: 'Primary Key'
});

assert.strictEqual(standardized.success, true, 'Extraction should succeed');
assert.strictEqual(standardized.questions.length, 2, 'Should standardize 2 questions');
assert.strictEqual(standardized.questions[0].questionNumber, '1', 'Q1 number matches');
assert.strictEqual(standardized.questions[0].options.length, 4, 'Q1 has 4 options');
assert.strictEqual(standardized.questions[0].correctAnswer, 'B', 'Q1 correct answer is B');
assert.strictEqual(standardized.questions[1].questionNumber, '2', 'Q2 number matches');
assert.strictEqual(standardized.questions[1].marks, 2, 'Q2 marks match');
assert.strictEqual(standardized.questions[1].options[1].key, '2', 'Q2 option key is 2');
assert.strictEqual(standardized.stats.totalQuestions, 2, 'Total questions statistic matches');
assert.strictEqual(standardized.stats.totalCalculatedMarks, 3, 'Calculated marks (1 + 2 = 3) match');

console.log('  Extracted Q1:', standardized.questions[0].questionText);
console.log('  Options:', standardized.questions[0].options.map(o => `(${o.key}) ${o.text}`).join(' | '));
console.log('  Answer Key:', standardized.questions[0].correctAnswer);
console.log('  Extracted Q2:', standardized.questions[1].questionText);
console.log('  Options:', standardized.questions[1].options.map(o => `(${o.key}) ${o.text}`).join(' | '));
console.log('  Answer Key:', standardized.questions[1].correctAnswer);
console.log('  ✓ Output standardizer verified successfully.');

// Test 9: Hybrid PDF 200-Question Multi-Batch Merger (Text Q1-125 + Vision Q126-200)
console.log('\nTest 9: Hybrid PDF Multi-Batch Merger (200 Questions Total)...');

// Generate Mock Text Batch (Q1 to Q125)
const textBatchQuestions = [];
for (let i = 1; i <= 125; i++) {
  textBatchQuestions.push({
    questionNumber: String(i),
    questionText: `Digital Text Question ${i}`,
    options: [
      { key: '1', text: `Option 1 for Q${i}` },
      { key: '2', text: `Option 2 for Q${i}` },
      { key: '3', text: `Option 3 for Q${i}` },
      { key: '4', text: `Option 4 for Q${i}` }
    ],
    marks: 1
  });
}
const mockTextBatch = {
  metadata: { title: 'TS Police Constable Prelims 2022', maxMarks: 200 },
  sections: [{ id: 'sec_1', title: 'General Studies', questions: textBatchQuestions }]
};

// Generate Mock Vision Batch (Q126 to Q200)
const visionBatchQuestions = [];
for (let i = 126; i <= 200; i++) {
  visionBatchQuestions.push({
    questionNumber: String(i),
    questionText: `Scanned Vision Question ${i}`,
    options: [
      { key: '1', text: `Option 1 for Q${i}` },
      { key: '2', text: `Option 2 for Q${i}` },
      { key: '3', text: `Option 3 for Q${i}` },
      { key: '4', text: `Option 4 for Q${i}` }
    ],
    marks: 1
  });
}
const mockVisionBatch = {
  metadata: { title: 'TS Police Constable Prelims 2022', maxMarks: 200 },
  sections: [{ id: 'sec_1', title: 'General Studies', questions: visionBatchQuestions }]
};

// Merge both batches
const mergedPaper = handler.mergeBatches([mockTextBatch, mockVisionBatch], 'TS_Police_Constable_2022.pdf');

assert.strictEqual(mergedPaper.success, true, 'Merged extraction should succeed');
assert.strictEqual(mergedPaper.questions.length, 200, 'Should have exactly 200 questions');
assert.strictEqual(mergedPaper.questions[0].questionNumber, '1', 'First question should be Q1');
assert.strictEqual(mergedPaper.questions[124].questionNumber, '125', 'Question 125 should be in place');
assert.strictEqual(mergedPaper.questions[125].questionNumber, '126', 'Question 126 should seamlessly follow Q125');
assert.strictEqual(mergedPaper.questions[199].questionNumber, '200', 'Last question should be Q200');
assert.strictEqual(mergedPaper.stats.totalQuestions, 200, 'Stats should report 200 total questions');
assert.strictEqual(mergedPaper.stats.totalCalculatedMarks, 200, 'Stats should calculate 200 marks');

console.log(`  ✓ Successfully merged Text Batch (1-125) and Visual Batch (126-200)!`);
console.log(`  ✓ Total Questions: ${mergedPaper.questions.length} / 200`);
console.log(`  ✓ First Q: [${mergedPaper.questions[0].questionNumber}] ${mergedPaper.questions[0].questionText}`);
console.log(`  ✓ Mid Q:   [${mergedPaper.questions[125].questionNumber}] ${mergedPaper.questions[125].questionText}`);
console.log(`  ✓ Final Q: [${mergedPaper.questions[199].questionNumber}] ${mergedPaper.questions[199].questionText}`);

console.log('\n====================================================');
console.log('🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY!');

// Test 10: Question 198 Akbar Statements MCQ Recovery & Bilingual Merger
console.log('\nTest 10: Question 198 Statement MCQ Recovery & Bilingual Stem...');

const rawQ198 = {
  questionNumber: '198',
  questionText: `Which of the following statements is not correct about reign of Akbar ?
(1) Raja Todarmal, a Rajput noble became Akbar's revenue minister.
(2) Raja Birbal, a Brahmin rose to high position and became Diwan.
(3) Raja Mansingh, brother-in-law of Akbar was made the commander of the military forces.
(4) Promoulgation of a new religious philosophy called the Din-I-Illahi in 1582 by Akbar.
అక్బర్ కాలానికి సంబంధించి ఈ క్రింది వాఖ్యములలో ఏది సరిఅయింది కాదు ?
(1) రాజ్యపుత్రుడు అయిన తోడర్మల్ అక్బర్ యొక్క రెవెన్యూ మంత్రిగా నియమించబడెను.
(2) బ్రాహ్మణుడైన బీర్బల్ క్రమ క్రమంగా అనేక పదవులు అధిరోహిస్తూ దివాన్ గా నియమించబడెను.
(3) అక్బర్ తన బావమరిది అయిన మాన్సింగ్ను సైన్యాధ్యక్షునిగా నియమించెను.
(4) 1582 లో ‘దీన్-ఇ-ఇలాహి (Din-I-Illahi)’ అను నూతన మతాన్ని అక్బర్ ప్రకటించెను.`,
  options: [
    { key: '1', text: '1' },
    { key: '2', text: '2' },
    { key: '3', text: '3' },
    { key: '4', text: '4' }
  ],
  marks: 1
};

const sanitizedQ198 = handler.sanitizeAIExtractedQuestion(rawQ198);

assert.strictEqual(sanitizedQ198.options.length, 4, 'Should recover exactly 4 options');
assert.ok(sanitizedQ198.options[0].text.includes('Raja Todarmal'), 'Option 1 should contain English text');
assert.ok(sanitizedQ198.options[0].text.includes('తోడర్మల్'), 'Option 1 should contain Telugu translation');
assert.ok(sanitizedQ198.options[1].text.includes('Raja Birbal'), 'Option 2 should contain English text');
assert.ok(sanitizedQ198.options[1].text.includes('బీర్బల్'), 'Option 2 should contain Telugu translation');
assert.ok(sanitizedQ198.options[2].text.includes('Raja Mansingh'), 'Option 3 should contain English text');
assert.ok(sanitizedQ198.options[2].text.includes('మాన్సింగ్'), 'Option 3 should contain Telugu translation');
assert.ok(sanitizedQ198.options[3].text.includes('Din-I-Illahi'), 'Option 4 should contain English text');
assert.ok(sanitizedQ198.options[3].text.includes('దీన్-ఇ-ఇలాహి'), 'Option 4 should contain Telugu translation');
assert.ok(sanitizedQ198.questionText.includes('reign of Akbar'), 'Question stem should keep English prompt');
assert.ok(sanitizedQ198.questionText.includes('అక్బర్ కాలానికి'), 'Question stem should keep Telugu prompt');

console.log('  ✓ Q198 Question Stem:\n    ', sanitizedQ198.questionText.replace(/\n/g, ' '));
console.log('  ✓ Q198 Option 1:', sanitizedQ198.options[0].text);
console.log('  ✓ Q198 Option 2:', sanitizedQ198.options[1].text);
console.log('  ✓ Q198 Option 3:', sanitizedQ198.options[2].text);
console.log('  ✓ Q198 Option 4:', sanitizedQ198.options[3].text);
console.log('  ✓ Verified Q198 recovered all 4 bilingual options with zero dummy placeholders!');

console.log('\nTest 11: Page-Based Smart Batching & Zero Omission Check (Q1 & Q15-35)...');

const tsPoliceSample = `--- [Page 1] ---
TS Police Constable Prelims 2022

--- [Page 2] ---
1. A pair of socks been missing (2) 
 from my room. have (3) is
(1) has
2. I always listen to great speeches carefully
14. Either of the foot paths arrested the thieves.

--- [Page 3] ---
15. I have done a deal of work.
Read the passage below and answer the questions (21-25).
Ms. Yanada recalls all too clearly that mid-summer day in 1945
23. Japan Confederation of A & H Bomb Sufferers is made up of

--- [Page 4] ---
24. Japan was forced to surrender after the
30. If LCM and HCF of two numbers x and y are L and H respectively

--- [Page 5] ---
31. The average weight of a group of men is 77.5 kgs.
35. The ratios of the ages of two persons before 6 years

--- [Page 6] ---
36. In a cylindrical vessel of height 14 cm and radius 5 cm`;

const batches = handler.splitTextIntoBatches(tsPoliceSample, 12);
assert.strictEqual(batches.length, 3, 'Should create exactly 3 batches for 6 pages (2 pages per batch)');

// Batch 1 must contain Question 1 and Page 2
assert.ok(batches[0].includes('--- [Page 2] ---'), 'Batch 1 must retain Page 2 marker');
assert.ok(batches[0].includes('1. A pair of socks'), 'Batch 1 must contain Question 1');
assert.ok(batches[0].includes('14. Either of the foot paths'), 'Batch 1 must contain Question 14');

// Batch 2 must contain Questions 15 to 30 (Pages 3 and 4)
assert.ok(batches[1].includes('--- [Page 3] ---'), 'Batch 2 must retain Page 3 marker');
assert.ok(batches[1].includes('15. I have done a deal of work.'), 'Batch 2 must contain Question 15');
assert.ok(batches[1].includes('24. Japan was forced to surrender'), 'Batch 2 must contain Question 24');
assert.ok(batches[1].includes('30. If LCM and HCF'), 'Batch 2 must contain Question 30');

// Batch 3 must contain Questions 31 to 36 (Pages 5 and 6)
assert.ok(batches[2].includes('--- [Page 5] ---'), 'Batch 3 must retain Page 5 marker');
assert.ok(batches[2].includes('31. The average weight'), 'Batch 3 must contain Question 31');
assert.ok(batches[2].includes('35. The ratios of the ages'), 'Batch 3 must contain Question 35');
assert.ok(batches[2].includes('36. In a cylindrical vessel'), 'Batch 3 must contain Question 36');

console.log('  ✓ Batch 1 coverage: Page 1-2 (contains Question 1 to 14)');
console.log('  ✓ Batch 2 coverage: Page 3-4 (contains Questions 15 to 30)');
console.log('  ✓ Batch 3 coverage: Page 5-6 (contains Questions 31 to 36)');
console.log('  ✓ Verified 100% complete coverage: Question 1 & Questions 15-35 are never omitted!');

console.log('\n====================================================');
console.log('🎉 ALL 11 TEST SUITES PASSED FLAWLESSLY!');
console.log('====================================================');
process.exit(0);
