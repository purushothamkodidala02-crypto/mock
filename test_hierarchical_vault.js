/**
 * Test Hierarchical Vault Grouping & Pattern Analyzer
 * Verifies that:
 * 1. detectClassification accurately extracts Board, Exam, Paper Type (Common vs Specialization), Branch, and Year.
 * 2. getPapersGroupedByHierarchy correctly organizes papers as Board -> Exam -> Paper/Branch -> Years.
 * 3. updatePaperClassification properly updates storage.
 * 4. PaperPatternAnalyzer digests hierarchical classification and builds domain-aware prompts.
 */

const assert = require('assert');
const { PaperVault } = require('./js/paper-vault.js');
const { PaperPatternAnalyzer } = require('./js/paper-analyzer.js');

// Mock browser storage for Node.js environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
global.window = {
  localStorage: global.localStorage
};

async function runTests() {
  console.log('🧪 Starting Hierarchical Vault & Pattern Analyzer Verification...');

  const vault = new PaperVault();
  await vault.initPromise;

  // ==========================================
  // Test 1: Classification Auto-Detection
  // ==========================================
  console.log('\n--- Test 1: Classification Auto-Detection ---');
  
  const sample1 = vault.detectClassification(
    'Telangana State Public Service Commission (TGPSC) Assistant Executive Engineers (AEE) Exam 2023\nPaper-I: General Studies and Mental Ability',
    { maxMarks: 150 },
    'tgpsc_aee_2023_paper1_gs.pdf'
  );
  console.log('Sample 1 Detected:', sample1);
  assert.ok(sample1.board.includes('TGPSC'), 'Should detect TGPSC board');
  assert.ok(sample1.exam.includes('AEE'), 'Should detect AEE exam');
  assert.strictEqual(sample1.paperType, 'common', 'Should detect Common paper category');
  assert.strictEqual(sample1.paperCode, 'Paper 1', 'Should detect Paper 1');
  assert.ok(sample1.specialization.includes('General Studies'), 'Should detect GS&MA branch');
  assert.strictEqual(sample1.year, '2023', 'Should detect year 2023');
  console.log('✅ Sample 1 (TGPSC AEE Paper 1) Auto-Detection PASSED');

  const sample2 = vault.detectClassification(
    'TGPSC AEE 2018 Paper II: Civil Engineering Technical Questions. Total Marks: 300',
    {},
    'civil_eng_2018_paper2.pdf'
  );
  console.log('Sample 2 Detected:', sample2);
  assert.ok(sample2.board.includes('TGPSC'), 'Should detect TGPSC board');
  assert.ok(sample2.exam.includes('AEE'), 'Should detect AEE exam');
  assert.strictEqual(sample2.paperType, 'specialization', 'Should detect Specialization category');
  assert.strictEqual(sample2.paperCode, 'Paper 2', 'Should detect Paper 2');
  assert.ok(sample2.specialization.includes('Civil Engineering'), 'Should detect Civil Engineering branch');
  assert.strictEqual(sample2.year, '2018', 'Should detect year 2018');
  console.log('✅ Sample 2 (TGPSC AEE Civil Paper 2) Auto-Detection PASSED');

  const sample3 = vault.detectClassification(
    'Telangana Board TGPSC AEE Mechanical Engineering Paper 2 Year 2020',
    {},
    'mech_2020.pdf'
  );
  assert.strictEqual(sample3.paperType, 'specialization');
  assert.strictEqual(sample3.specialization, 'Mechanical Engineering');
  assert.strictEqual(sample3.year, '2020');
  console.log('✅ Sample 3 (TGPSC AEE Mechanical Paper 2) Auto-Detection PASSED');

  // ==========================================
  // Test 2: Save Multi-Year Papers to Vault
  // ==========================================
  console.log('\n--- Test 2: Save Multi-Year Papers to Vault ---');

  const testPapers = [
    // Common Paper 1 across 3 years
    {
      title: 'TGPSC AEE 2015 Paper 1 General Studies',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'common',
      paperCode: 'Paper 1',
      specialization: 'General Studies & Mental Ability',
      year: '2015',
      paperData: {
        metadata: { title: 'TGPSC AEE 2015 Paper 1', year: '2015', maxMarks: 150 },
        questions: [{ questionNumber: 1, questionText: 'Telangana movement leader was?', options: [{ text: 'Option A' }] }]
      }
    },
    {
      title: 'TGPSC AEE 2018 Paper 1 General Studies',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'common',
      paperCode: 'Paper 1',
      specialization: 'General Studies & Mental Ability',
      year: '2018',
      paperData: {
        metadata: { title: 'TGPSC AEE 2018 Paper 1', year: '2018', maxMarks: 150 },
        questions: [{ questionNumber: 1, questionText: 'Consider the following statements regarding Kakatiya dynasty', options: [{ text: '1 only' }] }]
      }
    },
    {
      title: 'TGPSC AEE 2023 Paper 1 General Studies',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'common',
      paperCode: 'Paper 1',
      specialization: 'General Studies & Mental Ability',
      year: '2023',
      paperData: {
        metadata: { title: 'TGPSC AEE 2023 Paper 1', year: '2023', maxMarks: 150 },
        questions: [{ questionNumber: 1, questionText: 'Rythu Bandhu scheme evaluation', options: [{ text: '1 and 2' }] }]
      }
    },
    // Specialization Paper 2: Civil Engineering across 2 years
    {
      title: 'TGPSC AEE 2018 Paper 2 Civil Engineering',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'specialization',
      paperCode: 'Paper 2',
      specialization: 'Civil Engineering',
      year: '2018',
      paperData: {
        metadata: { title: 'TGPSC AEE 2018 Paper 2 Civil', year: '2018', maxMarks: 300 },
        questions: [{ questionNumber: 1, questionText: 'Calculate bending moment of cantilever beam under UDL', options: [{ text: 'wL^2/2' }] }]
      }
    },
    {
      title: 'TGPSC AEE 2023 Paper 2 Civil Engineering',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'specialization',
      paperCode: 'Paper 2',
      specialization: 'Civil Engineering',
      year: '2023',
      paperData: {
        metadata: { title: 'TGPSC AEE 2023 Paper 2 Civil', year: '2023', maxMarks: 300 },
        questions: [{ questionNumber: 1, questionText: 'As per IS 456-2000, minimum grade of concrete for severe exposure is', options: [{ text: 'M30' }] }]
      }
    },
    // Specialization Paper 2: Mechanical Engineering
    {
      title: 'TGPSC AEE 2020 Paper 2 Mechanical Engineering',
      board: 'TGPSC',
      exam: 'AEE',
      paperType: 'specialization',
      paperCode: 'Paper 2',
      specialization: 'Mechanical Engineering',
      year: '2020',
      paperData: {
        metadata: { title: 'TGPSC AEE 2020 Paper 2 Mech', year: '2020', maxMarks: 300 },
        questions: [{ questionNumber: 1, questionText: 'Carnot engine efficiency between 300K and 600K', options: [{ text: '50%' }] }]
      }
    }
  ];

  const savedIds = [];
  for (const p of testPapers) {
    const saved = await vault.savePaper(p.paperData, {
      title: p.title,
      board: p.board,
      exam: p.exam,
      paperType: p.paperType,
      paperCode: p.paperCode,
      specialization: p.specialization,
      year: p.year
    });
    savedIds.push(saved.id);
  }
  console.log(`Saved ${savedIds.length} test papers into vault.`);
  assert.strictEqual(savedIds.length, 6, 'Should have saved 6 papers');

  // ==========================================
  // Test 3: Hierarchy Tree Verification
  // Board -> Exam -> Paper/Specialization Branch -> Exam Years inside!
  // ==========================================
  console.log('\n--- Test 3: Hierarchy Tree Verification ---');
  const hierarchy = await vault.getPapersGroupedByHierarchy();
  console.log('Hierarchy root keys (Boards):', Object.keys(hierarchy));
  assert.ok(hierarchy['TGPSC'], 'TGPSC Board folder should exist');

  const tgpscBoard = hierarchy['TGPSC'];
  console.log('TGPSC Board contains exams:', Object.keys(tgpscBoard));
  assert.ok(tgpscBoard['AEE'], 'AEE exam folder should exist under TGPSC');

  const aeeExam = tgpscBoard['AEE'];
  console.log('AEE Exam contains Paper/Branch folders:', Object.keys(aeeExam.papers));

  const branchKeys = Object.keys(aeeExam.papers);
  assert.strictEqual(branchKeys.length, 3, 'Should have 3 paper/branch folders');

  const gsBranchKey = branchKeys.find(k => k.includes('common') || aeeExam.papers[k].displayName.includes('General Studies'));
  assert.ok(gsBranchKey, 'Common GS&MA Paper branch must exist');
  const gsBranch = aeeExam.papers[gsBranchKey];
  const gsYears = Object.keys(gsBranch.years);
  console.log(`Found GS branch "${gsBranch.displayName}" with years:`, gsYears);
  assert.strictEqual(gsYears.length, 3, 'GS&MA branch should have 3 years inside (2015, 2018, 2023)');
  assert.strictEqual(gsBranch.paperType, 'common', 'GS branch should be common type');

  const civilBranchKey = branchKeys.find(k => k.includes('civil') || aeeExam.papers[k].displayName.includes('Civil'));
  assert.ok(civilBranchKey, 'Civil Engineering Paper branch must exist');
  const civilBranch = aeeExam.papers[civilBranchKey];
  const civilYears = Object.keys(civilBranch.years);
  console.log(`Found Civil branch "${civilBranch.displayName}" with years:`, civilYears);
  assert.strictEqual(civilYears.length, 2, 'Civil branch should have 2 years inside (2018, 2023)');
  assert.strictEqual(civilBranch.paperType, 'specialization', 'Civil branch should be specialization type');

  const mechBranchKey = branchKeys.find(k => k.includes('mech') || aeeExam.papers[k].displayName.includes('Mechanical'));
  assert.ok(mechBranchKey, 'Mechanical Engineering Paper branch must exist');
  const mechBranch = aeeExam.papers[mechBranchKey];
  const mechYears = Object.keys(mechBranch.years);
  console.log(`Found Mechanical branch "${mechBranch.displayName}" with years:`, mechYears);
  assert.strictEqual(mechYears.length, 1, 'Mechanical branch should have 1 year inside (2020)');

  console.log('✅ Hierarchy Rule PASSED: Board -> Exam -> Paper/Branch -> Exam Years inside!');

  // ==========================================
  // Test 4: Edit Classification via updatePaperClassification
  // ==========================================
  console.log('\n--- Test 4: updatePaperClassification ---');
  const mechPaperId = mechBranch.years['2020'][0].id;
  await vault.updatePaperClassification(mechPaperId, {
    specialization: 'Mechanical & Production Engineering',
    year: '2021'
  });

  const updatedPaper = await vault.getPaper(mechPaperId);
  assert.strictEqual(updatedPaper.specialization, 'Mechanical & Production Engineering');
  assert.strictEqual(updatedPaper.year, '2021');
  console.log('✅ updatePaperClassification successfully updated specialization and year');

  // ==========================================
  // Test 5: PaperPatternAnalyzer with Multi-Branch Digest
  // ==========================================
  console.log('\n--- Test 5: PaperPatternAnalyzer Multi-Branch Digest ---');
  const allPapers = await vault.getAllPapers();
  const analyzer = new PaperPatternAnalyzer({});
  const digest = analyzer.prepareCrossPaperDigest(allPapers);

  console.log('Digest total papers:', digest.totalPapers);
  console.log('Digest year range:', digest.yearRange);
  console.log('Digest distribution:', digest.distribution);

  assert.strictEqual(digest.totalPapers, 6, 'Digest should compile 6 papers');
  assert.ok(digest.distribution.hasCommon, 'Should detect common papers');
  assert.ok(digest.distribution.hasSpecialization, 'Should detect specialization papers');
  assert.ok(digest.distribution.specializations.includes('Civil Engineering'), 'Should list Civil Engineering');

  const prompt = analyzer.buildAnalysisPrompt(digest);
  assert.ok(prompt.includes('IMPORTANT DUAL-PAPER EXAMINATION STRUCTURE'), 'Prompt should have dual-paper structure guidance');
  assert.ok(prompt.includes('Civil Engineering'), 'Prompt should reference Civil Engineering');
  console.log('✅ PaperPatternAnalyzer Prompt Formulation with Dual-Paper Guidance PASSED');

  console.log('\n🎉 ALL 5 HIERARCHICAL VAULT & PATTERN ANALYZER TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
