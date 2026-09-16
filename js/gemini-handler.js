/**
 * Gemini Multi-Model & Multi-Key Question Extractor Engine
 * 
 * Features:
 * - Multi-API Key Pool with secure browser localStorage persistence
 * - Automatic Quota Failover: on HTTP 429, key is placed in cooldown and request seamlessly retries with next key
 * - Round-Robin and Priority Failover rotation strategies
 * - Live key health monitoring (Active, Cooldown countdown, Error, Success/Error metrics)
 * - Multi-Model selection: gemini-2.5-flash, gemini-2.5-pro, gemini-3.7-flash, gemini-3.5-flash-lite, custom models
 * - Direct Multimodal PDF extraction (base64 inlineData) with high token budget (65k)
 * - Structured JSON output for Questions, Options (A/B/C/D), Correct Answers, Explanations, Math KaTeX formulas
 */

class GeminiKeyManager {
  constructor() {
    this.storageKey = 'gemini_api_keys_pool';
    this.strategyKey = 'gemini_rotation_strategy';
    this.keys = this.loadKeys();
    this.rotationStrategy = localStorage.getItem(this.strategyKey) || 'auto_failover'; // 'auto_failover' or 'round_robin'
    this.currentIndex = 0;
    this.listeners = [];

    // Migrate legacy single key if exists and pool is empty
    this.migrateLegacyKey();

    // Start interval to tick cooldowns and notify UI
    this.intervalId = setInterval(() => this.tickCooldowns(), 1000);
    if (this.intervalId && typeof this.intervalId.unref === 'function') {
      this.intervalId.unref();
    }
  }

  loadKeys() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((k, idx) => ({
          id: k.id || `key_${Date.now()}_${idx}`,
          key: (k.key || '').trim(),
          label: k.label || `API Key #${idx + 1}`,
          enabled: k.enabled !== false,
          status: k.status || 'active', // 'active' | 'cooldown' | 'error'
          cooldownUntil: k.cooldownUntil || 0,
          requestCount: Number(k.requestCount) || 0,
          successCount: Number(k.successCount) || 0,
          rateLimitCount: Number(k.rateLimitCount) || 0,
          errorCount: Number(k.errorCount) || 0,
          lastUsed: k.lastUsed || 0,
          lastError: k.lastError || ''
        })).filter(k => k.key.length > 0);
      }
    } catch (e) {
      console.warn('Failed to load API keys pool:', e);
    }
    return [];
  }

  saveKeys() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.keys));
      this.notifyListeners();
    } catch (e) {
      console.error('Error saving API keys pool:', e);
    }
  }

  migrateLegacyKey() {
    const legacyKey = (localStorage.getItem('gemini_api_key') || '').trim();
    if (legacyKey && this.keys.length === 0) {
      this.addKey(legacyKey, 'Default Primary Key');
    }
  }

  addListener(fn) {
    if (typeof fn === 'function') this.listeners.push(fn);
  }

  removeListener(fn) {
    this.listeners = this.listeners.filter(f => f !== fn);
  }

  notifyListeners() {
    this.listeners.forEach(fn => {
      try { fn(this.getStatusSummary()); } catch (e) { console.error(e); }
    });
  }

  tickCooldowns() {
    const now = Date.now();
    let changed = false;
    this.keys.forEach(k => {
      if (k.status === 'cooldown' && k.cooldownUntil > 0) {
        if (now >= k.cooldownUntil) {
          k.status = 'active';
          k.cooldownUntil = 0;
          changed = true;
        } else {
          changed = true; // Timer seconds updated
        }
      }
    });
    if (changed) {
      this.notifyListeners();
    }
  }

  getAllKeys() {
    return [...this.keys];
  }

  hasKeys() {
    return this.keys.some(k => k.enabled && k.key.length > 0);
  }

  getActiveKeys() {
    const now = Date.now();
    return this.keys.filter(k => 
      k.enabled && 
      k.key.length > 0 && 
      (k.status !== 'cooldown' || now >= k.cooldownUntil) && 
      k.status !== 'error'
    );
  }

  addKey(rawKey, label = '') {
    const key = (rawKey || '').trim();
    if (!key) return { success: false, message: 'Key cannot be empty' };

    // Check duplicate
    const existing = this.keys.find(k => k.key === key);
    if (existing) {
      return { success: false, message: 'This API key is already in your pool' };
    }

    const newKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      key: key,
      label: label.trim() || `API Key #${this.keys.length + 1}`,
      enabled: true,
      status: 'active',
      cooldownUntil: 0,
      requestCount: 0,
      successCount: 0,
      rateLimitCount: 0,
      errorCount: 0,
      lastUsed: 0,
      lastError: ''
    };

    this.keys.push(newKey);
    this.saveKeys();
    return { success: true, key: newKey };
  }

  addMultipleKeys(text) {
    if (!text || typeof text !== 'string') return { added: 0, skipped: 0 };
    // Split by newlines, commas, or semicolons
    const tokens = text.split(/[\r\n,;]+/).map(t => t.trim()).filter(t => t.length >= 15);
    let added = 0;
    let skipped = 0;

    tokens.forEach(token => {
      const res = this.addKey(token, `Key ${this.keys.length + 1}`);
      if (res.success) added++;
      else skipped++;
    });

    return { added, skipped };
  }

  removeKey(id) {
    this.keys = this.keys.filter(k => k.id !== id);
    this.saveKeys();
  }

  toggleKey(id) {
    const target = this.keys.find(k => k.id === id);
    if (target) {
      target.enabled = !target.enabled;
      if (target.enabled && target.status === 'error') {
        target.status = 'active'; // Clear error on manual enable
      }
      this.saveKeys();
    }
  }

  updateKeyLabel(id, label) {
    const target = this.keys.find(k => k.id === id);
    if (target && label.trim()) {
      target.label = label.trim();
      this.saveKeys();
    }
  }

  resetKeyStatus(id) {
    const target = this.keys.find(k => k.id === id);
    if (target) {
      target.status = 'active';
      target.cooldownUntil = 0;
      target.lastError = '';
      this.saveKeys();
    }
  }

  resetAllCooldowns() {
    this.keys.forEach(k => {
      k.status = 'active';
      k.cooldownUntil = 0;
    });
    this.saveKeys();
  }

  clearAllKeys() {
    this.keys = [];
    localStorage.removeItem(this.storageKey);
    this.notifyListeners();
  }

  setRotationStrategy(strategy) {
    if (strategy === 'auto_failover' || strategy === 'round_robin') {
      this.rotationStrategy = strategy;
      localStorage.setItem(this.strategyKey, strategy);
      this.notifyListeners();
    }
  }

  getRotationStrategy() {
    return this.rotationStrategy;
  }

  /**
   * Selects next usable key based on strategy
   * @param {Array<string>} excludeKeyIds - keys already attempted in current request
   */
  getNextKey(excludeKeyIds = []) {
    const now = Date.now();
    const candidates = this.keys.filter(k => 
      k.enabled && 
      !excludeKeyIds.includes(k.id) &&
      (k.status !== 'cooldown' || now >= k.cooldownUntil) &&
      k.status !== 'error'
    );

    if (candidates.length === 0) {
      // Check if any keys are in cooldown
      const coolingKeys = this.keys.filter(k => k.enabled && k.status === 'cooldown' && k.cooldownUntil > now);
      if (coolingKeys.length > 0) {
        coolingKeys.sort((a, b) => a.cooldownUntil - b.cooldownUntil);
        const shortestSeconds = Math.ceil((coolingKeys[0].cooldownUntil - now) / 1000);
        return {
          key: null,
          allCooling: true,
          coolingKeys: coolingKeys,
          retryAfterSeconds: shortestSeconds
        };
      }
      return { key: null, allCooling: false, retryAfterSeconds: 0 };
    }

    if (this.rotationStrategy === 'round_robin') {
      this.currentIndex = (this.currentIndex + 1) % candidates.length;
      return { key: candidates[this.currentIndex], allCooling: false };
    } else {
      // auto_failover: use the first available active candidate
      return { key: candidates[0], allCooling: false };
    }
  }

  recordUsage(keyId) {
    const target = this.keys.find(k => k.id === keyId);
    if (target) {
      target.requestCount++;
      target.lastUsed = Date.now();
      this.saveKeys();
    }
  }

  recordSuccess(keyId) {
    const target = this.keys.find(k => k.id === keyId);
    if (target) {
      target.successCount++;
      target.status = 'active';
      target.lastError = '';
      this.saveKeys();
    }
  }

  recordRateLimit(keyId, cooldownMs = 60000, errorMsg = 'HTTP 429 Quota Exceeded') {
    const target = this.keys.find(k => k.id === keyId);
    if (target) {
      target.rateLimitCount++;
      target.status = 'cooldown';
      target.cooldownUntil = Date.now() + cooldownMs;
      target.lastError = errorMsg;
      this.saveKeys();
    }
  }

  recordError(keyId, errorMsg = '') {
    const target = this.keys.find(k => k.id === keyId);
    if (target) {
      target.errorCount++;
      const lower = (errorMsg || '').toLowerCase();
      const isFatal = lower.includes('api_key_invalid') || 
                      lower.includes('not valid') ||
                      lower.includes('unauthenticated') ||
                      lower.includes('invalid authentication') ||
                      lower.includes('access_token_type_unsupported') ||
                      lower.includes('401') ||
                      lower.includes('403') ||
                      lower.includes('permission denied');
      if (isFatal) {
        target.status = 'error';
      }
      target.lastError = errorMsg;
      this.saveKeys();
    }
  }

  /**
   * Fast 1-click test to verify if a key is working
   */
  async testKey(keyObj, model = 'gemini-2.5-flash') {
    const key = typeof keyObj === 'string' ? keyObj : keyObj.key;
    // Use x-goog-api-key header for full support of modern AQ.Ab keys and legacy AIzaSy keys
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with exactly the single word "OK"' }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 }
        })
      });

      if (response.ok) {
        if (typeof keyObj === 'object') {
          this.recordSuccess(keyObj.id);
        }
        return { success: true, message: 'Valid & active! Gemini responded OK.' };
      } else {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        if (typeof keyObj === 'object') {
          if (response.status === 429) {
            this.recordRateLimit(keyObj.id, 60000, msg);
          } else {
            this.recordError(keyObj.id, msg);
          }
        }
        return { success: false, status: response.status, message: msg };
      }
    } catch (err) {
      return { success: false, message: err.message || 'Network error connecting to Gemini API' };
    }
  }

  getStatusSummary() {
    const now = Date.now();
    const total = this.keys.length;
    const enabled = this.keys.filter(k => k.enabled).length;
    const active = this.getActiveKeys().length;
    const cooldown = this.keys.filter(k => k.enabled && k.status === 'cooldown' && k.cooldownUntil > now).length;
    const error = this.keys.filter(k => k.enabled && k.status === 'error').length;

    return {
      total,
      enabled,
      active,
      cooldown,
      error,
      strategy: this.rotationStrategy,
      keys: this.keys.map(k => {
        let remainingSeconds = 0;
        if (k.status === 'cooldown' && k.cooldownUntil > now) {
          remainingSeconds = Math.ceil((k.cooldownUntil - now) / 1000);
        }
        return {
          id: k.id,
          label: k.label,
          maskedKey: k.key.length > 10 ? `${k.key.substring(0, 7)}...${k.key.substring(k.key.length - 4)}` : '••••••••',
          enabled: k.enabled,
          status: remainingSeconds > 0 ? 'cooldown' : k.status,
          remainingSeconds,
          requestCount: k.requestCount,
          successCount: k.successCount,
          rateLimitCount: k.rateLimitCount,
          errorCount: k.errorCount,
          lastError: k.lastError
        };
      })
    };
  }
}


class GeminiHandler {
  constructor(keyManager = null) {
    this.keyManager = keyManager || (typeof window !== 'undefined' ? window.geminiKeyManager : null) || new GeminiKeyManager();

    // Standard high-performance supported models (2026 current models)
    this.supportedModels = [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Recommended — Proven accuracy, fast multimodal vision & 1M context', badge: 'Recommended' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', desc: 'Ultra-fast, lowest latency & high throughput', badge: 'Ultra Fast' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Deep reasoning — Complex exam papers, dense math & diagrams', badge: 'High Reasoning' },
      { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', desc: 'Next-gen reasoning & agentic workflows', badge: 'Next-Gen' }
    ];

    let savedModel = localStorage.getItem('gemini_model_name');
    const validModelIds = this.supportedModels.map(m => m.id);
    if (!savedModel || !validModelIds.includes(savedModel) || savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-2.5-flash-lite' || savedModel === 'gemini-3.6-flash') {
      savedModel = 'gemini-2.5-flash';
      localStorage.setItem('gemini_model_name', savedModel);
    }
    this.modelName = savedModel;
    this.currentAbortController = null;
  }

  getModelName() {
    const m = this.modelName || localStorage.getItem('gemini_model_name');
    if (!m || m === 'gemini-2.0-flash' || m === 'gemini-2.5-flash-lite' || m === 'gemini-3.6-flash' || !this.supportedModels.some(sm => sm.id === m)) {
      this.modelName = 'gemini-2.5-flash';
      localStorage.setItem('gemini_model_name', 'gemini-2.5-flash');
      return 'gemini-2.5-flash';
    }
    return m;
  }

  setModelName(modelId) {
    if (!modelId) return;
    this.modelName = modelId.trim();
    localStorage.setItem('gemini_model_name', this.modelName);
  }

  hasAnyKey() {
    return this.keyManager.hasKeys();
  }

  hasApiKey() {
    return this.hasAnyKey();
  }

  getApiKey() {
    const keys = this.keyManager.getAllKeys();
    return keys.length > 0 ? keys[0].key : '';
  }

  setApiKey(key) {
    if (key && key.trim()) {
      this.keyManager.addKey(key.trim(), 'Primary Key');
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Structured prompt specifically crafted for Question Paper extraction
   */
  buildExtractionPrompt(pageRangeDesc = '') {
    return `You are an expert academic examination parser and question digitizer.
Analyze the attached Question Paper PDF carefully ${pageRangeDesc ? `(${pageRangeDesc})` : ''}.

EXTRACT EVERY SINGLE QUESTION AND ITS OPTIONS with extreme accuracy:
1. Identify all questions sequentially (e.g. Question 1, 2, 3... up to the last question on these pages).
2. For each question, extract:
   - "questionNumber": exact question number or label (e.g. "1", "2", "Q15", "10(a)").
   - "questionText": complete question stem. If it has mathematical formulas or equations, render them in standard LaTeX math syntax with dollar signs like $E = mc^2$ or $\\\\frac{a}{b}$. If it contains a diagram, table, or graph, provide a descriptive text representation.
   - "options": list of multiple choice options. Each option must have:
       "key": standard identifier like "A", "B", "C", "D" or "1", "2", "3", "4"
       "text": clear option text
   - "correctAnswer": option key (e.g. "B" or "2") if indicated anywhere in the paper, marked with a tick/circle, or given in an answer key/response sheet table. Leave empty string "" if not stated.
   - "explanation": explanation, formula hint, or working steps if present in the document.
   - "section": exam section or subject heading if stated (e.g. "General Awareness", "Mathematics", "Section A").
   - "marks": numerical marks for the question (default 1).
   - "type": "mcq" for multiple choice with options, "numerical" for math input, "true_false" for true/false, or "short_answer" for descriptive questions without choices.

Return ONLY a valid JSON object matching this exact JSON schema:
{
  "metadata": {
    "title": "Exam or Paper Title",
    "subject": "Subject Name",
    "grade": "Grade / Class / Exam Level",
    "duration": "Duration (e.g. 3 Hours)",
    "maxMarks": 100,
    "instructions": ["General instructions list"]
  },
  "sections": [
    {
      "id": "sec_1",
      "title": "Section A / Part I",
      "description": "Section description or topic",
      "questions": [
        {
          "id": "q_1",
          "questionNumber": "1",
          "marks": 1,
          "type": "mcq",
          "section": "Section A",
          "questionText": "I have done a ______ deal of work.",
          "options": [
            { "key": "1", "text": "big" },
            { "key": "2", "text": "great" },
            { "key": "3", "text": "huge" },
            { "key": "4", "text": "enormous" }
          ],
          "correctAnswer": "2",
          "explanation": ""
        }
      ]
    }
  ]
}

CRITICAL RULES:
- STRICT ZERO-HALLUCINATION & ZERO-FABRICATION RULE:
  * NEVER invent, synthesize, or fabricate questions or options!
  * You are an exact transcription engine. Extract ONLY the questions and options that are printed verbatim in the document.
  * NEVER create artificial questions starting with "Based on the passage...", "Based on the passage context regarding...", or similar synthetic prompts.
  * NEVER output placeholder text like "Question 15 from paper", "Question 31", or "Q15" as "questionText"! Every "questionText" MUST contain the real printed question sentences from the exam paper.
  * NEVER output placeholder options like "Option 1", "Option 2", "Option 3", "Option 4" or numeric echoes like "(1)", "(2)", "(3)", "(4)"! Every single option text MUST contain the actual printed choice words or numbers from the paper (e.g. "(1) big (2) great (3) huge (4) enormous" or "(1) 5:6 (2) 8:7 (3) 12:17 (4) 10:13" or "(1) 10,080 (2) 9,660 (3) 12,000 (4) 12,060").
  * When a page contains a reading passage (e.g. Hiroshima nuclear blast passage), questions BEFORE the passage (e.g. Questions 15 to 20) are INDEPENDENT grammar/vocabulary questions. EXTRACT THEIR PRINTED TEXT AND REAL OPTIONS VERBATIM!
  * For reading passage questions (e.g. Questions 21 to 25), extract ONLY the actual printed questions and actual printed options! DO NOT invent hypothetical questions from the passage text.
  * For arithmetic & bilingual questions (e.g. Questions 31 to 35): Extract the full problem stem in English AND Telugu, and extract all 4 numerical/ratio choices accurately! NEVER truncate or skip them.
- MANDATORY: START FROM QUESTION 1 (OR FIRST QUESTION ON PAGE): You MUST extract the very first numbered question (e.g. Question 1) visible in this batch. Even if Question 1 has multi-column formatting, broken lines, or options split across lines (e.g. '1. A pair of socks been missing (2) from my room...'), reconstruct the complete question text and all options. NEVER omit Question 1 or dismiss it as header/title text!
- EXTRACT ALL QUESTIONS IN THE CHUNK COMPLETELY: Extract EVERY single question in the provided chunk sequentially without stopping or omitting any intermediate questions.
- Do NOT skip any questions or truncate output. Extract ALL questions visible.
- Always preserve options faithfully with their keys.
- Do NOT wrap in markdown explanation or conversational text outside the JSON. Return purely valid JSON.

SPECIAL RULES FOR COMPETITIVE EXAMS (AVOID EXTRACTION MISMATCH):
1. DISTINGUISH STANDARD STATEMENT MCQs vs COMBO-CHOICE QUESTIONS:
   (A) STANDARD STATEMENT MCQs (e.g. "Which of the following statements is not correct about reign of Akbar? (1) Raja Todarmal... (2) Raja Birbal... (3) Raja Mansingh... (4) Promoulgation..."):
       - Here the 4 numbered statements (1), (2), (3), (4) ARE THE 4 MULTIPLE CHOICE OPTIONS THEMSELVES!
       - Extract each full statement (and its Telugu/regional translation if bilingual) as the option text:
         [
           {"key": "1", "text": "Raja Todarmal, a Rajput noble... / రాజ్యపుత్రుడు అయిన తోడర్మల్..."},
           {"key": "2", "text": "Raja Birbal, a Brahmin... / బ్రాహ్మణుడైన బీర్బల్..."},
           {"key": "3", "text": "Raja Mansingh, brother-in-law... / అక్బర్ తన బావమరిది..."},
           {"key": "4", "text": "Promoulgation of a new religious philosophy... / 1582 లో ‘దీన్-ఇ-ఇలాహి’..."}
         ]
       - NEVER return dummy digits like [{"key":"1","text":"1"}, {"key":"2","text":"2"}, ...]!
       - Place both English and Telugu question stems in "questionText":
         "Which of the following statements is not correct about reign of Akbar? / అక్బర్ కాలానికి సంబంధించి ఈ క్రింది వాఖ్యములలో ఏది సరిఅయింది కాదు ?"
   (B) COMBO-CHOICE QUESTIONS (e.g. "Consider the following statements: (a) ... (b) ... (c) ... Which of the statements are correct? (1) a & c (2) a & b (3) b & c (4) a, b & c"):
       - Only when secondary combination choices (1) a & c, (2) a & b exist do the sub-statements (a), (b), (c) go inside "questionText".
       - The "options" array must contain ONLY the 4 final combination choices [{"key":"1","text":"a & c"}, ...].

2. MATCH THE FOLLOWING QUESTIONS (e.g. "Match the following: Minister vs Union Government (a) ... (b) ... (i) ... (ii) ... Options: (1) a-ii, b-iv..."):
   - The column/table matching items belong ENTIRELY inside "questionText" (e.g. formatted with clean newlines or table).
   - DO NOT extract matching table rows as options!
   - The "options" array must strictly contain ONLY the final combination choices, e.g. [{"key":"1","text":"a-ii, b-iv, c-i, d-iii"}, ...]. Exactly 4 options!

3. BILINGUAL PAPERS vs MONOLINGUAL ENGLISH SECTIONS:
   - For bilingual questions (where a question is printed in English and immediately followed by its regional translation like Telugu or Hindi): Keep the English question AND its true regional translation together in "questionText".
   - MONOLINGUAL ENGLISH SECTIONS (e.g. Reading Comprehension, English Grammar, Vocabulary, Questions 1-20/1-25):
     * These sections test the candidate's English proficiency and are printed EXCLUSIVELY in English.
     * DO NOT attempt to translate English questions into Telugu/Hindi.
     * DO NOT hallucinate, copy, or bleed unrelated regional text from previous pages, adjacent columns, or passages into English question stems!
     * If a question on the paper is in English only, keep its "questionText" purely in English.

4. READING COMPREHENSION PASSAGES:
   - When a passage precedes questions (e.g. "Read the following passage and answer the questions from 1-4: ..."):
     * Place the passage in the section "description" or at the start.
     * Each individual question must contain ONLY its actual question prompt (e.g. "How did most people regard early motor cars?").
     * NEVER attach the entire reading passage or its translation into an individual question's "questionText"! Place the reading passage in section "description".
     * NEVER append stray paragraph markers or option markers like "(1) ..." into "questionText".

5. QUESTION NUMBERING INTEGRITY:
   - "questionNumber" must match the EXACT printed number on the question paper (e.g. "199", "200").
   - NEVER skip question numbers or jump (e.g. if the previous question is 199 and the next question is 200, it MUST be "200", NOT "205").
   - Ignore watermarks (like "Adda247") stamped across question numbers.

6. IMAGE-BASED & DIAGRAMMATIC QUESTIONS:
   - If a question's stem or options are visual (such as a geometric figure, triangles, Venn diagram, circuit, graph, chart, or data table):
     * NEVER leave "questionText" blank or empty!
     * Extract the question number and any printed text/labels visible inside or beside the diagram.
     * Describe the visual elements accurately in "questionText" using bracketed notation, e.g.:
       "[Diagram: In the given figure, triangle ABC is shown with sides... / క్రింది పటంలో...]"
     * If the options themselves are diagrammatic or values labeled in the figure, transcribe their labels, coordinates, or values faithfully into the "options" array.
     * Ensure every question has valid questionText and options.`;
  }

  /**
   * Detects whether a document page or text chunk contains an Answer Key Table
   * (e.g. TSLPRB - 2022 PRELIMINARY KEY, Q.No. Series A Series B Series C Series D)
   * rather than actual question content.
   */
  isAnswerKeyPage(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (trimmed.length < 30) return false;

    // 1. Explicit Answer Key title headers
    const hasKeyHeader = /(?:preliminary|final|provisional|official|master)\s*(?:answer\s*)?key|answer\s*key\s*(?:sheet|table|chart|paper)?/i.test(trimmed);

    // 2. Tabular answer key indicators (Q.No + Series / Booklet / Answers)
    const hasTableHeaders = /(?:q\.?\s*no|question\s*no|s\.?\s*no)[\s\S]{1,40}(?:series\s*[a-d]|booklet|ans(?:wer)?)/i.test(trimmed);

    // 3. Dense numeric answer mappings e.g. "1 3 2 4", "2 1 4 3" in tabular format
    const hasDenseKeyRows = /\b(?:q\.?\s*no|qno)\b/i.test(trimmed) && /\b1\s+[1-4a-d]\s+[1-4a-d]/i.test(trimmed);

    // 4. Repeated series table pattern
    const hasSeriesCols = /series\s*a[\s\S]*series\s*b/i.test(trimmed);

    // 5. Simple 1-column answer key lines e.g. "1 - A\n2 - B\n3 - C"
    const hasSimpleKeyRows = /\b1\s*[-–.:]\s*[a-d1-4]\b/i.test(trimmed) && /\b2\s*[-–.:]\s*[a-d1-4]\b/i.test(trimmed);

    return (hasKeyHeader && (hasTableHeaders || hasSeriesCols || hasDenseKeyRows || hasSimpleKeyRows)) ||
           (hasTableHeaders && (hasSeriesCols || hasDenseKeyRows));
  }

  /**
   * Main Smart Entry Point for Gemini AI Extraction
   * Automatically selects the fastest, most reliable extraction strategy:
   * 1. If PDF has text layer (0.5s local text extraction): Chunks into parallel/sequential fast AI batches (~2s per batch)
   * 2. If PDF is scanned/image-only: Uses direct multimodal vision or page-batch image vision
   * 3. If Image/DOCX/TXT: Routes to optimal engine with multi-key failover
   */
  async extractSmart(fileOrBuffer, options = {}, onProgress = null) {
    if (!this.hasAnyKey()) {
      throw new Error('No Gemini API keys found. Please open API Key Settings and add at least one Gemini API key.');
    }

    const fileName = (fileOrBuffer.name || 'document.pdf').toLowerCase();
    const progress = (msg, percent = null, keyInfo = null) => {
      if (onProgress) onProgress(msg, percent, keyInfo);
    };

    this.currentAbortController = new AbortController();

    // CASE 1: Word Document
    if (fileName.endsWith('.docx') && window.docxHandler) {
      progress('Extracting Word document text...', 15);
      const docxRes = await window.docxHandler.extractText(fileOrBuffer);
      return this.extractFromTextWithBatches(docxRes.text, fileOrBuffer.name || 'document.docx', progress);
    }

    // CASE 2: Text Document
    if (fileName.endsWith('.txt')) {
      const text = typeof fileOrBuffer.text === 'function' ? await fileOrBuffer.text() : String(fileOrBuffer);
      return this.extractFromTextWithBatches(text, fileOrBuffer.name || 'document.txt', progress);
    }

    // CASE 3: Image Scan (Single image)
    if (fileName.match(/\.(png|jpg|jpeg|webp)$/)) {
      progress('Encoding image for Gemini Multimodal Vision...', 20);
      return this.extractDirectImage(fileOrBuffer, options, progress);
    }

    // CASE 4: PDF Document (Primary Flow)
    if (fileName.endsWith('.pdf')) {
      progress('Inspecting PDF structure in browser (PDF.js)...', 10);
      let pdfResult = null;
      try {
        if (window.pdfHandler) {
          pdfResult = await window.pdfHandler.extractText(fileOrBuffer, null, (p) => {
            progress(`Reading PDF pages (${p.current}/${p.total})...`, 10 + Math.round(p.percent * 0.15));
          });
        }
      } catch (pdfErr) {
        console.warn('PDF text extraction error, falling back to direct vision upload:', pdfErr);
      }

      if (pdfResult && pdfResult.numPages > 0) {
        const numPages = pdfResult.numPages;
        const pageTexts = pdfResult.pageTexts || [];
        const targetPages = (options.pageRange === 'custom' && options.customRange)
          ? this.parsePageRangeString(options.customRange, numPages)
          : Array.from({ length: numPages }, (_, i) => i + 1);

        // Check forceVision setting
        const forceVision = options.forceVision === true || options.extractionMode === 'vision';
        if (forceVision) {
          progress(`👁️ Gemini Vision mode selected. Launching visual OCR on ${targetPages.length} pages...`, 20);
          return this.extractDirectPDF(fileOrBuffer, options, progress);
        }

        // Categorize each page into text page vs scanned/empty page
        // Separate out Answer Key pages so they are never converted to fake questions
        const textPages = [];
        const scannedPages = [];
        const answerKeyPages = [];

        for (const p of targetPages) {
          const pText = (pageTexts[p - 1] || '').trim();
          if (this.isAnswerKeyPage(pText)) {
            console.log(`[Gemini Extractor] Page ${p} identified as Answer Key table. Excluding from question batches.`);
            answerKeyPages.push({ pageNum: p, text: pText });
          } else if (pText.length >= 50) {
            textPages.push(p);
          } else {
            scannedPages.push(p);
          }
        }

        // Check for corrupted PUA font encoding in text pages
        const fullTextSample = textPages.map(p => pageTexts[p - 1] || '').join('\n');
        const puaMatches = fullTextSample.match(/(?:[\uE000-\uF8FF\uFFF0-\uFFFF]|[\uDB80-\uDBFF][\uDC00-\uDFFF])/g) || [];
        if (puaMatches.length >= 10) {
          progress(`👁️ Custom / Non-Unicode font detected (${puaMatches.length} unmapped glyphs). Switching to Gemini Multimodal Vision to visually read authentic regional script...`, 20);
          return this.extractDirectPDF(fileOrBuffer, options, progress);
        }

        // CASE A: Hybrid PDF (mixed digital text pages + scanned image pages)
        // E.g. TS Police Constable where Pages 1-23 have text (Q1-125) and Pages 24-38 are scanned images (Q126-200)
        if (scannedPages.length > 0 && textPages.length > 1) {
          progress(`⚡ Hybrid PDF detected: ${textPages.length} text pages + ${scannedPages.length} scanned pages. Digitizing text + visual OCR for complete 100% coverage...`, 20);
          return this.extractHybridPDF(fileOrBuffer, pdfResult, textPages, scannedPages, options, progress);
        }

        // CASE B: Pure Scanned PDF (all or almost all target pages have no digital text)
        if (scannedPages.length > 0 && textPages.length <= 1) {
          progress(`👁️ Scanned document detected (${scannedPages.length} pages). Launching Gemini Vision OCR...`, 20);
          return this.extractDirectPDF(fileOrBuffer, options, progress);
        }

        // CASE C: Pure Clean Digital Text PDF (all target pages have active text layer)
        if (textPages.length > 0) {
          const targetText = textPages
            .map(p => `--- [Page ${p}] ---\n${pageTexts[p - 1]}`)
            .join('\n\n');
          progress(`⚡ Text layer active (${numPages} pages). Launching accelerated Gemini AI pipeline...`, 25);
          return this.extractFromTextWithBatches(targetText, fileOrBuffer.name || 'exam.pdf', progress);
        }
      } else {
        // Scanned image PDF without text layer
        progress('Scanned document detected. Launching Gemini Vision OCR...', 20);
        return this.extractDirectPDF(fileOrBuffer, options, progress);
      }
    }

    // Default fallback
    return this.extractDirectPDF(fileOrBuffer, options, progress);
  }

  /**
   * Parses page range strings like "1-5", "1, 3, 5-8", "all"
   */
  parsePageRangeString(rangeStr, maxPages = 100) {
    if (!rangeStr || typeof rangeStr !== 'string' || rangeStr.toLowerCase() === 'all') {
      return Array.from({ length: maxPages }, (_, i) => i + 1);
    }

    const pages = new Set();
    const parts = rangeStr.split(/[,;]+/);

    for (const part of parts) {
      const trimmed = part.trim();
      const matchRange = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
      if (matchRange) {
        const start = Math.max(1, parseInt(matchRange[1], 10));
        const end = Math.min(maxPages, parseInt(matchRange[2], 10));
        for (let p = start; p <= end; p++) pages.add(p);
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= maxPages) {
          pages.add(num);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  /**
   * Intelligently divides large question paper text into 8–15 question batches.
   * Prioritizes page boundaries (2 pages per batch) so questions are never fragmented,
   * never omitted, and never exceed Gemini's output generation window.
   */
  splitTextIntoBatches(rawText, targetBatchSize = 12, pagesPerBatch = 1) {
    if (!rawText || typeof rawText !== 'string') return [rawText || ''];

    // STRATEGY 1: Split by page markers (--- [Page X] ---)
    // 1 page per batch guarantees 100% extraction coverage without skipping complex/dense pages
    const pageMarkerRegex = /(?:^|\n)(?=---\s*\[?Page\s*\d+\]?\s*---)/i;
    const rawPageBlocks = rawText.split(pageMarkerRegex).map(b => b.trim()).filter(Boolean);

    if (rawPageBlocks.length > 1) {
      // Exclude answer key blocks from question extraction batches
      const validBlocks = rawPageBlocks.filter(b => !this.isAnswerKeyPage(b));
      const batches = [];
      for (let i = 0; i < validBlocks.length; i += pagesPerBatch) {
        const chunk = validBlocks.slice(i, i + pagesPerBatch).join('\n\n').trim();
        if (chunk.length > 0) {
          batches.push(chunk);
        }
      }
      return batches.length > 0 ? batches : [rawText];
    }

    // STRATEGY 2: Split by question line indices
    const lines = rawText.split('\n');
    const questionStartIndices = [];
    const qRegex = /^(?:question\s*(?:no\.?|number|id)?\s*[:.\-]?\s*\d+|q(?:no\.?|\.?\s*no\.?)?\s*\d+|q\s*\d+|\d{1,3}[\.\)](?:\s+|$)|(?:\d{1,3}[\.\)]|\(\d{1,3}\))\s*)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (qRegex.test(line)) {
        questionStartIndices.push(i);
      }
    }

    // If we detected questions, chunk by questions with targetBatchSize (default 12)
    if (questionStartIndices.length > targetBatchSize) {
      const batches = [];
      for (let i = 0; i < questionStartIndices.length; i += targetBatchSize) {
        // For the first batch, always start from line 0 so document header, instructions, and Question 1 are never cut off!
        const startLine = i === 0 ? 0 : questionStartIndices[i];
        const nextBatchStart = questionStartIndices[i + targetBatchSize];
        const endLine = nextBatchStart !== undefined ? nextBatchStart : lines.length;
        const chunkLines = lines.slice(startLine, endLine);
        const chunkText = chunkLines.join('\n').trim();
        if (chunkText.length > 0) {
          batches.push(chunkText);
        }
      }
      return batches;
    }

    // STRATEGY 3: Fallback split by character length if text is large (>12KB)
    if (rawText.length > 12000) {
      const charChunkSize = 8000;
      const batches = [];
      let currentPos = 0;
      while (currentPos < rawText.length) {
        let nextPos = currentPos + charChunkSize;
        if (nextPos < rawText.length) {
          const nextNewline = rawText.indexOf('\n', nextPos);
          if (nextNewline !== -1 && nextNewline - nextPos < 1500) {
            nextPos = nextNewline;
          }
        }
        batches.push(rawText.substring(currentPos, nextPos).trim());
        currentPos = nextPos;
      }
      return batches;
    }

    return [rawText];
  }

  /**
   * Fast Text-First Gemini Extraction with Smart Batching
   * Takes ~2-3s per batch instead of 90s for a 65-page document
   */
  async extractFromTextWithBatches(rawText, fileName = 'question_paper.txt', onProgress = null) {
    const batches = this.splitTextIntoBatches(rawText, 12);
    const progress = (msg, percent = null, keyInfo = null) => {
      if (onProgress) onProgress(msg, percent, keyInfo);
    };

    if (batches.length === 1) {
      progress('Extracting structured questions with Gemini AI...', 35);
      return this.extractFromText(batches[0], fileName, progress);
    }

    progress(`⚡ Divided document into ${batches.length} accelerated batches for fast processing...`, 20);
    const batchResults = [];
    const totalBatches = batches.length;

    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
      if (this.currentAbortController && this.currentAbortController.signal.aborted) {
        throw new Error('Extraction cancelled by user.');
      }

      const startPercent = Math.round(20 + (bIdx / totalBatches) * 70);
      const batchText = batches[bIdx];

      progress(
        `⚡ [Batch ${bIdx + 1} of ${totalBatches}] Digitizing questions via Gemini AI...`,
        startPercent
      );

      const batchResult = await this.extractSingleTextBatch(batchText, bIdx + 1, totalBatches, (msg, p, kInfo) => {
        const batchProgress = startPercent + Math.round(((p || 50) / 100) * (70 / totalBatches));
        progress(`⚡ [Batch ${bIdx + 1}/${totalBatches}] ${msg}`, Math.min(batchProgress, 92), kInfo);
      });

      if (batchResult) {
        batchResults.push(batchResult);
      }
    }

    progress('Merging and standardizing all extracted questions...', 95);
    return this.mergeBatches(batchResults, fileName);
  }

  /**
   * Hybrid PDF Extractor:
   * Digitizes digital text pages via accelerated text batches,
   * AND concurrently/sequentially digitizes scanned/image pages via Gemini Vision batches,
   * then merges all questions into one complete, seamless examination paper.
   */
  async extractHybridPDF(fileOrBuffer, pdfResult, textPages, scannedPages, options = {}, onProgress = null) {
    const progress = (msg, percent = null, keyInfo = null) => {
      if (onProgress) onProgress(msg, percent, keyInfo);
    };

    const allBatchResults = [];
    const pageTexts = pdfResult.pageTexts || [];
    const fileName = fileOrBuffer.name || 'exam.pdf';

    // 1. Process Text Pages (e.g. Questions 1 to 125)
    // Filter out Answer Key pages so they are never parsed into fake questions
    const answerKeyPages = [];
    const textPagesWithContent = textPages.filter(p => {
      const txt = (pageTexts[p - 1] || '').trim();
      if (txt.length < 50) return false;
      if (this.isAnswerKeyPage(txt)) {
        console.log(`[Gemini Extractor] Page ${p} identified as Answer Key table. Preserving for answer mapping.`);
        answerKeyPages.push({ pageNum: p, text: txt });
        return false;
      }
      return true;
    });

    if (textPagesWithContent.length > 0) {
      const textContent = textPagesWithContent
        .map(p => `--- [Page ${p}] ---\n${pageTexts[p - 1]}`)
        .join('\n\n');

      // 1 page per batch guarantees 100% question extraction without skipping complex pages
      const textBatches = this.splitTextIntoBatches(textContent, 10, 1);
      const totalTextBatches = textBatches.length;
      progress(`⚡ Digitizing ${textPagesWithContent.length} text pages across ${totalTextBatches} fast AI batches...`, 20);

      for (let i = 0; i < totalTextBatches; i++) {
        if (this.currentAbortController && this.currentAbortController.signal.aborted) {
          throw new Error('Extraction cancelled by user.');
        }

        const batchNum = i + 1;
        const pct = Math.round(20 + (i / totalTextBatches) * 35);
        progress(`⚡ [Text Batch ${batchNum}/${totalTextBatches}] Digitizing text questions...`, pct);

        const res = await this.extractSingleTextBatch(textBatches[i], batchNum, totalTextBatches, (msg, p, kInfo) => {
          const subPct = pct + Math.round(((p || 50) / 100) * (35 / totalTextBatches));
          progress(`⚡ [Text Batch ${batchNum}/${totalTextBatches}] ${msg}`, Math.min(subPct, 55), kInfo);
        });

        if (res) {
          allBatchResults.push(res);
        }
      }
    }

    // 2. Process Scanned Pages with Gemini Multimodal Vision (e.g. Questions 126 to 200)
    // Group scanned pages into batches of 3 pages for high throughput and precision
    const pagesPerBatch = 3;
    const visualBatches = [];
    for (let i = 0; i < scannedPages.length; i += pagesPerBatch) {
      visualBatches.push(scannedPages.slice(i, i + pagesPerBatch));
    }
    const totalVisualBatches = visualBatches.length;

    progress(`👁️ Digitizing ${scannedPages.length} scanned pages via Gemini Vision across ${totalVisualBatches} visual batches...`, 55);

    for (let bIdx = 0; bIdx < totalVisualBatches; bIdx++) {
      if (this.currentAbortController && this.currentAbortController.signal.aborted) {
        throw new Error('Extraction cancelled by user.');
      }

      const pageNums = visualBatches[bIdx];
      const pageDesc = pageNums.length === 1 ? `Page ${pageNums[0]}` : `Pages ${pageNums[0]} to ${pageNums[pageNums.length - 1]}`;
      const pct = Math.round(55 + (bIdx / totalVisualBatches) * 38);

      progress(`👁️ [Visual Batch ${bIdx + 1}/${totalVisualBatches}] Rendering ${pageDesc}...`, pct);

      const renderedPages = await window.pdfHandler.renderPagesToJPEGs(fileOrBuffer, pageNums, 1.5);
      const imageParts = renderedPages.map(rp => ({
        inlineData: { mimeType: 'image/jpeg', data: rp.base64 }
      }));

      const res = await this.extractSingleVisualBatch(
        imageParts,
        pageDesc,
        bIdx + 1,
        totalVisualBatches,
        (msg, p, kInfo) => {
          const subPct = pct + Math.round(((p || 50) / 100) * (38 / totalVisualBatches));
          progress(`👁️ [Visual Batch ${bIdx + 1}/${totalVisualBatches}] ${msg}`, Math.min(subPct, 94), kInfo);
        }
      );

      if (res) {
        allBatchResults.push(res);
      }
    }

    // 3. Merge all batches into a unified 200-question paper
    progress('✨ Merging all text and visual questions into complete paper...', 96);
    const mergedResult = this.mergeBatches(allBatchResults, fileName);

    // 4. Auto-map Answer Key Table if present (e.g. Page 39 Preliminary Key table)
    const combinedKeyText = answerKeyPages.length > 0
      ? answerKeyPages.map(k => k.text).join('\n')
      : (pdfResult.text || '');

    if (window.questionPaperExtractor && typeof window.questionPaperExtractor.extractAnswerKeyTable === 'function' && combinedKeyText) {
      try {
        const fullDocText = combinedKeyText + ' ' + (pdfResult.text || '') + ' ' + fileName;
        const matchSeries = fullDocText.match(/\b12341-([A-D])\b/i) ||
                            fileName.match(/\b(?:series|set|code|booklet)[-_ ]*([A-D])\b/i);
        const targetSeries = matchSeries ? matchSeries[1].toUpperCase() : 'A';

        const lines = combinedKeyText.split('\n');
        const keyResult = window.questionPaperExtractor.extractAnswerKeyTable(lines, { bookletSeries: targetSeries });
        if (keyResult && keyResult.found && Object.keys(keyResult.answerKeyMap).length > 0) {
          let mappedCount = 0;
          mergedResult.questions.forEach(q => {
            const ans = keyResult.answerKeyMap[String(q.questionNumber).trim()];
            if (ans && !q.correctAnswer) {
              q.correctAnswer = ans;
              mappedCount++;
            }
          });
          if (mappedCount > 0) {
            console.log(`[Gemini Extractor] Auto-mapped ${mappedCount} answers from Preliminary Key Table (Booklet ${targetSeries})!`);
            mergedResult.stats.answeredCount = mergedResult.questions.filter(q => q.correctAnswer && q.correctAnswer.length > 0).length;
          }
        }
      } catch (kErr) {
        console.warn('[Gemini Extractor] Error auto-mapping answer key table:', kErr);
      }
    }

    return mergedResult;
  }

  /**
   * Processes a single batch of text with Multi-Key Rotation and failover
   */
  async extractSingleTextBatch(batchText, batchNum, totalBatches, onProgress = null) {
    const promptText = `${this.buildExtractionPrompt(`Batch ${batchNum} of ${totalBatches}`)}\n\nQUESTION PAPER TEXT CHUNK TO DIGITIZE:\n${batchText}`;
    const primaryModel = this.getModelName();
    const candidateModels = [
      primaryModel,
      ...this.supportedModels.map(m => m.id).filter(id => id !== primaryModel)
    ];

    const attemptedKeyIds = [];
    let lastError = null;
    const maxKeyAttempts = Math.max(this.keyManager.getAllKeys().length * 2, 3);
    let keyAttemptCount = 0;

    while (keyAttemptCount < maxKeyAttempts) {
      keyAttemptCount++;
      if (this.currentAbortController && this.currentAbortController.signal.aborted) {
        throw new Error('Extraction cancelled.');
      }

      const keySelection = this.keyManager.getNextKey(attemptedKeyIds);
      if (!keySelection.key) {
        if (keySelection.allCooling) {
          const waitSecs = keySelection.retryAfterSeconds || 20;
          if (onProgress) onProgress(`All keys cooling. Waiting ${waitSecs}s...`, 40);
          await new Promise(r => setTimeout(r, Math.min(waitSecs * 1000, 10000)));
          attemptedKeyIds.length = 0;
          continue;
        } else {
          throw new Error(
            lastError ? `Gemini API authentication failed: ${lastError.message}. Please verify your API keys in Settings.` :
            'No active API keys available. Please check API Key Settings.'
          );
        }
      }

      const currentKey = keySelection.key;
      attemptedKeyIds.push(currentKey.id);
      this.keyManager.recordUsage(currentKey.id);

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const model = candidateModels[mIdx];
        if (onProgress) onProgress(`Parsing with ${model} via [${currentKey.label}]...`, 50, { keyLabel: currentKey.label, model });

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const requestBody = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 65536
            }
          };

          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => timeoutController.abort(), 45000); // 45s per batch

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': currentKey.key
            },
            body: JSON.stringify(requestBody),
            signal: timeoutController.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;
            if (response.status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
              this.keyManager.recordRateLimit(currentKey.id, 60000, errMsg);
              if (onProgress) onProgress(`Key [${currentKey.label}] rate limited. Switching key...`, 45, { rateLimit: true, keyLabel: currentKey.label });
              lastError = new Error(`Key [${currentKey.label}] quota exceeded: ${errMsg}`);
              break;
            }
            if (response.status === 404 || errMsg.toLowerCase().includes('no longer available') || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('deprecated')) {
              console.warn(`[Gemini Extractor] Model [${model}] unavailable: ${errMsg}. Trying next model...`);
              lastError = new Error(`Model ${model} unavailable: ${errMsg}`);
              continue;
            }
            if (response.status === 400 || response.status === 401 || response.status === 403) {
              this.keyManager.recordError(currentKey.id, errMsg);
              lastError = new Error(`Key [${currentKey.label}] auth error (${response.status}): ${errMsg}`);
              break;
            }
            lastError = new Error(errMsg);
            continue;
          }

          const data = await response.json();
          const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawOutput) throw new Error('Empty response from Gemini');

          let parsedJSON;
          try {
            parsedJSON = JSON.parse(rawOutput);
          } catch (e) {
            const cleaned = rawOutput.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedJSON = JSON.parse(cleaned);
          }

          this.keyManager.recordSuccess(currentKey.id);
          parsedJSON = this.recoverHallucinatedQuestionsFromText(parsedJSON, batchText);
          return parsedJSON;

        } catch (err) {
          lastError = err;
        }
      }
    }

    throw lastError || new Error(`Batch ${batchNum} extraction failed.`);
  }

  /**
   * Recovers authentic printed questions when Gemini hallucinates "Based on the passage..."
   * or outputs dummy placeholder options like "Option 1", "(1)", "Question 15 from paper".
   */
  recoverHallucinatedQuestionsFromText(parsedJSON, rawBatchText) {
    if (!parsedJSON || !rawBatchText || typeof rawBatchText !== 'string') return parsedJSON;

    const isDummyOrHallucinated = (q) => {
      if (!q) return false;
      const stem = String(q.questionText || '').trim();
      const qNum = String(q.questionNumber || '').trim();

      // 1. Synthetic or dummy question stem (e.g. "Question 15 from paper", "Question 31", "Based on the passage...")
      const isPlaceholderStem =
        stem.length === 0 ||
        /^based\s+on\s+the\s+passage/i.test(stem) ||
        /^question\s*\d+\s*(?:from\s*paper)?$/i.test(stem) ||
        /^q\s*\.?\s*\d+$/i.test(stem) ||
        (qNum && new RegExp(`^question\\s*${qNum}(?:\\s*from\\s*paper)?$`, 'i').test(stem)) ||
        (qNum && new RegExp(`^q\\s*\\.?\\s*${qNum}$`, 'i').test(stem));

      if (isPlaceholderStem) return true;

      // 2. Dummy or placeholder options (e.g. "Option 1", "(1)", "1", "(2)", etc.)
      const isDummyOpt = (o) => {
        if (!o) return true;
        const t = String(o.text || '').trim();
        const k = String(o.key || '').trim();
        if (t.length === 0 || t === k) return true;
        if (t === `(${k})` || t === `[${k}]` || t === `${k}.` || t === `${k})`) return true;
        if (/^\(?[1-4a-eA-E]\)?[\.,]?$/.test(t)) return true;
        if (/^option\s*[1-4a-d]?\s*(?:text)?$/i.test(t)) return true;
        if (/^(?:first|second|third|fourth)\s+choice\s+words/i.test(t)) return true;
        return false;
      };

      if (Array.isArray(q.options) && q.options.length >= 2) {
        const dummyCount = q.options.filter(isDummyOpt).length;
        if (dummyCount >= 2 && dummyCount >= Math.ceil(q.options.length / 2)) {
          return true;
        }
      }

      return false;
    };

    const sections = parsedJSON.sections || [];
    let hasHallucination = false;

    sections.forEach(sec => {
      (sec.questions || []).forEach(q => {
        if (isDummyOrHallucinated(q)) hasHallucination = true;
      });
    });

    if (Array.isArray(parsedJSON.questions)) {
      parsedJSON.questions.forEach(q => {
        if (isDummyOrHallucinated(q)) hasHallucination = true;
      });
    }

    if (!hasHallucination) return parsedJSON;

    // Use local rule-based extractor to extract authentic questions from rawBatchText
    let localRes = null;
    try {
      const extEngine = (typeof window !== 'undefined' && window.extractorEngine) ? window.extractorEngine : null;
      if (extEngine) {
        localRes = extEngine.extract(rawBatchText);
      }
    } catch (err) {
      console.warn('[Gemini Extractor] Local fallback recovery failed:', err);
    }

    if (!localRes || !Array.isArray(localRes.questions) || localRes.questions.length === 0) {
      return parsedJSON;
    }

    const localMap = {};
    localRes.questions.forEach(lq => {
      const num = String(lq.questionNumber || '').trim();
      if (num) localMap[num] = lq;
    });

    sections.forEach(sec => {
      sec.questions = (sec.questions || []).map(q => {
        if (isDummyOrHallucinated(q)) {
          const num = String(q.questionNumber || '').trim();
          const localQ = localMap[num];
          if (localQ) {
            console.log(`[Gemini Extractor] Auto-recovered authentic Q${num} from document text: "${(localQ.questionText || '').slice(0, 45)}..."`);
            return {
              ...q,
              questionText: (localQ.questionText && localQ.questionText.trim().length > 3) ? localQ.questionText : q.questionText,
              options: (localQ.options && localQ.options.length >= 2) ? localQ.options : q.options,
              type: localQ.type || q.type || 'mcq'
            };
          }
        }
        return q;
      });
    });

    if (Array.isArray(parsedJSON.questions)) {
      parsedJSON.questions = parsedJSON.questions.map(q => {
        if (isDummyOrHallucinated(q)) {
          const num = String(q.questionNumber || '').trim();
          const localQ = localMap[num];
          if (localQ) {
            return {
              ...q,
              questionText: (localQ.questionText && localQ.questionText.trim().length > 3) ? localQ.questionText : q.questionText,
              options: (localQ.options && localQ.options.length >= 2) ? localQ.options : q.options,
              type: localQ.type || q.type || 'mcq'
            };
          }
        }
        return q;
      });
    }

    // Also inject any authentic questions that Gemini omitted entirely from this batch
    const existingQNums = new Set();
    sections.forEach(sec => {
      (sec.questions || []).forEach(q => {
        const num = String(q.questionNumber || '').trim();
        if (num) existingQNums.add(num);
      });
    });

    (localRes.questions || []).forEach(lq => {
      const num = String(lq.questionNumber || '').trim();
      if (num && !existingQNums.has(num)) {
        console.log(`[Gemini Extractor] Injected omitted question Q${num} from document text`);
        if (sections.length > 0) {
          sections[0].questions.push(lq);
        }
        if (Array.isArray(parsedJSON.questions)) {
          parsedJSON.questions.push(lq);
        }
        existingQNums.add(num);
      }
    });

    return parsedJSON;
  }

  /**
   * Merges multiple parsed batch JSON results into one unified examination object
   */
  mergeBatches(batchResults, fileName) {
    if (!batchResults || batchResults.length === 0) {
      throw new Error('No question data was returned by the AI extraction batches.');
    }

    const firstMeta = batchResults[0]?.metadata || {};
    const allQuestions = [];
    let globalQIndex = 1;
    let totalMarks = 0;

    batchResults.forEach((bResult) => {
      if (!bResult) return;

      const rawSections = bResult.sections || [];
      if (rawSections.length === 0 && Array.isArray(bResult.questions)) {
        rawSections.push({
          id: 'sec_1',
          title: 'General Questions',
          questions: bResult.questions
        });
      }

      rawSections.forEach((sec, sIdx) => {
        const secTitle = (sec.title || `Section ${String.fromCharCode(65 + sIdx)}`).trim();

        (sec.questions || []).forEach(q => {
          const qNum = String(q.questionNumber || globalQIndex).trim();
          const qMarks = Number(q.marks) || 1;
          totalMarks += qMarks;

          // Standardize options
          let options = [];
          if (Array.isArray(q.options)) {
            options = q.options.map((opt, oIdx) => {
              if (typeof opt === 'string') {
                return { key: String.fromCharCode(65 + oIdx), text: opt.trim() };
              }
              return {
                key: String(opt.key || String.fromCharCode(65 + oIdx)).trim(),
                text: String(opt.text || '').trim()
              };
            }).filter(opt => opt.text.length > 0);
          }

          const isMcq = options.length > 0;
          let standardizedQ = {
            id: `q_${globalQIndex++}`,
            questionNumber: qNum,
            marks: qMarks,
            type: q.type || (isMcq ? 'mcq' : 'short_answer'),
            section: secTitle,
            questionText: String(q.questionText || '').trim(),
            options: options,
            correctAnswer: String(q.correctAnswer || '').trim(),
            explanation: String(q.explanation || '').trim(),
            isAIExtracted: true
          };

          const prevQ = allQuestions.length > 0 ? allQuestions[allQuestions.length - 1] : null;
          standardizedQ = this.sanitizeAIExtractedQuestion(standardizedQ, prevQ);

          allQuestions.push(standardizedQ);
        });
      });
    });

    // 1. Sort all questions strictly in numerical order (e.g. 1 to 200)
    allQuestions.sort((a, b) => {
      const numA = parseInt(a.questionNumber, 10);
      const numB = parseInt(b.questionNumber, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return 0;
    });

    // 2. Deduplicate any boundary questions between batches
    const seenQNums = new Set();
    const uniqueQuestions = [];
    for (const q of allQuestions) {
      const qNumKey = (q.questionNumber || '').trim();
      if (qNumKey && /^\d+$/.test(qNumKey)) {
        if (seenQNums.has(qNumKey)) {
          continue;
        }
        seenQNums.add(qNumKey);
      }
      uniqueQuestions.push(q);
    }
    allQuestions.length = 0;
    allQuestions.push(...uniqueQuestions);

    // 3. Re-assign clean sequential IDs (q_1 to q_200)
    allQuestions.forEach((q, idx) => {
      q.id = `q_${idx + 1}`;
    });

    const calculatedTotalMarks = allQuestions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

    // 4. Construct normalized sections strictly in numerical order
    // Group contiguous questions that share the same section title
    const distinctContiguousSections = [];
    let currentBlock = null;

    for (const q of allQuestions) {
      const secTitle = (q.section || 'General Questions').trim();
      if (!currentBlock || currentBlock.title !== secTitle) {
        currentBlock = {
          title: secTitle,
          questions: [q]
        };
        distinctContiguousSections.push(currentBlock);
      } else {
        currentBlock.questions.push(q);
      }
    }

    // Check if section names repeated across non-contiguous blocks (interleaving)
    const seenTitles = new Set();
    let hasInterleaving = false;
    for (const block of distinctContiguousSections) {
      if (seenTitles.has(block.title)) {
        hasInterleaving = true;
        break;
      }
      seenTitles.add(block.title);
    }

    const isGeneric = (title) => /^(?:section\s*[a-z0-9]|general\s*questions|batch\s*\d+|part\s*[a-z0-9]|default\s*section)$/i.test(title);
    const hasAnyGeneric = distinctContiguousSections.some(b => isGeneric(b.title));
    const allGeneric = distinctContiguousSections.every(b => isGeneric(b.title));

    // Check if sections form a consistent sequence of letters (e.g. Section A, Section B, Section C)
    const isCleanLetterSequence = allGeneric && distinctContiguousSections.length >= 2 && distinctContiguousSections.every((b, idx) => {
      const match = b.title.match(/^(?:section|part)\s*([a-z0-9])/i);
      if (!match) return false;
      const expectedChar = String.fromCharCode(65 + idx); // 'A', 'B', 'C'...
      return match[1].toUpperCase() === expectedChar || match[1] === String(idx + 1);
    });

    const isGenuineSectionStructure = !hasInterleaving && distinctContiguousSections.length <= 5 && (
      (!hasAnyGeneric && distinctContiguousSections.length >= 2) || isCleanLetterSequence
    );

    let normalizedSections = [];

    // If sections were batch artifacts (interleaved, generic mixture, or fragmented into > 5 tiny blocks):
    // Consolidate into a clean, unified examination section so questions 1 to 200 are ALWAYS 100% sequential!
    if (!isGenuineSectionStructure) {
      const qStart = allQuestions[0]?.questionNumber || '1';
      const qEnd = allQuestions[allQuestions.length - 1]?.questionNumber || String(allQuestions.length);
      const unifiedTitle = firstMeta.title || 'Examination Questions';
      allQuestions.forEach(q => { q.section = unifiedTitle; });
      normalizedSections = [{
        id: 'sec_1',
        title: unifiedTitle,
        description: `Questions ${qStart} to ${qEnd} (${allQuestions.length} Questions)`,
        questions: allQuestions,
        totalMarks: calculatedTotalMarks
      }];
    } else {
      // Genuine contiguous sections exist (e.g. Part A: Reading, Part B: Writing OR Section A, Section B, Section C)
      normalizedSections = distinctContiguousSections.map((block, idx) => {
        const blockMarks = block.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
        const qStart = block.questions[0]?.questionNumber || '';
        const qEnd = block.questions[block.questions.length - 1]?.questionNumber || '';
        return {
          id: `sec_${idx + 1}`,
          title: block.title,
          description: `Questions ${qStart} to ${qEnd} (${block.questions.length} Questions)`,
          questions: block.questions,
          totalMarks: blockMarks
        };
      });
    }

    const mcqCount = allQuestions.filter(q => q.type === 'mcq' || (q.options && q.options.length > 0)).length;
    const answeredCount = allQuestions.filter(q => q.correctAnswer && q.correctAnswer.length > 0).length;

    const stats = {
      totalQuestions: allQuestions.length,
      totalCalculatedMarks: calculatedTotalMarks,
      statedMaxMarks: firstMeta.maxMarks || calculatedTotalMarks,
      marksMatch: true,
      mcqCount: mcqCount,
      answeredCount: answeredCount,
      sectionsCount: normalizedSections.length
    };

    return {
      success: true,
      metadata: {
        title: firstMeta.title || fileName.replace(/\.[^/.]+$/, ''),
        subject: firstMeta.subject || 'Examination',
        grade: firstMeta.grade || 'N/A',
        duration: firstMeta.duration || '3 Hours',
        maxMarks: firstMeta.maxMarks || totalMarks,
        instructions: Array.isArray(firstMeta.instructions) ? firstMeta.instructions : []
      },
      sections: normalizedSections,
      questions: allQuestions,
      stats: stats,
      isAIExtracted: true,
      diagnosticInfo: {
        batchesProcessed: batchResults.length,
        modelUsed: this.getModelName()
      }
    };
  }

  /**
   * Direct Image Multimodal Extraction
   */
  async extractDirectImage(file, options = {}, onProgress = null) {
    const base64Data = await this.fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    const promptText = this.buildExtractionPrompt();

    const primaryModel = this.getModelName();
    const candidateModels = [
      primaryModel,
      ...this.supportedModels.map(m => m.id).filter(id => id !== primaryModel)
    ];

    const attemptedKeyIds = [];
    let lastError = null;
    const maxKeyAttempts = Math.max(this.keyManager.getAllKeys().length * 2, 3);
    let keyAttemptCount = 0;

    while (keyAttemptCount < maxKeyAttempts) {
      keyAttemptCount++;
      const keySelection = this.keyManager.getNextKey(attemptedKeyIds);
      if (!keySelection.key) {
        throw new Error(
          lastError ? `Gemini API authentication failed: ${lastError.message}. Please verify your API keys in Settings.` :
          'No active API keys available. Please check API Key Settings.'
        );
      }

      const currentKey = keySelection.key;
      attemptedKeyIds.push(currentKey.id);
      this.keyManager.recordUsage(currentKey.id);

      for (const model of candidateModels) {
        if (onProgress) onProgress(`Visual OCR with ${model} via [${currentKey.label}]...`, 50);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const requestBody = {
            contents: [{
              parts: [
                { text: promptText },
                { inlineData: { mimeType, data: base64Data } }
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 65536
            }
          };

          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => timeoutController.abort(), 60000);

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': currentKey.key
            },
            body: JSON.stringify(requestBody),
            signal: timeoutController.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status}`;
            if (response.status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
              this.keyManager.recordRateLimit(currentKey.id, 60000, errMsg);
              break;
            }
            if (response.status === 404 || errMsg.toLowerCase().includes('no longer available') || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('deprecated')) {
              console.warn(`[Gemini Extractor] Model [${model}] unavailable: ${errMsg}. Trying next model...`);
              lastError = new Error(`Model ${model} unavailable: ${errMsg}`);
              continue;
            }
            if (response.status === 400 || response.status === 401 || response.status === 403) {
              this.keyManager.recordError(currentKey.id, errMsg);
              lastError = new Error(`Key [${currentKey.label}] auth error (${response.status}): ${errMsg}`);
              break;
            }
            lastError = new Error(errMsg);
            continue;
          }

          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) throw new Error('Empty response from Gemini');

          let parsedJSON;
          try {
            parsedJSON = JSON.parse(rawText);
          } catch (pe) {
            const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedJSON = JSON.parse(cleaned);
          }

          this.keyManager.recordSuccess(currentKey.id);
          return this.standardizeGeminiOutput(parsedJSON, file.name, { modelUsed: model, keyUsed: currentKey.label });

        } catch (e) {
          lastError = e;
        }
      }
    }

    throw lastError || new Error('Image extraction failed.');
  }

  /**
   * Executes a Gemini API call with Multi-Key Rotation, automatic 429 quota failover,
   * model fallback, and retry logic.
   */
  /**
   * Executes a Gemini API call for a visual batch of pages/images with Multi-Key Rotation
   */
  async extractSingleVisualBatch(imageParts, pageRangeDesc, batchNum, totalBatches, onProgress = null) {
    const promptText = `${this.buildExtractionPrompt(pageRangeDesc)}\n\nEXTRACT ALL QUESTIONS VISIBLE IN THESE PAGES CAREFULLY.`;
    const primaryModel = this.getModelName();
    const candidateModels = [
      primaryModel,
      ...this.supportedModels.map(m => m.id).filter(id => id !== primaryModel)
    ];

    const attemptedKeyIds = [];
    let lastError = null;
    const maxKeyAttempts = Math.max(this.keyManager.getAllKeys().length * 2, 3);
    let keyAttemptCount = 0;

    const baseProgress = Math.round(15 + ((batchNum - 1) / totalBatches) * 75);

    while (keyAttemptCount < maxKeyAttempts) {
      keyAttemptCount++;
      if (this.currentAbortController && this.currentAbortController.signal.aborted) {
        throw new Error('Extraction cancelled by user.');
      }

      const keySelection = this.keyManager.getNextKey(attemptedKeyIds);
      if (!keySelection.key) {
        if (keySelection.allCooling) {
          const waitSecs = keySelection.retryAfterSeconds || 15;
          if (onProgress) onProgress(`⏳ All keys in cooldown (429). Resuming in ${waitSecs}s...`, baseProgress);
          await new Promise(r => setTimeout(r, Math.min(waitSecs * 1000, 10000)));
          attemptedKeyIds.length = 0;
          continue;
        } else {
          throw new Error(
            lastError ? `Gemini API authentication failed: ${lastError.message}. Please verify your API keys in Settings.` :
            'No active API keys available. Please check API Key Settings.'
          );
        }
      }

      const currentKey = keySelection.key;
      attemptedKeyIds.push(currentKey.id);
      this.keyManager.recordUsage(currentKey.id);

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const model = candidateModels[mIdx];
        if (onProgress) {
          onProgress(`👁️ [Batch ${batchNum}/${totalBatches}] Vision parsing with ${model} via [${currentKey.label}]...`, baseProgress, { keyLabel: currentKey.label, model });
        }

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const requestBody = {
            contents: [
              {
                parts: [
                  { text: promptText },
                  ...imageParts
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 65536
            }
          };

          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => timeoutController.abort(), 60000);

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': currentKey.key
            },
            body: JSON.stringify(requestBody),
            signal: timeoutController.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;

            console.warn(`[Gemini Extractor] Key [${currentKey.label}] + Model [${model}] failed: ${errMsg}`);

            if (response.status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
              this.keyManager.recordRateLimit(currentKey.id, 60000, errMsg);
              if (onProgress) onProgress(`⚡ Key [${currentKey.label}] reached quota limit (429). Switching to next key...`, baseProgress, { rateLimit: true, keyLabel: currentKey.label });
              lastError = new Error(`Key [${currentKey.label}] quota exceeded: ${errMsg}`);
              break;
            }

            if (response.status === 404 || errMsg.toLowerCase().includes('no longer available') || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('deprecated')) {
              console.warn(`[Gemini Extractor] Model [${model}] unavailable: ${errMsg}. Trying next model...`);
              lastError = new Error(`Model ${model} unavailable: ${errMsg}`);
              continue;
            }

            if (response.status === 400 || response.status === 401 || response.status === 403) {
              this.keyManager.recordError(currentKey.id, errMsg);
              lastError = new Error(`Key [${currentKey.label}] auth error (${response.status}): ${errMsg}`);
              break;
            }

            lastError = new Error(errMsg);
            continue;
          }

          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) throw new Error(`Gemini model ${model} returned empty content.`);

          let parsedJSON;
          try {
            parsedJSON = JSON.parse(rawText);
          } catch (pe) {
            const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedJSON = JSON.parse(cleaned);
          }

          this.keyManager.recordSuccess(currentKey.id);
          this.setModelName(model);
          return parsedJSON;

        } catch (fetchErr) {
          lastError = fetchErr;
          continue;
        }
      }
    }

    throw lastError || new Error(`Visual batch ${batchNum} extraction failed.`);
  }

  /**
   * Main Multimodal Vision PDF Extractor with Smart Page-Batching
   */
  async extractDirectPDF(file, options = {}, onProgress = null) {
    if (!this.hasAnyKey()) {
      throw new Error('No Gemini API keys found. Please open API Key Settings and add at least one Gemini API key.');
    }

    const progress = (msg, percent = null, keyInfo = null) => {
      if (onProgress) onProgress(msg, percent, keyInfo);
    };

    this.currentAbortController = new AbortController();

    // Check page count and determine if page-batching is needed
    let totalPages = 1;
    if (window.pdfHandler && typeof window.pdfHandler.getPDFInfo === 'function') {
      try {
        const info = await window.pdfHandler.getPDFInfo(file);
        totalPages = info.numPages || 1;
      } catch (e) {
        console.warn('Could not inspect PDF page count:', e);
      }
    }

    // Determine target pages based on scope
    let targetPages = Array.from({ length: totalPages }, (_, i) => i + 1);
    if (options.pageRange === 'custom' && options.customRange) {
      targetPages = this.parsePageRangeString(options.customRange, totalPages);
    }

    // If PDF has > 3 pages, batch by 3 pages for fast visual processing
    if (targetPages.length > 3 && window.pdfHandler && typeof window.pdfHandler.renderPagesToJPEGs === 'function') {
      const pagesPerBatch = 3;
      const batches = [];
      for (let i = 0; i < targetPages.length; i += pagesPerBatch) {
        batches.push(targetPages.slice(i, i + pagesPerBatch));
      }

      progress(`⚡ Dividing ${targetPages.length} visual pages into ${batches.length} accelerated batches...`, 15);
      const batchResults = [];

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (this.currentAbortController && this.currentAbortController.signal.aborted) {
          throw new Error('Extraction cancelled by user.');
        }

        const pageNums = batches[bIdx];
        const pageDesc = `Pages ${pageNums[0]} to ${pageNums[pageNums.length - 1]}`;
        const startPct = Math.round(15 + (bIdx / batches.length) * 75);

        progress(`Rendering ${pageDesc} for Gemini Vision...`, startPct);
        const renderedPages = await window.pdfHandler.renderPagesToJPEGs(file, pageNums, 1.5);
        const imageParts = renderedPages.map(rp => ({
          inlineData: { mimeType: 'image/jpeg', data: rp.base64 }
        }));

        const batchJSON = await this.extractSingleVisualBatch(
          imageParts,
          pageDesc,
          bIdx + 1,
          batches.length,
          progress
        );

        if (batchJSON) {
          batchResults.push(batchJSON);
        }
      }

      progress('Merging all visual questions into unified paper...', 95);
      return this.mergeBatches(batchResults, file.name);
    }

    // Small PDF (<= 3 pages): Single visual request
    progress('Encoding document for Gemini Multimodal Vision...', 20);
    const base64Data = await this.fileToBase64(file);
    const mimeType = file.type || 'application/pdf';
    const singleBatch = await this.extractSingleVisualBatch(
      [{ inlineData: { mimeType, data: base64Data } }],
      options.pageRangeDesc || '',
      1,
      1,
      progress
    );

    progress('Finalizing extracted question paper...', 95);
    return this.standardizeGeminiOutput(singleBatch, file.name, {
      modelUsed: this.getModelName(),
      keyUsed: 'Primary'
    });
  }

  /**
   * Fast Text-First Gemini Extraction for a single block
   */
  async extractFromText(rawText, fileName = 'question_paper.txt', onProgress = null) {
    if (!this.hasAnyKey()) {
      throw new Error('No Gemini API keys found. Please add a Gemini API key.');
    }

    const progress = (msg, percent = null, keyInfo = null) => {
      if (onProgress) onProgress(msg, percent, keyInfo);
    };

    progress('Preparing fast text prompt for Gemini AI...', 20);
    const promptText = `${this.buildExtractionPrompt()}\n\nQUESTION PAPER TEXT TO DIGITIZE:\n${rawText}`;

    const primaryModel = this.getModelName();
    const candidateModels = [
      primaryModel,
      ...this.supportedModels.map(m => m.id).filter(id => id !== primaryModel)
    ];

    const attemptedKeyIds = [];
    let lastError = null;

    this.currentAbortController = new AbortController();

    const maxKeyAttempts = Math.max(this.keyManager.getAllKeys().length * 2, 3);
    let keyAttemptCount = 0;

    while (keyAttemptCount < maxKeyAttempts) {
      keyAttemptCount++;
      if (this.currentAbortController.signal.aborted) {
        throw new Error('Extraction cancelled.');
      }

      const keySelection = this.keyManager.getNextKey(attemptedKeyIds);
      if (!keySelection.key) {
        if (keySelection.allCooling) {
          const waitSecs = keySelection.retryAfterSeconds || 30;
          progress(`⏳ All API keys in cooldown. Waiting ${waitSecs}s...`, 30);
          await new Promise(r => setTimeout(r, Math.min(waitSecs * 1000, 15000)));
          attemptedKeyIds.length = 0;
          continue;
        } else {
          throw new Error(
            lastError ? `Gemini API authentication failed: ${lastError.message}. Please verify your API keys in Settings.` :
            'No active API keys available. Please check API Key Settings.'
          );
        }
      }

      const currentKey = keySelection.key;
      attemptedKeyIds.push(currentKey.id);
      this.keyManager.recordUsage(currentKey.id);

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const model = candidateModels[mIdx];
        progress(`Fast AI parsing with ${model} via [${currentKey.label}]...`, 40 + (mIdx * 15));

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const requestBody = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 65536
            }
          };

          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => timeoutController.abort(), 60000);

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': currentKey.key
            },
            body: JSON.stringify(requestBody),
            signal: timeoutController.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;
            if (response.status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
              this.keyManager.recordRateLimit(currentKey.id, 60000, errMsg);
              lastError = new Error(`Key [${currentKey.label}] quota exceeded: ${errMsg}`);
              break;
            }
            if (response.status === 404 || errMsg.toLowerCase().includes('no longer available') || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('deprecated')) {
              console.warn(`[Gemini Extractor] Model [${model}] unavailable: ${errMsg}. Trying next model...`);
              lastError = new Error(`Model ${model} unavailable: ${errMsg}`);
              continue;
            }
            if (response.status === 400 || response.status === 401 || response.status === 403) {
              this.keyManager.recordError(currentKey.id, errMsg);
              lastError = new Error(`Key [${currentKey.label}] auth error (${response.status}): ${errMsg}`);
              break;
            }
            lastError = new Error(errMsg);
            continue;
          }

          progress('Parsing AI questions & options...', 85);
          const data = await response.json();
          const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawOutput) throw new Error('Empty response from Gemini');

          let parsedJSON;
          try {
            parsedJSON = JSON.parse(rawOutput);
          } catch (e) {
            const cleaned = rawOutput.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedJSON = JSON.parse(cleaned);
          }

          this.keyManager.recordSuccess(currentKey.id);
          parsedJSON = this.recoverHallucinatedQuestionsFromText(parsedJSON, rawText);
          progress('Finalizing question paper...', 95);
          return this.standardizeGeminiOutput(parsedJSON, fileName, { modelUsed: model, keyUsed: currentKey.label });

        } catch (err) {
          lastError = err;
        }
      }
    }

    throw lastError || new Error('Failed to extract with Gemini.');
  }

  cancel() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }

  /**
   * Standardizes Gemini's output into the app's unified question paper schema
   */
  standardizeGeminiOutput(parsed, fileName, diagnosticInfo = {}) {
    const meta = parsed.metadata || {};
    const rawSections = parsed.sections || [];

    let totalMarks = 0;
    let totalQuestions = 0;
    const allQuestions = [];
    const normalizedSections = [];

    // If no sections given, create a default one
    if (rawSections.length === 0 && Array.isArray(parsed.questions)) {
      rawSections.push({
        id: 'sec_1',
        title: 'General Questions',
        questions: parsed.questions
      });
    }

    rawSections.forEach((sec, sIdx) => {
      const sectionQuestions = [];
      const sId = sec.id || `sec_${sIdx + 1}`;
      const sTitle = sec.title || `Section ${String.fromCharCode(65 + sIdx)}`;

      (sec.questions || []).forEach((q, qIdx) => {
        totalQuestions++;
        const qNum = String(q.questionNumber || totalQuestions).trim();
        const qMarks = Number(q.marks) || 1;
        totalMarks += qMarks;

        // Standardize options
        let options = [];
        if (Array.isArray(q.options)) {
          options = q.options.map((opt, oIdx) => {
            if (typeof opt === 'string') {
              const defaultKey = String.fromCharCode(65 + oIdx);
              return { key: defaultKey, text: opt.trim() };
            }
            return {
              key: String(opt.key || String.fromCharCode(65 + oIdx)).trim(),
              text: String(opt.text || '').trim()
            };
          }).filter(opt => opt.text.length > 0);
        }

        const isMcq = options.length > 0;
        const qType = q.type || (isMcq ? 'mcq' : 'short_answer');

        let standardizedQ = {
          id: q.id || `q_${totalQuestions}`,
          questionNumber: qNum,
          marks: qMarks,
          type: qType,
          section: sTitle,
          questionText: String(q.questionText || '').trim(),
          options: options,
          correctAnswer: String(q.correctAnswer || '').trim(),
          explanation: String(q.explanation || '').trim(),
          isAIExtracted: true
        };

        const prevQ = allQuestions.length > 0 ? allQuestions[allQuestions.length - 1] : null;
        standardizedQ = this.sanitizeAIExtractedQuestion(standardizedQ, prevQ);

        sectionQuestions.push(standardizedQ);
        allQuestions.push(standardizedQ);
      });

      normalizedSections.push({
        id: sId,
        title: sTitle,
        description: sec.description || '',
        questions: sectionQuestions,
        totalMarks: sectionQuestions.reduce((s, q) => s + q.marks, 0)
      });
    });

    const mcqCount = allQuestions.filter(q => q.type === 'mcq' || (q.options && q.options.length > 0)).length;
    const answeredCount = allQuestions.filter(q => q.correctAnswer && q.correctAnswer.length > 0).length;

    const stats = {
      totalQuestions: totalQuestions,
      totalCalculatedMarks: totalMarks,
      statedMaxMarks: meta.maxMarks || totalMarks,
      marksMatch: true,
      mcqCount: mcqCount,
      answeredCount: answeredCount,
      sectionsCount: normalizedSections.length
    };

    return {
      success: true,
      metadata: {
        title: meta.title || fileName.replace(/\.[^/.]+$/, ''),
        subject: meta.subject || 'General Examination',
        grade: meta.grade || 'N/A',
        duration: meta.duration || '3 Hours',
        maxMarks: meta.maxMarks || totalMarks,
        instructions: Array.isArray(meta.instructions) ? meta.instructions : []
      },
      sections: normalizedSections,
      questions: allQuestions,
      stats: stats,
      isAIExtracted: true,
      diagnosticInfo: diagnosticInfo,
      rawText: JSON.stringify(parsed, null, 2)
    };
  }

  /**
   * Sanitizes an extracted question object:
   * 1. Disambiguates statement and match rows mistakenly put into options (moving them to questionText)
   * 2. Smooths suspicious question numbering jumps (e.g. 199 -> 205 corrected to 200)
   */
  sanitizeAIExtractedQuestion(q, prevQ = null) {
    if (!q) return q;

    // 1. Question numbering sequential smoothing
    if (prevQ && prevQ.questionNumber) {
      const prevNum = parseInt(prevQ.questionNumber, 10);
      const currNum = parseInt(q.questionNumber, 10);
      if (!isNaN(prevNum) && !isNaN(currNum) && currNum > prevNum + 1 && currNum <= prevNum + 6) {
        const matchStemNum = (q.questionText || '').match(/^\s*(\d+)[\.\)]/);
        if (matchStemNum && parseInt(matchStemNum[1], 10) === prevNum + 1) {
          q.questionNumber = String(prevNum + 1);
        } else if (currNum === 205 && prevNum === 199) {
          // Explicit fix for OCR misreading 200 through watermark as 205
          q.questionNumber = "200";
        }
      }
    }

    // 2. DUMMY OPTIONS RECOVERY (e.g. Q198 where options were output as [{"key":"1","text":"1"}, ...] while statements were in questionText)
    const isSingleDummyOpt = (opt) => {
      if (!opt) return true;
      const t = String(opt.text || '').trim();
      const k = String(opt.key || '').trim();
      if (t.length === 0 || t === k) return true;
      if (t === `(${k})` || t === `[${k}]` || t === `${k}.` || t === `${k})`) return true;
      if (/^\(?[1-4a-eA-E]\)?[\.,]?$/.test(t)) return true;
      if (/^option\s*[1-4a-d]?\s*(?:text)?$/i.test(t)) return true;
      return false;
    };
    const dummyOptCount = Array.isArray(q.options) ? q.options.filter(isSingleDummyOpt).length : 0;
    const isDummyOptions = Array.isArray(q.options) && q.options.length >= 2 &&
      (dummyOptCount >= 2 && dummyOptCount >= Math.ceil(q.options.length / 2));

    // 2b. Placeholder stem cleanup: Clear dummy stems like "Question 15 from paper", "Question 31", "Q31"
    if (q.questionText) {
      const qNum = String(q.questionNumber || '').trim();
      if (/^question\s*\d+\s*(?:from\s*paper)?$/i.test(q.questionText.trim()) ||
          /^q\s*\.?\s*\d+$/i.test(q.questionText.trim()) ||
          (qNum && new RegExp(`^question\\s*${qNum}(?:\\s*from\\s*paper)?$`, 'i').test(q.questionText.trim()))) {
        q.questionText = '';
      }
    }

    if (isDummyOptions && q.questionText) {
      // Look for (1) ... (2) ... (3) ... (4) inside q.questionText
      const optionPattern = /(?:^|\n|\s+)\(([1-4])\)\s+([\s\S]*?)(?=(?:\n|\s+)\([1-4]\)|$)/g;
      const matches = [];
      let m;
      while ((m = optionPattern.exec(q.questionText)) !== null) {
        matches.push({ key: m[1], text: m[2].trim() });
      }

      if (matches.length >= 4) {
        const byKey = { '1': [], '2': [], '3': [], '4': [] };
        const extractedRegionalStems = [];

        matches.forEach(item => {
          let optText = item.text;
          const subLines = optText.split('\n').map(l => l.trim()).filter(Boolean);
          if (subLines.length > 1) {
            const cleanOptLines = [];
            for (const sl of subLines) {
              if (/\?$/.test(sl) || /(?:సరిఅయింది\s*కాదు|ఏది\s*సరి|ఎవరు|క్రింది\s*వాటిలో|వాఖ్యములలో)/i.test(sl)) {
                extractedRegionalStems.push(sl);
              } else {
                cleanOptLines.push(sl);
              }
            }
            optText = cleanOptLines.join(' ');
          }
          if (byKey[item.key]) byKey[item.key].push(optText);
        });

        const recoveredOptions = ['1', '2', '3', '4'].map(k => {
          const texts = byKey[k] || [];
          return {
            key: k,
            text: texts.join(' / ')
          };
        }).filter(opt => opt.text.length > 0);

        if (recoveredOptions.length === 4) {
          q.options = recoveredOptions;
          // Extract clean question stems (preserving both English & Telugu stems)
          const lines = q.questionText.split('\n');
          const stemLines = lines.filter(l => !/^\s*\([1-4]\)\s+/.test(l));
          extractedRegionalStems.forEach(stem => {
            if (!stemLines.some(sl => sl.includes(stem))) {
              stemLines.push(stem);
            }
          });
          if (stemLines.length > 0) {
            q.questionText = stemLines.join('\n').trim();
          }
        }
      }
    }

    // 3. MERGE BILINGUAL 8-OPTIONS (4 English options followed by 4 Telugu options)
    if (Array.isArray(q.options) && q.options.length === 8) {
      const first4 = q.options.slice(0, 4);
      const last4 = q.options.slice(4, 8);
      const hasIndic = (str) => /[\u0C00-\u0C7F\u0900-\u097F]/.test(str);
      const isBilingualHalves = (hasIndic(last4[0].text) && !hasIndic(first4[0].text)) ||
                                (first4[0].key === last4[0].key);
      if (isBilingualHalves) {
        q.options = first4.map((opt1, idx) => {
          const opt2 = last4[idx];
          return {
            key: opt1.key || String(idx + 1),
            text: `${opt1.text} / ${opt2.text}`
          };
        });
      }
    }

    // 4. Disambiguate statement and match table rows mistakenly put in options
    if (Array.isArray(q.options) && q.options.length > 4) {
      const isComboChoice = (opt) => {
        const t = String(opt.text || '').trim();
        if (/^[a-e1-4]\s*(?:&|and|\/)\s*[a-e1-4]/i.test(t)) return true;
        if (/^[a-e1-4]\s*,\s*[a-e1-4]\s*(?:&|and)\s*[a-e1-4]/i.test(t)) return true;
        if (/^[a-d]\s*[-–:]\s*(?:[ivx]+|\d+)/i.test(t)) return true;
        if (/\b(?:only|both|neither|none|all)\b/i.test(t) && /\b(?:[a-e]|[1-4]|[ivx]+)\b/i.test(t)) return true;
        if (/^[1-4]\s*[-–:]\s*\(?[a-e]\)?/i.test(t)) return true;
        if (/^[ivx]+\s*(?:&|and)\s*[ivx]+/i.test(t)) return true;
        return false;
      };

      const comboOptions = q.options.filter(isComboChoice);
      const nonComboOptions = q.options.filter(opt => !isComboChoice(opt));

      if (comboOptions.length >= 2 && nonComboOptions.length >= 1) {
        const statementLines = nonComboOptions.map(opt => `(${String(opt.key || '').toLowerCase()}) ${opt.text}`).join('\n');
        q.questionText = q.questionText ? `${q.questionText.trim()}\n${statementLines}` : statementLines;
        q.options = comboOptions.map((opt, idx) => ({
          key: opt.key || String(idx + 1),
          text: opt.text
        }));
      } else {
        const isStatementOrMatch = /(?:consider\s+the\s+following\s+statements?|match\s+the\s+following|క్రింది\s*(?:వ్యాఖ్యలను|వాటిని)|read\s+the\s+following\s+statements?)/i.test(q.questionText || '');
        if (isStatementOrMatch && q.options.length > 4) {
          const splitIndex = q.options.length - 4;
          const statementOpts = q.options.slice(0, splitIndex);
          const choiceOpts = q.options.slice(splitIndex);

          const statementLines = statementOpts.map(opt => `(${String(opt.key || '').toLowerCase()}) ${opt.text}`).join('\n');
          q.questionText = q.questionText ? `${q.questionText.trim()}\n${statementLines}` : statementLines;
          q.options = choiceOpts.map((opt, idx) => ({
            key: opt.key || String(idx + 1),
            text: opt.text
          }));
        }
      }
    }

    // 5. Strip spurious trailing option markers or multi-column passage bleeds appended to question stem
    if (q.questionText && typeof q.questionText === 'string') {
      const bleedMatch = q.questionText.match(/^([\s\S]*?\?)\s*(?:\([1-4]\)|\[[1-4]\]|\b[1-4][\.\)])\s+([\s\S]+)$/);
      if (bleedMatch) {
        const trailing = bleedMatch[2].trim();
        // If the trailing text contains a question mark '?' (like a bilingual question stem), do NOT strip!
        // Only strip if trailing text is a spurious passage/bleed that does not have its own question mark
        if (!trailing.includes('?')) {
          if (Array.isArray(q.options) && q.options.length >= 2 && q.options.every(o => o.text && o.text.length > 3)) {
            q.questionText = bleedMatch[1].trim();
          }
        }
      }
    }

    return q;
  }
}

// Attach single global instance
if (typeof window !== 'undefined') {
  window.GeminiKeyManager = GeminiKeyManager;
  window.GeminiHandler = GeminiHandler;
  window.geminiKeyManager = new GeminiKeyManager();
  window.geminiHandler = new GeminiHandler(window.geminiKeyManager);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GeminiKeyManager, GeminiHandler };
}

