/**
 * Paper Vault - Client-Side Multi-Paper Repository
 * Uses browser IndexedDB for persistent storage of 50+ full-length question papers,
 * with graceful fallback to localStorage and file export/import.
 */

class PaperVault {
  constructor() {
    this.dbName = 'QuestionPaperVaultDB';
    this.dbVersion = 2;
    this.storeName = 'papers';
    this.analysisStoreName = 'analyses';
    this.foldersStoreName = 'folders';
    this.db = null;
    this.isReady = false;
    this.listeners = [];
    this.initPromise = this.initDB();
  }

  async initDB() {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[PaperVault] IndexedDB not available, using localStorage fallback.');
      this.isReady = true;
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            const paperStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
            paperStore.createIndex('timestamp', 'timestamp', { unique: false });
            paperStore.createIndex('year', 'year', { unique: false });
            paperStore.createIndex('subject', 'subject', { unique: false });
          }
          if (!db.objectStoreNames.contains(this.analysisStoreName)) {
            const analysisStore = db.createObjectStore(this.analysisStoreName, { keyPath: 'id' });
            analysisStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains(this.foldersStoreName)) {
            const folderStore = db.createObjectStore(this.foldersStoreName, { keyPath: 'id' });
            folderStore.createIndex('board', 'board', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isReady = true;
          this.notifyListeners();
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('[PaperVault] IndexedDB open error:', event.target.error);
          this.isReady = true; // Fallback to localStorage
          resolve(null);
        };
      } catch (err) {
        console.error('[PaperVault] Failed to open IndexedDB:', err);
        this.isReady = true;
        resolve(null);
      }
    });
  }

  addListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyListeners() {
    this.getAllPapersSummary().then(papers => {
      this.listeners.forEach(cb => {
        try { cb(papers); } catch (e) { console.error(e); }
      });
    }).catch(() => {});
  }

  /**
   * Smart auto-detection of Exam Board, Exam Name, Year, Paper Type, and Specialization Branch
   */
  detectClassification(text = '', metadata = {}, filename = '') {
    const title = (metadata.title || '').trim();
    const subject = (metadata.subject || '').trim();
    const inst = (metadata.institution || '').trim();
    const combined = `${title} ${subject} ${inst} ${filename || ''} ${text.substring(0, 1200)}`.toLowerCase();

    // 1. Detect State / Commission Board
    let board = 'State Board / Commission';
    if (/tgpsc|tspsc|telangana state public service/i.test(combined)) {
      board = 'TGPSC (Telangana Board)';
    } else if (/tslprb|telangana.*police|police.*telangana/i.test(combined)) {
      board = 'TSLPRB (Telangana Police)';
    } else if (/appsc|andhra pradesh public service/i.test(combined)) {
      board = 'APPSC (Andhra Pradesh)';
    } else if (/upsc|union public service/i.test(combined)) {
      board = 'UPSC';
    } else if (/\bssc\b|staff selection/i.test(combined)) {
      board = 'SSC';
    } else if (/cbse|central board/i.test(combined)) {
      board = 'CBSE';
    } else if (inst) {
      board = inst;
    }

    // 2. Detect Exam / Recruitment Name
    let exam = 'General Examination';
    if (/\baee\b|assistant executive engineer/i.test(combined)) {
      exam = 'AEE (Assistant Executive Engineer)';
    } else if (/constable/i.test(combined)) {
      exam = 'Police Constable';
    } else if (/\bsi\b|sub-inspector|sub inspector/i.test(combined)) {
      exam = 'Police Sub-Inspector (SI)';
    } else if (/group\s*[-–]?\s*1|group\s*i\b/i.test(combined)) {
      exam = 'Group-1 Services';
    } else if (/group\s*[-–]?\s*2|group\s*ii\b/i.test(combined)) {
      exam = 'Group-2 Services';
    } else if (/class\s*10|10th\b|matric/i.test(combined)) {
      exam = 'Class 10 Board Exam';
    } else if (/class\s*12|12th\b|intermediate/i.test(combined)) {
      exam = 'Class 12 Board Exam';
    } else if (title) {
      const cleaned = title.replace(/\b(19\d\d|20\d\d)\b/g, '').replace(/paper\s*[-–—:]?\s*[12]/gi, '').trim();
      if (cleaned.length > 3) exam = cleaned;
    }

    // 3. Detect Exam Year (4 digits: 19xx or 20xx)
    const yearMatch = combined.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? yearMatch[0] : (new Date().getFullYear().toString());

    // 4. Detect Paper Category, Code, and Specialization Branch
    let paperType = 'common';
    let paperCode = 'Paper 1';
    let specialization = 'General Studies & Mental Ability (GS&MA)';

    if (/civil\b|civil engineering/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Civil Engineering';
    } else if (/mechanical\b|mechanical engineering/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Mechanical Engineering';
    } else if (/electrical\b|electrical engineering|eee\b/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Electrical Engineering';
    } else if (/electronics|ece\b/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Electronics Engineering';
    } else if (/computer science|cs\b|python|information tech/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Computer Science';
    } else if (/mathematics|maths\b/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 1';
      specialization = 'Mathematics';
    } else if (/physics\b/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 1';
      specialization = 'Physics';
    } else if (/chemistry\b/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 1';
      specialization = 'Chemistry';
    } else if (/paper\s*[-–—:]?\s*(2|ii\b|two)|technical/i.test(combined)) {
      paperType = 'specialization';
      paperCode = 'Paper 2';
      specialization = 'Technical Discipline';
    } else {
      paperType = 'common';
      paperCode = 'Paper 1';
      specialization = 'General Studies & Mental Ability (GS&MA)';
    }

    // Explicit paper number override
    if (/paper\s*[-–—:]?\s*(1|i\b|one)/i.test(combined)) {
      paperCode = 'Paper 1';
    } else if (/paper\s*[-–—:]?\s*(2|ii\b|two)/i.test(combined)) {
      paperCode = 'Paper 2';
    } else if (/paper\s*[-–—:]?\s*(3|iii\b|three)/i.test(combined)) {
      paperCode = 'Paper 3';
    }

    return {
      board,
      exam,
      year,
      paperType,
      paperCode,
      specialization
    };
  }

  /**
   * Save or update an extracted paper in the vault with hierarchical classification
   */
  async savePaper(paperData, customMeta = {}) {
    await this.initPromise;

    if (!paperData) return { success: false, message: 'No paper data provided' };

    const title = customMeta.title || 
                  paperData.metadata?.title || 
                  paperData.exam_info?.title || 
                  'Question Paper';

    // Auto-detect classification or use overrides
    const sampleText = paperData.text || 
      (paperData.questions ? paperData.questions.slice(0, 5).map(q => q.questionText || '').join(' ') : '');
    const autoClass = this.detectClassification(sampleText, paperData.metadata || {}, customMeta.filename || '');

    const board = customMeta.board || paperData.board || autoClass.board;
    const exam = customMeta.exam || paperData.exam || autoClass.exam;
    const year = customMeta.year || paperData.year || autoClass.year;
    const paperType = customMeta.paperType || paperData.paperType || autoClass.paperType;
    const paperCode = customMeta.paperCode || paperData.paperCode || autoClass.paperCode;
    const specialization = customMeta.specialization || paperData.specialization || autoClass.specialization;

    // Calculate question count and total marks
    let totalQuestions = 0;
    let totalMarks = 0;

    if (paperData.sections && Array.isArray(paperData.sections)) {
      paperData.sections.forEach(s => {
        if (s.questions && Array.isArray(s.questions)) {
          totalQuestions += s.questions.length;
          s.questions.forEach(q => {
            totalMarks += (Number(q.marks) || 1);
          });
        }
      });
    } else if (paperData.questions && Array.isArray(paperData.questions)) {
      totalQuestions = paperData.questions.length;
      paperData.questions.forEach(q => {
        totalMarks += (Number(q.marks) || 1);
      });
    } else if (paperData.totalQuestions) {
      totalQuestions = paperData.totalQuestions;
      totalMarks = paperData.totalCalculatedMarks || paperData.statedMaxMarks || totalQuestions;
    }

    const id = customMeta.id || 
               paperData.id || 
               `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const record = {
      id,
      title: title.trim(),
      board,
      exam,
      year,
      paperType,
      paperCode,
      specialization,
      subject: customMeta.subject || paperData.metadata?.subject || specialization,
      totalQuestions,
      totalMarks: totalMarks || paperData.metadata?.maxMarks || 0,
      timestamp: Date.now(),
      filename: customMeta.filename || paperData.filename || `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`,
      source: customMeta.source || paperData.source || 'local_engine',
      paperData: JSON.parse(JSON.stringify(paperData))
    };

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(record);

        req.onsuccess = () => {
          this.notifyListeners();
          resolve({ success: true, id, paper: record });
        };
        req.onerror = (e) => {
          console.error('[PaperVault] Store error:', e);
          this.fallbackSave(record);
          resolve({ success: true, id, paper: record });
        };
      });
    } else {
      this.fallbackSave(record);
      this.notifyListeners();
      return { success: true, id, paper: record };
    }
  }

  /**
   * Get all full stored papers
   */
  async getAllPapers() {
    await this.initPromise;

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.timestamp - a.timestamp));
        req.onerror = () => resolve(this.fallbackGetAllFull());
      });
    } else {
      return this.fallbackGetAllFull();
    }
  }

  /**
   * Get metadata summary of all stored papers (lightweight, no question bodies)
   */
  async getAllPapersSummary() {
    await this.initPromise;

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = (req.result || []).map(p => ({
            id: p.id,
            title: p.title,
            board: p.board || 'State Board / Commission',
            exam: p.exam || 'General Examination',
            year: p.year || 'N/A',
            paperType: p.paperType || 'common',
            paperCode: p.paperCode || 'Paper 1',
            specialization: p.specialization || p.subject || 'General Studies',
            subject: p.subject,
            totalQuestions: p.totalQuestions,
            totalMarks: p.totalMarks,
            timestamp: p.timestamp,
            filename: p.filename,
            source: p.source
          })).sort((a, b) => b.timestamp - a.timestamp);
          resolve(list);
        };
        req.onerror = () => {
          resolve(this.fallbackGetAllSummary());
        };
      });
    } else {
      return this.fallbackGetAllSummary();
    }
  }

  /**
   * Group papers by: Board ➔ Exam ➔ Paper / Specialization Branch ➔ Exam Years
   * Exactly matching student study needs (Paper is container, Years are inside!)
   */
  async getPapersGroupedByHierarchy() {
    const papers = await this.getAllPapersSummary();
    const customFolders = await this.getCustomFolders();
    const hierarchy = {};

    // 1. Seed with registered custom folders (even if empty)
    customFolders.forEach(f => {
      const board = f.board || 'State Board / Commission';
      const exam = f.exam || 'General Examination';
      const isCommon = f.paperType === 'common';
      const specName = f.specialization || (isCommon ? 'General Studies & Mental Ability (GS&MA)' : 'Technical Discipline');
      const paperKey = f.paperKey || (isCommon ? 'common_paper_1' : `spec_${specName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
      const paperDisplayName = isCommon 
        ? (f.paperCode ? `${f.paperCode}: ${specName} (Common Paper - All Branches)` : `Common Paper: ${specName}`)
        : (f.paperCode ? `${f.paperCode}: ${specName} (Specialization Paper)` : `Specialization: ${specName}`);

      if (!hierarchy[board]) hierarchy[board] = {};
      if (!hierarchy[board][exam]) hierarchy[board][exam] = {
        examName: exam,
        papers: {}
      };

      if (!hierarchy[board][exam].papers[paperKey]) {
        hierarchy[board][exam].papers[paperKey] = {
          folderId: f.id,
          paperKey,
          displayName: paperDisplayName,
          paperType: f.paperType || (isCommon ? 'common' : 'specialization'),
          paperCode: f.paperCode || (isCommon ? 'Paper 1' : 'Paper 2'),
          specialization: specName,
          board,
          exam,
          years: {}
        };
      }
    });

    // 2. Populate with actual saved papers
    papers.forEach(p => {
      const board = p.board || 'State Board / Commission';
      const exam = p.exam || 'General Examination';
      const isCommon = p.paperType === 'common';
      const specName = p.specialization || (isCommon ? 'General Studies & Mental Ability (GS&MA)' : 'Technical Discipline');
      const paperKey = isCommon ? 'common_paper_1' : `spec_${specName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const paperDisplayName = isCommon 
        ? (p.paperCode ? `${p.paperCode}: ${specName} (Common Paper - All Branches)` : `Common Paper: ${specName}`)
        : (p.paperCode ? `${p.paperCode}: ${specName} (Specialization Paper)` : `Specialization: ${specName}`);
      const year = p.year || 'Unknown Year';

      if (!hierarchy[board]) hierarchy[board] = {};
      if (!hierarchy[board][exam]) hierarchy[board][exam] = {
        examName: exam,
        papers: {}
      };

      if (!hierarchy[board][exam].papers[paperKey]) {
        hierarchy[board][exam].papers[paperKey] = {
          paperKey,
          displayName: paperDisplayName,
          paperType: p.paperType || (isCommon ? 'common' : 'specialization'),
          paperCode: p.paperCode || (isCommon ? 'Paper 1' : 'Paper 2'),
          specialization: specName,
          board,
          exam,
          years: {}
        };
      }

      if (!hierarchy[board][exam].papers[paperKey].years[year]) {
        hierarchy[board][exam].papers[paperKey].years[year] = [];
      }
      hierarchy[board][exam].papers[paperKey].years[year].push(p);
    });

    return hierarchy;
  }

  /**
   * Register a new custom Exam / Paper folder
   */
  async createFolder(folderDef = {}) {
    await this.initPromise;
    const board = (folderDef.board || 'State Board / Commission').trim();
    const exam = (folderDef.exam || 'General Examination').trim();
    const paperType = folderDef.paperType || 'common';
    const paperCode = (folderDef.paperCode || (paperType === 'common' ? 'Paper 1' : 'Paper 2')).trim();
    const specialization = (folderDef.specialization || (paperType === 'common' ? 'General Studies & Mental Ability (GS&MA)' : 'Technical Discipline')).trim();
    const paperKey = paperType === 'common' ? 'common_paper_1' : `spec_${specialization.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const id = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const folderRecord = {
      id,
      board,
      exam,
      paperType,
      paperCode,
      specialization,
      paperKey,
      createdAt: Date.now()
    };

    if (this.db && this.db.objectStoreNames.contains(this.foldersStoreName)) {
      try {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction([this.foldersStoreName], 'readwrite');
          const store = tx.objectStore(this.foldersStoreName);
          const req = store.put(folderRecord);
          req.onsuccess = () => resolve();
          req.onerror = (e) => reject(e);
        });
      } catch (e) {
        this.fallbackSaveFolder(folderRecord);
      }
    } else {
      this.fallbackSaveFolder(folderRecord);
    }

    this.notifyListeners();
    return { success: true, folder: folderRecord };
  }

  /**
   * Get all registered custom folders
   */
  async getCustomFolders() {
    await this.initPromise;
    if (this.db && this.db.objectStoreNames.contains(this.foldersStoreName)) {
      try {
        return await new Promise((resolve) => {
          const tx = this.db.transaction([this.foldersStoreName], 'readonly');
          const store = tx.objectStore(this.foldersStoreName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(this.fallbackGetFolders());
        });
      } catch (e) {
        return this.fallbackGetFolders();
      }
    } else {
      return this.fallbackGetFolders();
    }
  }

  fallbackGetFolders() {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('paper_vault_folders') || '[]');
    } catch (e) {
      return [];
    }
  }

  fallbackSaveFolder(folderRecord) {
    if (typeof localStorage === 'undefined') return;
    try {
      const folders = this.fallbackGetFolders();
      const idx = folders.findIndex(f => f.board === folderRecord.board && f.exam === folderRecord.exam && f.paperKey === folderRecord.paperKey);
      if (idx >= 0) {
        folders[idx] = folderRecord;
      } else {
        folders.push(folderRecord);
      }
      localStorage.setItem('paper_vault_folders', JSON.stringify(folders));
    } catch (e) {
      console.warn('[PaperVault] Could not save folder to localStorage:', e);
    }
  }

  async deleteFolder(folderKeyOrId) {
    await this.initPromise;
    if (this.db && this.db.objectStoreNames.contains(this.foldersStoreName)) {
      try {
        await new Promise((resolve) => {
          const tx = this.db.transaction([this.foldersStoreName], 'readwrite');
          const store = tx.objectStore(this.foldersStoreName);
          const req = store.delete(folderKeyOrId);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
      try {
        let folders = this.fallbackGetFolders();
        folders = folders.filter(f => f.id !== folderKeyOrId && f.paperKey !== folderKeyOrId);
        localStorage.setItem('paper_vault_folders', JSON.stringify(folders));
      } catch (e) {}
    }
    this.notifyListeners();
    return true;
  }

  /**
   * Update classification tags (Board, Exam, Year, Paper Type, Specialization Branch)
   */
  async updatePaperClassification(paperId, updates = {}) {
    await this.initPromise;
    let paperRecord = await this.getPaper(paperId);
    if (!paperRecord) return { success: false, message: 'Paper not found' };

    if (updates.board !== undefined) paperRecord.board = updates.board.trim();
    if (updates.exam !== undefined) paperRecord.exam = updates.exam.trim();
    if (updates.year !== undefined) paperRecord.year = updates.year.trim();
    if (updates.paperType !== undefined) paperRecord.paperType = updates.paperType;
    if (updates.paperCode !== undefined) paperRecord.paperCode = updates.paperCode.trim();
    if (updates.specialization !== undefined) paperRecord.specialization = updates.specialization.trim();
    if (updates.title !== undefined) paperRecord.title = updates.title.trim();

    if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const req = tx.objectStore(this.storeName).put(paperRecord);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
      });
    } else {
      this.fallbackSave(paperRecord);
    }

    this.notifyListeners();
    return { success: true, paper: paperRecord };
  }

  /**
   * Get full paper data including all questions by id
   */
  async getPaper(id) {
    await this.initPromise;

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(this.fallbackGet(id));
      });
    } else {
      return this.fallbackGet(id);
    }
  }

  /**
   * Delete a paper from the vault
   */
  async deletePaper(id) {
    await this.initPromise;

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(id);

        req.onsuccess = () => {
          this.notifyListeners();
          resolve(true);
        };
        req.onerror = () => {
          this.fallbackDelete(id);
          this.notifyListeners();
          resolve(true);
        };
      });
    } else {
      this.fallbackDelete(id);
      this.notifyListeners();
      return true;
    }
  }

  /**
   * Clear all papers in vault
   */
  async clearVault() {
    await this.initPromise;
    if (this.db) {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      tx.objectStore(this.storeName).clear();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('paper_vault_items');
      localStorage.removeItem('paper_vault_analyses');
    }
    this.notifyListeners();
  }

  /**
   * Export all stored papers as a single downloadable JSON backup
   */
  async exportVaultBackup() {
    await this.initPromise;
    let allPapers = [];

    if (this.db) {
      allPapers = await new Promise((resolve) => {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      allPapers = this.fallbackGetAllFull();
    }

    const backup = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      count: allPapers.length,
      papers: allPapers
    };

    const jsonStr = JSON.stringify(backup, null, 2);

    if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PaperVault_Backup_${allPapers.length}_Papers_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
    return jsonStr;
  }

  /**
   * Import papers from a backup JSON file or text
   */
  async importVaultBackup(jsonText) {
    try {
      const parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
      const papersToImport = Array.isArray(parsed) ? parsed : (parsed.papers || [parsed]);
      let imported = 0;

      for (const p of papersToImport) {
        if (p && (p.questions || p.sections || p.paperData)) {
          const rawData = p.paperData || p;
          await this.savePaper(rawData, {
            filename: p.filename || rawData.metadata?.title || 'Imported Paper',
            source: p.source || 'backup_import'
          });
          imported++;
        }
      }
      return { success: true, imported };
    } catch (err) {
      console.error('Failed to import vault backup:', err);
      throw err;
    }
  }

  /**
   * Save a generated pattern analysis report
   */
  async saveAnalysisReport(reportData) {
    await this.initPromise;
    const record = {
      id: `analysis_${Date.now()}`,
      timestamp: Date.now(),
      title: reportData.title || 'Exam Design & Pattern Analysis',
      paperIds: reportData.paperIds || [],
      paperTitles: reportData.paperTitles || [],
      report: reportData
    };

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.analysisStoreName], 'readwrite');
        const req = tx.objectStore(this.analysisStoreName).put(record);
        req.onsuccess = () => resolve({ success: true, id: record.id, report: record });
        req.onerror = () => resolve({ success: false, id: record.id, report: record });
      });
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const existing = JSON.parse(localStorage.getItem('paper_vault_analyses') || '[]');
        existing.unshift(record);
        localStorage.setItem('paper_vault_analyses', JSON.stringify(existing.slice(0, 50)));
      } catch (e) {}
    }
    return { success: true, id: record.id, report: record };
  }

  /**
   * Get all past pattern analysis reports
   */
  async getPastReports() {
    await this.initPromise;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction([this.analysisStoreName], 'readonly');
        const req = tx.objectStore(this.analysisStoreName).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.timestamp - a.timestamp));
        req.onerror = () => resolve([]);
      });
    }
    if (typeof localStorage !== 'undefined') {
      try {
        return JSON.parse(localStorage.getItem('paper_vault_analyses') || '[]');
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  // --- Fallback LocalStorage Implementation ---

  fallbackGetAllFull() {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('paper_vault_items') || '[]');
    } catch (e) {
      return [];
    }
  }

  fallbackGetAllSummary() {
    const full = this.fallbackGetAllFull();
    return full.map(p => ({
      id: p.id,
      title: p.title,
      board: p.board || 'State Board / Commission',
      exam: p.exam || 'General Examination',
      year: p.year || 'N/A',
      paperType: p.paperType || 'common',
      paperCode: p.paperCode || 'Paper 1',
      specialization: p.specialization || p.subject || 'General Studies',
      subject: p.subject,
      totalQuestions: p.totalQuestions,
      totalMarks: p.totalMarks,
      timestamp: p.timestamp,
      filename: p.filename,
      source: p.source
    })).sort((a, b) => b.timestamp - a.timestamp);
  }

  fallbackGet(id) {
    const full = this.fallbackGetAllFull();
    return full.find(p => p.id === id) || null;
  }

  fallbackSave(record) {
    if (typeof localStorage === 'undefined') return;
    try {
      const full = this.fallbackGetAllFull();
      const existingIdx = full.findIndex(p => p.id === record.id);
      if (existingIdx >= 0) {
        full[existingIdx] = record;
      } else {
        full.push(record);
      }
      localStorage.setItem('paper_vault_items', JSON.stringify(full));
    } catch (e) {
      console.warn('[PaperVault] localStorage quota exceeded:', e);
    }
  }

  fallbackDelete(id) {
    if (typeof localStorage === 'undefined') return;
    try {
      let full = this.fallbackGetAllFull();
      full = full.filter(p => p.id !== id);
      localStorage.setItem('paper_vault_items', JSON.stringify(full));
    } catch (e) {}
  }
}

// Attach globally
if (typeof window !== 'undefined') {
  window.PaperVault = PaperVault;
  window.paperVault = new PaperVault();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PaperVault };
}
