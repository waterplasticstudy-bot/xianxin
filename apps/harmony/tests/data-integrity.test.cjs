'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const root = path.resolve(__dirname, '../entry/src/main/ets');
const curriculum = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../entry/src/main/resources/rawfile/curriculum.json'), 'utf8'));
const primary = '/test-private/learning-state.json';
const nativeDate = Date;
const clone = value => JSON.parse(JSON.stringify(value));

// 仅替代设备边界：正式 controller / store / rules / worker 均从产品源码载入。
// 所有文件、系统凭据、时间、文件选择器和线程都在测试内存中；禁止真实网络。
function fixture(start = '2026-11-16T04:00:00.000Z') {
  const files = new Map(), handles = new Map(), modules = new Map(), timers = new Map();
  let now = nativeDate.parse(start), nextFd = 1, nextTimer = 1;
  const control = { failWrite: false, failFsyncPath: '', failRename: false, shortRead: false, chunk: Infinity,
    picker: [], pickerPromise: null, savePromise: null, dialog: 1, dialogPromise: null, pendingWorker: null, duplicateReply: false, hasSecret: false };
  const calls = { select: 0, save: 0, dialogs: 0, jobs: [], network: 0, secretReads: 0 };
  class ClockDate extends nativeDate {
    constructor(value) { super(arguments.length ? value : now); }
    static now() { return now; }
  }
  function schedule(callback, delay, repeat = 0) {
    const id = nextTimer++;
    timers.set(id, { callback, at: now + delay, repeat });
    return id;
  }
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const due = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      now = timer.at;
      if (timer.repeat) timer.at += timer.repeat; else timers.delete(id);
      timer.callback();
    }
    now = until;
  }
  const io = {
    OpenMode: { CREATE: 1, READ_WRITE: 2, TRUNC: 4, WRITE_ONLY: 8, READ_ONLY: 16 },
    accessSync: target => files.has(target),
    readTextSync(target) { if (!files.has(target)) throw Error('missing'); return files.get(target).toString('utf8'); },
    openSync(target, mode) {
      if ((mode & 1) && !files.has(target)) files.set(target, Buffer.alloc(0));
      if (!files.has(target)) throw Error('missing');
      if (mode & 4) files.set(target, Buffer.alloc(0));
      const fd = nextFd++; handles.set(fd, { target, offset: 0 }); return { fd };
    },
    closeSync(value) { handles.delete(typeof value === 'number' ? value : value.fd); },
    statSync(fd) { return { size: files.get(handles.get(fd).target).length }; },
    writeSync(fd, bytes) {
      if (control.failWrite) throw Error('disk full');
      const handle = handles.get(fd), source = Buffer.from(new Uint8Array(bytes));
      const count = Math.min(source.length, control.chunk), old = files.get(handle.target);
      const next = Buffer.alloc(Math.max(old.length, handle.offset + count));
      old.copy(next); source.copy(next, handle.offset, 0, count);
      handle.offset += count; files.set(handle.target, next); return count;
    },
    readSync(fd, bytes) {
      const source = files.get(handles.get(fd).target);
      const count = control.shortRead ? source.length - 1 : source.length;
      new Uint8Array(bytes).set(source.subarray(0, count)); return count;
    },
    fsyncSync(fd) { if (control.failFsyncPath && handles.get(fd).target.includes(control.failFsyncPath)) throw Error('fsync failed'); },
    copyFileSync(from, to) { if (!files.has(from)) throw Error('missing'); files.set(to, Buffer.from(files.get(from))); },
    renameSync(from, to) {
      if (control.failRename) throw Error('rename failed');
      if (!files.has(from)) throw Error('missing'); files.set(to, files.get(from)); files.delete(from);
    }
  };
  const asset = {
    Tag: { ALIAS: 1, SECRET: 2, RETURN_TYPE: 3 }, ReturnType: { ALL: 0, ATTRIBUTES: 1 },
    async query(query) { if (query.get(3) === 0) { calls.secretReads++; throw Error('No secret is supplied in this audit'); } return control.hasSecret ? [new Map()] : []; }
  };
  const kit = {
    '@kit.AbilityKit': {}, '@kit.ArkData': {}, '@kit.ArkUI': { uiMaterial: { Material: { empty: Object.freeze({ empty: true }) } } },
    '@kit.AssetStoreKit': { asset },
    '@kit.CoreFileKit': { fileIo: io, picker: {
      DocumentSaveOptions: class {}, DocumentSelectOptions: class {}, DocumentViewPicker: class {
        async select() { calls.select++; return control.pickerPromise ? await control.pickerPromise : control.picker; }
        async save() { calls.save++; return control.savePromise ? await control.savePromise : control.picker; }
      }
    } },
    '@kit.ArkTS': { util: {
      TextEncoder: class { encodeInto(value) { return new Uint8Array(Buffer.from(value, 'utf8')); } },
      TextDecoder: { create(encoding, options) { const decoder = new TextDecoder(encoding, options); return { decodeToString: bytes => decoder.decode(bytes) }; } }
    }, worker: { ThreadWorker: class {
      postMessage(job) {
        calls.jobs.push(job);
        setImmediate(async () => {
          if (control.pendingWorker) await control.pendingWorker;
          try {
            const port = { postMessage: summary => {
              this.onmessage?.({ data: summary });
              if (control.duplicateReply) this.onmessage?.({ data: summary });
            } };
            load(path.join(root, 'workers/PracticeWorker.ets'), { '@kit.ArkTS': { worker: { workerPort: port } } });
            port.onmessage({ data: job });
          } catch (error) { this.onerror?.(error); }
        });
      }
      terminate() {}
    } } },
    '@kit.NetworkKit': { http: { createHttp() { calls.network++; throw Error('Network forbidden in data audit'); } } }
  };
  function load(full, overrides) {
    if (!overrides && modules.has(full)) return modules.get(full).exports;
    const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      fileName: full.replace(/\.ets$/, '.ts'),
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true }
    });
    const module = { exports: {} }; if (!overrides) modules.set(full, module);
    const requireLocal = id => {
      if (overrides?.[id]) return overrides[id];
      if (kit[id]) return kit[id];
      assert.ok(id.startsWith('.'), `unexpected external dependency: ${id}`);
      let target = path.resolve(path.dirname(full), id);
      if (!path.extname(target)) target += fs.existsSync(target + '.ets') ? '.ets' : '.ts';
      return load(target);
    };
    vm.runInThisContext(`(function(require,module,exports,ObservedV2,Trace,Date,setTimeout,clearTimeout,setInterval,clearInterval){${compiled.outputText}\n})`, { filename: full })(
      requireLocal, module, module.exports, value => value, () => {}, ClockDate,
      (callback, delay) => schedule(callback, delay), id => timers.delete(id),
      (callback, delay) => schedule(callback, delay, delay), id => timers.delete(id)
    );
    return module.exports;
  }
  const context = { filesDir: '/test-private', resourceManager: { async getRawFileContent() { return new Uint8Array(Buffer.from(JSON.stringify(curriculum))); } } };
  const { StudyController } = load(path.join(root, 'services/StudyController.ets'));
  const controller = new StudyController();
  controller.setUIContext({ getHostContext() { return undefined; }, getPromptAction() { return { async showDialog() {
    calls.dialogs++; return control.dialogPromise ? await control.dialogPromise : { index: control.dialog };
  } }; } });
  const rules = load(path.join(root, 'core/StateRules.ts'));
  const bank = load(path.join(root, 'training/TrainingBank.ts'));
  return { controller, context, control, calls, files, handles, timers, advance, load, rules, bank,
    snapshot: () => JSON.parse(files.get(primary).toString('utf8')),
    backup: state => JSON.stringify(rules.createBackup(state || controller.state, curriculum)) };
}
async function ready(start, hasSecret = false) { const f = fixture(start); f.control.hasSecret = hasSecret; await f.controller.init(f.context); assert.equal(f.controller.ready, true); return f; }
function queueImport(f, note = '导入的笔记') {
  const state = clone(f.controller.state); state.notes['c-01'] = note;
  f.files.set('/chosen.json', Buffer.from(f.backup(state))); f.control.picker = ['/chosen.json'];
}

test('draft, note and report survive coalesced writes, failed flush, retry and a cold store read', async () => {
  const f = await ready(), c = f.controller, exercise = curriculum.exercises.find(item => item.type === 'code');
  c.saveDraft(exercise.id, '草稿一'); c.saveDraft(exercise.id, '草稿二：中文与😀');
  c.saveNote('c-01', '笔记：变量'); c.saveReport(c.today(), '日报：完成了一小步');
  f.advance(600);
  assert.equal(f.snapshot().drafts[exercise.id], '草稿二：中文与😀');
  assert.equal(f.snapshot().notes['c-01'], '笔记：变量');
  assert.equal(f.snapshot().reports[c.today()].note, '日报：完成了一小步');
  const durable = Buffer.from(f.files.get(primary));
  f.control.failFsyncPath = '.tmp'; c.saveDraft(exercise.id, '尚未落盘的草稿'); f.advance(600);
  assert.deepEqual(f.files.get(primary), durable);
  assert.equal(c.state.drafts[exercise.id], '尚未落盘的草稿');
  assert.equal(JSON.parse(f.backup()).state.drafts[exercise.id], '尚未落盘的草稿');
  f.control.failFsyncPath = ''; assert.equal(c.flush(), true);
  const store = new (f.load(path.join(root, 'services/NativeStore.ets')).NativeStore)();
  assert.deepEqual(store.load(f.context, curriculum), f.snapshot());
  assert.equal(f.handles.size, 0); assert.equal(f.calls.network, 0); assert.equal(f.calls.secretReads, 0);
});

test('repeated quiz submission keeps one progress membership while retaining separate attempts and sticky help', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'quiz');
  c.submitQuiz(q.id, q.answer); c.submitQuiz(q.id, q.answer);
  assert.equal(c.state.attempts.length, 2);
  assert.equal(new Set(c.state.attempts.map(item => item.id)).size, 2);
  assert.deepEqual(c.lessonProgress(q.lessonId).passedExercises, [q.id]);
  assert.deepEqual(c.lessonProgress(q.lessonId).independentExercises, [q.id]);
  c.markHint(q.id); c.submitQuiz(q.id, q.answer);
  assert.deepEqual(c.lessonProgress(q.lessonId).independentExercises, []);
  assert.equal(c.state.attempts.at(-1).assisted, true);
  const roundtrip = f.rules.validateBackup(f.backup(), curriculum);
  assert.deepEqual(roundtrip.progress, c.state.progress); assert.deepEqual(roundtrip.attempts, c.state.attempts);
});

test('impossible report dates cannot poison the durable state or a later backup', async () => {
  const f = await ready(), c = f.controller;
  c.saveReport('2024-02-29', '合法闰日');
  const before = clone(c.state), durable = Buffer.from(f.files.get(primary));
  for (const day of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29']) c.saveReport(day, '不应写入');
  assert.deepEqual(c.state, before); assert.deepEqual(f.files.get(primary), durable);
  assert.equal(f.rules.validateBackup(f.backup(), curriculum).reports['2024-02-29'].note, '合法闰日');
});

test('real worker completion merges interim notes, drafts and help and ignores duplicate native replies', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  let release; f.control.pendingWorker = new Promise(resolve => { release = resolve; }); f.control.duplicateReply = true;
  const running = c.runCode(q.id, q.solution);
  await c.runCode(q.id, q.solution); assert.equal(f.calls.jobs.length, 1);
  c.saveNote(q.lessonId, '运行中新增的笔记'); c.saveDraft(q.id, '运行中继续编辑的草稿'); c.markHint(q.id);
  release(); await running;
  assert.equal(c.lastRun.status, 'passed');
  assert.equal(c.state.attempts.filter(item => item.status === 'passed').length, 1);
  assert.equal(c.state.attempts.at(-1).assisted, true);
  assert.equal(c.state.notes[q.lessonId], '运行中新增的笔记');
  assert.equal(c.state.drafts[q.id], '运行中继续编辑的草稿');
  assert.deepEqual(f.snapshot().notes, c.state.notes); assert.equal(c.runBusy, false);
});

test('late real worker reply after timeout cannot overwrite timeout or award an extra pass', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  let release; f.control.pendingWorker = new Promise(resolve => { release = resolve; });
  const running = c.runCode(q.id, q.solution); f.advance(6001); await running;
  assert.equal(c.lastRun.status, 'timeout'); assert.equal(c.state.attempts.length, 1);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.lastRun.status, 'timeout'); assert.equal(c.state.attempts.length, 1); assert.equal(c.isPassed(q.id), false);
});

test('timer autosave plus repeated lifecycle pauses never duplicate seconds or sessions', async () => {
  const f = await ready(), c = f.controller;
  c.toggleTimer('c-01'); f.advance(35000); c.pauseTimer();
  c.pauseTimer(); c.pauseTimer(); f.advance(90000);
  assert.equal(c.daySeconds(c.today()), 35); assert.equal(c.timerSeconds, 35);
  assert.equal(new Set(c.state.sessions.map(item => item.id)).size, c.state.sessions.length);
  assert.equal(f.timers.size, 0);
  c.toggleTimer('c-01'); f.advance(5000); c.pauseTimer(); assert.equal(c.daySeconds(c.today()), 40);
  assert.deepEqual(f.snapshot().sessions, c.state.sessions);
});

test('timer seconds pending at a failed pause remain recoverable after storage recovers', async () => {
  const f = await ready(), c = f.controller;
  c.toggleTimer('c-01'); f.advance(5000); f.control.failWrite = true; c.pauseTimer();
  f.control.failWrite = false; c.pauseTimer();
  c.toggleTimer('c-01'); f.advance(3000); c.pauseTimer();
  assert.equal(c.daySeconds(c.today()), 8, '5 seconds before the failed pause plus 3 after restart must survive');
  assert.equal(f.snapshot().sessions.reduce((sum, item) => sum + item.seconds, 0), 8);
});

test('several failed timer autosaves remain in memory and a later normal save persists each interval once', async () => {
  const f = await ready(), c = f.controller;
  c.toggleTimer('c-01'); f.control.failWrite = true; f.advance(95000);
  assert.equal(c.todaySeconds(), 95);
  assert.equal(JSON.parse(f.backup()).state.sessions.reduce((sum, item) => sum + item.seconds, 0), 90);
  f.control.failWrite = false; assert.equal(c.saveNote('c-01', '恢复空间后保存'), true);
  c.pauseTimer(); c.pauseTimer();
  assert.equal(c.daySeconds(c.today()), 95);
  assert.equal(f.snapshot().sessions.reduce((sum, item) => sum + item.seconds, 0), 95);
});

test('timer splits midnight correctly so daily reports retain seconds on their actual day', async () => {
  const f = await ready('2026-11-16T15:59:50.000Z'), c = f.controller;
  c.toggleTimer('c-01'); f.advance(30000); c.pauseTimer();
  assert.equal(c.daySeconds('2026-11-16'), 10);
  assert.equal(c.daySeconds('2026-11-17'), 20);
  assert.equal(c.timerSeconds, 20);
  assert.equal(f.rules.validateBackup(f.backup(), curriculum).sessions.reduce((sum, item) => sum + item.seconds, 0), 30);
});

test('failed backup import never replaces live or primary state and closes every native handle', async () => {
  for (const failure of ['shortRead', 'recoverySync', 'replacementSync', 'rename']) {
    const f = await ready(), c = f.controller;
    c.saveNote('c-01', '原笔记'); queueImport(f);
    const before = clone(c.state), durable = Buffer.from(f.files.get(primary));
    if (failure === 'shortRead') f.control.shortRead = true;
    if (failure === 'recoverySync') f.control.failFsyncPath = '-before-import-';
    if (failure === 'replacementSync') f.control.failFsyncPath = '.tmp';
    if (failure === 'rename') f.control.failRename = true;
    await c.importBackup();
    assert.deepEqual(c.state, before, failure); assert.deepEqual(f.files.get(primary), durable, failure);
    assert.equal(f.handles.size, 0, failure); assert.doesNotMatch(c.notice, /已导入/);
  }
});

test('import preserves the latest draft in recovery and invalid incoming data cannot reach confirmation', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  c.saveNote('c-01', '原笔记'); queueImport(f); c.saveDraft(q.id, '文件选择之前的最新草稿');
  await c.importBackup();
  const recovery = [...f.files].filter(([name]) => name.includes('-before-import-'));
  assert.equal(recovery.length, 1);
  assert.equal(JSON.parse(recovery[0][1].toString('utf8')).drafts[q.id], '文件选择之前的最新草稿');
  assert.equal(c.state.notes['c-01'], '导入的笔记');
  const before = clone(c.state), dialogs = f.calls.dialogs;
  const malformed = JSON.parse(f.backup()); malformed.state.reports['2026-02-30'] = { note: '非法日期' };
  f.files.set('/chosen.json', Buffer.from(JSON.stringify(malformed))); await c.importBackup();
  f.files.set('/chosen.json', Buffer.from([0xc0, 0xaf])); await c.importBackup();
  assert.deepEqual(c.state, before); assert.equal(f.calls.dialogs, dialogs); assert.equal(f.handles.size, 0);
});

test('pending import blocks new workers so their late answers cannot revive the replaced state', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  c.saveNote('c-01', '原笔记'); queueImport(f);
  let choose, complete; f.control.pickerPromise = new Promise(resolve => { choose = resolve; });
  const importing = c.importBackup();
  f.control.pendingWorker = new Promise(resolve => { complete = resolve; });
  const running = c.runCode(q.id, q.solution); choose(['/chosen.json']); await importing;
  assert.equal(c.state.notes['c-01'], '导入的笔记'); assert.equal(f.calls.jobs.length, 0);
  complete(); await running; assert.equal(c.isPassed(q.id), false); assert.equal(c.dataBusy, false);
});

test('rapid duplicate imports open one replacement transaction and preserve one original recovery copy', async () => {
  const f = await ready(), c = f.controller;
  c.saveNote('c-01', '原笔记'); queueImport(f);
  let confirm; f.control.dialogPromise = new Promise(resolve => { confirm = resolve; });
  const first = c.importBackup(), second = c.importBackup();
  await new Promise(resolve => setImmediate(resolve));
  confirm({ index: 1 }); await Promise.all([first, second]);
  assert.equal(f.calls.select, 1, 'repeated tap must not start a second replacing transaction');
  assert.equal(f.calls.dialogs, 1);
  const recovery = [...f.files].filter(([name]) => name.includes('-before-import-'));
  assert.equal(recovery.length, 1); assert.equal(JSON.parse(recovery[0][1].toString('utf8')).notes['c-01'], '原笔记');
});

test('export uses complete UTF8 writes and roundtrips training difficulty, help and wrong-answer history', async () => {
  const f = await ready(), c = f.controller, rules = f.load(path.join(root, 'training/TrainingRules.ts'));
  const q = f.bank.getTrainingQuestion('tr:c-output-precedence:0');
  c.saveNote('c-01', '中文笔记😀'); c.saveReport(c.today(), '真实复盘');
  c.submitTrainingQuiz(q.id, (q.answer + 1) % q.choices.length); c.trainingHelp(q.id); c.submitTrainingQuiz(q.id, q.answer);
  c.saveTrainingDraft('tr:c-arith-add:0', 'int main(void) { return 0; }');
  const before = clone(c.state); f.files.set('/export.json', Buffer.alloc(0)); f.control.picker = ['/export.json']; f.control.chunk = 7;
  await c.exportBackup();
  const imported = f.rules.validateBackup(f.files.get('/export.json').toString('utf8'), curriculum);
  assert.deepEqual(imported.training, before.training); assert.deepEqual(imported.notes, before.notes); assert.deepEqual(imported.reports, before.reports);
  assert.deepEqual(c.state, before);
  for (const seed of [0, 42, 9999, 4294967295]) {
    assert.equal(rules.selectTrainingQuestion(imported.training, 'adaptive', 'all', seed).id,
      rules.selectTrainingQuestion(before.training, 'adaptive', 'all', seed).id);
  }
  f.control.failWrite = true; await c.exportBackup();
  assert.doesNotMatch(c.notice, /已导出/); assert.deepEqual(c.state, before);
  assert.equal(f.handles.size, 0); assert.equal(f.calls.network, 0); assert.equal(f.calls.secretReads, 0);
});

test('AI disabled startup with an existing simulated vault entry never reads secret contents or opens HTTP', async () => {
  const f = await ready(undefined, true);
  assert.equal(f.controller.hasApiKey, true); assert.equal(f.controller.state.settings.aiEnabled, false);
  await f.controller.loadModels();
  assert.equal(f.calls.secretReads, 0); assert.equal(f.calls.network, 0);
});

test('pending export excludes duplicate export, import and reset and releases the lock on every outcome', async () => {
  for (const outcome of ['success', 'cancel', 'failure']) {
    const f = await ready(), c = f.controller;
    c.saveNote('c-01', '导出事务期间保留'); c.toggleTimer('c-01'); f.advance(7000);
    f.files.set('/export.json', Buffer.alloc(0));
    let choose; f.control.savePromise = new Promise(resolve => { choose = resolve; });
    const exporting = c.exportBackup();
    assert.equal(c.dataBusy, true); assert.equal(c.timerRunning, false); assert.equal(c.daySeconds(c.today()), 7);
    const before = clone(c.state);
    await c.exportBackup(); await c.importBackup(); assert.equal(await c.resetLearningData(), false);
    assert.equal(f.calls.save, 1); assert.equal(f.calls.select, 0); assert.equal(f.calls.dialogs, 0);
    if (outcome === 'failure') f.control.failWrite = true;
    choose(outcome === 'cancel' ? [] : ['/export.json']); await exporting;
    assert.equal(c.dataBusy, false, outcome); assert.deepEqual(c.state, before, outcome); assert.equal(f.handles.size, 0);
    if (outcome === 'success') assert.equal(f.rules.validateBackup(f.files.get('/export.json').toString('utf8'), curriculum).sessions[0].seconds, 7);
    if (outcome === 'failure') assert.match(c.notice, /导出未完成/);
  }
});

test('reset cancellation leaves every record and active timer intact', async () => {
  const f = await ready(), c = f.controller;
  c.saveNote('c-01', '取消重置应保留'); c.toggleTimer('c-01'); f.advance(4000);
  const before = clone(c.state), durable = Buffer.from(f.files.get(primary)); f.control.dialog = 0;
  assert.equal(await c.resetLearningData(), false);
  assert.deepEqual(c.state, before); assert.deepEqual(f.files.get(primary), durable);
  assert.equal(c.timerRunning, true); assert.equal(c.dataBusy, false);
  assert.equal([...f.files.keys()].some(name => name.includes('-before-reset-')), false);
  c.pauseTimer(); assert.equal(c.daySeconds(c.today()), 4);
});

test('successful reset clears all learning records only after preserving a complete recovery and retains the key', async () => {
  const f = await ready(undefined, true), c = f.controller;
  const quiz = curriculum.exercises.find(item => item.type === 'quiz'), code = curriculum.exercises.find(item => item.type === 'code');
  c.saveNote('c-01', '待恢复笔记'); c.saveDraft(code.id, '待恢复草稿'); c.saveReport(c.today(), '待恢复日报');
  c.submitQuiz(quiz.id, quiz.answer); c.submitTrainingQuiz('tr:c-output-precedence:0', 0);
  c.saveTrainingDraft('tr:c-arith-add:0', '待恢复训练草稿');
  c.state.chats.push({ id: 'synthetic-chat', role: 'user', content: '纯测试对话', lessonId: 'c-01', createdAt: '2026-11-16T04:00:00.000Z' });
  c.state.settings.aiEnabled = true; c.toggleTimer('c-01'); f.advance(5000);
  assert.equal(await c.resetLearningData(), true);
  const recovery = [...f.files].filter(([name]) => name.includes('-before-reset-') && name.endsWith('.json'));
  assert.equal(recovery.length, 1);
  const original = f.rules.validateStoredState(recovery[0][1].toString('utf8'), curriculum);
  assert.equal(original.notes['c-01'], '待恢复笔记'); assert.equal(original.drafts[code.id], '待恢复草稿');
  assert.equal(original.sessions.reduce((sum, item) => sum + item.seconds, 0), 5);
  assert.equal(original.chats[0].content, '纯测试对话'); assert.equal(original.training.attempts.length, 1);
  for (const field of ['progress', 'drafts', 'notes', 'reports']) assert.deepEqual(c.state[field], {});
  for (const field of ['sessions', 'attempts', 'chats']) assert.deepEqual(c.state[field], []);
  assert.equal(c.state.training.attempts.length, 0); assert.deepEqual(c.state.training.drafts, {});
  assert.equal(c.hasApiKey, true); assert.equal(c.state.settings.hasApiKey, true); assert.equal(c.state.settings.aiEnabled, false);
  assert.equal(c.timerRunning, false); assert.equal(c.timerSeconds, 0); assert.equal(c.runBusy, false);
  assert.equal(c.lastRun.status, ''); assert.equal(c.lastQuiz.exerciseId, ''); assert.equal(c.dataBusy, false);
  assert.equal(f.timers.size, 0); assert.equal(f.calls.secretReads, 0); assert.equal(f.calls.network, 0);
  assert.equal(f.snapshot().notes['c-01'], undefined); assert.equal(f.snapshot().settings.hasApiKey, false);
});

test('recovery fsync, recovery rename or final reset write failure keeps original learning records', async () => {
  for (const failure of ['backupFsync', 'backupRename', 'replacementFsync']) {
    const f = await ready(), c = f.controller; c.saveNote('c-01', '不能被清空');
    const before = clone(c.state), durable = Buffer.from(f.files.get(primary));
    if (failure === 'backupFsync') f.control.failFsyncPath = '-before-reset-';
    if (failure === 'backupRename') f.control.failRename = true;
    if (failure === 'replacementFsync') f.control.failFsyncPath = 'learning-state.tmp';
    assert.equal(await c.resetLearningData(), false, failure);
    assert.deepEqual(c.state, before, failure); assert.deepEqual(f.files.get(primary), durable, failure);
    assert.equal(c.dataBusy, false); assert.equal(f.handles.size, 0); assert.doesNotMatch(c.notice, /学习数据已重置/);
  }
});

test('reset refuses in-flight work and its pending confirmation blocks new work and repeated replacement', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  let release; f.control.pendingWorker = new Promise(resolve => { release = resolve; });
  const running = c.runCode(q.id, q.solution);
  assert.equal(await c.resetLearningData(), false); assert.equal(f.calls.dialogs, 0);
  release(); await running;
  let confirm; f.control.dialogPromise = new Promise(resolve => { confirm = resolve; });
  const resetting = c.resetLearningData();
  assert.equal(c.dataBusy, true);
  await c.runCode(q.id, q.solution); await c.runTrainingCode('tr:c-arith-add:0', 'int main(void){return 0;}');
  await c.ask('不得发送', 'c-01', '', false); await c.saveApiKey('FAKE_ONLY_NEVER_SAVED'); await c.importBackup();
  assert.equal(await c.resetLearningData(), false); assert.equal(f.calls.jobs.length, 1); assert.equal(f.calls.select, 0);
  confirm({ index: 1 }); assert.equal(await resetting, true);
  assert.equal(c.state.attempts.length, 0); assert.equal(f.calls.network, 0); assert.equal(c.dataBusy, false);
});

test('an old timed-out worker answer arriving after reset cannot resurrect scores or display state', async () => {
  const f = await ready(), c = f.controller, q = curriculum.exercises.find(item => item.type === 'code');
  let release; f.control.pendingWorker = new Promise(resolve => { release = resolve; });
  const running = c.runCode(q.id, q.solution); f.advance(6001); await running;
  assert.equal(await c.resetLearningData(), true);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.state.attempts.length, 0); assert.equal(c.lastRun.status, ''); assert.equal(c.isPassed(q.id), false);
  assert.equal(f.snapshot().attempts.length, 0);
});

test('two recovery snapshots at the same clock instant use unique complete files', async () => {
  const f = await ready(), c = f.controller, { NativeStore } = f.load(path.join(root, 'services/NativeStore.ets'));
  const store = new NativeStore(); store.load(f.context, curriculum);
  c.saveNote('c-01', '较长的原始学习记录'); store.preserveBeforeImport(c.state);
  c.saveNote('c-01', '短'); store.preserveBeforeImport(c.state);
  const copies = [...f.files].filter(([name]) => name.includes('-before-import-') && name.endsWith('.json'));
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map(([, bytes]) => f.rules.validateStoredState(bytes.toString('utf8'), curriculum).notes['c-01']).sort(), ['短', '较长的原始学习记录'].sort());
});
