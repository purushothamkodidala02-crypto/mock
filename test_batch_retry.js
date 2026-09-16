const assert = require('assert');
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { localStorage };
require('./js/gemini-handler.js');
const handler = window.geminiHandler;
handler.supportedModels = [{ id: 'test-model' }];
handler.getModelName = () => 'test-model';
handler.getCandidateModels = () => ['test-model'];
handler.setModelName = () => {};
handler.keyManager = {
  getAllKeys: () => [{ id: 'test' }],
  getNextKey: tried => tried.includes('test') ? {} : { key: { id: 'test', key: 'dummy', label: 'Test' } },
  recordUsage() {}, recordSuccess() {}, recordError() {}
};
// Skip retry delays and request timers; all network responses below are simulated.
global.setTimeout = (fn, ms) => { if (ms <= 10000) queueMicrotask(fn); return 1; };
global.clearTimeout = () => {};
async function run(method, args) {
  let calls = 0;
  global.fetch = async () => {
    if (++calls === 1) throw Object.assign(new Error('Request timed out'), { name: 'AbortError' });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"questions":[]}' }] } }] }) };
  };
  await handler[method](...args);
  assert.strictEqual(calls, 2, `${method} must retry after exhausting keys`);
  calls = 0;
  global.fetch = async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'AbortError' }); };
  await assert.rejects(handler[method](...args), { code: 'GEMINI_NETWORK' });
  assert.strictEqual(calls, 3, `${method} must stop after three attempts`);
  calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API key' } }) }; };
  await assert.rejects(handler[method](...args), { code: 'GEMINI_AUTH' });
  assert.strictEqual(calls, 1, 'Authentication errors must not trigger transient retries');
}
(async () => {
  await run('extractSingleVisualBatch', [[], 'Pages 7 to 11', 3, 18]);
  await run('extractSingleTextBatch', ['Example question text', 3, 18]);
  console.log('Visual and text retries recover, remain bounded, and preserve auth errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
