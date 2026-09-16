class MockStudio {
  constructor() { this.builder = new MockBuilder(); this.busy = false; this.paused = false; }
  el(id) { return document.getElementById(`mock-${id}`); }
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  message(text) { this.el('status').textContent = text; }
  async run(fn) {
    if (this.busy) return;
    this.busy = true; this.paused = false;
    this.el('studio').querySelectorAll('button:not([data-always])').forEach(b => b.disabled = true);
    try { await fn(); } catch (error) { this.message(error.message); }
    finally { this.busy = false; this.el('studio').querySelectorAll('button').forEach(b => b.disabled = false); }
  }
  async open() {
    if (!this.el('studio')) this.mount();
    if (!this.el('studio').open) this.el('studio').showModal();
    if (!this.busy) await this.run(() => this.refresh());
  }
  mount() {
    const dialog = document.createElement('dialog'); dialog.id = 'mock-studio';
    dialog.innerHTML = `<div class="top"><h2>Mock Paper Builder</h2><button id="mock-close" class="secondary" data-always>Close</button></div>
      <p class="note">Generate full or subject papers, review them and export Excel. Your blueprints and mock history stay in this browser across days.</p>
      <p id="mock-status" role="status" aria-live="polite">Choose reviewed papers to begin, or resume a saved mock.</p>
      <button id="mock-pause" class="secondary" data-always>Pause after current batch</button>
      <section><h3>1. Analyze previous papers</h3><label>Exam name<input id="mock-exam" placeholder="TSLPRB Constable Preliminary"></label><div id="mock-papers" class="paper-list"></div>
      <label><input type="checkbox" id="mock-source-reviewed"> I have checked the selected papers against their originals.</label><button id="mock-analyze">Analyze / resume analysis</button><p class="note">Every source question is classified in saved batches. Historical patterns are guidance, not official exam requirements.</p></section>
      <section><h3>2. Review the exam blueprint</h3><label>Saved blueprint<select id="mock-blueprints"></select></label><div id="mock-blueprint-info" class="note"></div><div id="mock-blueprint-summary"></div>
      <details><summary>Edit blueprint rows and weights</summary><p class="note">Rows use subject, topic, difficulty (easy/medium/hard), style, depth and positive weight. Edit the JSON below. Saving creates a reviewed version; existing mocks keep their original version.</p><textarea id="mock-blueprint-editor" rows="14" spellcheck="false"></textarea></details>
      <button id="mock-save-blueprint">Save reviewed blueprint version</button></section>
      <section><h3>3. Create a mock</h3><div class="grid"><label>Mock name<input id="mock-name" placeholder="Automatic if blank"></label><label>Type<select id="mock-type"><option value="full">Full mock</option><option value="subject">Subject mock</option></select></label><label>Subject<select id="mock-subject"></select></label><label>Question count<input id="mock-count" type="number" min="1" max="500" value="200"></label><label>Content lifecycle<select id="mock-lifecycle"><option value="permanent">permanent</option><option value="review">review</option></select></label></div>
      <button id="mock-create">Create saved draft</button><p class="note">The complete paper is planned first, then generated in batches of up to 15. Duplicate history is checked across saved drafts and mocks.</p></section>
      <section><h3>4. My mocks</h3><label>Saved mock<select id="mock-mocks"></select></label><div id="mock-detail" class="note"></div><details><summary>Planned question distribution</summary><div id="mock-plan"></div></details>
      <button id="mock-generate">Generate / resume</button><button id="mock-reuse" class="secondary">Use eligible questions from other mock type</button><button id="mock-review" class="secondary">Open question review</button><p class="note">Optional reuse fills matching next slots with reviewed questions used only in the other mock type, preserving their import keys. Generation creates fresh questions for remaining slots. Text and tables are supported; image-only problems require manual authoring.</p><div id="mock-questions"></div></section>
      <section><h3>5. Excel export</h3><p class="note">Exact 22-column format. English subjects leave Telugu cells empty; Telugu subjects leave English cells empty. Other subjects include both languages. Date fields are blank. Review every question before export.</p>
      <details><summary>Importer values</summary><p class="note">Defaults below are configurable; confirm them with your importer. These settings are saved in this browser.</p><div class="grid"><label>Easy value<input id="mock-easy" value="easy"></label><label>Medium value<input id="mock-medium" value="medium"></label><label>Hard value<input id="mock-hard" value="hard"></label><label>is_active value<input id="mock-active" value="true"></label><label>Correct answer format<select id="mock-answer-format"><option value="letters">A / B / C / D</option><option value="numbers">1 / 2 / 3 / 4</option></select></label></div></details>
      <button id="mock-export">Export .xlsx</button></section>
      <section><h3>Backup and restore</h3><p class="note">Back up before clearing browser data or moving devices. This backup includes previous papers, analyses, blueprints, drafts and question history. Restore merges matching records and stops on conflicting versions.</p><button id="mock-backup">Download backup</button><label class="file-label">Restore backup<input id="mock-restore" type="file" accept=".json" hidden></label></section>`;
    document.body.appendChild(dialog);
    this.el('close').onclick = () => dialog.close();
    this.el('pause').onclick = () => { this.paused = true; this.message('Pause requested. The current batch will finish and save first.'); };
    this.el('blueprints').onchange = () => { if (!this.busy) this.blueprintInfo(); };
    this.el('mocks').onchange = () => { if (!this.busy) this.mockInfo(); };
    this.el('type').onchange = () => { this.el('subject').disabled = this.el('type').value === 'full'; };
    this.el('type').onchange();
    this.el('analyze').onclick = () => this.run(async () => {
      if (!this.el('source-reviewed').checked) throw Error('Review the source papers and check the confirmation first.');
      const ids = [...this.el('papers').querySelectorAll('input:checked')].map(i => i.value);
      const papers = (await window.paperVault.getAllPapers()).filter(p => ids.includes(p.id));
      let bp;
      try { bp = await this.builder.analyze(papers, this.el('exam').value, text => this.message(text), () => this.paused); }
      finally { await this.refresh(bp?.id); }
      this.message(bp.status === 'analyzing' ? 'Analysis paused and saved. Select the same papers and exam name to resume.' : 'Analysis saved. Review the blueprint and save a reviewed version.');
    });
    this.el('save-blueprint').onclick = () => this.run(async () => {
      const bp = await this.builder.saveBlueprint(this.el('blueprints').value, JSON.parse(this.el('blueprint-editor').value));
      await this.refresh(bp.id); this.message('Reviewed blueprint saved. You can create a mock now.');
    });
    this.el('create').onclick = () => this.run(async () => {
      const mock = await this.builder.create({ blueprintId: this.el('blueprints').value, name: this.el('name').value, type: this.el('type').value, subject: this.el('subject').value, count: this.el('count').value, lifecycle: this.el('lifecycle').value });
      await this.refresh(null, mock.id); this.message('Draft and complete slot plan saved. Click Generate / resume.');
    });
    this.el('generate').onclick = () => this.run(async () => {
      const id = this.el('mocks').value;
      try { await this.builder.generate(id, text => this.message(text), () => this.paused); this.message(this.paused ? 'Paused and saved.' : 'Generation saved. Open question review before export.'); }
      finally { await this.refresh(null, id); }
    });
    this.el('review').onclick = () => this.run(() => this.review());
    this.el('reuse').onclick = () => this.run(async () => { const count = await this.builder.reuse(this.el('mocks').value); await this.refresh(); this.message(`${count} eligible questions reused. Generate remaining slots as needed.`); });
    this.el('export').onclick = () => this.run(async () => {
      const state = await this.builder.store.read(), id = this.el('mocks').value;
      const format = Object.fromEntries(['easy', 'medium', 'hard', 'active'].map(k => [k, this.el(k).value])); format.numericAnswers = this.el('answer-format').value === 'numbers';
      if (Object.values(format).some(v => v === '')) throw Error('Importer values must not be empty.');
      const rows = MockBuilder.exportRows(state, id, format); localStorage.setItem('mock_export_format', JSON.stringify(format));
      this.download(MockXlsx.build(rows), `${state.mocks.find(m => m.id === id).name.replace(/[^\p{L}\p{N}_-]/gu, '_')}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      this.message('Excel exported. Stable question IDs and usage history are unchanged.');
    });
    this.el('backup').onclick = () => this.run(async () => { this.download(JSON.stringify(await this.builder.backup(), null, 2), `mock-builder-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'); this.message('Backup downloaded.'); });
    this.el('restore').onchange = event => this.run(async () => { const file = event.target.files[0]; if (file) { await this.builder.restore(JSON.parse(await file.text())); await this.refresh(); this.message('Backup restored.'); } event.target.value = ''; });
    try { const format = JSON.parse(localStorage.getItem('mock_export_format') || 'null'); if (format) { for (const k of ['easy', 'medium', 'hard', 'active']) this.el(k).value = format[k]; this.el('answer-format').value = format.numericAnswers ? 'numbers' : 'letters'; } } catch (_) {}
  }
  async refresh(bpId, mockId) {
    this.state = await this.builder.store.read();
    const selectedPapers = [...this.el('papers').querySelectorAll('input:checked')].map(i => i.value);
    const papers = await window.paperVault.getAllPapers();
    this.el('papers').innerHTML = papers.length ? papers.map(p => `<label><input type="checkbox" value="${this.escape(p.id)}" ${selectedPapers.includes(p.id) ? 'checked' : ''}> ${this.escape(p.title || p.filename || p.id)} — ${this.escape(p.year || '')} (${MockBuilder.questions(p).length} questions)</label>`).join('') : '<p class="note">Upload and save previous papers in Paper Vault first.</p>';
    for (const [name, records, id] of [['blueprints', this.state.blueprints, bpId], ['mocks', this.state.mocks, mockId]]) {
      const previous = id || this.el(name).value;
      this.el(name).innerHTML = [...records].reverse().map(r => `<option value="${this.escape(r.id)}">${this.escape(r.name || r.title)} ${r.version ? `v${r.version}` : ''} — ${this.escape(r.status)}</option>`).join('');
      if (records.some(r => r.id === previous)) this.el(name).value = previous;
    }
    this.blueprintInfo(); this.mockInfo();
  }
  blueprintInfo() {
    const bp = this.state.blueprints.find(b => b.id === this.el('blueprints').value);
    this.el('blueprint-editor').value = bp ? JSON.stringify({ title: bp.title, rows: bp.rows }, null, 2) : '';
    this.el('blueprint-info').textContent = bp ? `${bp.status} · ${bp.processed} source questions · Sources: ${bp.sourceTitles.join(', ')}` : 'No blueprint yet.';
    this.el('blueprint-summary').innerHTML = bp ? `<table><thead><tr><th>Subject / topic</th><th>Weight</th><th>Difficulty / style</th><th>Depth</th></tr></thead><tbody>${bp.rows.map(r => `<tr><td>${this.escape(r.subject)} / ${this.escape(r.topic)}</td><td>${r.weight}</td><td>${this.escape(r.difficulty)} / ${this.escape(r.style)}</td><td>${this.escape(r.depth)}</td></tr>`).join('')}</tbody></table>` : '';
    this.el('subject').innerHTML = [...new Set(bp?.rows.map(r => r.subject) || [])].map(s => `<option>${this.escape(s)}</option>`).join('');
  }
  mockInfo() {
    const m = this.state.mocks.find(m => m.id === this.el('mocks').value);
    this.el('questions').replaceChildren();
    this.el('detail').textContent = m ? `${m.type} · ${m.lifecycle} · ${m.createdAt.slice(0, 10)} · ${m.questionIds.length}/${m.slots.length} generated · ${m.status}${m.error ? ` · Last error: ${m.error}` : ''}` : 'No saved mocks yet.';
    const counts = new Map(); for (const s of m?.slots || []) { const key = `${s.subject} / ${s.topic} / ${s.difficulty}`; counts.set(key, (counts.get(key) || 0) + 1); }
    this.el('plan').innerHTML = `<table><thead><tr><th>Subject / topic / difficulty</th><th>Questions</th></tr></thead><tbody>${[...counts].map(([k, n]) => `<tr><td>${this.escape(k)}</td><td>${n}</td></tr>`).join('')}</tbody></table>`;
  }
  async review() {
    this.state = await this.builder.store.read(); const id = this.el('mocks').value, m = this.state.mocks.find(m => m.id === id);
    if (!m) throw Error('Select a mock.');
    const container = this.el('questions'); container.replaceChildren();
    const note = document.createElement('p'); note.className = 'note'; note.textContent = 'AI checks are not a guarantee. Review wording, both languages, answer and explanation. Save each question when verified.'; container.appendChild(note);
    for (const key of m.questionIds) {
      const q = this.state.questions.find(q => q.import_key === key), card = document.createElement('details'); card.className = 'question-card';
      const summary = document.createElement('summary'); summary.textContent = `Q${m.questionIds.indexOf(key) + 1} · ${q.subject} · ${q.reviewed ? 'Reviewed' : 'Needs review'} · ${(q.question_en || q.question_te).slice(0, 90)}`; card.appendChild(summary);
      const inputs = {};
      for (const field of [...MockBuilder.headers.filter(h => /_(en|te)$/.test(h)), 'correct_answer']) {
        if ((q.subject.toLowerCase() === 'english' && field.endsWith('_te')) || (q.subject.toLowerCase() === 'telugu' && field.endsWith('_en'))) continue;
        const label = document.createElement('label'); label.textContent = field; const input = document.createElement(field === 'correct_answer' ? 'input' : 'textarea'); input.value = q[field]; label.appendChild(input); card.appendChild(label); inputs[field] = input;
      }
      const button = document.createElement('button'); button.textContent = 'Save as reviewed';
      button.onclick = () => this.run(async () => {
        await this.builder.review(id, key, Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value])));
        this.state = await this.builder.store.read();
        const updatedMock = this.state.mocks.find(item => item.id === id);
        const option = [...this.el('mocks').options].find(option => option.value === id);
        if (option) option.textContent = `${updatedMock.name} — ${updatedMock.status}`;
        this.el('detail').textContent = `${updatedMock.type} · ${updatedMock.lifecycle} · ${updatedMock.createdAt.slice(0, 10)} · ${updatedMock.questionIds.length}/${updatedMock.slots.length} generated · ${updatedMock.status}`;
        summary.textContent = `Q${m.questionIds.indexOf(key) + 1} · ${q.subject} · Reviewed`; card.open = false; this.message('Question saved as reviewed. Export becomes available when all questions are reviewed.');
      }); card.appendChild(button); container.appendChild(card);
    }
  }
  download(bytes, filename, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type })), link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
window.mockStudio = new MockStudio();
