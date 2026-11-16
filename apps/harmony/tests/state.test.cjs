'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const sdkRoot = process.env.HARMONY_SDK_ROOT || 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony';
const ts = require(path.join(sdkRoot, 'ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js'));
const core = path.resolve(__dirname, '../entry/src/main/ets/core');
const cache = new Map();
function load(name, directory = core) {
  const full = path.resolve(directory, name + '.ts');
  if (cache.has(full)) return cache.get(full);
  const source = fs.readFileSync(full, 'utf8');
  const result = ts.transpileModule(source, { fileName: full, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, strict: true } });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  const module = { exports: {} };
  cache.set(full, module.exports);
  vm.runInThisContext('(function(require,module,exports){' + result.outputText + '\n})', { filename: full })(
    dependency => load(dependency, path.dirname(full)), module, module.exports);
  cache.set(full, module.exports);
  return module.exports;
}
const { freshState, dateKey } = load('Models');
const { validateBackup, validateStoredState, createBackup, recordAttempt } = load('StateRules');
const curriculum = {
  version: 1, modules: [], resources: [],
  lessons: [{id:'l1', exerciseIds:['q1','c1']}, {id:'l2', exerciseIds:['q2']}],
  exercises: [{id:'q1', lessonId:'l1', type:'quiz', choices:['a','b'], answer:1, hints:[]},
    {id:'c1', lessonId:'l1', type:'code', tests:[{input:'',expected:'ok'}], hints:[]},
    {id:'q2', lessonId:'l2', type:'quiz', choices:['a','b'], answer:0, hints:[]}]
};
const q1 = curriculum.exercises[0], c1 = curriculum.exercises[1], q2 = curriculum.exercises[2];
const clone = value => JSON.parse(JSON.stringify(value));
function backup(state = freshState(), format = 'qicheng-harmony-backup') {
  return { format, version:1, exportedAt:'2026-11-15T12:00:00+08:00', curriculumVersion:1, state:clone(state) };
}
function imported(value) { return validateBackup(JSON.stringify(value), curriculum); }
function assertRejected(mutator, original = backup()) {
  const value = clone(original);
  mutator(value);
  const text = JSON.stringify(value);
  assert.throws(() => validateBackup(text, curriculum));
  assert.equal(JSON.stringify(value), text);
}

test('native export is isolated, clears AI flags, and never mutates the live state', () => {
  const state = freshState(); state.settings.aiEnabled = true; state.settings.hasApiKey = true;
  state.notes.l1 = 'Keep my note';
  const before = JSON.stringify(state);
  const result = createBackup(state, curriculum);
  assert.equal(result.format, 'qicheng-harmony-backup');
  assert.equal(result.version, 2);
  assert.equal(result.state.settings.aiEnabled, false);
  assert.equal(result.state.settings.hasApiKey, false);
  assert.equal(JSON.stringify(state), before);
  result.state.notes.l1 = 'Changed copy';
  assert.equal(state.notes.l1, 'Keep my note');
  assert.equal(Object.hasOwn(result.state.settings, 'apiKey'), false);
});

test('desktop v1 and native legacy state migrate only absent thinking fields', () => {
  for (const format of ['stm32-studio-backup', 'qicheng-harmony-backup']) {
    const value = backup(freshState(), format);
    value.state.settings.aiEnabled = true;
    value.state.settings.hasApiKey = true;
    delete value.state.settings.thinkingMode; delete value.state.settings.reasoningEffort;
    value.state.notes.l1 = 'Legacy note';
    const result = imported(value);
    assert.equal(result.settings.thinkingMode, 'enabled');
    assert.equal(result.settings.reasoningEffort, 'high');
    assert.equal(result.settings.aiEnabled, false);
    assert.equal(result.settings.hasApiKey, false);
    assert.equal(result.notes.l1, 'Legacy note');
    const stored = validateStoredState(JSON.stringify(value.state), curriculum);
    assert.equal(stored.settings.aiEnabled, true);
    assert.equal(stored.settings.hasApiKey, false);
    assert.equal(stored.settings.thinkingMode, 'enabled');
  }
  assertRejected(b => { b.state.settings.thinkingMode = null; });
  assertRejected(b => { b.state.settings.reasoningEffort = 'medium'; });
});

test('corrupt envelopes, primitives and secret or prototype fields fail without changing input', () => {
  for (const source of ['', '{', 'null', '[]', 'true', '42', '"text"']) assert.throws(() => validateBackup(source, curriculum));
  for (const mutate of [b => { b.version = 3; }, b => { b.curriculumVersion = 9; },
    b => { b.format = 'something-else'; }, b => { b.extra = true; }, b => { b.state.extra = true; },
    b => { b.state.settings.apiKey = 'TEST_VALUE_MUST_NOT_EXPORT'; },
    b => { b.state.settings.dailyMinutes = true; }, b => { b.state.settings = null; },
    b => { b.state.notes.l1 = {}; }, b => { b.exportedAt = '2026-11-15'; },
    b => { delete b.state.usage; }, b => { b.state.usage.requests = -1; },
    b => { b.state.notes.missing = 'bad'; }, b => { b.state.drafts.missing = 'bad'; }]) assertRejected(mutate);
  for (const target of ['root', 'settings', 'notes', 'reports']) {
    const value = backup();
    const object = target === 'root' ? value : value.state[target];
    Object.defineProperty(object, '__proto__', {value:{polluted:true}, enumerable:true});
    assert.throws(() => imported(value));
  }
  assert.equal({}.polluted, undefined);
  const live = freshState(); live.settings.apiKey = 'TEST_VALUE_MUST_NOT_EXPORT';
  const before = JSON.stringify(live);
  assert.throws(() => createBackup(live, curriculum));
  assert.equal(JSON.stringify(live), before);
});

test('recordAttempt requires actual code provenance and rejects invalid writes atomically', () => {
  const state = freshState();
  for (const action of [() => recordAttempt(state,curriculum,c1,'passed',false),
    () => recordAttempt(state,curriculum,c1,'passed',false,'gcc'),
    () => recordAttempt(state,curriculum,c1,'correct',false,'learning-c'),
    () => recordAttempt(state,curriculum,q1,'compile_error',false),
    () => recordAttempt(state,curriculum,q1,'unsupported',false),
    () => recordAttempt(state,curriculum,{...q1,id:'missing'},'passed',false)]) {
    const before = JSON.stringify(state); assert.throws(action); assert.equal(JSON.stringify(state), before);
  }
  recordAttempt(state,curriculum,c1,'wrong_answer',false,'learning-c');
  assert.deepEqual(state.progress.l1.passedExercises, []);
  recordAttempt(state,curriculum,c1,'passed',false,'learning-c');
  assert.equal(state.attempts.at(-1).engine, 'learning-c');
  assert.deepEqual(state.progress.l1.independentExercises, ['c1']);
  assert.equal(state.progress.l1.status, 'learning');
  recordAttempt(state,curriculum,q1,'correct',false);
  assert.equal(state.progress.l1.status, 'completed');
  assert.equal(state.attempts.at(-1).status, 'passed');
  assert.equal(Object.hasOwn(state.attempts.at(-1), 'engine'), false);
  assert.doesNotThrow(() => imported(backup(state)));
});

test('assistance taints only its exercise permanently and help never awards a pass', () => {
  const state = freshState();
  recordAttempt(state,curriculum,q1,'passed',false);
  recordAttempt(state,curriculum,q1,'hint',false);
  assert.deepEqual(state.progress.l1.independentExercises, []);
  recordAttempt(state,curriculum,q1,'passed',false);
  assert.equal(state.attempts.at(-1).assisted, true);
  recordAttempt(state,curriculum,c1,'ai_help',false);
  assert.deepEqual(state.progress.l1.passedExercises, ['q1']);
  assert.equal(state.progress.l1.status, 'learning');
  recordAttempt(state,curriculum,c1,'passed',false,'learning-c');
  assert.deepEqual(state.progress.l1.independentExercises, []);
  assert.equal(state.progress.l1.assisted, true);
  recordAttempt(state,curriculum,q2,'passed',false);
  assert.deepEqual(state.progress.l2.independentExercises, ['q2']);
  assert.doesNotThrow(() => imported(backup(state)));
});

test('forged passes, completion, mismatched relationships and hidden assistance are rejected', () => {
  const state = freshState(); recordAttempt(state,curriculum,q1,'passed',false);
  const valid = backup(state);
  for (const mutate of [b => { b.state.progress.l1.passedExercises.push('c1'); },
    b => { b.state.progress.l1.status = 'completed'; },
    b => { b.state.progress.l1.independentExercises.push('c1'); },
    b => { b.state.progress.l1.passedExercises.push('q1'); },
    b => { b.state.attempts[0].lessonId = 'l2'; }, b => { b.state.attempts[0].type = 'code'; },
    b => { b.state.attempts[0].status = 'hint'; }, b => { b.state.attempts[0].engine = 'gcc'; },
    b => { b.state.attempts.push(clone(b.state.attempts[0])); },
    b => { b.state.attempts[0].assisted = true; }]) assertRejected(mutate, valid);
  recordAttempt(state,curriculum,q1,'ai_help',true);
  assertRejected(b => { b.state.progress.l1.independentExercises = ['q1']; }, backup(state));
  assertRejected(b => { b.state.progress.l1.assisted = false; }, backup(state));
});

test('desktop attempts retain absent engine and native interpreted attempts retain learning-c', () => {
  const state = freshState(); recordAttempt(state,curriculum,c1,'passed',false,'learning-c');
  const desktop = backup(state,'stm32-studio-backup'); delete desktop.state.attempts[0].engine;
  const importedDesktop = imported(desktop);
  assert.equal(Object.hasOwn(importedDesktop.attempts[0],'engine'), false);
  const exportedDesktop = createBackup(importedDesktop,curriculum);
  assert.equal(Object.hasOwn(exportedDesktop.state.attempts[0],'engine'), false);
  assert.equal(imported(backup(state)).attempts[0].engine,'learning-c');
  assert.equal(imported(createBackup(state,curriculum)).attempts[0].engine,'learning-c');
});

test('timestamps, list limits, chat metadata and text bounds are validated', () => {
  const state = freshState();
  const createdAt = '2026-11-15T17:30:00Z';
  state.sessions.push({id:'session1',date:dateKey(new Date(createdAt)),lessonId:'l1',seconds:30,createdAt});
  state.chats.push({id:'chat1',role:'assistant',content:'Answer',lessonId:'l1',createdAt,
    requestSettings:{model:'deepseek-flash',thinkingMode:'enabled',reasoningEffort:'high',thinkingSupported:true},warning:'Truncated'});
  state.reports['2026-11-16'] = {note:'Daily note'};
  assert.doesNotThrow(() => imported(backup(state)));
  for (const mutate of [b => { b.state.sessions[0].date = '2026-11-15'; },
    b => { b.state.sessions[0].seconds = 301; }, b => { b.state.sessions[0].createdAt = '2026-02-30T00:00:00Z'; },
    b => { b.state.chats[0].requestSettings.reasoningEffort = 'medium'; },
    b => { b.state.chats[0].requestSettings.apiKey = 'forbidden'; },
    b => { b.state.chats[0].warning = 'x'.repeat(301); }, b => { b.state.chats[0].lessonId = 'missing'; },
    b => { b.state.chats.push(clone(b.state.chats[0])); }, b => { b.state.notes.l1 = 'x'.repeat(24001); },
    b => { b.state.drafts.c1 = 'x'.repeat(60001); }, b => { b.state.chats = Array(10001).fill(null); },
    b => { b.state.attempts = Array(100001).fill(null); }, b => { b.state.sessions = Array(100001).fill(null); }]) assertRejected(mutate,backup(state));
});

test('training migration preserves old data and validates new native v2 backups', () => {
  const old = backup(); delete old.state.training; old.state.notes.l1 = 'legacy note';
  const migrated = imported(old);
  assert.equal(migrated.notes.l1, 'legacy note');
  assert.deepEqual(migrated.training.attempts, []);
  assert.equal(createBackup(migrated, curriculum).version, 2);
  const current = createBackup(migrated, curriculum);
  assert.deepEqual(imported(current).training, migrated.training);
  assertRejected(b => { b.state.training = null; });
  assertRejected(b => { b.version = 2; delete b.state.training; });
  assertRejected(b => { b.state.training = { version: 1 }; });
  assertRejected(b => { b.format = 'stm32-studio-backup'; b.version = 2; });
});
