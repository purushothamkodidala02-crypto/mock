/**
 * App Controller - Connects UI, Parsers, State, Quiz Engine & Exporters
 * Zero API Local Engine + Gemini Multimodal AI Pool
 */

class AppController {
  constructor() {
    this.extractedData = null;
    this.filteredQuestions = [];
    this.activeFilter = { search: '', section: 'all', type: 'all' };
    this.currentEditingQuestionId = null;
    this.extractionEngine = 'local';
    this.currentKeyModalTab = 'keys';
    this.selectedFile = null;
    this.pageScope = 'all';
    this.selectedVaultPaperIds = new Set();
    this.currentAnalysisReport = null;
    this.currentAnalysisTab = 'blueprint';
    this.vaultView = 'hierarchy';
    this.currentFolderUploadTarget = null;
    this.folderUploadSelectedFile = null;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.setupIcons();
    this.setupEventListeners();
    this.setupDropzone();
    this.updateEngineUI();
    this.updateKeyStatsUI();
    this.updateVaultNavBadge();

    // Register KeyManager listener for real-time cooldown timer and stats
    if (window.geminiKeyManager) {
      window.geminiKeyManager.addListener((summary) => {
        this.updateKeyStatsUI(summary);
        const modal = document.getElementById('ai-key-modal');
        if (modal && !modal.classList.contains('hidden') && this.currentKeyModalTab === 'keys') {
          this.renderKeysTable();
        }
      });
    }

    // Register PaperVault listener for badge updates
    if (window.paperVault) {
      window.paperVault.addListener(() => {
        this.updateVaultNavBadge();
        const vaultModal = document.getElementById('paper-vault-modal');
        if (vaultModal && !vaultModal.classList.contains('hidden')) {
          this.renderVaultTable();
        }
      });
    }
  }

  setupIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  setupEventListeners() {
    // Sample papers dropdown toggle
    const btnSamples = document.getElementById('btn-samples');
    const sampleMenu = document.getElementById('sample-menu');
    if (btnSamples && sampleMenu) {
      btnSamples.addEventListener('click', (e) => {
        e.stopPropagation();
        sampleMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        sampleMenu.classList.add('hidden');
      });
    }

    // File input change
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }
  }

  setupDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.onFileSelected(files[0]);
      }
    });
  }

  setUploadTab(tab) {
    const btnFile = document.getElementById('tab-btn-file');
    const btnText = document.getElementById('tab-btn-text');
    const contentFile = document.getElementById('tab-content-file');
    const contentText = document.getElementById('tab-content-text');

    if (tab === 'file') {
      btnFile.className = 'px-4 py-2 text-sm font-semibold rounded-lg bg-white text-indigo-600 shadow-sm transition-all';
      btnText.className = 'px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all';
      contentFile.classList.remove('hidden');
      contentText.classList.add('hidden');
    } else {
      btnText.className = 'px-4 py-2 text-sm font-semibold rounded-lg bg-white text-indigo-600 shadow-sm transition-all';
      btnFile.className = 'px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all';
      contentText.classList.remove('hidden');
      contentFile.classList.add('hidden');
    }
    this.setupIcons();
  }

  onToggleImages(elem) {
    const badge = document.getElementById('badge-extract-mode');
    if (!badge) return;
    if (elem.checked) {
      badge.textContent = '🖼️ Image Extraction Active';
      badge.className = 'text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200';
    } else {
      badge.textContent = '⚡ Instant Fast Mode Active';
      badge.className = 'text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200';
    }
  }

  startTimer() {
    this.extractionStartTime = Date.now();
    const timeElem = document.getElementById('processing-time-elapsed');
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!timeElem || !this.extractionStartTime) return;
      const elapsedSec = Math.floor((Date.now() - this.extractionStartTime) / 1000);
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      timeElem.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 500);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  showProgress(statusText, percent = 0) {
    const indicator = document.getElementById('processing-indicator');
    const status = document.getElementById('processing-status-text');
    const percentElem = document.getElementById('processing-percent');
    const bar = document.getElementById('processing-bar');

    // Ensure progress bar never jumps backwards during active extraction
    if (percent > 0) {
      if (!this.maxProgressSeen || percent < 15) {
        this.maxProgressSeen = percent;
      } else {
        this.maxProgressSeen = Math.max(this.maxProgressSeen, percent);
      }
      percent = this.maxProgressSeen;
    }

    if (indicator) indicator.classList.remove('hidden');
    if (status) status.textContent = statusText;
    if (percentElem) percentElem.textContent = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;

    if (!this.timerInterval) {
      this.startTimer();
    }
  }

  hideProgress() {
    this.stopTimer();
    this.maxProgressSeen = 0;
    const indicator = document.getElementById('processing-indicator');
    if (indicator) indicator.classList.add('hidden');
    const fastBtn = document.getElementById('btn-force-fast-mode');
    if (fastBtn) fastBtn.classList.add('hidden');
  }

  cancelExtraction() {
    if (window.geminiHandler) {
      window.geminiHandler.cancel();
    }
    this.hideProgress();
  }

  async switchToFastLocalExtraction() {
    this.cancelExtraction();
    await this.startLocalExtraction();
  }

  // --- GEMINI MULTI-KEY & MODEL SETTINGS MODAL ---

  setKeyModalTab(tab) {
    this.currentKeyModalTab = tab;
    const btnKeys = document.getElementById('tab-btn-modal-keys');
    const btnAdd = document.getElementById('tab-btn-modal-add');
    const btnModel = document.getElementById('tab-btn-modal-model');

    const contentKeys = document.getElementById('tab-content-modal-keys');
    const contentAdd = document.getElementById('tab-content-modal-add');
    const contentModel = document.getElementById('tab-content-modal-model');

    const activeClass = 'pb-2.5 px-3 text-xs font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center gap-1.5 transition-all';
    const inactiveClass = 'pb-2.5 px-3 text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-all';

    if (btnKeys) btnKeys.className = tab === 'keys' ? activeClass : inactiveClass;
    if (btnAdd) btnAdd.className = tab === 'add' ? activeClass : inactiveClass;
    if (btnModel) btnModel.className = tab === 'model' ? activeClass : inactiveClass;

    if (contentKeys) contentKeys.classList.toggle('hidden', tab !== 'keys');
    if (contentAdd) contentAdd.classList.toggle('hidden', tab !== 'add');
    if (contentModel) contentModel.classList.toggle('hidden', tab !== 'model');

    if (tab === 'keys') {
      this.renderKeysTable();
    }
    this.setupIcons();
  }

  openAiKeyModal(initialTab = 'keys') {
    const modal = document.getElementById('ai-key-modal');
    if (!modal) return;

    // Sync active model radio
    const currentModel = window.geminiHandler ? window.geminiHandler.getModelName() : 'gemini-2.5-flash';
    const modelRadio = document.querySelector(`input[name="modal-model-radio"][value="${currentModel}"]`);
    if (modelRadio) modelRadio.checked = true;

    // Sync rotation strategy radio
    const currentStrategy = window.geminiKeyManager ? window.geminiKeyManager.getRotationStrategy() : 'auto_failover';
    const stratRadio = document.querySelector(`input[name="modal-strategy-radio"][value="${currentStrategy}"]`);
    if (stratRadio) stratRadio.checked = true;

    modal.classList.remove('hidden');
    this.setKeyModalTab(initialTab);
    this.renderKeysTable();
    this.setupIcons();
  }

  closeAiKeyModal() {
    const modal = document.getElementById('ai-key-modal');
    if (modal) modal.classList.add('hidden');
    this.updateEngineUI();
    this.updateFilePreviewKeyStatus();
  }

  updateKeyStatsUI(summary = null) {
    if (!summary) {
      summary = window.geminiKeyManager ? window.geminiKeyManager.getStatusSummary() : { active: 0, cooldown: 0, total: 0, strategy: 'auto_failover', keys: [] };
    }

    const activeElem = document.getElementById('modal-stat-active');
    const cooldownElem = document.getElementById('modal-stat-cooldown');
    const totalElem = document.getElementById('modal-stat-total');
    const tabCountElem = document.getElementById('tab-keys-count');
    const stratElem = document.getElementById('modal-stat-strategy');

    if (activeElem) activeElem.textContent = summary.active || 0;
    if (cooldownElem) cooldownElem.textContent = summary.cooldown || 0;
    if (totalElem) totalElem.textContent = summary.total || 0;
    if (tabCountElem) tabCountElem.textContent = summary.total || 0;
    if (stratElem) stratElem.textContent = summary.strategy === 'round_robin' ? 'Round-Robin' : 'Auto-Failover';

    this.updateFilePreviewKeyStatus();
  }

  updateFilePreviewKeyStatus() {
    const modelBadge = document.getElementById('file-card-model-badge');
    if (modelBadge && window.geminiHandler) {
      modelBadge.textContent = window.geminiHandler.getModelName();
    }

    const statusElem = document.getElementById('file-preview-key-status');
    if (!statusElem) return;

    if (!window.geminiKeyManager || !window.geminiKeyManager.hasKeys()) {
      statusElem.textContent = 'No Gemini Key Configured';
      statusElem.className = 'text-slate-500 font-medium';
    } else {
      const summary = window.geminiKeyManager.getStatusSummary();
      if (summary.active > 0) {
        statusElem.textContent = `✓ ${summary.active} Gemini Key${summary.active > 1 ? 's' : ''} Ready`;
        statusElem.className = 'text-emerald-700 font-medium';
      } else if (summary.cooldown > 0) {
        statusElem.textContent = `⏳ Keys in cooldown`;
        statusElem.className = 'text-amber-700 font-medium';
      } else {
        statusElem.textContent = `⚠️ Key error`;
        statusElem.className = 'text-red-600 font-medium';
      }
    }
  }

  renderKeysTable() {
    const tbody = document.getElementById('modal-keys-table-body');
    const emptyNotice = document.getElementById('keys-empty-notice');
    if (!tbody) return;

    const summary = window.geminiKeyManager ? window.geminiKeyManager.getStatusSummary() : { keys: [] };
    this.updateKeyStatsUI(summary);

    if (!summary.keys || summary.keys.length === 0) {
      tbody.innerHTML = '';
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }

    if (emptyNotice) emptyNotice.classList.add('hidden');

    tbody.innerHTML = summary.keys.map(k => {
      let statusBadge = '';
      if (!k.enabled) {
        statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">Disabled</span>';
      } else if (k.status === 'cooldown' && k.remainingSeconds > 0) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse" title="${k.lastError || 'HTTP 429 Quota Cooldown'}">⏳ Cooldown (${k.remainingSeconds}s)</span>`;
      } else if (k.status === 'error') {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800" title="${k.lastError || 'Key Error'}">⚠️ Error</span>`;
      } else {
        statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">● Active</span>';
      }

      return `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-3 py-2.5 font-medium text-slate-800 text-xs">
            <div class="flex items-center space-x-1.5">
              <span>${k.label}</span>
            </div>
          </td>
          <td class="px-3 py-2.5 font-mono text-[11px] text-slate-600">
            <span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${k.maskedKey}</span>
          </td>
          <td class="px-3 py-2.5">
            ${statusBadge}
          </td>
          <td class="px-3 py-2.5 text-center text-xs">
            <span class="font-semibold text-slate-700">${k.requestCount || 0}</span> / 
            <span class="${(k.rateLimitCount || 0) > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}">${k.rateLimitCount || 0}</span>
          </td>
          <td class="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
            <button onclick="app.testKeyHealth('${k.id}')" class="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors" title="Test Key Health">
              <i data-lucide="activity" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="app.toggleKeyEnabled('${k.id}')" class="p-1 ${k.enabled ? 'text-emerald-600 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-600'} rounded hover:bg-slate-100 transition-colors" title="${k.enabled ? 'Disable Key' : 'Enable Key'}">
              <i data-lucide="${k.enabled ? 'toggle-right' : 'toggle-left'}" class="w-4 h-4"></i>
            </button>
            <button onclick="app.deleteKeyFromModal('${k.id}')" class="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Delete Key">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.setupIcons();
  }

  addSingleKeyFromModal() {
    const labelInput = document.getElementById('add-key-label');
    const valueInput = document.getElementById('add-key-value');
    const key = valueInput ? valueInput.value.trim() : '';
    const label = labelInput ? labelInput.value.trim() : '';

    if (!key) {
      alert('Please enter or paste your Gemini API key (starts with AQ.Ab... or AIzaSy...).');
      return;
    }

    if (!window.geminiKeyManager) return;
    const res = window.geminiKeyManager.addKey(key, label);
    if (!res.success) {
      alert(res.message || 'Failed to add key');
      return;
    }

    if (valueInput) valueInput.value = '';
    if (labelInput) labelInput.value = '';

    this.setExtractionEngine('gemini');
    this.setKeyModalTab('keys');
  }

  addBulkKeysFromModal() {
    const textarea = document.getElementById('add-keys-bulk');
    const text = textarea ? textarea.value.trim() : '';

    if (!text) {
      alert('Please paste one or more Gemini API keys (one per line).');
      return;
    }

    if (!window.geminiKeyManager) return;
    const res = window.geminiKeyManager.addMultipleKeys(text);
    if (res.added === 0) {
      alert('No new valid keys were found or keys are already in your pool.');
      return;
    }

    alert(`Successfully added ${res.added} key(s) to your pool!${res.skipped > 0 ? ` (${res.skipped} duplicate/invalid skipped)` : ''}`);
    if (textarea) textarea.value = '';

    this.setExtractionEngine('gemini');
    this.setKeyModalTab('keys');
  }

  resetAllKeyCooldowns() {
    if (window.geminiKeyManager) {
      window.geminiKeyManager.resetAllCooldowns();
      this.renderKeysTable();
    }
  }

  clearAllKeys() {
    if (confirm('Are you sure you want to remove all API keys from this browser?')) {
      if (window.geminiKeyManager) {
        window.geminiKeyManager.clearAllKeys();
        this.renderKeysTable();
        this.setExtractionEngine('local');
      }
    }
  }

  deleteKeyFromModal(id) {
    if (window.geminiKeyManager) {
      window.geminiKeyManager.removeKey(id);
      this.renderKeysTable();
    }
  }

  toggleKeyEnabled(id) {
    if (window.geminiKeyManager) {
      window.geminiKeyManager.toggleKey(id);
      this.renderKeysTable();
    }
  }

  async testKeyHealth(id) {
    if (!window.geminiKeyManager) return;
    const allKeys = window.geminiKeyManager.getAllKeys();
    const keyObj = allKeys.find(k => k.id === id);
    if (!keyObj) return;

    this.showProgress(`Testing key health for [${keyObj.label}]...`, 50);
    const result = await window.geminiKeyManager.testKey(keyObj, window.geminiHandler?.getModelName());
    this.hideProgress();

    if (result.success) {
      alert(`✅ Key [${keyObj.label}] is valid and responding successfully to Gemini API!`);
    } else {
      alert(`❌ Key test failed: ${result.message}`);
    }
    this.renderKeysTable();
  }

  onModelSelectChange(model) {
    if (window.geminiHandler) {
      window.geminiHandler.setModelName(model);
    }
    const radio = document.querySelector(`input[name="modal-model-radio"][value="${model}"]`);
    if (radio) radio.checked = true;
    const badge = document.getElementById('file-card-model-badge');
    if (badge) badge.textContent = model;
  }

  onModalModelRadioChange(model) {
    if (window.geminiHandler) {
      window.geminiHandler.setModelName(model);
    }
    const navSelect = document.getElementById('nav-model-select');
    if (navSelect) navSelect.value = model;
    const badge = document.getElementById('file-card-model-badge');
    if (badge) badge.textContent = model;
  }

  onStrategyRadioChange(strategy) {
    if (window.geminiKeyManager) {
      window.geminiKeyManager.setRotationStrategy(strategy);
    }
    const statElem = document.getElementById('modal-stat-strategy');
    if (statElem) statElem.textContent = strategy === 'round_robin' ? 'Round-Robin' : 'Auto-Failover';
  }

  // --- ENGINE & FILE INGESTION CONTROLLER ---

  setExtractionEngine(engine) {
    this.extractionEngine = engine;
    const btnLocal = document.getElementById('engine-btn-local');
    const btnGemini = document.getElementById('engine-btn-gemini');

    if (engine === 'gemini') {
      if (btnGemini) btnGemini.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all flex items-center shadow-sm';
      if (btnLocal) btnLocal.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center';

      if (!window.geminiKeyManager || !window.geminiKeyManager.hasKeys()) {
        this.openAiKeyModal('add');
      }
    } else {
      this.extractionEngine = 'local';
      if (btnLocal) btnLocal.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all flex items-center shadow-sm';
      if (btnGemini) btnGemini.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center';
    }
    this.setupIcons();
  }

  updateEngineUI() {
    const btnLocal = document.getElementById('engine-btn-local');
    const btnGemini = document.getElementById('engine-btn-gemini');
    if (!btnLocal || !btnGemini) return;

    if (this.extractionEngine === 'gemini' && window.geminiKeyManager && window.geminiKeyManager.hasKeys()) {
      btnGemini.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all flex items-center shadow-sm';
      btnLocal.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center';
    } else {
      btnLocal.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all flex items-center shadow-sm';
      btnGemini.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center';
    }
  }

  async handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      await this.onFileSelected(files[0]);
    }
  }

  async onFileSelected(file) {
    this.selectedFile = file;
    const card = document.getElementById('file-selected-card');
    const nameElem = document.getElementById('file-preview-name');
    const sizeElem = document.getElementById('file-preview-size');
    const pagesElem = document.getElementById('file-preview-pages');

    if (card) card.classList.remove('hidden');
    if (nameElem) nameElem.textContent = file.name;
    if (sizeElem) {
      const kb = file.size / 1024;
      sizeElem.textContent = kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.round(kb)} KB`;
    }

    if (pagesElem) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.pdf')) {
        pagesElem.textContent = 'Detecting PDF pages...';
        try {
          if (window.pdfjsLib) {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pagesElem.textContent = `${pdfDoc.numPages} Page${pdfDoc.numPages > 1 ? 's' : ''}`;
          } else {
            pagesElem.textContent = 'PDF Document';
          }
        } catch (e) {
          pagesElem.textContent = 'PDF Document';
        }
      } else if (fileName.match(/\.(png|jpg|jpeg|webp)$/)) {
        pagesElem.textContent = 'Image Scan';
      } else if (fileName.endsWith('.docx')) {
        pagesElem.textContent = 'Word Document';
      } else {
        pagesElem.textContent = 'Text Document';
      }
    }

    this.updateFilePreviewKeyStatus();
    this.setupIcons();
  }

  clearSelectedFile() {
    this.selectedFile = null;
    const card = document.getElementById('file-selected-card');
    if (card) card.classList.add('hidden');
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  }

  onScopeChange(scope) {
    this.pageScope = scope;
    const customInput = document.getElementById('custom-page-range-input');
    if (customInput) {
      customInput.classList.toggle('hidden', scope !== 'custom');
      if (scope === 'custom') customInput.focus();
    }
  }

  async startGeminiExtraction() {
    if (!this.selectedFile) {
      alert('Please select or upload a document first.');
      return;
    }

    if (!window.geminiKeyManager || !window.geminiKeyManager.hasKeys()) {
      alert('Please add at least one Gemini API key to use AI extraction.');
      this.openAiKeyModal('add');
      return;
    }

    const customInput = document.getElementById('custom-page-range-input');
    const customRange = customInput ? customInput.value.trim() : '';
    const modeSelect = document.getElementById('select-ai-mode');
    const extractionMode = modeSelect ? modeSelect.value : 'auto';

    try {
      const banner = document.getElementById('key-rotation-banner');
      if (banner) banner.classList.add('hidden');

      const fastBtn = document.getElementById('btn-force-fast-mode');
      if (fastBtn) fastBtn.classList.remove('hidden');

      this.showProgress('Initiating Accelerated Gemini AI Extraction...', 15);
      const aiResult = await window.geminiHandler.extractSmart(
        this.selectedFile,
        { pageRange: this.pageScope, customRange, extractionMode },
        (status, percent, keyInfo) => {
          this.showProgress(status, percent);

          if (keyInfo && keyInfo.rateLimit) {
            const rotBanner = document.getElementById('key-rotation-banner');
            const rotText = document.getElementById('key-rotation-text');
            if (rotBanner && rotText) {
              rotText.textContent = `⚡ Key [${keyInfo.keyLabel || 'Primary'}] reached quota limit (429). Auto-switched to next key seamlessly!`;
              rotBanner.classList.remove('hidden');
            }
          }
        }
      );
      this.hideProgress();
      this.renderExtractedPaper(aiResult);
    } catch (err) {
      console.error(err);
      this.hideProgress();
      if (confirm(`Gemini extraction notice: ${err.message || err}\n\nWould you like to instantly parse this document with the Local Free Engine instead?`)) {
        this.startLocalExtraction();
      }
    }
  }

  async startLocalExtraction() {
    if (!this.selectedFile) {
      alert('Please select or upload a document first.');
      return;
    }
    const prevEngine = this.extractionEngine;
    this.setExtractionEngine('local');
    try {
      await this.processFiles([this.selectedFile]);
    } finally {
      this.setExtractionEngine(prevEngine);
    }
  }

  async processFiles(files) {
    const firstFile = files[0];
    const fileName = firstFile.name.toLowerCase();

    // Check if AI mode is active for PDF or Image
    if (this.extractionEngine === 'gemini' && window.geminiKeyManager && window.geminiKeyManager.hasKeys()) {
      try {
        this.showProgress('Starting Accelerated Gemini AI Extraction...', 10);
        const fastBtn = document.getElementById('btn-force-fast-mode');
        if (fastBtn) fastBtn.classList.remove('hidden');

        const aiResult = await window.geminiHandler.extractSmart(firstFile, {}, (status, percent) => {
          this.showProgress(status, percent);
        });
        this.hideProgress();
        this.renderExtractedPaper(aiResult);
        return;
      } catch (aiErr) {
        console.warn("Gemini AI error, falling back seamlessly to Local Engine:", aiErr);
        this.showProgress('Gemini extraction unavailable. Instantly extracting with Local Free Engine...', 25);
      }
    }

    this.showProgress('Analyzing file format...', 10);

    try {
      let rawText = '';
      let extractedImages = [];

      if (fileName.endsWith('.pdf')) {
        this.showProgress('Extracting PDF text layer & layout...', 30);
        const extractImages = true; // Always extract images so image-only questions get their content
        const pdfResult = await window.pdfHandler.extractText(firstFile, { extractImages }, (p) => {
          this.showProgress(p.status || `Reading PDF Page ${p.current} of ${p.total}...`, Math.round(30 + (p.percent * 0.5)));
        });
        rawText = pdfResult.text;
        extractedImages = pdfResult.images || [];

        // If PDF had minimal text layer (scanned PDF), alert OCR fallback
        if (!rawText || rawText.trim().length < 50) {
          this.showProgress('PDF text layer empty. Attempting OCR on scanned pages...', 60);
          rawText = "Please upload pages as JPG or PNG images for OCR extraction.";
        }
      } else if (fileName.match(/\.(png|jpg|jpeg|webp)$/)) {
        if (files.length === 1) {
          this.showProgress('Initializing in-browser OCR (Tesseract.js)...', 20);
          const ocrResult = await window.ocrHandler.recognize(firstFile, {
            onProgress: (p) => this.showProgress(p.status || 'Recognizing text...', 60)
          });
          rawText = ocrResult.text;
        } else {
          this.showProgress(`Running OCR on ${files.length} images...`, 20);
          const multiResult = await window.ocrHandler.recognizeMultiple(files, (p) => {
            this.showProgress(p.status, Math.round((p.current / p.total) * 80));
          });
          rawText = multiResult.text;
        }
      } else if (fileName.endsWith('.docx')) {
        this.showProgress('Extracting Word document...', 50);
        const docxResult = await window.docxHandler.extractText(firstFile);
        rawText = docxResult.text;
      } else {
        // Plain text file
        this.showProgress('Reading text file...', 50);
        rawText = await firstFile.text();
      }

      this.showProgress('Running NLP Question Extractor...', 90);
      await new Promise(r => setTimeout(r, 20));
      const extracted = window.extractorEngine.extract(rawText, { images: extractedImages });
      await new Promise(r => setTimeout(r, 20));
      this.hideProgress();

      this.renderExtractedPaper(extracted);

    } catch (err) {
      console.error(err);
      this.hideProgress();
      alert(`Error extracting document: ${err.message || err}`);
    }
  }

  extractFromRawText() {
    const textInput = document.getElementById('raw-text-input');
    const raw = textInput ? textInput.value : '';
    if (!raw.trim()) {
      alert('Please enter or paste question paper text first.');
      return;
    }

    this.showProgress('Parsing questions & sections...', 50);
    setTimeout(() => {
      const extracted = window.extractorEngine.extract(raw);
      this.hideProgress();
      this.renderExtractedPaper(extracted);
    }, 100);
  }

  loadSample(sampleKey) {
    const sample = window.SAMPLE_QUESTION_PAPERS[sampleKey];
    if (!sample) return;

    this.showProgress(`Loading sample: ${sample.title}...`, 50);
    setTimeout(() => {
      const extracted = window.extractorEngine.extract(sample.text, { images: sample.images || [] });
      this.hideProgress();
      this.renderExtractedPaper(extracted);
    }, 150);
  }

  renderExtractedPaper(data) {
    this.extractedData = data;

    // Auto-save to Paper Vault if paper contains questions
    if (window.paperVault && data && data.questions && data.questions.length > 0) {
      const sourceInfo = {
        filename: this.selectedFile ? this.selectedFile.name : (data.metadata?.title || 'Extracted Paper'),
        source: this.extractionEngine === 'gemini' ? 'gemini_ai' : 'local_engine'
      };
      window.paperVault.savePaper(data, sourceInfo)
        .then((res) => {
          if (res && res.id) {
            this.currentPaperVaultId = res.id;
            this.renderStudioFolderLocation(res.paper);
          }
          this.updateVaultNavBadge();
        })
        .catch(err => console.warn('Could not auto-save to Paper Vault:', err));
    }

    // Show workspace, hide upload box
    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('studio-workspace').classList.remove('hidden');

    // Show top action buttons
    document.getElementById('btn-open-quiz').classList.remove('hidden');
    document.getElementById('btn-open-export').classList.remove('hidden');
    document.getElementById('btn-print').classList.remove('hidden');

    // Render Stats
    this.renderStats(data.stats);

    // Render Metadata
    this.renderMetadata(data.metadata);

    // Populate Section Filter Dropdown
    this.populateSectionFilter(data.sections);

    // Render Question Cards
    this.applyFilters();

    this.setupIcons();
    this.renderMathFormulas();
  }

  renderStats(stats) {
    document.getElementById('stat-total-questions').textContent = stats.totalQuestions || 0;
    document.getElementById('stat-total-marks').textContent = stats.totalCalculatedMarks || 0;
    document.getElementById('stat-total-sections').textContent = this.extractedData.sections.length || 0;
    document.getElementById('stat-mcq-count').textContent = stats.mcqCount || 0;

    const badge = document.getElementById('stat-marks-match-badge');
    if (stats.statedMaxMarks) {
      if (stats.statedMaxMarks === stats.totalCalculatedMarks) {
        badge.textContent = `✓ Matches Max (${stats.statedMaxMarks}M)`;
        badge.className = 'text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ml-1';
      } else {
        badge.textContent = `⚠️ Stated: ${stats.statedMaxMarks}M (Diff: ${stats.totalCalculatedMarks - stats.statedMaxMarks})`;
        badge.className = 'text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 ml-1';
      }
    } else {
      badge.textContent = `${stats.totalCalculatedMarks} Total Marks`;
      badge.className = 'text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 ml-1';
    }
  }

  renderMetadata(meta) {
    document.getElementById('disp-institution').textContent = meta.institution || 'EXAMINATION PAPER';
    document.getElementById('disp-title').textContent = meta.title || 'Question Paper';
    document.getElementById('disp-subject').textContent = meta.subject || 'Not specified';
    document.getElementById('disp-grade').textContent = meta.grade || 'N/A';
    document.getElementById('disp-duration').textContent = meta.duration || 'N/A';
    document.getElementById('disp-maxmarks').textContent = meta.maxMarks ? `${meta.maxMarks} Marks` : `${this.extractedData.stats.totalCalculatedMarks} Marks`;

    const instContainer = document.getElementById('disp-instructions-container');
    const instList = document.getElementById('disp-instructions-list');
    instList.innerHTML = '';

    if (meta.instructions && meta.instructions.length > 0) {
      meta.instructions.forEach(inst => {
        const li = document.createElement('li');
        li.textContent = inst;
        instList.appendChild(li);
      });
      instContainer.classList.remove('hidden');
    } else {
      instContainer.classList.add('hidden');
    }
  }

  toggleHeaderEdit() {
    const dispView = document.getElementById('metadata-display-view');
    const editView = document.getElementById('metadata-edit-view');
    const btnText = document.getElementById('btn-edit-header-text');

    if (editView.classList.contains('hidden')) {
      const meta = this.extractedData.metadata;
      document.getElementById('edit-meta-title').value = meta.title || '';
      document.getElementById('edit-meta-institution').value = meta.institution || '';
      document.getElementById('edit-meta-subject').value = meta.subject || '';
      document.getElementById('edit-meta-grade').value = meta.grade || '';
      document.getElementById('edit-meta-duration').value = meta.duration || '';
      document.getElementById('edit-meta-maxmarks').value = meta.maxMarks || this.extractedData.stats.totalCalculatedMarks || '';
      document.getElementById('edit-meta-instructions').value = (meta.instructions || []).join('\n');

      dispView.classList.add('hidden');
      editView.classList.remove('hidden');
      btnText.textContent = 'Cancel';
    } else {
      editView.classList.add('hidden');
      dispView.classList.remove('hidden');
      btnText.textContent = 'Edit Details';
    }
  }

  saveMetadataChanges() {
    const meta = this.extractedData.metadata;
    meta.title = document.getElementById('edit-meta-title').value;
    meta.institution = document.getElementById('edit-meta-institution').value;
    meta.subject = document.getElementById('edit-meta-subject').value;
    meta.grade = document.getElementById('edit-meta-grade').value;
    meta.duration = document.getElementById('edit-meta-duration').value;
    meta.maxMarks = parseInt(document.getElementById('edit-meta-maxmarks').value, 10) || null;
    meta.instructions = document.getElementById('edit-meta-instructions').value.split('\n').filter(l => l.trim().length > 0);

    this.renderMetadata(meta);
    this.renderStats(this.extractedData.stats);
    this.toggleHeaderEdit();
  }

  populateSectionFilter(sections) {
    const filterSec = document.getElementById('filter-section');
    filterSec.innerHTML = '<option value="all">All Sections</option>';
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `${sec.title} (${sec.questions?.length || 0} Qs)`;
      filterSec.appendChild(opt);
    });
  }

  applyFilters() {
    const searchVal = (document.getElementById('filter-search')?.value || '').toLowerCase();
    const sectionVal = document.getElementById('filter-section')?.value || 'all';
    const typeVal = document.getElementById('filter-type')?.value || 'all';

    const container = document.getElementById('questions-studio-container');
    container.innerHTML = '';

    (this.extractedData.sections || []).forEach(sec => {
      if (sectionVal !== 'all' && sec.id !== sectionVal) return;

      const matchingQuestions = (sec.questions || []).filter(q => {
        if (typeVal !== 'all' && q.type !== typeVal) return false;
        if (searchVal) {
          const matchText = (q.questionText + ' ' + (q.options || []).map(o => o.text).join(' ')).toLowerCase();
          return matchText.includes(searchVal);
        }
        return true;
      });

      if (matchingQuestions.length > 0) {
        // Render Section Header
        const secElem = document.createElement('div');
        secElem.className = 'space-y-4';
        secElem.innerHTML = `
          <div class="flex items-center justify-between bg-gradient-to-r from-slate-100 to-indigo-50/30 p-3.5 rounded-xl border border-slate-200">
            <div>
              <h4 class="font-bold text-slate-800 text-sm flex items-center">
                <i data-lucide="layers" class="w-4 h-4 mr-2 text-indigo-600"></i> ${sec.title}
                ${sec.description ? `<span class="text-xs font-normal text-slate-500 ml-2">(${sec.description})</span>` : ''}
              </h4>
            </div>
            <div class="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              ${matchingQuestions.length} Questions | ${matchingQuestions.reduce((s, q) => s + (Number(q.marks) || 0), 0)} Marks
            </div>
          </div>
          <div class="space-y-3" id="sec-questions-${sec.id}"></div>
        `;
        container.appendChild(secElem);

        const qListElem = secElem.querySelector(`#sec-questions-${sec.id}`);
        matchingQuestions.forEach((q, idx) => {
          qListElem.appendChild(this.createQuestionCard(q, sec));
        });
      }
    });

    // Toggle "Clear Diagrams" button visibility
    const hasAnyImages = (this.extractedData?.questions || []).some(q => !!q.image);
    const clearBtn = document.getElementById('btn-clear-all-images');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !hasAnyImages);
    }

    this.setupIcons();
    this.renderMathFormulas();
  }

  removeAllImages() {
    if (!this.extractedData || !this.extractedData.questions || this.extractedData.questions.length === 0) return;
    if (confirm('Are you sure you want to remove all attached diagrams/images from this question paper?')) {
      this.extractedData.questions.forEach(q => {
        delete q.image;
        q.image = null;
      });
      if (this.extractedData.sections) {
        this.extractedData.sections.forEach(sec => {
          (sec.questions || []).forEach(q => {
            delete q.image;
            q.image = null;
          });
        });
      }
      this.applyFilters();
    }
  }

  createQuestionCard(q, section) {
    const card = document.createElement('div');
    card.className = 'question-card bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:border-indigo-200 transition-all space-y-3';
    card.id = `card-${q.id}`;

    const typeBadgeClass = `badge-${q.type || 'short_answer'}`;
    const formattedType = (q.type || 'Short Answer').replace('_', ' ').toUpperCase();

    let imageHtml = '';
    if (q.image) {
      imageHtml = `<div class="my-2"><img src="${q.image}" class="max-h-48 rounded-lg border border-slate-200 p-1 bg-white" /></div>`;
    }

    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">`;
      q.options.forEach(opt => {
        const isCorrect = q.correctAnswer === opt.key;
        optionsHtml += `
          <div class="p-2.5 rounded-lg border ${isCorrect ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 font-medium' : 'border-slate-200 bg-slate-50/50 text-slate-700'} text-xs flex items-start space-x-2">
            <span class="font-bold px-1.5 py-0.5 rounded ${isCorrect ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${opt.key}</span>
            <span class="flex-1 math-rendered">${opt.text}</span>
            ${isCorrect ? '<span class="text-emerald-600 font-bold text-xs">✓ Correct</span>' : ''}
          </div>
        `;
      });
      optionsHtml += `</div>`;
    }

    let subQuestionsHtml = '';
    if (q.subQuestions && q.subQuestions.length > 0) {
      subQuestionsHtml = `<div class="space-y-1.5 pl-4 border-l-2 border-indigo-200 my-2">`;
      q.subQuestions.forEach(sq => {
        subQuestionsHtml += `
          <div class="text-xs text-slate-700 flex items-start justify-between">
            <div><strong class="text-indigo-600">(${sq.label})</strong> <span class="math-rendered">${sq.text}</span></div>
            <span class="text-slate-400 font-medium ml-2">[${sq.marks || 1}M]</span>
          </div>
        `;
      });
      subQuestionsHtml += `</div>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center space-x-2">
          <span class="px-2.5 py-1 bg-slate-900 text-white rounded-md font-bold text-xs">Q${q.questionNumber}</span>
          <span class="px-2 py-0.5 rounded text-xs font-semibold ${typeBadgeClass}">${formattedType}</span>
          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-xs">${q.marks || 1} Mark${(q.marks > 1 ? 's' : '')}</span>
          ${q.hasOrChoice ? '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-xs">OR Choice</span>' : ''}
        </div>
        
        <div class="flex items-center space-x-1 no-print">
          <button onclick="app.editQuestion('${q.id}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50" title="Edit Question">
            <i data-lucide="edit" class="w-4 h-4"></i>
          </button>
          <button onclick="app.duplicateQuestion('${q.id}')" class="p-1.5 text-slate-400 hover:text-sky-600 rounded-md hover:bg-sky-50" title="Duplicate">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>
          <button onclick="app.deleteQuestion('${q.id}')" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <div class="text-sm font-medium text-slate-800 leading-relaxed math-rendered">
        ${q.questionText || (q.image ? '<span class="inline-flex items-center gap-1.5 text-amber-700 italic bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Visual Question — See Diagram Below</span>' : '<span class="inline-flex items-center gap-1.5 text-slate-400 italic bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg> Image-based question — content not extracted from PDF</span>')}
      </div>

      ${imageHtml}
      ${optionsHtml}
      ${subQuestionsHtml}

      ${q.explanation ? `<div class="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-600"><strong>Note / Solution:</strong> ${q.explanation}</div>` : ''}
    `;

    return card;
  }

  renderMathFormulas(targetContainer = null) {
    if (window.renderMathInElement) {
      try {
        const container = targetContainer || document.getElementById('questions-studio-container');
        if (container) {
          window.renderMathInElement(container, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
          });
        }
      } catch (e) {
        console.warn('KaTeX render error ignored:', e);
      }
    }
  }

  // --- QUESTION EDITING & ACTIONS ---

  editQuestion(qId) {
    const q = this.extractedData.questions.find(x => x.id === qId);
    if (!q) return;

    this.currentEditingQuestionId = qId;
    document.getElementById('modal-q-id').value = q.id;
    document.getElementById('modal-q-num').value = q.questionNumber || '';
    document.getElementById('modal-q-marks').value = q.marks || 1;
    document.getElementById('modal-q-type').value = q.type || 'short_answer';
    document.getElementById('modal-q-text').value = q.questionText || '';
    document.getElementById('modal-q-correct').value = q.correctAnswer || '';
    document.getElementById('modal-q-explanation').value = q.explanation || '';

    // Options
    document.getElementById('modal-opt-A').value = q.options?.find(o => o.key === 'A')?.text || '';
    document.getElementById('modal-opt-B').value = q.options?.find(o => o.key === 'B')?.text || '';
    document.getElementById('modal-opt-C').value = q.options?.find(o => o.key === 'C')?.text || '';
    document.getElementById('modal-opt-D').value = q.options?.find(o => o.key === 'D')?.text || '';

    this.onModalTypeChange();
    document.getElementById('modal-q-title').textContent = `Edit Question Q${q.questionNumber}`;
    document.getElementById('edit-question-modal').classList.remove('hidden');
    this.setupIcons();
  }

  openAddQuestionModal() {
    this.currentEditingQuestionId = null;
    const nextNum = (this.extractedData.questions.length + 1).toString();
    document.getElementById('modal-q-id').value = '';
    document.getElementById('modal-q-num').value = nextNum;
    document.getElementById('modal-q-marks').value = 1;
    document.getElementById('modal-q-type').value = 'mcq';
    document.getElementById('modal-q-text').value = '';
    document.getElementById('modal-q-correct').value = 'A';
    document.getElementById('modal-q-explanation').value = '';
    document.getElementById('modal-opt-A').value = '';
    document.getElementById('modal-opt-B').value = '';
    document.getElementById('modal-opt-C').value = '';
    document.getElementById('modal-opt-D').value = '';

    this.onModalTypeChange();
    document.getElementById('modal-q-title').textContent = 'Add New Question';
    document.getElementById('edit-question-modal').classList.remove('hidden');
    this.setupIcons();
  }

  onModalTypeChange() {
    const type = document.getElementById('modal-q-type').value;
    const wrapper = document.getElementById('modal-options-wrapper');
    if (type === 'mcq' || type === 'true_false') {
      wrapper.classList.remove('hidden');
    } else {
      wrapper.classList.add('hidden');
    }
  }

  saveQuestionModalChanges() {
    const qId = document.getElementById('modal-q-id').value;
    const qNum = document.getElementById('modal-q-num').value;
    const marks = parseFloat(document.getElementById('modal-q-marks').value) || 1;
    const type = document.getElementById('modal-q-type').value;
    const text = document.getElementById('modal-q-text').value;
    const correct = document.getElementById('modal-q-correct').value.trim().toUpperCase();
    const explanation = document.getElementById('modal-q-explanation').value;

    const optA = document.getElementById('modal-opt-A').value;
    const optB = document.getElementById('modal-opt-B').value;
    const optC = document.getElementById('modal-opt-C').value;
    const optD = document.getElementById('modal-opt-D').value;

    const options = [];
    if (optA) options.push({ key: 'A', text: optA });
    if (optB) options.push({ key: 'B', text: optB });
    if (optC) options.push({ key: 'C', text: optC });
    if (optD) options.push({ key: 'D', text: optD });

    if (qId) {
      // Update existing question
      const q = this.extractedData.questions.find(x => x.id === qId);
      if (q) {
        q.questionNumber = qNum;
        q.marks = marks;
        q.type = type;
        q.questionText = text;
        q.options = options;
        q.correctAnswer = correct;
        q.explanation = explanation;
      }
    } else {
      // Add new question to first section
      const newQ = {
        id: `q_custom_${Date.now()}`,
        questionNumber: qNum,
        marks: marks,
        type: type,
        questionText: text,
        options: options,
        correctAnswer: correct,
        explanation: explanation,
        subQuestions: [],
        hasOrChoice: false
      };
      if (this.extractedData.sections.length === 0) {
        this.extractedData.sections.push({ id: 'sec_1', title: 'Section A', questions: [newQ] });
      } else {
        this.extractedData.sections[0].questions.push(newQ);
      }
      this.extractedData.questions.push(newQ);
    }

    // Recompute total marks & stats
    this.recalculateStats();
    this.closeQuestionModal();
    this.applyFilters();
  }

  closeQuestionModal() {
    document.getElementById('edit-question-modal').classList.add('hidden');
  }

  duplicateQuestion(qId) {
    const q = this.extractedData.questions.find(x => x.id === qId);
    if (!q) return;

    const cloned = JSON.parse(JSON.stringify(q));
    cloned.id = `q_dup_${Date.now()}`;
    cloned.questionNumber = `${cloned.questionNumber} (Copy)`;

    const sec = this.extractedData.sections.find(s => s.questions.some(item => item.id === qId));
    if (sec) {
      const idx = sec.questions.findIndex(item => item.id === qId);
      sec.questions.splice(idx + 1, 0, cloned);
    }
    this.extractedData.questions.push(cloned);

    this.recalculateStats();
    this.applyFilters();
  }

  deleteQuestion(qId) {
    if (!confirm('Are you sure you want to delete this question?')) return;

    (this.extractedData.sections || []).forEach(sec => {
      sec.questions = (sec.questions || []).filter(q => q.id !== qId);
    });
    this.extractedData.questions = this.extractedData.questions.filter(q => q.id !== qId);

    this.recalculateStats();
    this.applyFilters();
  }

  recalculateStats() {
    let totalMarks = 0;
    this.extractedData.sections.forEach(sec => {
      sec.totalMarks = sec.questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
      totalMarks += sec.totalMarks;
    });

    this.extractedData.stats = window.extractorEngine.computeStatistics(
      this.extractedData.questions,
      totalMarks,
      this.extractedData.metadata.maxMarks
    );
    this.renderStats(this.extractedData.stats);
  }

  resetWorkspace() {
    this.extractedData = null;
    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('studio-workspace').classList.add('hidden');
    document.getElementById('btn-open-quiz').classList.add('hidden');
    document.getElementById('btn-open-export').classList.add('hidden');
    document.getElementById('btn-print').classList.add('hidden');
    document.getElementById('raw-text-input').value = '';
  }

  // --- EXPORT MODAL ---

  openExportModal() {
    document.getElementById('export-modal').classList.remove('hidden');
    this.setupIcons();
  }

  closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  exportFile(format) {
    if (!this.extractedData) return;

    switch (format) {
      case 'json':
        window.exporterEngine.exportJSON(this.extractedData);
        break;
      case 'csv':
        window.exporterEngine.exportCSV(this.extractedData);
        break;
      case 'markdown':
        window.exporterEngine.exportMarkdown(this.extractedData);
        break;
      case 'latex':
        window.exporterEngine.exportLaTeX(this.extractedData);
        break;
      case 'doc':
        window.exporterEngine.exportWordDoc(this.extractedData);
        break;
      case 'quiz_csv':
        window.exporterEngine.exportQuizFormat(this.extractedData);
        break;
      case 'pdf':
        window.print();
        break;
    }

    this.closeExportModal();
  }

  // --- INTERACTIVE QUIZ MODE ---

  launchQuiz() {
    if (!this.extractedData || this.extractedData.questions.length === 0) {
      alert('No questions available to test.');
      return;
    }

    window.quizEngine.startQuiz(this.extractedData);
    document.getElementById('quiz-header-title').textContent = this.extractedData.metadata.title || 'Practice Test';
    document.getElementById('quiz-header-subject').textContent = `${this.extractedData.metadata.subject || 'Exam'} | ${this.extractedData.questions.length} Questions`;
    
    document.getElementById('quiz-modal').classList.remove('hidden');
    this.renderQuizCurrentQuestion();
    this.renderQuizPalette();
    this.setupIcons();
  }

  renderQuizCurrentQuestion() {
    const q = window.quizEngine.getCurrentQuestion();
    if (!q) return;

    const idx = window.quizEngine.currentQuestionIndex;
    const total = window.quizEngine.questions.length;

    const numBadge = document.getElementById('quiz-q-num-badge') || document.getElementById('quiz-q-num');
    if (numBadge) numBadge.textContent = `Q${q.questionNumber || (idx + 1)}`;

    const marksBadge = document.getElementById('quiz-q-marks-badge') || document.getElementById('quiz-q-marks');
    if (marksBadge) marksBadge.textContent = `${q.marks || 1} Mark${(q.marks > 1 ? 's' : '')}`;

    const typeBadge = document.getElementById('quiz-q-type-badge');
    if (typeBadge) {
      typeBadge.textContent = (q.type || 'MCQ').replace('_', ' ').toUpperCase();
      typeBadge.className = `px-2.5 py-1 rounded-md font-semibold text-xs badge-${q.type || 'mcq'}`;
    }

    const progText = document.getElementById('quiz-progress-text');
    if (progText) progText.textContent = `Question ${idx + 1} of ${total}`;

    // Question text & placeholder for empty text
    const qTextElem = document.getElementById('quiz-question-text');
    if (qTextElem) {
      if (q.questionText && q.questionText.trim()) {
        qTextElem.textContent = q.questionText;
      } else if (q.image) {
        qTextElem.innerHTML = '<span class="inline-flex items-center gap-1.5 text-amber-700 italic bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Visual Question — Refer to Attached Diagram Below</span>';
      } else {
        qTextElem.innerHTML = '<span class="inline-flex items-center gap-1.5 text-slate-400 italic bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg> Image-based question — diagram/text not captured in PDF text layer</span>';
      }
    }

    // Question Diagram Container
    const imgContainer = document.getElementById('quiz-question-image-container');
    if (imgContainer) {
      if (q.image) {
        imgContainer.innerHTML = `<img src="${q.image}" class="max-h-80 rounded-xl border border-slate-200 p-2 bg-white shadow-sm" alt="Question ${q.questionNumber} Diagram" />`;
        imgContainer.classList.remove('hidden');
      } else {
        imgContainer.innerHTML = '';
        imgContainer.classList.add('hidden');
      }
    }


    // Flag button state
    const isFlagged = window.quizEngine.isFlagged(q.id);
    const btnFlag = document.getElementById('btn-quiz-flag');
    if (isFlagged) {
      btnFlag.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300';
      btnFlag.innerHTML = '<i data-lucide="flag" class="w-3.5 h-3.5 mr-1 fill-amber-500 text-amber-600"></i> Flagged';
    } else {
      btnFlag.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200';
      btnFlag.innerHTML = '<i data-lucide="flag" class="w-3.5 h-3.5 mr-1"></i> Flag for Review';
    }

    // Answer container
    const ansContainer = document.getElementById('quiz-answer-container');
    ansContainer.innerHTML = '';

    const currentAnswer = window.quizEngine.userAnswers[q.id];

    if (q.options && q.options.length > 0) {
      q.options.forEach(opt => {
        const isSelected = currentAnswer === opt.key;
        const optElem = document.createElement('div');
        optElem.className = `quiz-option p-4 rounded-xl border-2 cursor-pointer flex items-center space-x-3 transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-semibold' : 'border-slate-200 bg-white hover:border-slate-300'}`;
        optElem.onclick = () => {
          window.quizEngine.recordAnswer(q.id, opt.key);
          this.renderQuizCurrentQuestion();
          this.renderQuizPalette();
        };

        optElem.innerHTML = `
          <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold text-xs ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-500'}">
            ${opt.key}
          </div>
          <div class="text-sm flex-1 math-rendered">${opt.text}</div>
        `;
        ansContainer.appendChild(optElem);
      });
    } else {
      // Open-ended / Descriptive Textbox
      ansContainer.innerHTML = `
        <div class="space-y-2">
          <label class="text-xs font-semibold text-slate-500 block">Type your answer / notes:</label>
          <textarea id="quiz-text-ans" rows="4" placeholder="Enter your response here..." class="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-sans">${currentAnswer || ''}</textarea>
        </div>
      `;

      const txt = document.getElementById('quiz-text-ans');
      if (txt) {
        txt.oninput = (e) => {
          window.quizEngine.recordAnswer(q.id, e.target.value);
          this.renderQuizPalette();
        };
      }
    }

    // Prev / Next button state
    document.getElementById('btn-quiz-prev').disabled = idx === 0;
    document.getElementById('btn-quiz-prev').classList.toggle('opacity-50', idx === 0);
    document.getElementById('btn-quiz-next').disabled = idx === total - 1;
    document.getElementById('btn-quiz-next').classList.toggle('opacity-50', idx === total - 1);

    this.setupIcons();
    this.renderMathFormulas(document.getElementById('quiz-modal'));
  }

  renderQuizPalette() {
    const grid = document.getElementById('quiz-bubble-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const currIdx = window.quizEngine.currentQuestionIndex;

    window.quizEngine.questions.forEach((q, idx) => {
      const isCurrent = idx === currIdx;
      const isAnswered = window.quizEngine.userAnswers[q.id] !== undefined && window.quizEngine.userAnswers[q.id] !== '';
      const isFlagged = window.quizEngine.isFlagged(q.id);

      let bgClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
      if (isAnswered) bgClass = 'bg-emerald-500 text-white font-bold border-emerald-600';
      if (isFlagged) bgClass = 'bg-amber-500 text-white font-bold border-amber-600';
      if (isCurrent) bgClass += ' ring-2 ring-indigo-600 ring-offset-2';

      const bubble = document.createElement('button');
      bubble.className = `w-10 h-10 rounded-xl text-xs font-semibold border flex items-center justify-center transition-all ${bgClass}`;
      bubble.textContent = q.questionNumber || (idx + 1);
      bubble.onclick = () => {
        window.quizEngine.goToIndex(idx);
        this.renderQuizCurrentQuestion();
        this.renderQuizPalette();
      };

      grid.appendChild(bubble);
    });
  }

  toggleCurrentFlag() {
    const q = window.quizEngine.getCurrentQuestion();
    if (!q) return;
    window.quizEngine.toggleFlag(q.id);
    this.renderQuizCurrentQuestion();
    this.renderQuizPalette();
  }

  quizGoNext() {
    if (window.quizEngine.goToNext()) {
      this.renderQuizCurrentQuestion();
      this.renderQuizPalette();
    }
  }

  quizGoPrev() {
    if (window.quizEngine.goToPrevious()) {
      this.renderQuizCurrentQuestion();
      this.renderQuizPalette();
    }
  }

  confirmSubmitQuiz() {
    if (confirm('Are you sure you want to submit your mock test?')) {
      const results = window.quizEngine.submitQuiz();
      document.getElementById('quiz-modal').classList.add('hidden');
      this.showQuizResults(results);
    }
  }

  closeQuizModal() {
    if (confirm('Exit test? Your progress will be discarded.')) {
      window.quizEngine.stopTimer();
      document.getElementById('quiz-modal').classList.add('hidden');
    }
  }

  showQuizResults(res) {
    document.getElementById('res-score').textContent = `${res.totalScore} / ${res.maxPossibleScore}`;
    document.getElementById('res-percentage').textContent = `${res.percentage}%`;
    document.getElementById('res-time').textContent = res.timeTakenFormatted;

    const list = document.getElementById('res-breakdown-list');
    list.innerHTML = '';

    res.questionResults.forEach(r => {
      const item = document.createElement('div');
      item.className = 'py-3 text-xs space-y-1';

      let statusBadge = `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">Unattempted</span>`;
      if (r.status === 'correct') {
        statusBadge = `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">✓ Correct (+${r.awardedMarks}M)</span>`;
      } else if (r.status === 'incorrect') {
        statusBadge = `<span class="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold">✗ Incorrect (0M)</span>`;
      } else if (r.status === 'answered') {
        statusBadge = `<span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">Attempted (+${r.awardedMarks}M)</span>`;
      }

      item.innerHTML = `
        <div class="flex items-center justify-between">
          <strong class="text-slate-800">Q${r.questionNumber}:</strong>
          ${statusBadge}
        </div>
        <p class="text-slate-600 font-medium">${r.questionText}</p>
        <div class="flex items-center space-x-4 text-slate-500 pt-1">
          <div>Your Answer: <strong class="text-slate-800">${r.userAnswer || 'None'}</strong></div>
          ${r.correctAnswer ? `<div>Correct Key: <strong class="text-emerald-700">${r.correctAnswer}</strong></div>` : ''}
        </div>
      `;
      list.appendChild(item);
    });

    document.getElementById('quiz-result-modal').classList.remove('hidden');
    this.setupIcons();
  }

  closeQuizResults() {
    document.getElementById('quiz-result-modal').classList.add('hidden');
  }

  resetWorkspace() {
    this.extractedData = null;
    this.selectedFile = null;
    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('studio-workspace').classList.add('hidden');
    document.getElementById('btn-open-quiz').classList.add('hidden');
    document.getElementById('btn-open-export').classList.add('hidden');
    document.getElementById('btn-print').classList.add('hidden');
    const fileCard = document.getElementById('file-selected-card');
    if (fileCard) fileCard.classList.add('hidden');
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // PAPER VAULT & MULTI-EXAM REPOSITORY
  // ==========================================

  async updateVaultNavBadge() {
    if (!window.paperVault) return;
    try {
      const papers = await window.paperVault.getAllPapersSummary();
      const customFolders = await window.paperVault.getCustomFolders();
      const count = (papers ? papers.length : 0);
      const folderCount = (customFolders ? customFolders.length : 0);
      const navCountElem = document.getElementById('nav-vault-count');
      const modalBadgeElem = document.getElementById('vault-modal-badge');
      if (navCountElem) {
        if (count === 0 && folderCount > 0) {
          navCountElem.textContent = `Paper Vault (${folderCount} folder${folderCount === 1 ? '' : 's'})`;
        } else {
          navCountElem.textContent = `Paper Vault (${count})`;
        }
      }
      if (modalBadgeElem) {
        if (count === 0 && folderCount > 0) {
          modalBadgeElem.textContent = `${folderCount} Folder${folderCount === 1 ? '' : 's'} Created`;
        } else {
          modalBadgeElem.textContent = `${count} Paper${count === 1 ? '' : 's'} Stored`;
        }
      }
    } catch (e) {
      console.warn('Error updating vault badge:', e);
    }
  }

  async openVaultModal() {
    const modal = document.getElementById('paper-vault-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    await this.renderVaultContent();
    this.setupIcons();
  }

  closeVaultModal() {
    const modal = document.getElementById('paper-vault-modal');
    if (modal) modal.classList.add('hidden');
  }

  setVaultView(view) {
    this.vaultView = view;
    const btnHier = document.getElementById('btn-vault-view-hierarchy');
    const btnTable = document.getElementById('btn-vault-view-table');

    const activeClass = 'px-2.5 py-1 text-xs font-bold rounded-md bg-white text-indigo-700 shadow-xs flex items-center gap-1 transition-all';
    const inactiveClass = 'px-2.5 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-all';

    if (btnHier) btnHier.className = view === 'hierarchy' ? activeClass : inactiveClass;
    if (btnTable) btnTable.className = view === 'table' ? activeClass : inactiveClass;

    this.renderVaultContent();
  }

  async renderVaultContent() {
    if (!window.paperVault) return;
    this.updateVaultNavBadge();

    const papers = await window.paperVault.getAllPapersSummary();
    const customFolders = await window.paperVault.getCustomFolders();
    const emptyState = document.getElementById('vault-empty-state');
    const tableContainer = document.getElementById('vault-papers-table-container');
    const hierContainer = document.getElementById('vault-hierarchy-container');

    const hasPapers = papers && papers.length > 0;
    const hasFolders = customFolders && customFolders.length > 0;

    if (!hasPapers && !hasFolders) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (tableContainer) tableContainer.classList.add('hidden');
      if (hierContainer) hierContainer.classList.add('hidden');
      this.updateVaultSelectionUI();
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    if (this.vaultView === 'hierarchy' || !hasPapers) {
      if (hierContainer) hierContainer.classList.remove('hidden');
      if (tableContainer) tableContainer.classList.add('hidden');
      await this.renderVaultHierarchy();
    } else {
      if (tableContainer) tableContainer.classList.remove('hidden');
      if (hierContainer) hierContainer.classList.add('hidden');
      await this.renderVaultTable();
    }
  }

  async renderVaultHierarchy() {
    const container = document.getElementById('vault-hierarchy-container');
    if (!container || !window.paperVault) return;

    const hierarchy = await window.paperVault.getPapersGroupedByHierarchy();
    container.innerHTML = '';

    const boardNames = Object.keys(hierarchy);
    if (boardNames.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-xs text-center py-6">No papers found.</div>';
      return;
    }

    boardNames.forEach(board => {
      const boardBlock = document.createElement('div');
      boardBlock.className = 'bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden';

      // Board Header
      const boardHeader = document.createElement('div');
      boardHeader.className = 'px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between';
      boardHeader.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-base">🏛️</span>
          <span class="font-extrabold text-slate-800 text-xs uppercase tracking-wider">${this.escapeHtml(board)}</span>
        </div>
        <span class="text-[11px] text-slate-500 font-semibold">State / Commission Board</span>
      `;
      boardBlock.appendChild(boardHeader);

      const boardBody = document.createElement('div');
      boardBody.className = 'p-4 space-y-5';

      const exams = hierarchy[board];
      Object.keys(exams).forEach(examName => {
        const examGroup = exams[examName];
        const examBlock = document.createElement('div');
        examBlock.className = 'space-y-3';

        // Exam Title
        const examTitle = document.createElement('div');
        examTitle.className = 'flex items-center space-x-2 text-xs font-bold text-indigo-950 border-b border-slate-100 pb-1.5';
        examTitle.innerHTML = `
          <i data-lucide="clipboard-list" class="w-4 h-4 text-indigo-600"></i>
          <span>${this.escapeHtml(examName)}</span>
        `;
        examBlock.appendChild(examTitle);

        // Papers / Branches within this exam
        const papersObj = examGroup.papers || {};
        const paperKeys = Object.keys(papersObj);

        const papersGrid = document.createElement('div');
        papersGrid.className = 'space-y-4';

        paperKeys.forEach(pKey => {
          const paperBranch = papersObj[pKey];
          const isCommon = paperBranch.paperType === 'common';
          const yearsObj = paperBranch.years || {};
          const yearKeys = Object.keys(yearsObj).sort((a, b) => b.localeCompare(a)); // Newest year first

          // Collect all paper IDs in this branch
          const branchPaperIds = [];
          yearKeys.forEach(yr => {
            (yearsObj[yr] || []).forEach(p => branchPaperIds.push(p.id));
          });
          const allBranchSelected = branchPaperIds.length > 0 && branchPaperIds.every(id => this.selectedVaultPaperIds.has(id));

          const branchCard = document.createElement('div');
          branchCard.className = `rounded-xl border ${isCommon ? 'border-indigo-200 bg-indigo-50/30' : 'border-amber-200 bg-amber-50/20'} overflow-hidden`;

          // Branch Header (Common Paper vs Specialization)
          const branchHeader = document.createElement('div');
          branchHeader.className = `px-3.5 py-2.5 flex items-center justify-between border-b ${isCommon ? 'border-indigo-100 bg-indigo-100/50' : 'border-amber-100 bg-amber-100/50'}`;
          branchHeader.innerHTML = `
            <div class="flex items-center space-x-2">
              <span class="text-sm">${isCommon ? '📘' : '📙'}</span>
              <div>
                <span class="font-bold text-xs ${isCommon ? 'text-indigo-900' : 'text-amber-950'}">${this.escapeHtml(paperBranch.displayName)}</span>
                <span class="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${isCommon ? 'bg-indigo-200 text-indigo-800' : 'bg-amber-200 text-amber-900'}">${yearKeys.length} Exam Year${yearKeys.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <button onclick="app.openFolderUploadModal('${this.escapeHtml(board)}', '${this.escapeHtml(examName)}', '${paperBranch.paperKey}', '${paperBranch.paperType}', '${this.escapeHtml(paperBranch.paperCode || '')}', '${this.escapeHtml(paperBranch.specialization || '')}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1" title="Upload question paper directly into this branch folder">
                <i data-lucide="upload" class="w-3 h-3 text-amber-200"></i>
                <span>+ Upload Paper Here</span>
              </button>
              ${yearKeys.length === 0 ? `
              <button onclick="app.deleteCustomFolder('${this.escapeHtml(paperBranch.folderId || paperBranch.paperKey)}')" class="px-2 py-1 text-[11px] font-semibold rounded-lg bg-white text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all flex items-center gap-1" title="Delete this empty branch folder">
                <i data-lucide="trash-2" class="w-3 h-3 text-rose-500"></i>
                <span>Delete</span>
              </button>` : ''}
              ${yearKeys.length > 0 ? `
              <button onclick="app.toggleSelectBranchPapers('${paperBranch.paperKey}', ${!allBranchSelected})" class="px-2.5 py-1 text-[11px] font-semibold rounded-lg ${allBranchSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'} transition-all flex items-center gap-1">
                ${allBranchSelected ? '✓ All Years Selected' : '+ Select All Years'}
              </button>` : ''}
            </div>
          `;
          branchCard.appendChild(branchHeader);

          if (yearKeys.length === 0) {
            const emptyBranch = document.createElement('div');
            emptyBranch.className = 'p-6 text-center space-y-2 border border-dashed border-slate-200 rounded-lg m-3 bg-white/80';
            emptyBranch.innerHTML = `
              <div class="text-slate-400 text-xs font-semibold">📁 No question papers stored in this branch yet.</div>
              <button onclick="app.openFolderUploadModal('${this.escapeHtml(board)}', '${this.escapeHtml(examName)}', '${paperBranch.paperKey}', '${paperBranch.paperType}', '${this.escapeHtml(paperBranch.paperCode || '')}', '${this.escapeHtml(paperBranch.specialization || '')}')" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5">
                <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-amber-300"></i> Upload First Exam Paper
              </button>
            `;
            branchCard.appendChild(emptyBranch);
          } else {
            // Years Grid inside this paper
            const yearsGrid = document.createElement('div');
            yearsGrid.className = 'p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5';

            yearKeys.forEach(yr => {
              const paperList = yearsObj[yr] || [];
              paperList.forEach(p => {
                const isChecked = this.selectedVaultPaperIds.has(p.id);
                const yearCard = document.createElement('div');
                yearCard.className = `p-3 rounded-lg border bg-white flex flex-col justify-between space-y-2 hover:shadow-xs transition-all ${isChecked ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-slate-200'}`;

                yearCard.innerHTML = `
                  <div class="flex items-start justify-between gap-2">
                    <label class="flex items-center space-x-2 cursor-pointer">
                      <input type="checkbox" data-paper-id="${p.id}" ${isChecked ? 'checked' : ''} onchange="app.toggleVaultPaperSelection('${p.id}', this.checked)" class="vault-item-checkbox rounded text-indigo-600 focus:ring-indigo-500">
                      <span class="font-black text-slate-900 text-sm">📅 ${this.escapeHtml(p.year || yr)}</span>
                    </label>
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${isCommon ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'} border ${isCommon ? 'border-indigo-200' : 'border-amber-200'}">
                      ${this.escapeHtml(p.paperCode || (isCommon ? 'Paper 1' : 'Paper 2'))}
                    </span>
                  </div>

                  <div class="text-[11px] text-slate-600 font-medium line-clamp-1" title="${this.escapeHtml(p.title)}">
                    ${this.escapeHtml(p.title)}
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>${p.totalQuestions || 0} Qs • <strong class="text-slate-700">${p.totalMarks || 0}M</strong></span>
                    <div class="flex items-center space-x-1">
                      <button onclick="app.loadPaperFromVault('${p.id}')" class="px-2 py-0.8 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors" title="Open in Studio">Open</button>
                      <button onclick="app.openClassifyModal('${p.id}')" class="p-1 text-slate-500 hover:text-indigo-600 rounded transition-colors" title="Edit Classification / Tags"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
                      <button onclick="app.deletePaperFromVault('${p.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="Delete"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                    </div>
                  </div>
                `;
                yearsGrid.appendChild(yearCard);
              });
            });

            branchCard.appendChild(yearsGrid);
          }
          papersGrid.appendChild(branchCard);
        });

        examBlock.appendChild(papersGrid);
        boardBody.appendChild(examBlock);
      });

      boardBlock.appendChild(boardBody);
      container.appendChild(boardBlock);
    });

    this.updateVaultSelectionUI();
    this.setupIcons();
  }

  async renderVaultTable() {
    if (!window.paperVault) return;
    const tbody = document.getElementById('vault-papers-table-body');
    const tableContainer = document.getElementById('vault-papers-table-container');
    const emptyState = document.getElementById('vault-empty-state');
    if (!tbody) return;

    try {
      const papers = await window.paperVault.getAllPapersSummary();
      this.updateVaultNavBadge();

      if (!papers || papers.length === 0) {
        if (tableContainer) tableContainer.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        this.updateVaultSelectionUI();
        return;
      }

      if (tableContainer) tableContainer.classList.remove('hidden');
      if (emptyState) emptyState.classList.add('hidden');

      tbody.innerHTML = '';
      papers.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-indigo-50/40 transition-colors';

        const isChecked = this.selectedVaultPaperIds.has(p.id);

        tr.innerHTML = `
          <td class="px-3 py-3 text-center">
            <input type="checkbox" data-paper-id="${p.id}" ${isChecked ? 'checked' : ''} onchange="app.toggleVaultPaperSelection('${p.id}', this.checked)" class="vault-item-checkbox rounded text-indigo-600 focus:ring-indigo-500">
          </td>
          <td class="px-3 py-3">
            <div class="font-bold text-slate-800 text-xs">${this.escapeHtml(p.title || 'Untitled Exam Paper')}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${this.escapeHtml(p.filename || '')}</div>
          </td>
          <td class="px-3 py-3">
            <div class="font-bold text-slate-800 text-xs">${this.escapeHtml(p.board || 'State Board')}</div>
            <div class="text-[11px] text-indigo-700 font-medium">${this.escapeHtml(p.exam || 'General Exam')}</div>
          </td>
          <td class="px-3 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${p.paperType === 'common' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}">
              ${p.paperType === 'common' ? '📘 ' : '📙 '}${this.escapeHtml(p.specialization || p.subject || 'General')}
            </span>
          </td>
          <td class="px-3 py-3 text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
              ${p.year || 'N/A'}
            </span>
          </td>
          <td class="px-3 py-3 text-center font-semibold text-slate-700">
            ${p.totalQuestions || 0}
          </td>
          <td class="px-3 py-3 text-center font-bold text-indigo-700">
            ${p.totalMarks || 0} M
          </td>
          <td class="px-3 py-3 text-right whitespace-nowrap space-x-1">
            <button onclick="app.loadPaperFromVault('${p.id}')" class="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1" title="Open and edit in Studio">
              <i data-lucide="folder-open" class="w-3 h-3"></i> Open
            </button>
            <button onclick="app.openClassifyModal('${p.id}')" class="p-1 text-slate-500 hover:text-indigo-600 rounded transition-colors" title="Edit Classification / Tags"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
            <button onclick="app.deletePaperFromVault('${p.id}')" class="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center gap-1" title="Delete from Vault">
              <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      this.updateVaultSelectionUI();
      this.setupIcons();
    } catch (err) {
      console.error('Error rendering vault table:', err);
    }
  }

  toggleVaultPaperSelection(paperId, isChecked) {
    if (isChecked) {
      this.selectedVaultPaperIds.add(paperId);
    } else {
      this.selectedVaultPaperIds.delete(paperId);
    }
    this.updateVaultSelectionUI();
  }

  async toggleSelectAllVault(isChecked) {
    if (!window.paperVault) return;
    const papers = await window.paperVault.getAllPapersSummary();
    if (isChecked) {
      papers.forEach(p => this.selectedVaultPaperIds.add(p.id));
    } else {
      this.selectedVaultPaperIds.clear();
    }
    const checkboxes = document.querySelectorAll('.vault-item-checkbox');
    checkboxes.forEach(cb => { cb.checked = isChecked; });
    this.updateVaultSelectionUI();
  }

  async toggleSelectBranchPapers(paperKey, selectAll) {
    if (!window.paperVault) return;
    const hierarchy = await window.paperVault.getPapersGroupedByHierarchy();

    const targetIds = [];
    Object.keys(hierarchy).forEach(b => {
      Object.keys(hierarchy[b]).forEach(ex => {
        const pObj = hierarchy[b][ex].papers?.[paperKey];
        if (pObj && pObj.years) {
          Object.keys(pObj.years).forEach(yr => {
            (pObj.years[yr] || []).forEach(p => targetIds.push(p.id));
          });
        }
      });
    });

    targetIds.forEach(id => {
      if (selectAll) {
        this.selectedVaultPaperIds.add(id);
      } else {
        this.selectedVaultPaperIds.delete(id);
      }
    });

    await this.renderVaultContent();
  }

  updateVaultSelectionUI() {
    const counterElem = document.getElementById('vault-selection-counter');
    const analyzeBtn = document.getElementById('btn-vault-analyze');
    const selectAllCb = document.getElementById('vault-select-all');

    const count = this.selectedVaultPaperIds.size;
    if (counterElem) {
      counterElem.textContent = count === 1 ? '1 paper selected' : `${count} papers selected`;
    }

    if (analyzeBtn) {
      if (count > 0) {
        analyzeBtn.disabled = false;
        analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        analyzeBtn.innerHTML = `
          <i data-lucide="sparkles" class="w-4 h-4 text-amber-300"></i>
          <span>Analyze Exam Patterns (${count} Paper${count > 1 ? 's' : ''})</span>
        `;
      } else {
        analyzeBtn.disabled = true;
        analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        analyzeBtn.innerHTML = `
          <i data-lucide="sparkles" class="w-4 h-4 text-amber-300"></i>
          <span>Analyze Exam Patterns (Gemini AI)</span>
        `;
      }
    }

    const allCheckboxes = document.querySelectorAll('.vault-item-checkbox');
    if (selectAllCb && allCheckboxes.length > 0) {
      selectAllCb.checked = count === allCheckboxes.length;
    }
    this.setupIcons();
  }

  // --- Classification Modal Controller ---

  async openClassifyModal(paperId) {
    const id = paperId || this.currentPaperVaultId;
    if (!window.paperVault || !id) {
      alert('Please select or extract a question paper first.');
      return;
    }
    const paper = await window.paperVault.getPaper(id);
    if (!paper) {
      alert('Paper record not found in Vault.');
      return;
    }

    document.getElementById('classify-paper-id').value = paper.id;
    document.getElementById('classify-title').value = paper.title || '';
    document.getElementById('classify-board').value = paper.board || 'TGPSC (Telangana Board)';
    document.getElementById('classify-exam').value = paper.exam || 'AEE (Assistant Executive Engineer)';
    document.getElementById('classify-year').value = paper.year || '';
    document.getElementById('classify-paper-code').value = paper.paperCode || (paper.paperType === 'common' ? 'Paper 1' : 'Paper 2');
    document.getElementById('classify-specialization').value = paper.specialization || (paper.paperType === 'common' ? 'General Studies & Mental Ability (GS&MA)' : 'Civil Engineering');

    const typeRadios = document.querySelectorAll('input[name="classify-paper-type"]');
    typeRadios.forEach(r => {
      r.checked = r.value === (paper.paperType || 'common');
    });

    // Populate existing folders quick selector
    const selectElem = document.getElementById('classify-existing-folders-select');
    if (selectElem) {
      selectElem.innerHTML = '<option value="">-- Or enter custom Board & Exam manually below --</option>';
      try {
        const customFolders = await window.paperVault.getCustomFolders();
        customFolders.forEach((f, idx) => {
          const opt = document.createElement('option');
          opt.value = String(idx);
          const isCommon = f.paperType === 'common';
          opt.textContent = `${isCommon ? '📘' : '📙'} ${f.board} ➔ ${f.exam} ➔ ${f.paperCode ? f.paperCode + ': ' : ''}${f.specialization}`;
          selectElem.appendChild(opt);
        });

        selectElem.onchange = () => {
          const val = selectElem.value;
          if (val !== '' && customFolders[val]) {
            const chosen = customFolders[val];
            if (chosen.board) document.getElementById('classify-board').value = chosen.board;
            if (chosen.exam) document.getElementById('classify-exam').value = chosen.exam;
            if (chosen.specialization) document.getElementById('classify-specialization').value = chosen.specialization;
            if (chosen.paperCode) document.getElementById('classify-paper-code').value = chosen.paperCode;
            typeRadios.forEach(r => {
              r.checked = r.value === (chosen.paperType || 'common');
            });
          }
        };
      } catch (e) {
        console.warn('Error loading custom folders into classify modal:', e);
      }
    }

    const modal = document.getElementById('paper-classify-modal');
    if (modal) modal.classList.remove('hidden');
    this.setupIcons();
  }

  closeClassifyModal() {
    const modal = document.getElementById('paper-classify-modal');
    if (modal) modal.classList.add('hidden');
  }

  onClassifyPaperTypeChange(val) {
    const specInput = document.getElementById('classify-specialization');
    const codeInput = document.getElementById('classify-paper-code');
    if (val === 'common') {
      if (specInput && (!specInput.value || specInput.value.includes('Engineering'))) {
        specInput.value = 'General Studies & Mental Ability (GS&MA)';
      }
      if (codeInput) codeInput.value = 'Paper 1';
    } else {
      if (specInput && (specInput.value.includes('General Studies') || !specInput.value)) {
        specInput.value = 'Civil Engineering';
      }
      if (codeInput) codeInput.value = 'Paper 2';
    }
  }

  async saveClassificationFromModal() {
    if (!window.paperVault) return;
    const paperId = document.getElementById('classify-paper-id')?.value;
    if (!paperId) return;

    const title = document.getElementById('classify-title')?.value || '';
    const board = document.getElementById('classify-board')?.value || 'State Board';
    const exam = document.getElementById('classify-exam')?.value || 'General Examination';
    const year = document.getElementById('classify-year')?.value || '';
    const paperCode = document.getElementById('classify-paper-code')?.value || 'Paper 1';
    const specialization = document.getElementById('classify-specialization')?.value || 'General Studies';
    const paperTypeRadio = document.querySelector('input[name="classify-paper-type"]:checked');
    const paperType = paperTypeRadio ? paperTypeRadio.value : 'common';

    try {
      await window.paperVault.updatePaperClassification(paperId, {
        title,
        board,
        exam,
        year,
        paperCode,
        specialization,
        paperType
      });
      this.closeClassifyModal();
      await this.renderVaultContent();

      const updated = await window.paperVault.getPaper(paperId);
      if (updated) {
        this.renderStudioFolderLocation(updated);
      }
    } catch (e) {
      alert(`Could not update classification: ${e.message || e}`);
    }
  }

  renderStudioFolderLocation(paper) {
    if (!paper) return;
    const banner = document.getElementById('studio-vault-banner');
    if (!banner) return;
    banner.classList.remove('hidden');

    const bBoard = document.getElementById('studio-vault-board');
    const bExam = document.getElementById('studio-vault-exam');
    const bBranch = document.getElementById('studio-vault-branch');
    const bYear = document.getElementById('studio-vault-year');

    const isCommon = paper.paperType === 'common';
    if (bBoard) bBoard.textContent = `🏛️ ${paper.board || 'State Board'}`;
    if (bExam) bExam.textContent = `📋 ${paper.exam || 'General Exam'}`;
    if (bBranch) {
      bBranch.textContent = `${isCommon ? '📘' : '📙'} ${paper.paperCode ? paper.paperCode + ': ' : ''}${paper.specialization || (isCommon ? 'General Studies' : 'Specialization')}`;
      bBranch.className = `px-2 py-0.5 ${isCommon ? 'bg-indigo-100 border-indigo-300 text-indigo-900' : 'bg-amber-100 border-amber-300 text-amber-900'} rounded border font-bold`;
    }
    if (bYear) bYear.textContent = `📅 ${paper.year || 'N/A'}`;
    this.setupIcons();
  }

  // --- New Folder Modal Methods ---

  openNewFolderModal() {
    const modal = document.getElementById('new-folder-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const boardInput = document.getElementById('new-folder-board');
    const examInput = document.getElementById('new-folder-exam');
    const specInput = document.getElementById('new-folder-specialization');
    const codeInput = document.getElementById('new-folder-paper-code');
    if (boardInput) boardInput.value = '';
    if (examInput) examInput.value = '';
    if (specInput) specInput.value = 'General Studies & Mental Ability (GS&MA)';
    if (codeInput) codeInput.value = 'Paper 1';
    const radioCommon = document.querySelector('input[name="new-folder-paper-type"][value="common"]');
    if (radioCommon) radioCommon.checked = true;
    this.setupIcons();
  }

  closeNewFolderModal() {
    const modal = document.getElementById('new-folder-modal');
    if (modal) modal.classList.add('hidden');
  }

  onNewFolderTypeChange(val) {
    const specInput = document.getElementById('new-folder-specialization');
    const codeInput = document.getElementById('new-folder-paper-code');
    if (val === 'common') {
      if (specInput) specInput.value = 'General Studies & Mental Ability (GS&MA)';
      if (codeInput) codeInput.value = 'Paper 1';
    } else {
      if (specInput) specInput.value = 'Civil Engineering';
      if (codeInput) codeInput.value = 'Paper 2';
    }
  }

  async saveNewFolderFromModal() {
    const board = document.getElementById('new-folder-board')?.value.trim();
    const exam = document.getElementById('new-folder-exam')?.value.trim();
    const paperType = document.querySelector('input[name="new-folder-paper-type"]:checked')?.value || 'common';
    const specialization = document.getElementById('new-folder-specialization')?.value.trim();
    const paperCode = document.getElementById('new-folder-paper-code')?.value.trim();

    if (!board) {
      alert('Please specify a State / Board Authority (e.g. TGPSC, APPSC, UPSC).');
      return;
    }
    if (!exam) {
      alert('Please specify an Exam Name (e.g. AEE, Police Constable, Group 1).');
      return;
    }
    if (!specialization) {
      alert('Please specify a Specialization or Discipline name.');
      return;
    }

    try {
      await window.paperVault.createFolder({
        board,
        exam,
        paperType,
        paperCode,
        specialization
      });
      this.closeNewFolderModal();
      this.openVaultModal();
      await this.renderVaultContent();
      this.setupIcons();
    } catch (e) {
      alert(`Could not create folder: ${e.message || e}`);
    }
  }

  async deleteCustomFolder(folderId) {
    if (!confirm('Are you sure you want to remove this empty folder branch?')) return;
    if (!window.paperVault) return;
    try {
      await window.paperVault.deleteFolder(folderId);
      await this.renderVaultContent();
      this.setupIcons();
    } catch (e) {
      alert(`Could not delete folder: ${e.message || e}`);
    }
  }

  // --- Targeted In-Folder Paper Upload Methods ---

  openFolderUploadModal(board, exam, paperKey, paperType, paperCode, specialization) {
    this.currentFolderUploadTarget = {
      board,
      exam,
      paperKey,
      paperType,
      paperCode,
      specialization
    };
    this.folderUploadSelectedFile = null;

    const modal = document.getElementById('folder-upload-modal');
    if (!modal) return;

    const bBoard = document.getElementById('target-breadcrumb-board');
    const bExam = document.getElementById('target-breadcrumb-exam');
    const bBranch = document.getElementById('target-breadcrumb-branch');
    const isCommon = paperType === 'common';

    if (bBoard) bBoard.textContent = `🏛️ ${board}`;
    if (bExam) bExam.textContent = `📋 ${exam}`;
    if (bBranch) bBranch.textContent = `${isCommon ? '📘' : '📙'} ${paperCode ? paperCode + ': ' : ''}${specialization}`;

    const currentYear = new Date().getFullYear().toString();
    const yearInput = document.getElementById('target-upload-year');
    const titleInput = document.getElementById('target-upload-title');
    if (yearInput) yearInput.value = currentYear;
    if (titleInput) titleInput.value = `${board} ${exam} ${specialization} ${currentYear}`;

    const dropzoneLabel = document.getElementById('target-dropzone-label');
    if (dropzoneLabel) dropzoneLabel.textContent = 'Click to browse or drop PDF / DOCX / Image';

    const fileInput = document.getElementById('target-upload-file-input');
    if (fileInput) fileInput.value = '';

    const progressElem = document.getElementById('target-upload-progress');
    if (progressElem) progressElem.classList.add('hidden');

    modal.classList.remove('hidden');
    this.setupIcons();
  }

  closeFolderUploadModal() {
    const modal = document.getElementById('folder-upload-modal');
    if (modal) modal.classList.add('hidden');
    this.folderUploadSelectedFile = null;
  }

  onTargetFolderFileSelected(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    this.folderUploadSelectedFile = files[0];
    const dropzoneLabel = document.getElementById('target-dropzone-label');
    if (dropzoneLabel) {
      dropzoneLabel.innerHTML = `📄 <strong class="text-indigo-700">${this.escapeHtml(files[0].name)}</strong> (${Math.round(files[0].size / 1024)} KB)`;
    }
  }

  async executeFolderUpload() {
    if (!this.currentFolderUploadTarget) return;

    const yearInput = document.getElementById('target-upload-year');
    const year = yearInput ? yearInput.value.trim() : '';
    if (!year) {
      alert('Please specify the Exam Year (e.g. 2024, 2023, 2018).');
      return;
    }

    if (!this.folderUploadSelectedFile) {
      alert('Please select a question paper file (PDF, Word DOCX, or Image).');
      return;
    }

    const file = this.folderUploadSelectedFile;
    const titleInput = document.getElementById('target-upload-title');
    const customTitle = titleInput?.value.trim() || `${this.currentFolderUploadTarget.board} ${this.currentFolderUploadTarget.exam} ${this.currentFolderUploadTarget.specialization} ${year}`;

    const engineRadio = document.querySelector('input[name="target-upload-engine"]:checked');
    const engine = engineRadio ? engineRadio.value : 'gemini';

    const progressElem = document.getElementById('target-upload-progress');
    const progressLabel = document.getElementById('target-progress-label');
    const progressBar = document.getElementById('target-progress-bar');
    const progressPct = document.getElementById('target-progress-percent');
    const submitBtn = document.getElementById('target-upload-submit-btn');
    const cancelBtn = document.getElementById('target-upload-cancel-btn');

    if (progressElem) progressElem.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const updateProg = (msg, pct) => {
      if (progressLabel) progressLabel.textContent = msg;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressPct) progressPct.textContent = `${pct}%`;
    };

    try {
      updateProg('Reading file content...', 20);
      let extracted = null;
      const ext = file.name.split('.').pop().toLowerCase();

      // Extraction branch
      if (engine === 'gemini' && window.geminiHandler && window.geminiHandler.hasAnyKey()) {
        updateProg('Processing with Gemini AI Intelligence...', 40);
        if (ext === 'pdf' && window.pdfHandler) {
          const pdfText = await window.pdfHandler.extractText(file, (msg, p) => updateProg(msg, 20 + Math.round(p * 0.3)));
          const res = await window.geminiHandler.extractFromText(pdfText.fullText, file.name, (msg, p) => updateProg(msg, 50 + Math.round(p * 0.4)));
          extracted = typeof res === 'string' ? JSON.parse(res) : res;
        } else {
          const res = await window.geminiHandler.extractFromFile(file, (msg, p) => updateProg(msg, 30 + Math.round(p * 0.6)));
          extracted = typeof res === 'string' ? JSON.parse(res) : res;
        }
      } else {
        // Local extraction engine fallback
        updateProg('Processing with client-side extractor...', 40);
        if (ext === 'pdf' && window.pdfHandler) {
          const pdfText = await window.pdfHandler.extractText(file, (msg, p) => updateProg(msg, 20 + Math.round(p * 0.4)));
          extracted = window.extractorEngine.extract(pdfText.fullText);
        } else if ((ext === 'docx' || ext === 'doc') && window.docxHandler) {
          const docText = await window.docxHandler.extractText(file);
          extracted = window.extractorEngine.extract(docText);
        } else if (file.type.startsWith('image/') && window.ocrHandler) {
          const ocrText = await window.ocrHandler.recognize(file, (msg, p) => updateProg(msg, 20 + Math.round(p * 0.5)));
          extracted = window.extractorEngine.extract(ocrText);
        } else {
          const text = await file.text();
          extracted = window.extractorEngine.extract(text);
        }
      }

      if (!extracted) {
        throw new Error('Could not extract questions from document.');
      }

      updateProg('Saving paper directly under branch folder...', 90);
      const target = this.currentFolderUploadTarget;

      await window.paperVault.savePaper(extracted, {
        title: customTitle,
        board: target.board,
        exam: target.exam,
        paperType: target.paperType,
        paperCode: target.paperCode,
        specialization: target.specialization,
        year: year,
        filename: file.name,
        source: engine === 'gemini' ? 'gemini_ai' : 'local_engine'
      });

      updateProg('Done!', 100);
      this.closeFolderUploadModal();
      await this.renderVaultContent();
      this.setupIcons();

      alert(`✅ Successfully saved question paper under:\n${target.board} ➔ ${target.exam} ➔ ${target.specialization} ➔ ${year}!`);
    } catch (err) {
      console.error('Folder upload error:', err);
      alert(`Extraction failed: ${err.message || err}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (progressElem) progressElem.classList.add('hidden');
    }
  }

  addNewPaperToVaultFromUpload() {
    this.closeVaultModal();
    const uploadSection = document.getElementById('upload-section');
    if (uploadSection) {
      uploadSection.classList.remove('hidden');
      uploadSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async loadPaperFromVault(paperId) {
    if (!window.paperVault) return;
    try {
      const fullRecord = await window.paperVault.getPaper(paperId);
      if (!fullRecord || !fullRecord.paperData) {
        alert('Could not find paper record in Vault.');
        return;
      }
      this.closeVaultModal();
      this.currentPaperVaultId = fullRecord.id;
      this.renderExtractedPaper(fullRecord.paperData);
      this.renderStudioFolderLocation(fullRecord);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error loading paper from vault:', err);
      alert(`Failed to load paper: ${err.message || err}`);
    }
  }

  async deletePaperFromVault(paperId) {
    if (!confirm('Are you sure you want to remove this paper from your Vault? This action cannot be undone.')) {
      return;
    }
    try {
      await window.paperVault.deletePaper(paperId);
      this.selectedVaultPaperIds.delete(paperId);
      await this.renderVaultContent();
    } catch (err) {
      console.error('Error deleting paper from vault:', err);
      alert(`Could not delete paper: ${err.message || err}`);
    }
  }

  async exportVaultBackup() {
    if (!window.paperVault) return;
    try {
      const jsonStr = await window.paperVault.exportVaultBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PaperExtract_Vault_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error exporting backup: ${err.message || err}`);
    }
  }

  async handleVaultFileImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const res = await window.paperVault.importVaultBackup(text);
        alert(`Successfully imported ${res.imported} question paper(s) into your Vault!`);
        await this.renderVaultContent();
      } catch (err) {
        alert(`Failed to import vault file: ${err.message || err}`);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  async loadSamplePapersToVault() {
    if (!window.SAMPLE_QUESTION_PAPERS || !window.paperVault) return;
    try {
      const sampleMetaMap = {
        ts_police: {
          board: 'TSLPRB (Telangana Police)',
          exam: 'Police Constable',
          year: '2015',
          paperType: 'common',
          paperCode: 'Paper 1',
          specialization: 'General Studies & Mental Ability (GS&MA)'
        },
        math: {
          board: 'CBSE',
          exam: 'Class 10 Board Exam',
          year: '2024',
          paperType: 'specialization',
          paperCode: 'Paper 1',
          specialization: 'Mathematics'
        },
        physics: {
          board: 'CBSE',
          exam: 'Class 12 Board Exam',
          year: '2024',
          paperType: 'specialization',
          paperCode: 'Paper 1',
          specialization: 'Physics'
        },
        cs: {
          board: 'CBSE',
          exam: 'Class 12 Board Exam',
          year: '2024',
          paperType: 'specialization',
          paperCode: 'Paper 1',
          specialization: 'Computer Science'
        },
        gk: {
          board: 'State Board / Commission',
          exam: 'General Olympiad',
          year: '2023',
          paperType: 'common',
          paperCode: 'Paper 1',
          specialization: 'General Knowledge & Current Affairs'
        },
        cbt_response: {
          board: 'TGPSC (Telangana Board)',
          exam: 'AEE (Assistant Executive Engineer)',
          year: '2023',
          paperType: 'specialization',
          paperCode: 'Paper 2',
          specialization: 'Civil Engineering'
        }
      };

      const keys = Object.keys(window.SAMPLE_QUESTION_PAPERS);
      for (const k of keys) {
        const s = window.SAMPLE_QUESTION_PAPERS[k];
        const extracted = window.extractorEngine.extract(s.text, { images: s.images || [] });
        const meta = sampleMetaMap[k] || {};
        await window.paperVault.savePaper(extracted, {
          filename: `${k}_sample.txt`,
          source: 'sample_library',
          ...meta
        });
      }
      alert(`Loaded ${keys.length} classified exam papers into your Vault!`);
      await this.renderVaultContent();
    } catch (err) {
      alert(`Could not load sample papers: ${err.message || err}`);
    }
  }

  addNewPaperToVaultFromUpload() {
    this.closeVaultModal();
    this.resetWorkspace();
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.click();
  }

  // ==========================================
  // EXAM INTELLIGENCE & PATTERN DISCOVERY STUDIO
  // ==========================================

  async analyzeSelectedPapersWithGemini() {
    if (this.selectedVaultPaperIds.size === 0) {
      alert('Please select at least 1 question paper from the Vault to analyze.');
      return;
    }

    if (!window.geminiKeyManager || !window.geminiKeyManager.hasKeys()) {
      if (confirm('Gemini API Key is required for deep Pattern Discovery & Exam Intelligence.\n\nWould you like to add your Gemini API Key now?')) {
        this.openAiKeyModal('add');
      }
      return;
    }

    // Load full paper objects
    const papers = [];
    for (const id of this.selectedVaultPaperIds) {
      const p = await window.paperVault.getPaper(id);
      if (p) papers.push(p);
    }

    if (papers.length === 0) {
      alert('Selected papers could not be retrieved from the vault.');
      return;
    }

    // Close vault modal, open analysis modal with loading state
    this.closeVaultModal();
    this.openPatternAnalysisModal();

    const titleElem = document.getElementById('analysis-modal-title');
    const subtitleElem = document.getElementById('analysis-modal-subtitle');
    const bodyElem = document.getElementById('analysis-modal-body');

    if (titleElem) titleElem.textContent = 'Discovering Exam Design Logic & Patterns...';
    if (subtitleElem) subtitleElem.textContent = `Analyzing ${papers.length} question paper${papers.length > 1 ? 's' : ''} with Gemini AI`;

    if (bodyElem) {
      bodyElem.innerHTML = `
        <div class="py-16 text-center space-y-4 max-w-md mx-auto animate-pulse">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
            <i data-lucide="sparkles" class="w-8 h-8 text-amber-500 animate-spin"></i>
          </div>
          <h4 id="analysis-progress-label" class="text-base font-bold text-slate-800">Synthesizing Cross-Paper Architecture...</h4>
          <p id="analysis-progress-sublabel" class="text-xs text-slate-500">Compacting exam structural digests, topic matrices, and archetypes for Gemini AI reasoning...</p>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div id="analysis-progress-fill" class="bg-gradient-to-r from-indigo-600 to-purple-600 h-2.5 rounded-full transition-all duration-300" style="width: 25%"></div>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">Running on model: ${window.geminiHandler ? window.geminiHandler.getModelName() : 'gemini-2.5-flash'}</div>
        </div>
      `;
      this.setupIcons();
    }

    try {
      const report = await window.paperPatternAnalyzer.analyzeExamPatterns(papers, {
        onProgress: (status, percent) => {
          const pLabel = document.getElementById('analysis-progress-label');
          const pFill = document.getElementById('analysis-progress-fill');
          if (pLabel) pLabel.textContent = status;
          if (pFill) pFill.style.width = `${percent}%`;
        }
      });

      this.currentAnalysisReport = report;

      // Save to vault for history
      await window.paperVault.saveAnalysisReport(report);

      // Update modal header
      if (titleElem) {
        titleElem.textContent = `${report.executiveBlueprint?.examTitle || 'Exam'} Blueprint & Pattern Discovery`;
      }
      if (subtitleElem) {
        subtitleElem.textContent = `${report.totalPapersAnalyzed} Paper(s) Analyzed (${report.yearsCovered || 'All Years'}) • Generated by Gemini AI`;
      }

      this.setAnalysisTab('blueprint');
    } catch (err) {
      console.error('Pattern analysis failed:', err);
      if (bodyElem) {
        bodyElem.innerHTML = `
          <div class="py-12 text-center space-y-4 max-w-lg mx-auto">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <i data-lucide="alert-circle" class="w-7 h-7"></i>
            </div>
            <h4 class="text-base font-bold text-slate-800">Pattern Discovery Encountered an Issue</h4>
            <p class="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200 text-left font-mono">${this.escapeHtml(err.message || String(err))}</p>
            <div class="flex justify-center gap-3">
              <button onclick="app.analyzeSelectedPapersWithGemini()" class="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg text-xs hover:bg-indigo-700 transition-colors">
                Retry Analysis
              </button>
              <button onclick="app.closePatternAnalysisModal()" class="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs hover:bg-slate-300 transition-colors">
                Close
              </button>
            </div>
          </div>
        `;
        this.setupIcons();
      }
    }
  }

  openPatternAnalysisModal(report = null) {
    if (report) {
      this.currentAnalysisReport = report;
    }
    const modal = document.getElementById('pattern-analysis-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.setupIcons();
    }
  }

  closePatternAnalysisModal() {
    const modal = document.getElementById('pattern-analysis-modal');
    if (modal) modal.classList.add('hidden');
  }

  setAnalysisTab(tab) {
    this.currentAnalysisTab = tab;
    const tabs = ['blueprint', 'topics', 'traps', 'forecast', 'strategy', 'markdown'];

    tabs.forEach(t => {
      const btn = document.getElementById(`tab-analysis-${t}`);
      if (btn) {
        if (t === tab) {
          btn.className = 'py-3 px-3 font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center gap-1.5 whitespace-nowrap';
        } else {
          btn.className = 'py-3 px-3 font-semibold text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-1.5 whitespace-nowrap';
        }
      }
    });

    this.renderAnalysisTabContent();
    this.setupIcons();
    this.renderMathFormulas();
  }

  renderAnalysisTabContent() {
    const bodyElem = document.getElementById('analysis-modal-body');
    if (!bodyElem) return;

    if (!this.currentAnalysisReport) {
      bodyElem.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          No analysis report available. Please select papers and click "Analyze Exam Patterns".
        </div>
      `;
      return;
    }

    const r = this.currentAnalysisReport;
    const bp = r.executiveBlueprint || {};
    const diff = r.difficultyDistribution || {};

    if (this.currentAnalysisTab === 'blueprint') {
      bodyElem.innerHTML = `
        <div class="space-y-6">
          <!-- KPI Highlights Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
              <div class="text-[11px] font-bold uppercase text-indigo-700">Questions per Paper</div>
              <div class="text-xl font-extrabold text-indigo-950 mt-1">${bp.standardQuestionCount || 0} Qs</div>
              <div class="text-[10px] text-indigo-600 mt-0.5">Total Marks: ${bp.totalCalculatedMarks || bp.standardQuestionCount || 0}M</div>
            </div>
            <div class="bg-purple-50/70 border border-purple-100 rounded-xl p-3.5">
              <div class="text-[11px] font-bold uppercase text-purple-700">Target Pace & Duration</div>
              <div class="text-xl font-extrabold text-purple-950 mt-1">${bp.timePerQuestionSeconds || '54 sec/Q'}</div>
              <div class="text-[10px] text-purple-600 mt-0.5">Duration: ${bp.standardDuration || '180 mins'}</div>
            </div>
            <div class="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5">
              <div class="text-[11px] font-bold uppercase text-amber-700">Scoring & Negative Marking</div>
              <div class="text-sm font-bold text-amber-950 mt-1">${bp.scoringLogic || 'Standard 1 Mark'}</div>
              <div class="text-[10px] text-amber-700 mt-0.5">Penalizes random guesswork</div>
            </div>
            <div class="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3.5">
              <div class="text-[11px] font-bold uppercase text-emerald-700">Papers & Timeline</div>
              <div class="text-xl font-extrabold text-emerald-950 mt-1">${r.totalPapersAnalyzed || 1} Papers</div>
              <div class="text-[10px] text-emerald-600 mt-0.5">Span: ${r.yearsCovered || 'Multi-Year'}</div>
            </div>
          </div>

          <!-- Difficulty Distribution Breakdown -->
          <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="bar-chart-2" class="w-4 h-4 text-indigo-600"></i>
              Cognitive Level & Difficulty Distribution
            </h4>
            <div class="w-full h-4 bg-slate-100 rounded-full flex overflow-hidden">
              <div style="width: ${diff.level1RecallPercent || 30}%" class="bg-emerald-500" title="Level 1: Factual Recall (${diff.level1RecallPercent || 30}%)"></div>
              <div style="width: ${diff.level2ApplicationPercent || 45}%" class="bg-indigo-600" title="Level 2: Applied Analysis (${diff.level2ApplicationPercent || 45}%)"></div>
              <div style="width: ${diff.level3SynthesisPercent || 25}%" class="bg-amber-500" title="Level 3: Complex Synthesis (${diff.level3SynthesisPercent || 25}%)"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div class="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                <div class="font-bold text-emerald-800 flex items-center justify-between">
                  <span>Level 1: Direct Recall</span>
                  <span>${diff.level1RecallPercent || 30}%</span>
                </div>
                <p class="text-[11px] text-emerald-700 mt-1">${diff.level1Desc || 'Direct factual definitions, dates, and baseline questions.'}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
                <div class="font-bold text-indigo-800 flex items-center justify-between">
                  <span>Level 2: Applied Conceptual</span>
                  <span>${diff.level2ApplicationPercent || 45}%</span>
                </div>
                <p class="text-[11px] text-indigo-700 mt-1">${diff.level2Desc || 'Multi-step arithmetic, applied reasoning, and thematic constitutional articles.'}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                <div class="font-bold text-amber-800 flex items-center justify-between">
                  <span>Level 3: Deep Synthesis</span>
                  <span>${diff.level3SynthesisPercent || 25}%</span>
                </div>
                <p class="text-[11px] text-amber-700 mt-1">${diff.level3Desc || 'Multi-statement evaluations (a, b, c), chronological match matrices, and distractor traps.'}</p>
              </div>
            </div>
            <div class="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg">
              <strong>Examiner Design Pattern:</strong> ${diff.overallDifficultySummary || 'Balanced qualifying standard designed to reward high accuracy and penalize negative guessing.'}
            </div>
          </div>

          <!-- Question Archetypes Aggregated -->
          <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="layers" class="w-4 h-4 text-purple-600"></i>
              Structural Question Archetypes (Extracted from Selected Papers)
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div class="text-lg font-extrabold text-slate-800">${r.archetypeSummary?.statementQuestions || 0}</div>
                <div class="text-[11px] text-slate-600 font-medium mt-0.5">Statement-Based (a, b, c)</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div class="text-lg font-extrabold text-slate-800">${r.archetypeSummary?.matchTableQuestions || 0}</div>
                <div class="text-[11px] text-slate-600 font-medium mt-0.5">Match Matrix Tables</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div class="text-lg font-extrabold text-slate-800">${r.archetypeSummary?.numericalQuestions || 0}</div>
                <div class="text-[11px] text-slate-600 font-medium mt-0.5">Formula / Math Problems</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div class="text-lg font-extrabold text-slate-800">${r.archetypeSummary?.bilingualQuestions || 0}</div>
                <div class="text-[11px] text-slate-600 font-medium mt-0.5">Bilingual (Telugu/English)</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentAnalysisTab === 'topics') {
      const topics = r.topicWeightageMatrix || [];
      bodyElem.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="pie-chart" class="w-4 h-4 text-indigo-600"></i>
              Multi-Year Topic Weightage & Recurrence Heatmap
            </h4>
            <span class="text-xs text-slate-500 font-medium">${topics.length} Key Domains Mapped</span>
          </div>

          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <table class="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th class="px-3 py-2.5">Domain / Subject Topic</th>
                  <th class="px-3 py-2.5 text-center">Weightage</th>
                  <th class="px-3 py-2.5 text-center">Avg Questions</th>
                  <th class="px-3 py-2.5 text-center">Trend</th>
                  <th class="px-3 py-2.5">High-Yield Hotspots</th>
                  <th class="px-3 py-2.5">Examiner Focus</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${topics.map(t => {
                  let trendBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Stable ➔</span>';
                  if (t.trend === 'increasing') {
                    trendBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Rising ↗</span>';
                  } else if (t.trend === 'decreasing') {
                    trendBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Falling ↘</span>';
                  }

                  return `
                    <tr class="hover:bg-indigo-50/30 transition-colors">
                      <td class="px-3 py-3 font-bold text-slate-800">
                        ${this.escapeHtml(t.topic)}
                        ${t.recurrenceRate ? `<div class="text-[10px] font-normal text-indigo-600">${t.recurrenceRate} recurrence across years</div>` : ''}
                      </td>
                      <td class="px-3 py-3 text-center">
                        <span class="px-2 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-100">
                          ${t.weightagePercent}%
                        </span>
                      </td>
                      <td class="px-3 py-3 text-center font-semibold text-slate-700">
                        ${t.averageQuestions} Qs
                      </td>
                      <td class="px-3 py-3 text-center">
                        ${trendBadge}
                      </td>
                      <td class="px-3 py-3">
                        <div class="flex flex-wrap gap-1">
                          ${(t.highYieldSubtopics || []).map(sub => `
                            <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">${this.escapeHtml(sub)}</span>
                          `).join('')}
                        </div>
                      </td>
                      <td class="px-3 py-3 text-slate-600 text-[11px]">
                        ${this.escapeHtml(t.examinerFocus || '-')}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.currentAnalysisTab === 'traps') {
      const traps = r.questionDesignAndTraps || {};
      const styles = traps.questionFormulationStyles || [];
      const trapList = traps.commonExaminerTraps || [];

      bodyElem.innerHTML = `
        <div class="space-y-6">
          <!-- Common Traps Alert Box -->
          <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2.5">
            <h4 class="font-bold text-amber-900 text-sm flex items-center gap-2">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>
              Active Examiner Trap Mechanisms Identified
            </h4>
            <ul class="space-y-1.5 text-xs text-amber-950 list-disc list-inside">
              ${trapList.map(tr => `<li><strong>${this.escapeHtml(tr)}</strong></li>`).join('')}
            </ul>
          </div>

          <!-- Question Formulation Styles -->
          <div class="space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="crosshair" class="w-4 h-4 text-indigo-600"></i>
              Examiner Formulation Styles & Purpose
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${styles.map(s => `
                <div class="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 text-xs">${this.escapeHtml(s.style)}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${s.frequency || 'Frequent'}</span>
                  </div>
                  <div class="text-[11px] text-slate-600">
                    <strong>Examiner Purpose:</strong> ${this.escapeHtml(s.purpose || '-')}
                  </div>
                  <div class="text-[11px] text-rose-700 bg-rose-50/70 p-2 rounded-lg border border-rose-100">
                    <strong>Trap Trigger:</strong> ${this.escapeHtml(s.trapMechanisms || '-')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (this.currentAnalysisTab === 'forecast') {
      const fc = r.predictiveExamForecast || {};
      const expTopics = fc.expectedTopicDistribution || [];
      const hotspots = fc.top10MustMasterHotspots || [];

      bodyElem.innerHTML = `
        <div class="space-y-6">
          <div class="bg-gradient-to-br from-indigo-900 to-purple-900 text-white rounded-xl p-4 sm:p-5 shadow-sm space-y-2">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/20 text-white border border-white/30">AI Predictive Model</span>
            <h4 class="text-base font-bold">Upcoming Exam Blueprint Forecast</h4>
            <p class="text-xs text-indigo-200">
              Synthesized by identifying recurrence frequencies, difficulty trajectories, and syllabus focal points across historical papers.
            </p>
          </div>

          <!-- Top 10 Must-Master Hotspots -->
          <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i>
              Top High-Probability Must-Master Hotspots
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${hotspots.map((h, idx) => `
                <div class="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-indigo-300 transition-colors">
                  <span class="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">${idx + 1}</span>
                  <span class="font-medium text-slate-800 text-xs">${this.escapeHtml(h)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Expected Topic Distribution -->
          <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="target" class="w-4 h-4 text-indigo-600"></i>
              Expected Question Distribution for Upcoming Paper
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              ${expTopics.map(item => `
                <div class="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <div class="font-bold text-slate-800 text-xs">${this.escapeHtml(item.subject)}</div>
                  <div class="text-lg font-black text-indigo-900 mt-1">${this.escapeHtml(item.expectedQuestions)} Qs</div>
                  <div class="text-[10px] font-semibold text-emerald-700 mt-0.5">Priority: ${this.escapeHtml(item.priority || 'High')}</div>
                </div>
              `).join('')}
            </div>
            ${fc.highProbabilityQuestionArchetypes ? `
              <div class="text-xs text-slate-600 pt-2 border-t border-slate-100">
                <strong>Projected Formats:</strong> ${this.escapeHtml(fc.highProbabilityQuestionArchetypes)}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (this.currentAnalysisTab === 'strategy') {
      const strat = r.actionableStudyStrategy || {};
      const threeRound = strat.threeRoundExamAttemptStrategy || {};
      const dosAndDonts = strat.criticalPreparationDoAndDonts || {};

      bodyElem.innerHTML = `
        <div class="space-y-6">
          <!-- 3-Round Strategy Cards -->
          <div class="space-y-3">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <i data-lucide="clock" class="w-4 h-4 text-indigo-600"></i>
              Optimal 3-Round Time Management Strategy
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-extrabold text-emerald-900 text-xs">ROUND 1: SPEED KILLS</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-800">Minutes 0 - 55</span>
                </div>
                <p class="text-xs text-emerald-950 font-medium leading-relaxed">${this.escapeHtml(threeRound.round1Speed || 'Solve 100% known direct factual MCQs first. Build confidence and lock easy marks.')}</p>
              </div>

              <div class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-extrabold text-indigo-900 text-xs">ROUND 2: SOLVABLE REASONING</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-200 text-indigo-800">Minutes 55 - 135</span>
                </div>
                <p class="text-xs text-indigo-950 font-medium leading-relaxed">${this.escapeHtml(threeRound.round2Analytical || 'Tackle applied arithmetic, multi-step equations, and statement combinations where 2 options can be eliminated.')}</p>
              </div>

              <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-extrabold text-amber-900 text-xs">ROUND 3: REVIEW & RISK</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-800">Minutes 135 - 180</span>
                </div>
                <p class="text-xs text-amber-950 font-medium leading-relaxed">${this.escapeHtml(threeRound.round3Review || 'Carefully review flagged questions. Never make wild random guesses due to negative marking penalty.')}</p>
              </div>
            </div>
          </div>

          <!-- DOs and DONTs -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <h5 class="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i> Critical DOs
              </h5>
              <ul class="space-y-1 text-xs text-emerald-950 list-disc list-inside">
                ${(dosAndDonts.dos || ['Eliminate impossible choices first', 'Memorize formula shortcuts']).map(d => `<li>${this.escapeHtml(d)}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-rose-50/50 border border-rose-200 rounded-xl p-4 space-y-2">
              <h5 class="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                <i data-lucide="x-circle" class="w-4 h-4 text-rose-600"></i> Critical DON'Ts
              </h5>
              <ul class="space-y-1 text-xs text-rose-950 list-disc list-inside">
                ${(dosAndDonts.donts || ['Do not guess blindly on negative mark papers', 'Do not waste more than 90s on single question']).map(d => `<li>${this.escapeHtml(d)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentAnalysisTab === 'markdown') {
      const md = r.fullMarkdownReport || r.markdownReport || '';
      bodyElem.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500">Publication-Grade Markdown Report</span>
            <div class="space-x-2">
              <button onclick="app.copyAnalysisMarkdown()" class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors">Copy</button>
              <button onclick="app.downloadAnalysisMarkdown()" class="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">Download .md</button>
            </div>
          </div>
          <pre class="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[60vh] border border-slate-800 select-all">${this.escapeHtml(md)}</pre>
        </div>
      `;
    }
  }

  downloadAnalysisMarkdown() {
    if (!this.currentAnalysisReport) return;
    const text = this.currentAnalysisReport.fullMarkdownReport || this.currentAnalysisReport.markdownReport || '';
    const title = (this.currentAnalysisReport.executiveBlueprint?.examTitle || 'Exam_Pattern_Analysis').replace(/[^a-zA-Z0-9_-]/g, '_');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  copyAnalysisMarkdown() {
    if (!this.currentAnalysisReport) return;
    const text = this.currentAnalysisReport.fullMarkdownReport || this.currentAnalysisReport.markdownReport || '';
    navigator.clipboard.writeText(text).then(() => {
      alert('Analysis Markdown report copied to clipboard!');
    }).catch(err => {
      alert(`Could not copy to clipboard: ${err.message || err}`);
    });
  }
}

// Instantiate App
window.app = new AppController();
