/**
 * Automated Verification Test for Manual Folder Creation & In-Folder Paper Upload
 * Verifies:
 * 1. createFolder creates and persists registered exam/paper folders.
 * 2. getPapersGroupedByHierarchy includes empty custom folders alongside populated paper folders.
 * 3. In-folder paper saving correctly places uploaded papers under the target branch and year.
 * 4. Multi-year progression inside the created folder (e.g. 2022 and 2024).
 */

const assert = require('assert');
const { PaperVault } = require('./js/paper-vault.js');

// Mock localStorage for Node environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
global.window = { localStorage: global.localStorage };

async function runTests() {
  console.log('🧪 Starting Manual Folder Creation & In-Folder Upload Test Suite...');

  const vault = new PaperVault();
  await vault.initPromise;

  // ==========================================
  // Test 1: Manual Folder Creation
  // ==========================================
  console.log('\n--- Test 1: Manual Folder Creation ---');
  const folderRes = await vault.createFolder({
    board: 'Telangana Board (TGPSC)',
    exam: 'AEE (Assistant Executive Engineer)',
    paperType: 'specialization',
    paperCode: 'Paper 2',
    specialization: 'Electrical & Electronics Engineering (EEE)'
  });

  assert.strictEqual(folderRes.success, true, 'createFolder should succeed');
  assert.ok(folderRes.folder.id, 'Folder should have an ID');
  assert.strictEqual(folderRes.folder.specialization, 'Electrical & Electronics Engineering (EEE)');
  console.log('✅ Folder created successfully:', folderRes.folder.paperKey);

  const customFolders = await vault.getCustomFolders();
  assert.strictEqual(customFolders.length, 1, 'Should have 1 registered custom folder');
  console.log('✅ Custom folder verified in storage.');

  // ==========================================
  // Test 2: Verify Empty Folder in Hierarchy Tree
  // ==========================================
  console.log('\n--- Test 2: Verify Empty Folder in Hierarchy Tree ---');
  const hierarchy1 = await vault.getPapersGroupedByHierarchy();
  assert.ok(hierarchy1['Telangana Board (TGPSC)'], 'Board should exist in hierarchy');
  assert.ok(hierarchy1['Telangana Board (TGPSC)']['AEE (Assistant Executive Engineer)'], 'Exam should exist in hierarchy');

  const examGroup1 = hierarchy1['Telangana Board (TGPSC)']['AEE (Assistant Executive Engineer)'];
  const branchKey = folderRes.folder.paperKey;
  assert.ok(examGroup1.papers[branchKey], 'Branch folder should exist in exam group');

  const branch1 = examGroup1.papers[branchKey];
  const yearCount1 = Object.keys(branch1.years).length;
  console.log(`Branch "${branch1.displayName}" currently has ${yearCount1} years.`);
  assert.strictEqual(yearCount1, 0, 'Newly created branch should have 0 exam years');
  console.log('✅ Empty registered branch folder appears properly in hierarchy tree!');

  // ==========================================
  // Test 3: Upload Paper Directly into this Folder (Year 2024)
  // ==========================================
  console.log('\n--- Test 3: Upload Paper Directly into Folder (Year 2024) ---');
  const mockPaper2024 = {
    metadata: { title: 'TGPSC AEE 2024 EEE Technical Paper' },
    questions: [
      { questionNumber: 1, questionText: 'Synchronous motor speed formula is?', marks: 2, options: [{ text: '120f/P' }] },
      { questionNumber: 2, questionText: 'Transformer core losses include?', marks: 2, options: [{ text: 'Hysteresis & Eddy' }] }
    ]
  };

  const saveRes2024 = await vault.savePaper(mockPaper2024, {
    title: 'TGPSC AEE 2024 Electrical Paper 2',
    board: branch1.board,
    exam: branch1.exam,
    paperType: branch1.paperType,
    paperCode: branch1.paperCode,
    specialization: branch1.specialization,
    year: '2024',
    filename: 'tgpsc_aee_eee_2024.pdf'
  });

  assert.strictEqual(saveRes2024.success, true, 'Saving paper into folder should succeed');
  console.log('✅ Paper 2024 saved with ID:', saveRes2024.id);

  // Re-fetch hierarchy
  const hierarchy2 = await vault.getPapersGroupedByHierarchy();
  const branch2 = hierarchy2['Telangana Board (TGPSC)']['AEE (Assistant Executive Engineer)'].papers[branchKey];
  const yearKeys2 = Object.keys(branch2.years);
  console.log('Branch years after upload:', yearKeys2);
  assert.strictEqual(yearKeys2.length, 1, 'Branch should now contain 1 year');
  assert.ok(yearKeys2.includes('2024'), 'Branch should contain 2024');
  assert.strictEqual(branch2.years['2024'][0].totalQuestions, 2, 'Should contain 2 questions');
  assert.strictEqual(branch2.years['2024'][0].totalMarks, 4, 'Should contain 4 marks');
  console.log('✅ Paper 2024 correctly stored directly inside Electrical Engineering branch folder!');

  // ==========================================
  // Test 4: Multi-Year Progression under Folder (Add Year 2022)
  // ==========================================
  console.log('\n--- Test 4: Add Second Year (2022) to Same Folder ---');
  const mockPaper2022 = {
    metadata: { title: 'TGPSC AEE 2022 EEE Technical Paper' },
    questions: [
      { questionNumber: 1, questionText: 'Kirchhoff Voltage Law is based on conservation of?', marks: 2, options: [{ text: 'Energy' }] }
    ]
  };

  await vault.savePaper(mockPaper2022, {
    title: 'TGPSC AEE 2022 Electrical Paper 2',
    board: branch1.board,
    exam: branch1.exam,
    paperType: branch1.paperType,
    paperCode: branch1.paperCode,
    specialization: branch1.specialization,
    year: '2022',
    filename: 'tgpsc_aee_eee_2022.pdf'
  });

  const hierarchy3 = await vault.getPapersGroupedByHierarchy();
  const branch3 = hierarchy3['Telangana Board (TGPSC)']['AEE (Assistant Executive Engineer)'].papers[branchKey];
  const yearKeys3 = Object.keys(branch3.years);
  console.log('Branch years after second upload:', yearKeys3);
  assert.strictEqual(yearKeys3.length, 2, 'Branch should now contain 2 years (2022 and 2024)');
  assert.ok(yearKeys3.includes('2024') && yearKeys3.includes('2022'), 'Branch must contain both 2022 and 2024');
  // ==========================================
  // Test 5: Custom Folder Deletion Verification
  // ==========================================
  console.log('\n--- Test 5: Custom Folder Deletion ---');
  const tempFolder = await vault.createFolder({
    board: 'APPSC',
    exam: 'Group 1',
    paperType: 'common',
    paperCode: 'Paper 1',
    specialization: 'General Studies'
  });
  let foldersList = await vault.getCustomFolders();
  assert.ok(foldersList.some(f => f.id === tempFolder.folder.id), 'Temp folder should exist');
  console.log('✅ Temporary folder registered:', tempFolder.folder.id);

  await vault.deleteFolder(tempFolder.folder.id);
  foldersList = await vault.getCustomFolders();
  assert.ok(!foldersList.some(f => f.id === tempFolder.folder.id), 'Temp folder should be removed');
  console.log('✅ Folder deleted and verified from storage!');

  console.log('\n🎉 ALL MANUAL FOLDER CREATION, UPLOAD & DELETION TESTS PASSED FLAWLESSLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
