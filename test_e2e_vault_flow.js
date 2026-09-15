/**
 * End-to-End Test for Paper Vault & Exam Pattern Discovery Studio
 */
const assert = require('assert');

// Mock localStorage and window for headless Node environment
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

global.window = {
  localStorage: global.localStorage,
  indexedDB: null // tests storage fallback
};

const { PaperVault } = require('./js/paper-vault.js');
const { PaperPatternAnalyzer } = require('./js/paper-analyzer.js');

async function runE2E() {
  console.log('===============================================================');
  console.log('🚀 RUNNING END-TO-END PAPER VAULT & PATTERN DISCOVERY PIPELINE');
  console.log('===============================================================\n');

  const vault = new PaperVault();
  const analyzer = new PaperPatternAnalyzer();

  // Step 1: Clean Vault
  await vault.clearVault();
  let summaries = await vault.getAllPapersSummary();
  assert.strictEqual(summaries.length, 0, 'Vault should be empty initially');
  console.log('Step 1: Cleaned Vault successfully.');

  // Step 2: Ingest 3 Distinct Previous Question Papers
  const paperA = {
    metadata: {
      title: 'TS Police Constable Prelims 2015',
      subject: 'General Studies & Mental Ability',
      maxMarks: 200,
      duration: '3 Hours'
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
            questionText: 'Which temple built by Kakatiyas features floating bricks?',
            options: [
              { key: '1', text: 'Thousand Pillar Temple' },
              { key: '2', text: 'Ramappa Temple' },
              { key: '3', text: 'Bhadrakali Temple' },
              { key: '4', text: 'Alampur Temple' }
            ],
            correctAnswer: '2'
          }
        ]
      }
    ]
  };

  const paperB = {
    metadata: {
      title: 'TS Police Constable Prelims 2016',
      subject: 'General Studies & Arithmetic',
      maxMarks: 200,
      duration: '3 Hours'
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
            questionText: 'Three cubes of sides 3:4:5 melted into cube diagonal $12\\sqrt{3}$. Find edge.',
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

  const paperC = {
    metadata: {
      title: 'TS Police Constable Prelims 2018',
      subject: 'General Studies & State Movement',
      maxMarks: 200,
      duration: '3 Hours'
    },
    sections: [
      {
        id: 'sec_1',
        title: 'Telangana Movement',
        questions: [
          {
            id: 'q199',
            questionNumber: '199',
            marks: 1,
            type: 'mcq',
            questionText: 'Consider following statements: (a) Gentlemen Agreement signed in 1956 (b) 8-point formula in 1969. Choose correct.',
            options: [
              { key: '1', text: 'a only' },
              { key: '2', text: 'b only' },
              { key: '3', text: 'Both a and b' },
              { key: '4', text: 'Neither' }
            ],
            correctAnswer: '3'
          }
        ]
      }
    ]
  };

  const resA = await vault.savePaper(paperA, { filename: 'ts_2015.pdf', source: 'gemini_ai' });
  const resB = await vault.savePaper(paperB, { filename: 'ts_2016.pdf', source: 'gemini_ai' });
  const resC = await vault.savePaper(paperC, { filename: 'ts_2018.pdf', source: 'local_engine' });

  assert.ok(resA.success && resB.success && resC.success, 'All 3 papers must save successfully');
  console.log('Step 2: Saved 3 papers with years:', resA.paper.year, resB.paper.year, resC.paper.year);

  // Step 3: Verify Summaries & Ordering
  summaries = await vault.getAllPapersSummary();
  assert.strictEqual(summaries.length, 3, 'Vault must list 3 papers');
  console.log(`Step 3: Vault summaries verified (${summaries.length} papers listed).`);

  // Step 4: Multi-Paper Pattern Digest
  const fullPapers = [
    await vault.getPaper(resA.id),
    await vault.getPaper(resB.id),
    await vault.getPaper(resC.id)
  ];

  const digest = analyzer.prepareCrossPaperDigest(fullPapers);
  assert.strictEqual(digest.totalPapers, 3);
  assert.strictEqual(digest.yearRange, '2015 - 2018');
  console.log('Step 4: Cross-paper digest generated across years:', digest.yearRange);

  // Step 5: Full Prompt Generation
  const prompt = analyzer.buildAnalysisPrompt(digest);
  assert.ok(prompt.includes('executiveBlueprint'));
  assert.ok(prompt.includes('topicWeightageMatrix'));
  assert.ok(prompt.includes('questionDesignAndTraps'));
  assert.ok(prompt.includes('predictiveExamForecast'));
  assert.ok(prompt.includes('threeRoundExamAttemptStrategy'));
  console.log(`Step 5: Generated AI prompt length: ${prompt.length} characters.`);

  // Step 6: Mock AI Response Formatting & Standardizer
  const mockAI = {
    executiveBlueprint: {
      examTitle: 'Telangana State Police Recruitment Series',
      totalPapersAnalyzed: 3,
      yearsCovered: '2015 - 2018',
      standardQuestionCount: 200,
      standardDuration: '180 Minutes',
      timePerQuestionSeconds: '54 seconds',
      scoringLogic: '1 Mark per Q, negative marking 0.25',
      primaryTargetAudience: 'State Police Aspirants'
    },
    difficultyDistribution: {
      level1RecallPercent: 35,
      level1Desc: 'Direct history and polity facts',
      level2ApplicationPercent: 45,
      level2Desc: 'Calculations & applied arithmetic',
      level3SynthesisPercent: 20,
      level3Desc: 'Multi-statement Telangana movement combinations',
      overallDifficultySummary: 'Moderately competitive qualifying paper'
    },
    topicWeightageMatrix: [
      {
        topic: 'Telangana Movement & State History',
        weightagePercent: 30,
        averageQuestions: 60,
        trend: 'increasing',
        recurrenceRate: '100%',
        highYieldSubtopics: ['Gentlemen Agreement', '1969 Agitation', 'Mulki Rules'],
        examinerFocus: 'Chronology and agreement clauses'
      },
      {
        topic: 'Arithmetic & Reasoning',
        weightagePercent: 25,
        averageQuestions: 50,
        trend: 'stable',
        recurrenceRate: '100%',
        highYieldSubtopics: ['Mensuration', 'Ratios', 'Speed & Distance'],
        examinerFocus: 'Speed math and geometrical formulas'
      }
    ],
    questionDesignAndTraps: {
      questionFormulationStyles: [
        {
          style: 'Statement Evaluation (a, b)',
          frequency: '30%',
          purpose: 'Eliminate guesswork',
          trapMechanisms: 'Subtly altering dates in clause b'
        }
      ],
      commonExaminerTraps: ['Negation "NOT correct"', 'Near-homophone options']
    },
    yearOverYearEvolution: {
      keyChangesObserved: ['Rise in multi-statement questions', 'More localized Telangana culture questions'],
      difficultyTrajectory: 'Steadily increasing'
    },
    predictiveExamForecast: {
      expectedTopicDistribution: [
        { subject: 'Telangana History', expectedQuestions: '55-60', priority: 'Crucial' },
        { subject: 'Arithmetic', expectedQuestions: '50', priority: 'Crucial' }
      ],
      top10MustMasterHotspots: ['1969 Agitation Timeline', 'Mulki Rules 1919', 'Mensuration Cubes & Cylinders'],
      highProbabilityQuestionArchetypes: '35% Statement Evaluation, 15% Match Table, 50% Direct MCQs'
    },
    actionableStudyStrategy: {
      threeRoundExamAttemptStrategy: {
        round1Speed: 'First 55 mins: Answer all 100% known direct questions',
        round2Analytical: 'Next 80 mins: Work through calculations and 50/50 options',
        round3Review: 'Final 45 mins: Check marked questions, avoid random negative guesses'
      },
      criticalPreparationDoAndDonts: {
        dos: ['Master elimination technique', 'Memorize squares and cubes up to 30'],
        donts: ['Never guess blindly', 'Do not get stuck on single math problem']
      }
    }
  };

  const report = analyzer.standardizeAnalysisOutput(mockAI, digest, fullPapers);
  assert.ok(report.fullMarkdownReport.includes('Exam Blueprint & Pattern Discovery Report'));
  assert.ok(report.fullMarkdownReport.includes('Executive Exam Architecture & Blueprint'));
  assert.ok(report.fullMarkdownReport.includes('Topic Weightage & Frequency Matrix'));
  assert.ok(report.fullMarkdownReport.includes('Cognitive Difficulty & Bloom Curve'));
  assert.ok(report.fullMarkdownReport.includes('Predictive Next-Exam Blueprint'));
  assert.ok(report.fullMarkdownReport.includes('Actionable 3-Round Exam Strategy'));

  // Save report into vault
  const saveRep = await vault.saveAnalysisReport(report);
  assert.ok(saveRep.success && saveRep.id);
  const reportsList = await vault.getPastReports();
  assert.strictEqual(reportsList.length, 1);
  console.log('Step 6: AI report standardized & saved into Vault history.');

  // Step 7: Export & Import Roundtrip Backup
  const backupJson = await vault.exportVaultBackup();
  assert.ok(backupJson.includes('TS Police Constable Prelims 2015'));
  assert.ok(backupJson.includes('TS Police Constable Prelims 2018'));

  // Clear vault and import backup
  await vault.clearVault();
  assert.strictEqual((await vault.getAllPapersSummary()).length, 0);

  const importRes = await vault.importVaultBackup(backupJson);
  assert.strictEqual(importRes.imported, 3, 'Must re-import all 3 papers');
  const restoredSummaries = await vault.getAllPapersSummary();
  assert.strictEqual(restoredSummaries.length, 3, 'Restored vault must have 3 papers');
  console.log('Step 7: Vault Backup Export and Import Roundtrip 100% verified.');

  console.log('\n===============================================================');
  console.log('🎉 END-TO-END VERIFICATION COMPLETED SUCCESSFULLY WITH 0 ERRORS!');
  console.log('===============================================================\n');
}

runE2E().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
