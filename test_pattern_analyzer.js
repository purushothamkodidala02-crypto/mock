// Automated Unit Tests for PaperVault and PaperPatternAnalyzer
const assert = require('assert');

// Mock localStorage and window for Node environment
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

global.window = {
  localStorage: global.localStorage,
  indexedDB: null // test localStorage fallback path in Node
};

const { PaperVault } = require('./js/paper-vault.js');
const { PaperPatternAnalyzer } = require('./js/paper-analyzer.js');

console.log('====================================================');
console.log('🧪 RUNNING PAPER VAULT & PATTERN ANALYZER TEST SUITE');
console.log('====================================================\n');

// Initialize Vault
const vault = new PaperVault();
const analyzer = new PaperPatternAnalyzer();

async function runTests() {
  // Test 1: Empty vault check
  console.log('Test 1: Testing Vault Initialization...');
  await vault.clearVault();
  const initial = await vault.getAllPapersSummary();
  assert.strictEqual(initial.length, 0, 'Vault should be empty initially');
  console.log('  ✓ Vault initialized empty successfully.');

  // Test 2: Saving Paper 1 (TS Police 2015)
  console.log('\nTest 2: Saving Paper 1 into Vault...');
  const paper1Data = {
    metadata: {
      title: 'Telangana State Police Preliminary Exam 2015',
      subject: 'General Studies & Mental Ability',
      maxMarks: 200
    },
    sections: [
      {
        id: 'sec_1',
        title: 'General Studies',
        questions: [
          {
            id: 'q1',
            questionNumber: '1',
            marks: 1,
            type: 'mcq',
            section: 'General Studies',
            questionText: 'What is the synonym of amenable in peaceful settlement?',
            options: [
              { key: '1', text: 'Doubtful' },
              { key: '2', text: 'Unwilling' },
              { key: '3', text: 'Responsive' },
              { key: '4', text: 'Disagreeable' }
            ],
            correctAnswer: '3'
          },
          {
            id: 'q2',
            questionNumber: '2',
            marks: 1,
            type: 'mcq',
            section: 'General Studies',
            questionText: 'Consider the following statements regarding Kakatiya architecture: (a) Ramappa temple has floating bricks (b) Thousand pillar temple is in Warangal. Choose correct: (1) a only (2) b only (3) Both a & b (4) Neither',
            options: [
              { key: '1', text: 'a only' },
              { key: '2', text: 'b only' },
              { key: '3', text: 'Both a & b' },
              { key: '4', text: 'Neither' }
            ],
            correctAnswer: '3'
          }
        ]
      }
    ]
  };

  const saveRes1 = await vault.savePaper(paper1Data);
  assert.strictEqual(saveRes1.success, true, 'Should save paper 1 successfully');
  assert.ok(saveRes1.id, 'Should generate an ID');
  console.log(`  ✓ Paper 1 saved with ID: ${saveRes1.id}, Year: ${saveRes1.paper.year}`);

  // Test 3: Saving Paper 2 (TS Police 2016)
  console.log('\nTest 3: Saving Paper 2 into Vault...');
  const paper2Data = {
    metadata: {
      title: 'Telangana State Police Preliminary Exam 2016',
      subject: 'General Studies & Arithmetic',
      maxMarks: 200
    },
    sections: [
      {
        id: 'sec_1',
        title: 'Arithmetic',
        questions: [
          {
            id: 'q52',
            questionNumber: '52',
            marks: 1,
            type: 'mcq',
            section: 'Arithmetic',
            questionText: 'Three cubes with sides in ratio 3:4:5 are melted into single cube with diagonal 12\\sqrt{3} cm. Calculate side.',
            options: [
              { key: '1', text: '6 cm' },
              { key: '2', text: '8 cm' },
              { key: '3', text: '10 cm' },
              { key: '4', text: '12 cm' }
            ],
            correctAnswer: '4'
          }
        ]
      }
    ]
  };

  const saveRes2 = await vault.savePaper(paper2Data);
  assert.strictEqual(saveRes2.success, true, 'Should save paper 2 successfully');
  console.log(`  ✓ Paper 2 saved with ID: ${saveRes2.id}, Year: ${saveRes2.paper.year}`);

  // Test 4: Retrieval and Summary List
  console.log('\nTest 4: Retrieving Vault Summaries...');
  const summaries = await vault.getAllPapersSummary();
  assert.strictEqual(summaries.length, 2, 'Vault should contain 2 papers');
  assert.strictEqual(summaries[0].totalQuestions > 0, true, 'Questions count should be positive');
  console.log(`  ✓ Vault contains ${summaries.length} papers:`);
  summaries.forEach((p, i) => console.log(`     [${i + 1}] ${p.title} (${p.year}) - ${p.totalQuestions} Questions, ${p.totalMarks} Marks`));

  // Test 5: Fetch Single Paper
  console.log('\nTest 5: Fetching Single Paper by ID...');
  const fetched = await vault.getPaper(saveRes1.id);
  assert.ok(fetched, 'Should find saved paper');
  assert.strictEqual(fetched.title, 'Telangana State Police Preliminary Exam 2015');
  console.log('  ✓ Fetched paper content verified.');

  // Test 6: Cross-Paper Digest Generation
  console.log('\nTest 6: Generating Multi-Paper Digest for AI Analysis...');
  const fullPaper1 = await vault.getPaper(saveRes1.id);
  const fullPaper2 = await vault.getPaper(saveRes2.id);
  const digest = analyzer.prepareCrossPaperDigest([fullPaper1, fullPaper2]);

  assert.ok(digest, 'Digest should not be null');
  assert.strictEqual(digest.totalPapers, 2, 'Digest should cover 2 papers');
  assert.strictEqual(digest.papers.length, 2);
  assert.ok(digest.papers[0].archetypes.statementQuestions > 0, 'Should detect statement question in Paper 1');
  assert.ok(digest.papers[1].archetypes.numericalQuestions > 0, 'Should detect numerical question in Paper 2');
  console.log(`  ✓ Multi-paper digest compiled successfully:`);
  console.log(`     Paper 1 Archetypes:`, digest.papers[0].archetypes);
  console.log(`     Paper 2 Archetypes:`, digest.papers[1].archetypes);

  // Test 7: Prompt Construction
  console.log('\nTest 7: Building AI Analysis Prompt...');
  const prompt = analyzer.buildAnalysisPrompt(digest, 'Focus on Telangana State Movement questions');
  assert.ok(prompt.includes('executiveBlueprint'), 'Prompt must define executive blueprint');
  assert.ok(prompt.includes('topicWeightageMatrix'), 'Prompt must define topic weightage matrix');
  assert.ok(prompt.includes('predictiveExamForecast'), 'Prompt must define predictive forecast');
  assert.ok(prompt.includes('Telangana State Movement'), 'Prompt must include custom focus instructions');
  console.log(`  ✓ Prompt constructed successfully (${prompt.length} characters).`);

  // Test 8: Response Standardization & Markdown Generation
  console.log('\nTest 8: Testing Standardizer & Publication-Grade Report Generation...');
  const mockAIResponse = {
    executiveBlueprint: {
      examTitle: 'Telangana State Police Recruitment Examination Series',
      totalPapersAnalyzed: 2,
      yearsCovered: '2015 - 2016',
      standardQuestionCount: 200,
      standardDuration: '3 Hours (180 mins)',
      timePerQuestionSeconds: '54 seconds',
      scoringLogic: '1 mark per question, 1/4 negative marking',
      primaryTargetAudience: 'State Sub-Inspector / Constable Aspirants'
    },
    difficultyDistribution: {
      level1RecallPercent: 30,
      level1Desc: 'Direct factual memory of state geography and basic science',
      level2ApplicationPercent: 45,
      level2Desc: 'Applied arithmetic, percentage profit & loss, Indian Constitution articles',
      level3SynthesisPercent: 25,
      level3Desc: 'Kakatiya & Telangana movement statement combinations, match tables',
      overallDifficultySummary: 'Balanced qualifying paper with strategic negative marking filter'
    },
    topicWeightageMatrix: [
      {
        topic: 'Telangana History & Movement',
        weightagePercent: 25,
        averageQuestions: 50,
        trend: 'increasing',
        recurrenceRate: '100%',
        highYieldSubtopics: ['Gentlemen Agreement', 'Kakatiya Dynasty', '1969 Agitation'],
        examinerFocus: 'Chronology of agitations and historical committee recommendations'
      },
      {
        topic: 'Arithmetic & Mental Ability',
        weightagePercent: 25,
        averageQuestions: 50,
        trend: 'stable',
        recurrenceRate: '100%',
        highYieldSubtopics: ['Time & Work', 'Ratios & Mensuration', 'Series Completion'],
        examinerFocus: 'Calculation speed under 50 seconds per question'
      }
    ],
    questionDesignAndTraps: {
      questionFormulationStyles: [
        {
          style: 'Statement-Based Evaluation (a, b, c)',
          frequency: '35% of paper',
          purpose: 'Eliminates guesswork and tests multi-fact mastery',
          trapMechanisms: 'Pairing true statement with subtly altered year in second statement'
        }
      ],
      commonExaminerTraps: [
        'Negative phrasing ("Which of the following is NOT correct")',
        'Absolute qualifiers ("Only", "Exclusively")'
      ]
    },
    yearOverYearEvolution: {
      keyChangesObserved: [
        'Shift from 1-line GK questions to analytical multi-statement formats',
        'Higher depth in Telangana cultural heritage and literature'
      ],
      difficultyTrajectory: 'Consistent rise in analytical questions'
    },
    predictiveExamForecast: {
      expectedTopicDistribution: [
        { subject: 'Telangana History & Culture', expectedQuestions: '45-50', priority: 'Crucial' },
        { subject: 'Arithmetic & Reasoning', expectedQuestions: '50', priority: 'Crucial' }
      ],
      top10MustMasterHotspots: [
        '1969 Movement Timeline',
        'Indian Polity: Fundamental Rights & DPSP',
        'Mensuration & Cube Diagonals'
      ],
      highProbabilityQuestionArchetypes: '35% Statement Evaluation, 20% Match Matrices, 45% Direct MCQs'
    },
    actionableStudyStrategy: {
      threeRoundExamAttemptStrategy: {
        round1Speed: 'First 55 mins: Solve all 100% known direct questions (aim for 70+ marks)',
        round2Analytical: 'Next 80 mins: Work through statement evaluations and arithmetic problems',
        round3Review: 'Final 45 mins: Review difficult match tables and ensure zero mis-bubbling'
      },
      criticalPreparationDoAndDonts: {
        dos: ['Eliminate incorrect options first', 'Master formula shortcuts for mensuration'],
        donts: ['Never guess blindly due to 1/4 negative mark penalty', 'Do not spend >90s on any single math question']
      }
    }
  };

  const report = analyzer.standardizeAnalysisOutput(mockAIResponse, digest, [fullPaper1, fullPaper2]);
  assert.ok(report.markdownReport, 'Must generate Markdown report');
  assert.ok(report.markdownReport.includes('Executive Exam Architecture'), 'Markdown must have executive blueprint');
  assert.ok(report.markdownReport.includes('Topic Weightage & Frequency Matrix'), 'Markdown must have topic matrix');
  assert.ok(report.markdownReport.includes('Predictive Next-Exam Blueprint'), 'Markdown must have predictive blueprint');
  console.log(`  ✓ Report successfully standardized and formatted into ${report.markdownReport.length} chars of Markdown.`);

  // Test 9: Deletion test
  console.log('\nTest 9: Deleting Paper from Vault...');
  await vault.deletePaper(saveRes1.id);
  const remaining = await vault.getAllPapersSummary();
  assert.strictEqual(remaining.length, 1, 'Should have 1 paper remaining');
  assert.strictEqual(remaining[0].id, saveRes2.id, 'Remaining paper should be Paper 2');
  console.log('  ✓ Deletion verified.');

  console.log('\n====================================================');
  console.log('🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY!');
  console.log('====================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
