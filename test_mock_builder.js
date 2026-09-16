const assert = require('node:assert/strict');
const fs = require('node:fs');
global.localStorage = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
global.window = { paperVault: { getAllPapers: async () => [], getPastReports: async () => [], importVaultBackup: async () => {} } };
const { MockStore, MockBuilder } = require('./js/mock-builder');
const MockXlsx = require('./js/mock-xlsx');
const row = { subject: 'English', topic: 'Grammar', difficulty: 'medium', style: 'Direct', depth: 'Apply one rule', weight: 1 };
function question(slot, suffix = '') {
  // Distinct lexical stems exercise history without accidentally creating numeric variants.
  const names = ['apple', 'boat', 'cat', 'desk', 'eagle', 'fork', 'goat', 'house', 'ink', 'jacket', 'kite', 'lemon', 'moon', 'nest', 'owl', 'pear', 'queen', 'river', 'sun', 'tree'];
  return { slot, semantic_key: names[slot - 1] + suffix, question_en: names[slot - 1] + suffix + ' spelling?', option_a_en: 'a', option_b_en: 'b', option_c_en: 'c', option_d_en: 'd', correct_answer: 'A', explanation_en: 'The spelling follows the stated rule.' };
}
async function main() {
  const store = new MockStore(), builder = new MockBuilder(store);
  const state = MockStore.empty(); state.blueprints.push({ id: 'bp', title: 'Exam', version: 1, status: 'ready', rows: [row], sourceIds: [], sourceTitles: [] }); await store.write(state);
  const mixed = { rows: [{ ...row, weight: 2 }, { ...row, subject: 'Math', weight: 1 }] };
  const plan = MockBuilder.plan(mixed, 'full', '', 200);
  assert.equal(plan.length, 200); assert.equal(plan.filter(s => s.subject === 'English').length, 133);
  assert.throws(() => MockBuilder.plan(mixed, 'subject', 'Missing', 10));
  const mock = await builder.create({ blueprintId: 'bp', type: 'full', lifecycle: 'review', count: 16 });
  let generationCalls = 0;
  builder.json = async prompt => {
    if (prompt.startsWith('Independently')) {
      const batch = JSON.parse(prompt.split('Questions: ')[1].split('. Previous comparisons:')[0]);
      return { checks: batch.map(q => ({ slot: q.slot, valid: true })) };
    }
    generationCalls++;
    if (generationCalls === 2) throw Error('Simulated network failure');
    const slots = JSON.parse(prompt.split('Slots: ')[1]);
    return { questions: slots.map(s => question(s.slot)) };
  };
  await assert.rejects(builder.generate(mock.id), /network failure/);
  let saved = await new MockStore().read();
  assert.equal(saved.mocks[0].questionIds.length, 15); assert.equal(saved.mocks[0].status, 'paused');
  await builder.generate(mock.id);
  saved = await store.read(); assert.equal(saved.mocks[0].questionIds.length, 16);
  assert.equal(generationCalls, 3, 'Resume must not regenerate the first batch');
  assert.throws(() => MockBuilder.exportRows(saved, mock.id), /review/);
  for (const key of saved.mocks[0].questionIds) await builder.review(mock.id, key, {});
  saved = await store.read(); const rows = MockBuilder.exportRows(saved, mock.id);
  assert.equal(rows[0].length, 22); assert.equal(rows.length, 17);
  assert.equal(rows[1][7], ''); assert.equal(rows[1][14], ''); assert.equal(rows[1][18], 'review'); assert.equal(rows[1][19], '');
  const subject = await builder.create({ blueprintId: 'bp', type: 'subject', subject: 'English', lifecycle: 'review', count: 1 });
  assert.equal(await builder.reuse(subject.id), 1);
  saved = await store.read(); assert.equal(saved.mocks[1].questionIds[0], saved.mocks[0].questionIds[0]);
  const another = await builder.create({ blueprintId: 'bp', type: 'subject', subject: 'English', lifecycle: 'review', count: 1 });
  assert.equal(await builder.reuse(another.id), 1);
  saved = await store.read(); assert.notEqual(saved.mocks[2].questionIds[0], saved.mocks[1].questionIds[0]);
  assert(MockBuilder.duplicate({ question_en: 'A shopkeeper sells 20 apples for 400 rupees' }, [{ question_en: 'A shopkeeper sells 30 apples for 600 rupees' }]));
  const te = MockBuilder.cleanQuestion({ ...question(1), question_te: 'తెలుగు ప్రశ్న', option_a_te: 'అ', option_b_te: 'ఆ', option_c_te: 'ఇ', option_d_te: 'ఈ', explanation_te: 'వివరణ' }, { ...row, subject: 'Telugu', slot: 1 }, { lifecycle: 'permanent' });
  MockBuilder.validateQuestion(te); assert.equal(te.question_en, ''); assert.equal(te.explanation_en, '');
  assert.throws(() => MockBuilder.validateQuestion({ ...te, option_b_te: 'అ' }), /Duplicate/);
  const backup = await builder.backup(); localStorage.data = {}; const fresh = new MockBuilder(new MockStore()); await fresh.restore(backup);
  assert.deepEqual(await fresh.store.read(), backup.state);
  await fresh.restore(backup); assert.equal((await fresh.store.read()).questions.length, 16);
  await assert.rejects(fresh.restore({ kind: 'wrong' }), /supported/);
  const analysisStore = new MockStore('analysis-test');
  await analysisStore.write(MockStore.empty());
  const analysisBuilder = new MockBuilder(analysisStore);
  const sourcePapers = [{ id: 'source', title: 'Source exam', questions: Array.from({ length: 21 }, (_, i) => ({ questionText: `Original wording ${i}`, questionNumber: i + 1 })) }];
  let analysisCalls = 0;
  analysisBuilder.json = async prompt => {
    analysisCalls++;
    if (analysisCalls === 2) throw Error('Analysis interrupted');
    return { items: JSON.parse(prompt.split('Data: ')[1]).map(q => ({ ...row, source: q.source })) };
  };
  await assert.rejects(analysisBuilder.analyze(sourcePapers, 'Test exam'), /interrupted/);
  assert.equal((await analysisBuilder.store.read()).blueprints[0].processed, 20);
  const analyzed = await analysisBuilder.analyze(sourcePapers, 'Test exam');
  assert.equal(analysisCalls, 3); assert.equal(analyzed.rows[0].weight, 21); assert.equal(analyzed.rows[0].references.length, 21);
  const approved = await analysisBuilder.saveBlueprint(analyzed.id, analyzed);
  assert.equal(approved.status, 'ready'); assert.notEqual(approved.id, analyzed.id);
  await assert.rejects(analysisBuilder.analyze([{ id: 'bad', questions: [{ questionText: 'Bad extraction', needsReview: true }] }], 'Exam'), /Correct flagged/);
  const nextFull = await fresh.create({ blueprintId: 'bp', type: 'full', lifecycle: 'permanent', count: 1 });
  let attempts = 0;
  fresh.json = async () => { attempts++; return { questions: [question(1)] }; };
  await assert.rejects(fresh.generate(nextFull.id), /Repeated/);
  assert.equal(attempts, 3); assert.equal((await fresh.store.read()).mocks.find(m => m.id === nextFull.id).questionIds.length, 0);
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'mock-builder-test.xlsx'), MockXlsx.build([...rows, ['=1+1', 'Telugu', '', '', '', '', '', 'తెలుగు ప్రశ్న']]));
  console.log('Mock planning, durable resume, review gate, lifecycle, languages, cross-type reuse, history, backup and workbook checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
