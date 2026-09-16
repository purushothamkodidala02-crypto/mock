/**
 * Question Paper Extractor - NLP & Rule-Based Heuristic Extraction Engine
 * Zero API - 100% Client-Side
 */

class QuestionPaperExtractor {
  constructor() {
    this.debug = false;
  }

  /**
   * Main entry point: Parses raw text into a structured Question Paper Object
   * @param {string} rawText 
   * @param {Object} options (optional { images: Array })
   * @returns {Object} Structured Exam Data
   */
  extract(rawText, options = {}) {
    if (!rawText || typeof rawText !== 'string') {
      return this.createEmptyResult();
    }

    const availableImages = options.images || [];

    // 1. Normalize text line endings and basic whitespace
    const cleanText = this.normalizeText(rawText);
    const rawLines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 2. Extract Exam Header & Metadata
    const { metadata, contentStartIndex } = this.extractMetadata(rawLines);

    // 3. Check for and extract tabular Answer Key at end of paper
    const initialContentLines = rawLines.slice(contentStartIndex);
    const { answerKeyMap, remainingLines, found: answerKeyFound } = this.extractAnswerKeyTable(initialContentLines, metadata);

    // 4. Extract Sections & Segment Content
    const sections = this.segmentSections(remainingLines);

    // 5. Parse Questions within each Section
    let globalQuestionIndex = 1;
    let totalCalculatedMarks = 0;

    sections.forEach(section => {
      const parsedQuestions = this.parseQuestionsFromLines(section.rawLines, globalQuestionIndex);
      section.questions = parsedQuestions;
      globalQuestionIndex += parsedQuestions.length;

      // Calculate section total marks
      section.totalMarks = parsedQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
      totalCalculatedMarks += section.totalMarks;
      delete section.rawLines; // clean up internal field
    });

    // If no sections were explicitly created, ensure default section exists
    if (sections.length === 0) {
      const defaultQuestions = this.parseQuestionsFromLines(remainingLines, 1);
      const totalMarks = defaultQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
      sections.push({
        id: 'sec_1',
        title: 'General Section',
        description: 'All Questions',
        questions: defaultQuestions,
        totalMarks: totalMarks
      });
      totalCalculatedMarks = totalMarks;
    }

    // Flatten all questions for quick queries
    const allQuestions = sections.flatMap(sec => sec.questions);

    // 6. Map official answer keys from Answer Key Table to questions if available
    if (answerKeyFound && Object.keys(answerKeyMap).length > 0) {
      allQuestions.forEach(q => {
        const qNum = String(q.questionNumber).trim();
        if (answerKeyMap[qNum]) {
          q.correctAnswer = answerKeyMap[qNum];
        }
      });
    }

    // 7. Attach extracted images to questions with smart multi-tier mapping
    if (availableImages.length > 0) {
      const assignedImageIndices = new Set();

      // Tier 1: Exact Question Number Match (e.g. from sample or tag)
      allQuestions.forEach(q => {
        if (q.image) return;
        const qNumStr = String(q.questionNumber).trim();
        const imgMatchIdx = availableImages.findIndex((img, idx) => 
          !assignedImageIndices.has(idx) && 
          (String(img.qNum || img.targetQuestionNumber || '').trim() === qNumStr)
        );
        if (imgMatchIdx !== -1) {
          q.image = availableImages[imgMatchIdx].dataUrl || availableImages[imgMatchIdx];
          assignedImageIndices.add(imgMatchIdx);
        }
      });

      // Tier 2: Heuristic Visual Keyword Match (English + Regional)
      const visualKeywords = [
        'visual / diagram', 'figure', 'diagram', 'triangles', 'grid', 'table', 'venn',
        'shown below', 'following figure', 'given below', 'in the given image',
        'question mark (?)', 'values of p', 'values of p, q', 'p, q',
        'క్రింది పటంలో', 'పటం', 'చిత్రం', 'త్రిభుజం', 'ఆకృతి', 'వెన్ చిత్రం', 'గడి', 'చిత్రంలో',
        'रेखाचित्र', 'आकृति', 'चित्र'
      ];

      allQuestions.forEach(q => {
        if (q.image) return;
        const lowerText = (q.questionText || '').toLowerCase();
        const isVisual = visualKeywords.some(kw => lowerText.includes(kw)) ||
                         (lowerText.includes('?') && (lowerText.includes('find') || lowerText.includes('below') || lowerText.includes('values')));

        if (isVisual) {
          const nextImgIdx = availableImages.findIndex((_, idx) => !assignedImageIndices.has(idx));
          if (nextImgIdx !== -1) {
            q.image = availableImages[nextImgIdx].dataUrl || availableImages[nextImgIdx];
            assignedImageIndices.add(nextImgIdx);
          }
        }
      });

      // Tier 3: Auto-assign images to empty/text-less questions (image-only questions from PDF)
      // When a question has empty questionText AND no MCQ options, the question content
      // is almost certainly embedded as a raster image in the PDF (not in the text layer).
      allQuestions.forEach(q => {
        if (q.image) return;
        const hasContent = (q.questionText || '').trim().length > 0 ||
                           (q.options && q.options.length > 0);
        if (!hasContent) {
          const nextImgIdx = availableImages.findIndex((_, idx) => !assignedImageIndices.has(idx));
          if (nextImgIdx !== -1) {
            q.image = availableImages[nextImgIdx].dataUrl || availableImages[nextImgIdx];
            q.isImageOnly = true;
            assignedImageIndices.add(nextImgIdx);
          }
        }
      });
    }

    // 8. Statistics
    const stats = this.computeStatistics(allQuestions, totalCalculatedMarks, metadata.maxMarks);

    return {
      success: true,
      metadata: metadata,
      sections: sections,
      questions: allQuestions,
      stats: stats,
      answerKeyFound: answerKeyFound,
      rawText: rawText
    };
  }

  /**
   * Cleans and normalizes unicode characters, bullets, and line endings
   */
  normalizeText(text) {
    let normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u2018\u2019]/g, "'") // smart single quotes
      .replace(/[\u201C\u201D]/g, '"') // smart double quotes
      .replace(/[\u2013\u2014]/g, '-') // en-dash, em-dash
      .replace(/[\u00A0\u2000-\u200B]/g, ' ') // non-breaking spaces
      .replace(/[\uFFFD\uE000-\uF8FF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // remove replacement chars, custom font PUA glyphs and control codes
      .replace(/[•●▪◆]/g, '• ') // bullet normalization
      .replace(/\t/g, '    ');

    // Fix spaced out characters: "t h e" -> "the", "s o c i e t y" -> "society", "p e o p l e" -> "people"
    normalized = normalized.replace(/\b([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\b/g, '$1$2$3$4$5');
    normalized = normalized.replace(/\b([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\b/g, '$1$2$3$4');
    normalized = normalized.replace(/\b([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\b/g, '$1$2$3');

    // Multi-column bleed protection: Split embedded question numbers onto new lines (only 2-3 digit questions e.g. 10-500, never single digit math values like "is 5. Then" or years like 1986)
    normalized = normalized.replace(/([^\n])\s+(\b(?:[1-9]\d{1,2})\.\s+[A-Za-z\u0C00-\u0C7F\u0900-\u097F])/g, '$1\n$2');

    // Standardize parenthesized option markers with trailing punctuation e.g. "(4), " or "(2). " -> "(4) ", "(2) "
    normalized = normalized.replace(/\(\s*([1-4a-dA-D])\s*\)[\.,;:—\-]?\s+/g, '($1) ');

    // Split embedded question prompts and options onto new lines, but protect question numbering prefixes like "200. Match the following"
    normalized = normalized.replace(/([^\n])\s+(\(\s*[1-4a-dA-D]\s*\)\s*)/g, '$1\n$2');
    normalized = normalized.replace(/([^\n\d\.\)])\s+(\b(?:Select from the|Choose the right|Which of the following|Match the following|Fill in the blanks?)\b)/gi, '$1\n$2');

    return normalized;
  }

  /**
   * Extracts Header information (Title, Subject, Class, Max Marks, Time, Booklet Series, Instructions)
   */
  extractMetadata(lines) {
    const metadata = {
      title: '',
      subject: '',
      grade: '',
      duration: '',
      maxMarks: null,
      institution: '',
      date: '',
      bookletSeries: '',
      instructions: []
    };

    let contentStartIndex = 0;
    const headerLines = [];
    const maxHeaderScan = Math.min(lines.length, 35);
    let inInstructions = false;

    for (let i = 0; i < maxHeaderScan; i++) {
      const line = lines[i];

      // Stop scanning header if we hit the first section or first question
      if (this.isSectionHeader(line) || this.isQuestionStart(line)) {
        contentStartIndex = i;
        break;
      }

      // Check for Instructions Block
      if (/^(general\s+instructions?|instructions?|notes?|directions?):?/i.test(line)) {
        inInstructions = true;
        continue;
      }

      if (inInstructions) {
        if (/^(\d+\.|\(?[a-z]\)|•|-)\s+/i.test(line)) {
          metadata.instructions.push(line.replace(/^(\d+\.|\(?[a-z]\)|•|-)\s+/i, '').trim());
          continue;
        } else if (line.length > 5 && !line.includes(':')) {
          metadata.instructions.push(line);
          continue;
        }
      }

      // Booklet Series
      const seriesMatch = line.match(/(?:booklet\s*series|series|set)\s*[:=-]?\s*([a-d1-4])/i);
      if (seriesMatch && !metadata.bookletSeries) {
        metadata.bookletSeries = seriesMatch[1].toUpperCase();
      }

      // Max Marks / Full Marks / Total Marks
      const marksMatch = line.match(/(?:max(?:imum)?\.?\s*marks?|total\s*marks?|full\s*marks?|m\.m\.)\s*[:=-]?\s*(\d+)/i) ||
                         line.match(/marks\s*:\s*(\d+)/i);
      if (marksMatch && !metadata.maxMarks) {
        metadata.maxMarks = parseInt(marksMatch[1], 10);
      }

      // Time / Duration
      const timeMatch = line.match(/(?:time\s*(?:allowed|duration)?|duration)\s*[:=-]?\s*(\d+(?:\.\d+)?\s*(?:hrs?|hours?|mins?|minutes?)|(?:\d+\s*hours?\s*\d+\s*mins?))/i);
      if (timeMatch && !metadata.duration) {
        metadata.duration = timeMatch[1];
      }

      // Subject
      const subjMatch = line.match(/(?:subject|course|paper)\s*(?:name)?\s*[:=-]?\s*([a-zA-Z0-9\s,&()/-]+)/i);
      if (subjMatch && !metadata.subject) {
        metadata.subject = subjMatch[1].trim();
      }

      // Class / Grade
      const classMatch = line.match(/(?:class|grade|standard|std\.?|semester|sem\.?)\s*[:=-]?\s*([a-zA-Z0-9\sIVXLCDM-]+)/i);
      if (classMatch && !metadata.grade) {
        metadata.grade = classMatch[1].trim();
      }

      // Date
      const dateMatch = line.match(/(?:date|dated)\s*[:=-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i);
      if (dateMatch && !metadata.date) {
        metadata.date = dateMatch[1].trim();
      }

      // Institution / Board / University (typically in top 4 lines)
      if (i < 4 && !metadata.institution && !line.includes(':') && line.length > 4) {
        if (/school|college|university|institute|academy|board|cbse|icse|state\s*board|department|recruitment/i.test(line)) {
          metadata.institution = line.trim();
        }
      }

      // Examination Title fallback
      if (i < 5 && !metadata.title && !line.includes(':')) {
        if (/exam|test|assessment|mid[- ]?term|final|annual|pre-board|semester|quiz|preliminary|paper/i.test(line)) {
          metadata.title = line.trim();
        }
      }

      // CBT Response Sheet Specific Metadata
      const qpNameMatch = line.match(/^question\s*paper\s*name\s*[:=-]\s*(.+)$/i);
      if (qpNameMatch && !metadata.title) {
        metadata.title = qpNameMatch[1].trim();
      }

      const subjNameMatch = line.match(/^subject\s*name\s*[:=-]\s*(.+)$/i);
      if (subjNameMatch && !metadata.subject) {
        metadata.subject = subjNameMatch[1].trim();
      }

      const totalMarksMatch = line.match(/^(?:total\s*marks|display\s*marks)\s*[:=-]\s*(\d+)/i);
      if (totalMarksMatch && !metadata.maxMarks) {
        metadata.maxMarks = parseInt(totalMarksMatch[1], 10);
      }

      const cbtDurationMatch = line.match(/^duration\s*[:=-]\s*(\d+)/i);
      if (cbtDurationMatch && !metadata.duration) {
        metadata.duration = `${cbtDurationMatch[1]} Minutes`;
      }

      headerLines.push(line);
      contentStartIndex = i + 1;
    }

    // Fill defaults if not found
    if (!metadata.title && headerLines.length > 0) {
      metadata.title = headerLines[0].replace(/^[#\s=*-]+|[#\s=*-]+$/g, '');
    }
    if (!metadata.subject) {
      const commonSubjects = ['Mathematics', 'Maths', 'Physics', 'Chemistry', 'Biology', 'Science', 'English', 'Social Science', 'Social Studies', 'Social Telugu', 'History', 'Geography', 'Computer Science', 'Economics', 'Accountancy', 'Business Studies', 'Hindi', 'General Studies', 'Arithmetic & Reasoning'];
      for (const hLine of headerLines) {
        for (const subj of commonSubjects) {
          if (new RegExp(`\\b${subj}\\b`, 'i').test(hLine)) {
            metadata.subject = subj;
            break;
          }
        }
        if (metadata.subject) break;
      }
    }

    return { metadata, contentStartIndex };
  }

  /**
   * Determines if a line is a section header
   */
  isSectionHeader(line) {
    const trimmed = line.trim();
    return /^(?:section|part|group|unit|module)\s*[-:–]?\s*([a-z0-9ivx]+)(?:\s*[:–-].*)?$/i.test(trimmed) ||
           /^\[\s*(?:section|part|group)\s*[-:–]?\s*([a-z0-9ivx]+)\s*\]$/i.test(trimmed) ||
           /^(?:section|part)\s+[a-z0-9ivx]+(?:\s*\(.*\))?$/i.test(trimmed);
  }

  /**
   * Partitions lines into Section objects
   */
  segmentSections(lines) {
    const sections = [];
    let currentSection = null;
    let secCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (this.isSectionHeader(line)) {
        if (currentSection) {
          sections.push(currentSection);
        }

        const secNameMatch = line.match(/(?:section|part|group|unit|module)\s*[-:–]?\s*([a-z0-9ivx]+)(.*)/i);
        const secTag = secNameMatch ? secNameMatch[1].toUpperCase() : `${secCounter}`;
        const secDesc = secNameMatch && secNameMatch[2] ? secNameMatch[2].replace(/^[\s:–-]+/, '').trim() : '';

        currentSection = {
          id: `sec_${secCounter++}`,
          title: `Section ${secTag}`,
          description: secDesc,
          rawLines: []
        };
      } else {
        if (!currentSection) {
          currentSection = {
            id: `sec_${secCounter++}`,
            title: 'Section A',
            description: 'General Questions',
            rawLines: []
          };
        }
        currentSection.rawLines.push(line);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Determines if a line is an MCQ Option line or Choice Marker
   */
  isOptionLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Never consider matching table rows as options e.g. "(a) H.M. Patel (i) Finance Minister"
    if (/^\s*(?:\([a-e]\)|[a-e][\.\)])\s+.*?(?:\([ivxlcdm]+\)|[ivxlcdm]+[\.\)])/i.test(trimmed)) return false;

    // CBT Option Header
    if (/^options\s*:\s*$/i.test(trimmed)) return true;

    // Answer key lines
    if (/^(?:ans(?:wer)?|key|correct\s*option)\s*[:=-]/i.test(trimmed)) return true;

    // Parenthesized or bracketed options: (1), (2), (3), (4) or (A), (B), (C), (D) or [1], [A]
    if (/^\s*(?:\([a-e1-4]\)|\[[a-e1-4]\]|[a-e1-4]\))\s+/i.test(trimmed)) return true;

    // Multiple parenthesized options on single line: (1) ... (2) ... or (A) ... (B) ...
    if (/\(([a-e1-4])\)\s+.*?\s+\(([a-e1-4])\)/i.test(trimmed)) return true;

    // Single option prefix like A. Delhi, B. Mumbai (short option lines)
    if (/^\s*[a-e]\.\s+\S+/i.test(trimmed) && trimmed.length < 120 && !/^\s*[a-e]\.\s+(?:they|in|a|the|we|one|when|if|due|he|she)\b/i.test(trimmed)) return true;

    // Numbered option without period e.g. "1 are", "2 is"
    if (/^\s*[1-4]\s+[A-Za-z0-9]/i.test(trimmed) && trimmed.length < 80) return true;

    return false;
  }

  /**
   * Determines if a line is a Sub-Item, Matching Item, or Question Body Assertion/Reason
   */
  isSubItemLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Matching table row: e.g. "(a) H.M. Patel (i) Finance Minister" or "a) Minister i) Role"
    if (/^\s*(?:\([a-e]\)|[a-e][\.\)])\s+.*?(?:\([ivxlcdm]+\)|[ivxlcdm]+[\.\)])/i.test(trimmed)) return true;

    // Long statement line starting with letter: a) ... or (a) ...
    if (/^\s*(?:\([a-e]\)|[a-e]\))\s+[A-Za-z\u0C00-\u0C7F\u0900-\u097F]/u.test(trimmed) && !/^\s*(?:\([1-4]\)|[1-4]\))/i.test(trimmed)) {
      if (trimmed.length > 25) return true;
    }

    // Roman numeral sub-items in parentheses e.g. (i), (ii), (iii), (iv), (v)
    if (/^\s*\([ivxlcdm]+\)\s+/i.test(trimmed)) return true;

    // Assertion / Reason / Statement / List headers inside question
    if (/^\s*(?:assertion\s*\(?[a-z]?\)?|reason\s*\(?[a-z]?\)?|statement\s*(?:[ivxlcdm]+|\d+|[a-z])|list\s*[-–ivxlcdm\d]+)\s*:/i.test(trimmed)) return true;

    // Telugu / Hindi statement headers e.g. క్రింది వ్యాఖ్యలు, సరియైన వ్యాఖ్యలు
    if (/^\s*(?:క్రింది\s*వ్యాఖ్యలు|సరియైన\s*వ్యాఖ్యలు|సరియైన\s*సమాధానము|కింది\s*వాటిని|మంత్రి|కేంద్ర\s*ప్రభుత్వము)/u.test(trimmed)) return true;

    // Rearrangement statement lines e.g. "A. They are broken into...", "B. A painter once..."
    if (/^\s*[A-E]\.\s+(?:they|a|one|in|we|he|she|when|if|due|for|it|children|the)\b/i.test(trimmed)) return true;

    return false;
  }

  /**
   * Check if a line represents the beginning of a question
   */
  isQuestionStart(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Reject if it is an option line, sub-item line, or section header
    if (this.isOptionLine(trimmed)) return false;
    if (this.isSubItemLine(trimmed)) return false;
    if (this.isSectionHeader(trimmed)) return false;

    // Reject sub-statement lines like a) ... b) ... (a) ... (i) ...
    if (/^\s*(?:\([a-z0-9ivxlcdm]+\)|\[[a-z0-9ivxlcdm]+\]|[a-z]\))\s+/i.test(trimmed)) return false;

    // 1. Explicit Question Headers (e.g. Question Number : 148, Question 1:, Q1., Q.1, Q 1 -)
    if (/^(?:question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*(\d+|[a-z]|[ivxlcdm]+)|q(?:no\.?|\.?\s*no\.?)?\s*(\d+|[a-z]|[ivxlcdm]+)\s*[:.\)-]|q\s*(\d+)\b\s*[:.\)-]?)/i.test(trimmed)) {
      return true;
    }

    // 2. Standard Numbered Questions (e.g. 1. , 2) , 200. followed by question text or alone on line)
    // Constrain to numbers 1..600 to prevent years like 1886. or 2015. from triggering questions
    const numMatch = trimmed.match(/^(\d+)[\.\)](?:\s+|$)/u);
    if (numMatch) {
      const qVal = parseInt(numMatch[1], 10);
      if (qVal >= 1 && qVal <= 600) {
        return true;
      }
    }

    // 3. Uppercase Roman Numeral Top-Level Questions (e.g. I. Answer all..., II. Solve...)
    if (/^(?:[IVXLCDM]+)[\.\)]\s+[A-Za-z\u0C00-\u0C7F\u0900-\u097F]{3,}/u.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Extracts the explicit question number from the line prefix
   */
  extractQuestionNumber(line) {
    const trimmed = line.trim();

    // 1. Explicit question patterns (e.g. Question Number : 148, Question 1:, Q1., Q.1)
    const explicitMatch = trimmed.match(/^(?:question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*(\d+|[a-z]|[ivxlcdm]+)|q(?:no\.?|\.?\s*no\.?)?\s*(\d+|[a-z]|[ivxlcdm]+)|q\s*(\d+)\b)/i);
    if (explicitMatch) {
      return (explicitMatch[1] || explicitMatch[2] || explicitMatch[3] || '').trim();
    }

    // 2. Standard numbered (e.g. 1. , 2) , 200.) - supports standalone "200."
    const numMatch = trimmed.match(/^(\d+)[\.\)](?:\s+|$)/);
    if (numMatch) {
      const val = parseInt(numMatch[1], 10);
      if (val >= 1 && val <= 600) {
        return numMatch[1];
      }
    }

    // 3. Roman numeral (e.g. I. , II.)
    const romanMatch = trimmed.match(/^([IVXLCDM]+)[\.\)](?:\s+|$)/i);
    if (romanMatch) {
      return romanMatch[1];
    }

    return '';
  }

  /**
   * Parses questions from a list of raw text lines
   */
  parseQuestionsFromLines(lines, startingIndex = 1) {
    const questions = [];
    let currentQuestion = null;
    let questionNumber = startingIndex;

    const finalizeQuestion = (q) => {
      if (!q) return;
      this.enrichQuestion(q);
      questions.push(q);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for choice divider ("OR" / "[OR]")
      if (/^(?:or|\[or\]|\(or\)|---+or---+)$/i.test(line.trim())) {
        if (currentQuestion) {
          currentQuestion.hasOrChoice = true;
          currentQuestion.rawTextLines.push('--- [OR] ---');
        }
        continue;
      }

      if (this.isQuestionStart(line)) {
        finalizeQuestion(currentQuestion);

        const extractedNum = this.extractQuestionNumber(line);
        currentQuestion = {
          id: `q_${questionNumber++}`,
          questionNumber: extractedNum || `${questionNumber - 1}`,
          rawTextLines: [line],
          marks: null,
          type: 'short_answer',
          questionText: '',
          options: [],
          correctAnswer: '',
          explanation: '',
          subQuestions: [],
          hasOrChoice: false,
          mathFormulas: []
        };
      } else {
        if (currentQuestion) {
          currentQuestion.rawTextLines.push(line);
        } else {
          // Fallback if no question start was detected yet but sentence ends with '?'
          if (line.length > 15 && /[?]$/.test(line.trim())) {
            currentQuestion = {
              id: `q_${questionNumber++}`,
              questionNumber: `${questionNumber - 1}`,
              rawTextLines: [line],
              marks: null,
              type: 'short_answer',
              questionText: '',
              options: [],
              correctAnswer: '',
              explanation: '',
              subQuestions: [],
              hasOrChoice: false,
              mathFormulas: []
            };
          }
        }
      }
    }

    finalizeQuestion(currentQuestion);
    return questions;
  }

  /**
   * Enriches a question by parsing marks, MCQ choices, sub-questions, question type, and math
   */
  enrichQuestion(q) {
    const fullRawText = q.rawTextLines.join('\n');

    // 1. Extract Marks
    q.marks = this.extractMarks(fullRawText);

    // 2. Extract MCQ Options if present
    const { cleanedText, options, correctAnswer } = this.extractOptions(fullRawText);
    q.options = options;
    if (correctAnswer) q.correctAnswer = correctAnswer;

    // 3. Extract Sub-Questions (only for descriptive questions without options)
    if (q.options && q.options.length > 0) {
      q.subQuestions = [];
      q.questionText = this.cleanQuestionText(cleanedText);
    } else {
      const { textWithoutSubQuestions, subQuestions } = this.extractSubQuestions(cleanedText);
      q.subQuestions = subQuestions;
      q.questionText = this.cleanQuestionText(textWithoutSubQuestions.length > 0 ? textWithoutSubQuestions : cleanedText);
    }

    // 5. Detect Math / LaTeX formulas
    q.mathFormulas = this.detectMathFormulas(q.questionText + ' ' + (q.options ? q.options.map(o => o.text).join(' ') : ''));

    // 6. Detect Question Type
    q.type = this.detectQuestionType(q);

    // 7. Check for answer key hints in text
    if (!q.correctAnswer) {
      const ansMatch = fullRawText.match(/(?:ans(?:wer)?|key|correct\s*option)\s*[:=-]?\s*\(?([a-e1-4]|true|false)\)?/i);
      if (ansMatch) {
        q.correctAnswer = ansMatch[1].toUpperCase();
      }
    }
  }

  /**
   * Extracts marks from question text
   */
  extractMarks(text) {
    const marksPatterns = [
      /correct\s*marks\s*:\s*(\d+(?:\.\d+)?)/i,
      /\[\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?|m)?\s*\]/i,
      /\(\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?|m)\s*\)/i,
      /(?:\[|\()(\d+)\s*\+\s*(\d+)(?:\s*\+\s*(\d+))?\s*=\s*(\d+)(?:\]|\))/i,
      /\b(\d+)\s*(?:marks?|mark|pts)\b/i,
      /\[\s*(\d+)\s*\]$/m
    ];

    for (const pattern of marksPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[4]) {
          return parseFloat(match[4]);
        }
        return parseFloat(match[1]);
      }
    }

    return 1;
  }

  /**
   * Extracts Multiple Choice Options (A, B, C, D / (a), (b), (c), (d) / 1, 2, 3, 4)
   */
  extractOptions(text) {
    let options = [];
    let correctAnswer = '';
    let cleanedLines = [];

    const lines = text.split('\n');
    let inOptionsBlock = false;
    let pendingPreOptionText = '';

    // Check if the entire question stem is a statement or match question
    const hasStatementOrMatchHeader = /(?:consider\s+the\s+following\s+statements?|match\s+the\s+following|క్రింది\s*(?:వ్యాఖ్యలను|వాటిని|వివరాలను)|read\s+the\s+following\s+statements?)/i.test(text);

    // Helper: Detect inline options with sequential keys (e.g. (1) opt1 (2) opt2 or (A) optA (B) optB)
    const getMultiInlineMatches = (line) => {
      const matches = [...line.matchAll(/(?:\(([a-e1-4])\)|\[([a-e1-4])\])\s+([^(]+?)(?=(?:\([a-e1-4]\)|\[[a-e1-4]\])|$)/gi)];
      if (matches.length >= 2) {
        const keys = matches.map(m => (m[1] || m[2]).toUpperCase());
        if (keys.includes('1') && keys.includes('2')) return matches;
        if (keys.includes('3') && keys.includes('4')) return matches;
        if (keys.includes('A') && keys.includes('B')) return matches;
        if (keys.includes('C') && keys.includes('D')) return matches;
      }
      return null;
    };

    // Strict single option regex: (1) Option, (A) Option, [1] Option, [A] Option, 1) Option, A. Option, A) Option
    const explicitOptionRegex = /^\s*(?:\(([a-e1-4])\)|\[([a-e1-4])\]|([a-eA-E])[\.\)]|([1-4])\))\s*(.+)$/i;
    // Dotted numeric option (1. Option)
    const cbtNumericOptionRegex = /^\s*([1-4])\.\s*(.+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Ignore CBT metadata boilerplate lines
      if (/^(?:question\s*(?:no\.?|number|id|type)|option\s*shuffling|is\s*question\s*mandatory|calculator|component\s*m|correct\s*marks|wrong\s*marks|status)\s*[:=-]/i.test(line)) {
        continue;
      }

      // Check for Chosen / Marked Option line
      const chosenMatch = line.match(/^(?:chosen\s*option|given\s*option|marked\s*option|correct\s*option|answer\s*key)\s*[:=-]?\s*\(?([1-4a-e])\)?/i);
      if (chosenMatch) {
        correctAnswer = chosenMatch[1].toUpperCase();
        continue;
      }

      // Line 0 is always part of the question prompt, never an option
      if (i === 0) {
        const strippedLine0 = line.replace(/^(?:question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*\d+|q(?:no\.?|\.?\s*no\.?)?\s*\d+|q\s*\d+|\d+)\s*[:.\)-]\s+/i, '');
        if (strippedLine0.length > 0) cleanedLines.push(strippedLine0);
        continue;
      }

      // Never treat matching table rows as options e.g. "(a) H.M. Patel (i) Finance Minister"
      if (/^\s*(?:\([a-e]\)|[a-e][\.\)])\s+.*?(?:\([ivxlcdm]+\)|[ivxlcdm]+[\.\)])/i.test(line)) {
        cleanedLines.push(line);
        pendingPreOptionText = '';
        continue;
      }

      // Transition lines between statements/tables and final choices e.g. "Choose the correct statements:"
      const isTransitionLine = /^(?:choose\s+the\s+correct|select\s+the\s+correct|which\s+of\s+the\s+(?:following|above)\s+statements?|the\s+correct\s+(?:answer|code|option)\s+is|options\s*:|codes?\s*:|సరియైన\s*(?:వ్యాఖ్యలు|సమాధానము|ఎంపిక)|సరైన\s*(?:సమాధానం|జవాబు)|క్రింది\s*వాటిలో\s*సరియైనది)/i.test(line);
      if (isTransitionLine) {
        cleanedLines.push(line);
        inOptionsBlock = true;
        pendingPreOptionText = '';
        continue;
      }

      // If in statement or match question and we haven't reached the transition line, letter statements belong in stem
      if (hasStatementOrMatchHeader && !inOptionsBlock) {
        const isStatementLine = /^\s*(?:\([a-e]\)|[a-e][\.\)])\s+/i.test(line) || /^\s*\([ivxlcdm]+\)\s+/i.test(line);
        if (isStatementLine) {
          cleanedLines.push(line);
          pendingPreOptionText = '';
          continue;
        }
      }

      // CBT Options Header
      if (/^options\s*:\s*$/i.test(line)) {
        inOptionsBlock = true;
        pendingPreOptionText = '';
        continue;
      }

      // Check for Answer Key line
      const ansKeyMatch = line.match(/^(?:ans(?:wer)?|key|correct\s*option)\s*[:=-]?\s*\(?([a-e1-4])\)?/i);
      if (ansKeyMatch) {
        correctAnswer = ansKeyMatch[1].toUpperCase();
        continue;
      }

      // Check for multi inline options on single line
      const multiMatch = getMultiInlineMatches(line);
      if (multiMatch) {
        multiMatch.forEach(m => {
          const key = (m[1] || m[2]).toUpperCase();
          let optText = m[3].trim();
          if (optText.startsWith('*') || optText.endsWith('*')) {
            correctAnswer = key;
            optText = optText.replace(/\*/g, '').trim();
          }
          options.push({ key, text: optText });
        });
        inOptionsBlock = true;
        continue;
      }

      // Check for single option line
      const optMatch = line.match(explicitOptionRegex) || (inOptionsBlock ? line.match(cbtNumericOptionRegex) : null);

      if (optMatch) {
        const key = (optMatch[1] || optMatch[2] || optMatch[3] || optMatch[4]).toUpperCase();
        let optText = (optMatch[5] || optMatch[2] || '').trim();

        // If in CBT bilingual mode and we saw a preceding English option line without marker
        if (pendingPreOptionText && inOptionsBlock) {
          optText = `${pendingPreOptionText} / ${optText}`;
          pendingPreOptionText = '';
        }

        if (optText.startsWith('*') || optText.endsWith('*') || /\[x\]/i.test(optText)) {
          correctAnswer = key;
          optText = optText.replace(/[*\\[\]x]/gi, '').trim();
        }

        options.push({ key, text: optText });
        inOptionsBlock = true;
      } else {
        if (inOptionsBlock) {
          // Inside options block, a non-option line is likely the English text before a Telugu option line
          pendingPreOptionText = line;
        } else {
          cleanedLines.push(line);
        }
      }
    }

    // De-duplicate options by key
    const uniqueOptions = [];
    const seenKeys = new Set();
    for (const opt of options) {
      if (!seenKeys.has(opt.key)) {
        seenKeys.add(opt.key);
        uniqueOptions.push(opt);
      }
    }

    // Apply smart statement and match option sanitizer
    const sanitized = this.sanitizeQuestionOptions(cleanedLines.join('\n'), uniqueOptions, correctAnswer);

    return {
      cleanedText: sanitized.questionText,
      options: sanitized.options,
      correctAnswer: sanitized.correctAnswer
    };
  }

  /**
   * Disambiguates statement and match table rows that were mistakenly parsed as options
   */
  sanitizeQuestionOptions(questionText, options, correctAnswer = '') {
    // Strip spurious option marker or multi-column passage bleed appended to questionText after ?
    let cleanText = questionText;
    if (cleanText && typeof cleanText === 'string') {
      const bleedMatch = cleanText.match(/^([\s\S]*?\?)\s*(?:\([1-4]\)|\[[1-4]\]|\b[1-4][\.\)])\s+([\s\S]+)$/);
      if (bleedMatch && Array.isArray(options) && options.length >= 2) {
        cleanText = bleedMatch[1].trim();
      }
    }

    if (!options || options.length <= 4) {
      return { questionText: cleanText, options: options || [], correctAnswer };
    }

    const isComboChoice = (opt) => {
      const t = (opt.text || '').trim();
      // Combination with & or and or slash e.g. "a & c", "a and b", "1 & 2"
      if (/^[a-e1-4]\s*(?:&|and|\/)\s*[a-e1-4]/i.test(t)) return true;
      // Multi combination e.g. "a, b & c" or "a, b and c"
      if (/^[a-e1-4]\s*,\s*[a-e1-4]\s*(?:&|and)\s*[a-e1-4]/i.test(t)) return true;
      // Match combination e.g. "a-ii, b-iv, c-i, d-iii"
      if (/^[a-d]\s*[-–:]\s*(?:[ivx]+|\d+)/i.test(t)) return true;
      // Words e.g. "only a", "both a and b", "neither 1 nor 2"
      if (/\b(?:only|both|neither|none|all)\b/i.test(t) && /\b(?:[a-e]|[1-4]|[ivx]+)\b/i.test(t)) return true;
      // 1-(c), 2-(d)
      if (/^[1-4]\s*[-–:]\s*\(?[a-e]\)?/i.test(t)) return true;
      // Roman numerals: i & ii, i and iii
      if (/^[ivx]+\s*(?:&|and)\s*[ivx]+/i.test(t)) return true;
      return false;
    };

    const comboOptions = options.filter(isComboChoice);
    const nonComboOptions = options.filter(opt => !isComboChoice(opt));

    // Case 1: Mixed combination choices and statements/table rows
    if (comboOptions.length >= 2 && nonComboOptions.length >= 1) {
      const statementLines = nonComboOptions.map(opt => `(${opt.key.toLowerCase()}) ${opt.text}`).join('\n');
      const updatedText = questionText ? `${questionText.trim()}\n${statementLines}` : statementLines;
      const finalOptions = comboOptions.map((opt, idx) => ({
        key: opt.key || String(idx + 1),
        text: opt.text
      }));
      return {
        questionText: updatedText,
        options: finalOptions,
        correctAnswer: correctAnswer
      };
    }

    // Case 2: Statement or Match question with more than 4 options where first few are statements
    const isStatementOrMatch = /(?:consider\s+the\s+following\s+statements?|match\s+the\s+following|క్రింది\s*(?:వ్యాఖ్యలను|వాటిని)|read\s+the\s+following\s+statements?)/i.test(questionText || '');
    if (isStatementOrMatch && options.length > 4) {
      const splitIndex = options.length - 4;
      const statementOpts = options.slice(0, splitIndex);
      const choiceOpts = options.slice(splitIndex);

      const statementLines = statementOpts.map(opt => `(${opt.key.toLowerCase()}) ${opt.text}`).join('\n');
      const updatedText = questionText ? `${questionText.trim()}\n${statementLines}` : statementLines;
      const finalOptions = choiceOpts.map((opt, idx) => ({
        key: opt.key || String(idx + 1),
        text: opt.text
      }));
      return {
        questionText: updatedText,
        options: finalOptions,
        correctAnswer: correctAnswer
      };
    }

    return { questionText, options, correctAnswer };
  }

  /**
   * Extracts Sub-questions like (a), (b), (i), (ii) for descriptive questions
   */
  extractSubQuestions(text) {
    const subQuestions = [];
    const lines = text.split('\n');
    const mainLines = [];

    const subQRegex = /^\s*(?:\(([a-z]|[ivxlcdm]+)\)|([a-z]|[ivxlcdm]+)[\.\)])\s+(.+)$/i;

    for (const line of lines) {
      const match = line.match(subQRegex);
      if (match && !/^(?:a|b|c|d)\b/i.test(line)) {
        const tag = (match[1] || match[2]).toLowerCase();
        const subText = match[3].trim();
        const subMarks = this.extractMarks(subText);
        subQuestions.push({
          label: tag,
          text: subText.replace(/\[\s*\d+\s*(?:marks?)?\s*\]|\(\s*\d+\s*(?:marks?)?\s*\)/gi, '').trim(),
          marks: subMarks
        });
      } else {
        mainLines.push(line);
      }
    }

    return {
      textWithoutSubQuestions: subQuestions.length > 0 ? mainLines.join('\n') : text,
      subQuestions
    };
  }

  /**
   * Strips prefix numbering and trailing mark indicators from question body
   */
  cleanQuestionText(text) {
    if (!text) return '';
    let cleaned = text;

    // Remove CBT boilerplate lines
    cleaned = cleaned.replace(/^question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*\d+.*$/gim, '');
    cleaned = cleaned.replace(/^(?:question\s*(?:type|id)|option\s*shuffling|is\s*question\s*mandatory|calculator|component\s*minimum\s*marks|component\s*maximum\s*marks|correct\s*marks|wrong\s*marks|status|chosen\s*option|given\s*option)\s*[:.\-]?.*$/gim, '');
    cleaned = cleaned.replace(/^options\s*:\s*$/gim, '');

    // Strip leading question number prefixes
    cleaned = cleaned.replace(/^(?:question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*[0-9a-zivxlcdm]+|q(?:no\.?|\.?\s*no\.?)?\s*[0-9a-zivxlcdm]+|q\s*\d+|[0-9]+|[ivxlcdm]+)\s*[:.\)-]\s+/i, '');

    // Strip trailing marks indicators
    cleaned = cleaned.replace(/\[\s*\d+(?:\.\d+)?\s*(?:marks?|pts?|points?|m)?\s*\]$/i, '');
    cleaned = cleaned.replace(/\(\s*\d+(?:\.\d+)?\s*(?:marks?|pts?|points?|m)\s*\)$/i, '');
    cleaned = cleaned.replace(/\[\s*\d+\s*\+\s*\d+.*?\s*\]$/i, '');

    return cleaned.trim();
  }

  /**
   * Classifies question type based on structure and keywords
   */
  detectQuestionType(q) {
    const text = (q.questionText + ' ' + (q.options ? q.options.map(o => o.text).join(' ') : '')).toLowerCase();

    if (q.options && q.options.length >= 2) {
      if (q.options.length === 2 && (text.includes('true') || text.includes('false') || (q.options[0].text.toLowerCase() === 'true' && q.options[1].text.toLowerCase() === 'false'))) {
        return 'true_false';
      }
      return 'mcq';
    }

    if (text.includes('true or false') || text.includes('state true or false') || /^(true|false)\b/i.test(text)) {
      return 'true_false';
    }

    if (/_{3,}|\.{4,}|\[blank\]|\bfill in the blank/i.test(text)) {
      return 'fill_blank';
    }

    if (text.includes('match the following') || text.includes('column i') || text.includes('column a') || text.includes('match list')) {
      return 'match';
    }

    if (text.includes('calculate') || text.includes('evaluate') || text.includes('find the value') || text.includes('solve for') || text.includes('prove that')) {
      return 'numerical';
    }

    if (q.marks >= 4) {
      return 'long_answer';
    }

    return 'short_answer';
  }

  /**
   * Detects LaTeX expressions and mathematical formulas
   */
  detectMathFormulas(text) {
    if (!text || typeof text !== 'string') return [];
    const formulas = [];
    const latexRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
    
    try {
      const matches = [...text.matchAll(latexRegex)];
      for (const match of matches) {
        const formula = match[1] || match[2] || match[3] || match[4];
        if (formula && formula.trim().length > 0) {
          formulas.push(formula.trim());
        }
      }
    } catch (e) {
      console.warn('LaTeX regex error:', e);
    }

    try {
      const mathSymbolsRegex = /(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|[a-zA-Z0-9]\^[0-9a-zA-Z]+|[a-zA-Z0-9]_[0-9a-zA-Z]+|\\int|\\sum|\\theta|\\alpha|\\beta|\\pi|\\pm|\\leq|\\geq)/g;
      const symbolMatches = text.match(mathSymbolsRegex);
      if (symbolMatches) {
        symbolMatches.forEach(sym => {
          if (!formulas.includes(sym)) formulas.push(sym);
        });
      }
    } catch (e) {
      console.warn('Math symbol regex error:', e);
    }

    return formulas;
  }

  /**
   * Detects and parses tabular answer keys (e.g. TS Police Preliminary Key table)
   */
  extractAnswerKeyTable(lines, metadata = {}) {
    let keyStartIndex = -1;
    const answerKeyMap = {};

    // 1. Locate Answer Key header
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^(?:preliminary|final|official)?\s*(?:answer\s*key|key\s*sheet|key\s*table|preliminary\s*key)/i.test(line) ||
          /^q\.?no\.?\s+[a-d\s]+/i.test(line)) {
        keyStartIndex = i;
        break;
      }
    }

    if (keyStartIndex === -1) {
      return { answerKeyMap, remainingLines: lines, found: false };
    }

    // 2. Determine target booklet series (default to 'A' or metadata)
    const targetSeries = (metadata.bookletSeries || 'A').toUpperCase();
    let seriesColIndex = 1; // Default to column 1 if Q.No is col 0

    const keyLines = lines.slice(keyStartIndex);
    const questionLines = lines.slice(0, keyStartIndex);

    for (const line of keyLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Header row e.g. "Q.No. A B C D" or "QNo Ans"
      if (/^q\.?no/i.test(trimmed)) {
        const cols = trimmed.split(/\s+/);
        const sIdx = cols.findIndex(c => c.toUpperCase() === targetSeries);
        if (sIdx !== -1) {
          seriesColIndex = sIdx;
        }
        continue;
      }

      // Row e.g. "1 4 1 1 3" or "148 3" or "1. 4" or "1 - D"
      const rowMatch = trimmed.match(/^(\d+)\s+([0-9a-d\s-]+)$/i);
      if (rowMatch) {
        const qNum = rowMatch[1];
        const rest = rowMatch[2].trim().split(/\s+/);
        const ans = rest[seriesColIndex - 1] || rest[0];
        if (ans && ans !== '-') {
          answerKeyMap[qNum] = ans.toUpperCase();
        }
      }
    }

    return {
      answerKeyMap,
      remainingLines: questionLines,
      found: Object.keys(answerKeyMap).length > 0
    };
  }

  /**
   * Computes statistics for dashboard
   */
  computeStatistics(questions, calculatedMarks, statedMarks) {
    const typeCounts = {
      mcq: 0,
      true_false: 0,
      fill_blank: 0,
      short_answer: 0,
      long_answer: 0,
      numerical: 0,
      match: 0
    };

    questions.forEach(q => {
      const t = q.type || 'short_answer';
      if (typeCounts[t] !== undefined) {
        typeCounts[t]++;
      } else {
        typeCounts.short_answer++;
      }
    });

    return {
      totalQuestions: questions.length,
      totalCalculatedMarks: calculatedMarks,
      statedMaxMarks: statedMarks,
      marksMatch: statedMarks ? statedMarks === calculatedMarks : true,
      typeBreakdown: typeCounts,
      mcqCount: typeCounts.mcq,
      descriptiveCount: typeCounts.short_answer + typeCounts.long_answer + typeCounts.numerical
    };
  }

  createEmptyResult() {
    return {
      success: false,
      metadata: { title: '', subject: '', grade: '', duration: '', maxMarks: 0, instructions: [] },
      sections: [],
      questions: [],
      stats: { totalQuestions: 0, totalCalculatedMarks: 0, statedMaxMarks: 0, marksMatch: true, typeBreakdown: {} },
      answerKeyFound: false,
      rawText: ''
    };
  }
}

// Export instance to window
window.QuestionPaperExtractor = QuestionPaperExtractor;
window.extractorEngine = new QuestionPaperExtractor();
window.questionPaperExtractor = window.extractorEngine;
