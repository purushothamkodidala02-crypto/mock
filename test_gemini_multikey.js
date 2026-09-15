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

console.log('\n====================================================');
console.log('🎉 ALL 8 TEST SUITES PASSED FLAWLESSLY!');
console.log('====================================================');
process.exit(0);
