/**
 * Paper Pattern Analyzer - AI-Powered Exam Design & Logic Discovery Studio
 * Performs cross-paper multi-year analysis using Gemini AI (3.6-flash / 2.5-pro)
 * to uncover blueprint logic, recurring topic weightage, question traps, and predictive exam forecasts.
 */

class PaperPatternAnalyzer {
  constructor(geminiHandler = null) {
    this.geminiHandler = geminiHandler || window.geminiHandler;
  }

  getHandler() {
    if (!this.geminiHandler && typeof window !== 'undefined') {
      this.geminiHandler = window.geminiHandler;
    }
    return this.geminiHandler;
  }

  /**
   * Compiles an intelligent, token-efficient structural digest across multiple papers
   */
  prepareCrossPaperDigest(papers) {
    if (!Array.isArray(papers) || papers.length === 0) return null;

    const paperSummaries = papers.map((p, idx) => {
      const data = p.paperData || p;
      const meta = data.metadata || data.exam_info || {};
      const title = p.title || meta.title || `Paper #${idx + 1}`;
      const year = p.year || meta.year || 'Unknown Year';
      const board = p.board || meta.board || 'State PSC / Board';
      const exam = p.exam || meta.exam || 'Competitive Exam';
      const paperType = p.paperType || meta.paperType || 'common';
      const paperCode = p.paperCode || meta.paperCode || (paperType === 'common' ? 'Paper 1' : 'Paper 2');
      const specialization = p.specialization || meta.specialization || (paperType === 'common' ? 'General Studies & Mental Ability' : '');
      const maxMarks = p.totalMarks || meta.maxMarks || 0;
      const totalQuestions = p.totalQuestions || 0;

      // Extract questions from sections or flat list
      let questionsList = [];
      if (data.sections && Array.isArray(data.sections)) {
        data.sections.forEach(s => {
          if (s.questions && Array.isArray(s.questions)) {
            questionsList.push(...s.questions);
          }
        });
      } else if (data.questions && Array.isArray(data.questions)) {
        questionsList = [...data.questions];
      }

      // Categorize question formulation archetypes
      let statementQuestions = 0;
      let matchTableQuestions = 0;
      let numericalQuestions = 0;
      let directRecallQuestions = 0;
      let bilingualQuestions = 0;
      let negativePhraseQuestions = 0;
      let totalStemCharacters = 0;
      const cognitiveDepth = { recall: 0, application: 0, analysis: 0 };
      const detectedTopics = {};
      const questionEvidence = [];

      questionsList.forEach((q, questionIndex) => {
        const text = q.questionText || '';
        const lower = text.toLowerCase();
        totalStemCharacters += text.length;

        // Archetype classification
        if (/statements?|consider the following|choose the correct/i.test(lower) || /\(a\).*\(b\)/s.test(lower)) {
          statementQuestions++;
        } else if (/match the following|list\s*[-–—:]?\s*[i1a]/i.test(lower) || /i{1,3}-|a-\w/i.test(text)) {
          matchTableQuestions++;
        } else if (/calculate|evaluate|ratio|percent|find the value|\$|\\frac|\d+\s*km|\d+\s*meters/i.test(lower)) {
          numericalQuestions++;
        } else {
          directRecallQuestions++;
        }

        // Bilingual detection (contains Telugu/Hindi unicode)
        if (/[\u0C00-\u0C7F]/.test(text)) {
          bilingualQuestions++;
        }

        if (/\b(?:not|incorrect|except|false)\b/i.test(lower)) {
          negativePhraseQuestions++;
        }

        let depth = 'recall';
        if (/consider the following|assertion|reason|match the following|which statements?|codes? given below/i.test(lower) ||
            (text.match(/\([a-d1-4]\)/gi) || []).length >= 2) {
          depth = 'analysis';
        } else if (/calculate|evaluate|find|determine|ratio|percent|if\s+.+then|based on|apply/i.test(lower) ||
                   /\d/.test(text) && /[=+\-*/%]/.test(text)) {
          depth = 'application';
        }
        cognitiveDepth[depth]++;

        // Section / Topic aggregation
        const sectionName = q.section || 'General';
        detectedTopics[sectionName] = (detectedTopics[sectionName] || 0) + 1;

        questionEvidence.push({
          questionNumber: String(q.questionNumber || questionIndex + 1),
          sourcePage: q.sourcePage || q.pageNumber || '',
          section: sectionName,
          depth,
          stem: text.substring(0, 500),
          options: (q.options || []).slice(0, 6).map(option => ({
            key: String(option.key || ''),
            text: String(option.text || '').substring(0, 180)
          }))
        });
      });

      // Sample representative questions (take first, middle, and end questions for sampling)
      const sampleStep = Math.max(1, Math.floor(questionsList.length / 15));
      const sampleQuestions = [];
      for (let i = 0; i < questionsList.length && sampleQuestions.length < 15; i += sampleStep) {
        const q = questionsList[i];
        sampleQuestions.push({
          num: q.questionNumber || (i + 1),
          section: q.section || '',
          stem: (q.questionText || '').substring(0, 200),
          optionsCount: (q.options || []).length,
          sampleOption: q.options?.[0]?.text ? q.options[0].text.substring(0, 60) : ''
        });
      }

      return {
        id: p.id,
        title,
        board,
        exam,
        paperType,
        paperCode,
        specialization,
        year,
        maxMarks,
        totalQuestions: questionsList.length || totalQuestions,
        archetypes: {
          statementQuestions,
          matchTableQuestions,
          numericalQuestions,
          directRecallQuestions,
          bilingualQuestions
        },
        structuralMetrics: {
          negativePhraseQuestions,
          averageStemCharacters: questionsList.length > 0
            ? Math.round(totalStemCharacters / questionsList.length)
            : 0,
          cognitiveDepth
        },
        topicCounts: detectedTopics,
        sampleQuestions,
        questionEvidence
      };
    });

    // Compute year range
    const validYears = paperSummaries
      .map(p => parseInt(p.year, 10))
      .filter(y => !isNaN(y))
      .sort((a, b) => a - b);
    const yearRange = validYears.length > 0
      ? (validYears[0] === validYears[validYears.length - 1] ? `${validYears[0]}` : `${validYears[0]} - ${validYears[validYears.length - 1]}`)
      : 'Multi-Year';

    // Grouping distribution
    const boards = [...new Set(paperSummaries.map(p => p.board).filter(Boolean))];
    const exams = [...new Set(paperSummaries.map(p => p.exam).filter(Boolean))];
    const specializations = [...new Set(paperSummaries.map(p => p.specialization).filter(Boolean))];
    const hasCommon = paperSummaries.some(p => p.paperType === 'common');
    const hasSpecialization = paperSummaries.some(p => p.paperType === 'specialization');

    return {
      totalPapers: papers.length,
      yearRange,
      distribution: {
        boards,
        exams,
        specializations,
        hasCommon,
        hasSpecialization
      },
      papers: paperSummaries
    };
  }

  /**
   * Builds the rigorous examination architecture prompt for Gemini AI
   */
  buildAnalysisPrompt(digest, customInstructions = '') {
    const dist = digest.distribution || {};
    const hasCommon = dist.hasCommon;
    const hasSpecialization = dist.hasSpecialization;
    const specs = (dist.specializations || []).join(', ') || 'Domain Specialization';

    let domainGuidance = '';
    if (hasCommon && hasSpecialization) {
      domainGuidance = `
IMPORTANT DUAL-PAPER EXAMINATION STRUCTURE:
This dataset contains BOTH Common General Papers (Paper 1: GS & Mental Ability) and Technical Specialization Papers (${specs}).
1. Analyze how Paper 1 (Common GS&MA) acts as the qualifying / baseline stabilizer vs how Paper 2 (${specs}) acts as the decisive rank differentiator.
2. Formulate cross-paper preparation strategies addressing the combined marks weightage.
3. Compare the examiner testing style: General breadth & speed in Paper 1 vs Deep technical formulas, IS codes, and derivations in Paper 2.`;
    } else if (hasSpecialization) {
      domainGuidance = `
IMPORTANT TECHNICAL SPECIALIZATION FOCUS:
These papers belong to Technical Specialization (${specs}).
1. Analyze examiner emphasis on: Standard Formula Calculations vs IS Code provisions vs Theoretical Definitions vs Design Criteria.
2. Identify core technical chapters that yield the highest concentration of marks.
3. Pinpoint tricky engineering distractors (unit conversion traps, sign convention errors, empirical formula limits).`;
    } else {
      domainGuidance = `
IMPORTANT COMMON GENERAL STUDIES FOCUS:
These papers belong to Common Paper 1 (General Studies & Mental Ability).
1. Analyze the evolution of questions across State History & Movement, Indian Constitution & Polity, General Science, and Arithmetic/Mental Ability.
2. Track shifts from direct single-fact memory to multi-statement elimination questions and contemporary state policy questions.`;
    }

    return `You are a World-Class Exam Board Architect, Psychometrician, and Competitive Examination Strategy Specialist.

You have been provided with structural data and representative question samples from ${digest.totalPapers} previous examination paper(s):

${JSON.stringify(digest, null, 2)}

${domainGuidance}

${customInstructions ? `USER FOCUS INSTRUCTIONS: ${customInstructions}\n` : ''}

YOUR TASK:
Perform a deep, analytical examination blueprint and pattern discovery across these question papers.
Discover HOW this examination is designed, the underlying examiner logic, cognitive difficulty traps, recurring syllabus hotspots, and a predictive blueprint for upcoming exams.

EVIDENCE RULES:
- Base every conclusion only on the supplied questionEvidence and structuralMetrics.
- Distinguish observed facts from forecasts. Never present a forecast as certain.
- Cite supporting paper title/year and question numbers for major pattern claims.
- If fewer than 3 distinct years are supplied, mark trend and recurrence conclusions as low confidence.
- Analyze all supplied questions; sampleQuestions are navigation aids only.

Return your analysis as a valid JSON object matching the following structure exactly:
{
  "executiveBlueprint": {
    "examTitle": "Overall Examination Series Title",
    "examBoard": "e.g. Telangana Board (TGPSC)",
    "examStream": "Common Paper 1 (General Studies) or Specialization Paper 2 (Technical Discipline)",
    "specializationDomain": "e.g. Civil Engineering, Mechanical Engineering, or GS&MA",
    "totalPapersAnalyzed": ${digest.totalPapers},
    "yearsCovered": "e.g. 2015 - 2024",
    "standardQuestionCount": 200,
    "standardDuration": "e.g. 3 Hours (180 minutes)",
    "timePerQuestionSeconds": "e.g. 54 seconds per question",
    "scoringLogic": "Marks per question, negative marking rules, cut-off impact",
    "primaryTargetAudience": "Exam level, intended candidate profile"
  },
  "difficultyDistribution": {
    "level1RecallPercent": 30,
    "level1Desc": "Direct factual memory, definitions, standard historical dates",
    "level2ApplicationPercent": 45,
    "level2Desc": "Multi-step reasoning, concept application, arithmetic problem solving",
    "level3SynthesisPercent": 25,
    "level3Desc": "Complex multi-statement combinations, match tables with subtle traps, assertion-reasoning",
    "overallDifficultySummary": "Comprehensive summary of paper difficulty curve and cognitive load"
  },
  "topicWeightageMatrix": [
    {
      "topic": "Topic Name (e.g. Telangana History & Statehood Movement)",
      "weightagePercent": 25,
      "averageQuestions": 50,
      "trend": "increasing" | "stable" | "decreasing",
      "recurrenceRate": "95%",
      "highYieldSubtopics": ["Subtopic A", "Subtopic B", "Subtopic C"],
      "examinerFocus": "What specific angles or concepts does the examiner target repeatedly?"
    }
  ],
  "questionDesignAndTraps": {
    "questionFormulationStyles": [
      {
        "style": "Statement-Based Evaluation (e.g. Consider statements a, b, c; choose 1&2)",
        "frequency": "High (approx 30-35% of paper)",
        "purpose": "Why the examiner uses this format (e.g. forces full syllabus coverage and eliminates pure elimination)",
        "trapMechanisms": "How incorrect options are structured to trick candidates"
      },
      {
        "style": "Match the Following Matrices (List I vs List II)",
        "frequency": "Medium-High (approx 15-20% of paper)",
        "purpose": "Tests relational knowledge across 4 different facts in 1 question",
        "trapMechanisms": "Placing similar pairs in options (e.g. a-iv, b-iii vs a-iv, b-ii)"
      }
    ],
    "commonExaminerTraps": [
      "Negative phrasing traps ('Which of the following is NOT correct')",
      "Absolute qualifiers ('Always', 'Exclusively', 'Never')",
      "Close numeric distractors in calculation questions",
      "Bilingual translation nuances (technical terms vs vernacular idioms)"
    ]
  },
  "yearOverYearEvolution": {
    "keyChangesObserved": [
      "Shift from single-liner factual questions to multi-statement analytical questions",
      "Increased emphasis on contemporary policy schemes and constitutional articles",
      "Lengthening of arithmetic stems requiring faster mental math"
    ],
    "difficultyTrajectory": "How difficulty and competition have tightened over time"
  },
  "evidenceAndConfidence": {
    "overallConfidence": "high | medium | low",
    "limitations": ["Dataset limitation or extraction caveat"],
    "keyFindings": [
      {
        "finding": "Observed design pattern",
        "confidence": "high | medium | low",
        "evidence": ["2022 Paper Q31", "2018 Paper Q44"]
      }
    ]
  },
  "predictiveExamForecast": {
    "expectedTopicDistribution": [
      { "subject": "Subject Name", "expectedQuestions": "45-50", "priority": "Crucial / High / Medium" }
    ],
    "top10MustMasterHotspots": [
      "Specific Topic 1", "Specific Topic 2", "Specific Topic 3"
    ],
    "highProbabilityQuestionArchetypes": "Expected split of statement questions vs direct MCQs"
  },
  "actionableStudyStrategy": {
    "threeRoundExamAttemptStrategy": {
      "round1Speed": "First 60 mins: Rapid solve of 100% certain direct recall questions",
      "round2Analytical": "Next 75 mins: Statement-based & calculation problems with scratchpad",
      "round3Review": "Final 45 mins: Difficult match tables, verification, and bubble filling"
    },
    "criticalPreparationDoAndDonts": {
      "dos": ["Focus on statement elimination technique", "Prioritize high-yield historical timelines", "Practice 54-second per question pacing"],
      "donts": ["Do not spend >90 seconds on any single calculation problem", "Avoid skipping bilingual reading when options are ambiguous"]
    }
  }
}

Return ONLY valid JSON matching this schema. Be thorough, actionable, and mathematically grounded in the provided papers.`;
  }

  /**
   * Executes the AI pattern analysis across selected papers
   */
  async analyzeExamPatterns(papers, options = {}, onProgress = null) {
    const handler = this.getHandler();
    if (!handler) {
      throw new Error('Gemini AI engine is not initialized. Please configure API keys.');
    }
    if (!handler.hasAnyKey()) {
      throw new Error('No active Gemini API keys found. Please open API Key Settings and add a key.');
    }

    const progressCallback = onProgress || options.onProgress;
    const progress = (msg, pct) => {
      if (typeof progressCallback === 'function') progressCallback(msg, pct);
    };

    progress('Compiling multi-year question paper digest...', 15);
    const digest = this.prepareCrossPaperDigest(papers);
    if (!digest) {
      throw new Error('Could not compile question paper digest. Please ensure at least one paper is selected.');
    }

    progress(`Analyzing ${digest.totalPapers} question papers with Gemini AI...`, 35);
    const promptText = this.buildAnalysisPrompt(digest, options.customInstructions || '');

    // Select analysis model (gemini-2.5-flash recommended; option to use gemini-2.5-pro for deep reasoning)
    const model = options.model || handler.getModelName() || 'gemini-2.5-flash';
    progress(`Discovering exam design logic & patterns with ${model}...`, 50);

    if (typeof handler.generateStructuredJSON !== 'function') {
      throw new Error('The installed Gemini handler does not support structured pattern analysis. Reload the latest application build.');
    }

    const aiResponse = await handler.generateStructuredJSON(
      promptText,
      { model, temperature: 0.1, maxOutputTokens: 65536, timeoutMs: 180000 },
      (msg, p) => progress(msg, Math.min(92, p || 50))
    );

    progress('Synthesizing exam blueprint & predictive report...', 95);

    // Standardize result
    const standardized = this.standardizeAnalysisOutput(aiResponse.data, digest, papers);
    standardized.modelUsed = aiResponse.modelUsed;
    standardized.analysisVersion = 2;

    // Save report to PaperVault if available
    if (typeof window !== 'undefined' && window.paperVault) {
      try {
        const saved = await window.paperVault.saveAnalysisReport(standardized);
        standardized.storageId = saved.id;
      } catch (e) {
        console.warn('Could not auto-save analysis report:', e);
      }
    }

    progress('Analysis complete!', 100);
    return standardized;
  }

  /**
   * Standardizes the Gemini analysis response into structured data and formatted Markdown
   */
  standardizeAnalysisOutput(rawAIOutput, digest, originalPapers) {
    let data = rawAIOutput;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        const cleaned = data.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        data = JSON.parse(cleaned);
      }
    }

    const titles = originalPapers.map(p => p.title || 'Paper');
    const ids = originalPapers.map(p => p.id);

    // Ensure fallback to digest distribution if AI omitted any fields
    const bp = data.executiveBlueprint || {};
    const dist = digest.distribution || {};
    if (!bp.examBoard && dist.boards?.length) bp.examBoard = dist.boards.join(', ');
    if (!bp.examTitle && dist.exams?.length) bp.examTitle = dist.exams.join(', ');
    if (!bp.specializationDomain && dist.specializations?.length) bp.specializationDomain = dist.specializations.join(', ');
    if (!bp.examStream) {
      if (dist.hasCommon && dist.hasSpecialization) bp.examStream = 'Composite (Common Paper 1 & Specialization Paper 2)';
      else if (dist.hasSpecialization) bp.examStream = `Specialization Paper (${dist.specializations?.[0] || 'Technical'})`;
      else bp.examStream = 'Common Paper 1 (General Studies & Mental Ability)';
    }

    const result = {
      id: `analysis_${Date.now()}`,
      timestamp: Date.now(),
      title: bp.examTitle || data.executiveBlueprint?.examTitle || `${titles.join(' & ')} Pattern Analysis`,
      paperIds: ids,
      paperTitles: titles,
      totalPapers: originalPapers.length,
      totalPapersAnalyzed: originalPapers.length,
      yearsCovered: digest.yearRange,
      sourceSummary: {
        yearRange: digest.yearRange,
        distribution: digest.distribution,
        papers: digest.papers.map(paper => ({
          id: paper.id,
          title: paper.title,
          year: paper.year,
          totalQuestions: paper.totalQuestions,
          archetypes: paper.archetypes,
          structuralMetrics: paper.structuralMetrics,
          topicCounts: paper.topicCounts
        }))
      },
      executiveBlueprint: bp,
      difficultyDistribution: data.difficultyDistribution || {},
      topicWeightageMatrix: data.topicWeightageMatrix || [],
      questionDesignAndTraps: data.questionDesignAndTraps || {},
      yearOverYearEvolution: data.yearOverYearEvolution || {},
      evidenceAndConfidence: data.evidenceAndConfidence || {},
      predictiveExamForecast: data.predictiveExamForecast || {},
      actionableStudyStrategy: data.actionableStudyStrategy || {},
      raw: data
    };

    // Generate formatted Markdown report for instant export
    result.markdownReport = this.generateMarkdownReport(result);
    result.fullMarkdownReport = result.markdownReport;
    return result;
  }

  /**
   * Generates a publishable, publication-quality Markdown report
   */
  generateMarkdownReport(report) {
    const bp = report.executiveBlueprint || {};
    const diff = report.difficultyDistribution || {};
    const topics = report.topicWeightageMatrix || [];
    const traps = report.questionDesignAndTraps || {};
    const evo = report.yearOverYearEvolution || {};
    const confidence = report.evidenceAndConfidence || {};
    const forecast = report.predictiveExamForecast || {};
    const strategy = report.actionableStudyStrategy || {};

    let md = `# 🎓 Exam Blueprint & Pattern Discovery Report
**Exam:** ${report.title}
**Board / Commission:** ${bp.examBoard || 'State PSC'}
**Exam Stream:** ${bp.examStream || 'Competitive Examination'}
**Specialization:** ${bp.specializationDomain || 'General Studies / Technical'}
**Date of Analysis:** ${new Date(report.timestamp).toLocaleDateString()}
**Papers Analyzed (${report.totalPapers}):** ${report.paperTitles.join(', ')}

---

## 1. 🏛️ Executive Exam Architecture & Blueprint

| Metric | Specification |
|---|---|
| **Board / Authority** | ${bp.examBoard || 'State PSC'} |
| **Exam Stream / Paper** | ${bp.examStream || 'Common Paper 1 / Technical Specialization'} |
| **Domain / Branch** | ${bp.specializationDomain || 'All Branches'} |
| **Standard Duration** | ${bp.standardDuration || '3 Hours (180 mins)'} |
| **Total Questions** | ${bp.standardQuestionCount || 200} Questions |
| **Available Time Per Question** | ${bp.timePerQuestionSeconds || '~54 seconds'} |
| **Scoring & Marking Logic** | ${bp.scoringLogic || '1 mark per question, standard negative marking'} |
| **Intended Candidate Level** | ${bp.primaryTargetAudience || 'Competitive State Level Recruitment'} |

---

## 2. ⚖️ Cognitive Difficulty & Bloom Curve

- **Level 1: Direct Memory & Factual Recall:** **${diff.level1RecallPercent || 30}%**
  * *${diff.level1Desc || 'Direct single-fact questions, historical dates, definitions'}*
- **Level 2: Conceptual Understanding & Application:** **${diff.level2ApplicationPercent || 45}%**
  * *${diff.level2Desc || 'Multi-step arithmetic, applied constitution & polity principles, geography maps'}*
- **Level 3: Complex Synthesis & Analytical Traps:** **${diff.level3SynthesisPercent || 25}%**
  * *${diff.level3Desc || 'Multi-statement evaluation matrices, close distractors, advanced reasoning'}*

> **Examiner Difficulty Philosophy:**
> ${diff.overallDifficultySummary || 'The exam balances approachable qualifying marks with high-cognitive filter questions designed to reward conceptual depth over superficial rote learning.'}

---

## 3. 📊 Topic Weightage & Frequency Matrix

| Topic / Domain | Weightage (%) | Avg. Questions | Recurrence Rate | Trend | High-Yield Hotspots |
|---|---|---|---|---|---|
${topics.map(t => `| **${t.topic}** | **${t.weightagePercent}%** | ~${t.averageQuestions} Qs | ${t.recurrenceRate || '90%+'} | \`${t.trend || 'Stable'}\` | ${t.highYieldSubtopics ? t.highYieldSubtopics.join(', ') : 'Core syllabus'} |`).join('\n')}

---

## 4. 🧠 Question Formulation Logic & Examiner Traps

### Primary Question Styles
${(traps.questionFormulationStyles || []).map(s => `
#### 🔹 ${s.style}
- **Frequency:** ${s.frequency}
- **Why Examiners Use It:** ${s.purpose}
- **Trap Mechanism:** ${s.trapMechanisms}
`).join('\n')}

### Common Distractor Traps to Avoid
${(traps.commonExaminerTraps || []).map(t => `- ⚠️ **${t}**`).join('\n')}

---

## 5. 📈 Year-Over-Year Evolution Trends
${(evo.keyChangesObserved || []).map(c => `- 🔄 ${c}`).join('\n')}

*Trajectory:* ${evo.difficultyTrajectory || 'Rising analytical standards requiring strong speed and conceptual clarity.'}

---

## 6. 🔮 Predictive Next-Exam Blueprint & Forecast

### Expected Subject Breakdown
| Subject / Area | Expected Questions | Priority Level |
|---|---|---|
${(forecast.expectedTopicDistribution || []).map(f => `| **${f.subject}** | ${f.expectedQuestions} Qs | \`${f.priority}\` |`).join('\n')}

### 🎯 Top 10 Must-Master High-Yield Hotspots
${(forecast.top10MustMasterHotspots || []).map((h, i) => `${i + 1}. **${h}**`).join('\n')}

---

## 7. ⏱️ Actionable 3-Round Exam Strategy

1. **Round 1 (Minutes 0 - 60):** ${strategy.threeRoundExamAttemptStrategy?.round1Speed || 'Solve 100% certain factual recall questions immediately.'}
2. **Round 2 (Minutes 60 - 135):** ${strategy.threeRoundExamAttemptStrategy?.round2Analytical || 'Solve multi-statement and standard math questions with scratchpad.'}
3. **Round 3 (Minutes 135 - 180):** ${strategy.threeRoundExamAttemptStrategy?.round3Review || 'Tackle complex match tables, verify calculations, and complete OMR.'}

### Critical Candidate Do's & Don'ts
- **DO:** ${(strategy.criticalPreparationDoAndDonts?.dos || []).join(', ')}
- **DON'T:** ${(strategy.criticalPreparationDoAndDonts?.donts || []).join(', ')}

---

## 8. Evidence & Confidence

**Overall confidence:** ${confidence.overallConfidence || 'Not stated'}

${(confidence.keyFindings || []).map(item => `- **${item.finding}** (${item.confidence || 'unspecified'} confidence) — Evidence: ${(item.evidence || []).join(', ') || 'Not supplied'}`).join('\n')}

${(confidence.limitations || []).length ? `**Limitations:**\n${confidence.limitations.map(item => `- ${item}`).join('\n')}` : ''}

---
*Generated by PaperExtract Studio & Gemini AI Intelligence Engine*
`;
    return md;
  }
}

// Attach globally
if (typeof window !== 'undefined') {
  window.PaperPatternAnalyzer = PaperPatternAnalyzer;
  window.paperAnalyzer = new PaperPatternAnalyzer();
  window.paperPatternAnalyzer = window.paperAnalyzer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PaperPatternAnalyzer };
}
