'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const file = path.resolve(__dirname, '../entry/src/main/ets/services/HandExperience.ets');

function fixture() {
  const control = { capability: true, permission: true, onError: 0, offError: 0, flushError: false, dialog: 1, dialogPromise: null };
  const calls = { on: [], off: [], dialogs: [], checks: [], runtimeRequests: 0 };
  const stored = new Map(), listeners = new Set(), timers = new Map();
  let now = 1000, nextTimer = 1;
  const status = { NOT_HELD: 0, LEFT_HAND_HELD: 1, RIGHT_HAND_HELD: 2, BOTH_HANDS_HELD: 3, UNKNOWN_STATUS: 16 };
  const motion = {
    HoldingHandStatus: status,
    on(event, callback) { calls.on.push({ event, callback }); if (control.onError) throw { code: control.onError }; listeners.add(callback); },
    off(event, callback) { calls.off.push({ event, callback }); if (control.offError) throw { code: control.offError }; listeners.delete(callback); }
  };
  const prefs = {
    getSync: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
    putSync: (key, value) => stored.set(key, value),
    flushSync: () => { if (control.flushError) throw Error('disk full'); }
  };
  const kits = {
    './MaterialExperience': { materialExperience: { defaultMaterial: () => undefined } },
    '@kit.AbilityKit': { abilityAccessCtrl: {
      GrantStatus: { PERMISSION_GRANTED: 0, PERMISSION_DENIED: -1 },
      createAtManager: () => ({
        checkAccessTokenSync(token, permission) { calls.checks.push({ token, permission }); return control.permission ? 0 : -1; },
        requestPermissionsFromUser() { calls.runtimeRequests++; throw Error('DETECT_GESTURE is system_grant'); }
      })
    } },
    '@kit.ArkData': { preferences: { getPreferencesSync: () => prefs } },
    '@kit.ArkUI': {}, '@kit.BasicServicesKit': {}, '@kit.MultimodalAwarenessKit': { motion }
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file.replace(/\.ets$/, '.ts'),
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true }
  });
  class ClockDate extends Date { static now() { return now; } }
  const setTimer = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id; };
  vm.runInThisContext(`(function(require,module,exports,ObservedV2,Trace,canIUse,setTimeout,clearTimeout,Date){${compiled.outputText}\n})`, { filename: file })(
    name => { assert(kits[name], `unexpected native/network dependency ${name}`); return kits[name]; },
    module, module.exports, value => value, () => {},
    capability => { assert.equal(capability, 'SystemCapability.MultimodalAwareness.Motion'); return control.capability; },
    setTimer, id => timers.delete(id), ClockDate
  );
  const ui = { getPromptAction: () => ({ async showDialog(options) { calls.dialogs.push(options); return control.dialogPromise ? await control.dialogPromise : { index: control.dialog }; } }) };
  const context = { applicationInfo: { accessTokenId: 123 } };
  const hand = new module.exports.HandExperience();
  const advance = milliseconds => {
    const until = now + milliseconds;
    while (true) {
      const entry = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].callback();
    }
    now = until;
  };
  const emit = value => { [...listeners].forEach(callback => callback(value)); };
  return { hand, control, calls, stored, listeners, timers, status, ui, context, advance, emit, ...module.exports };
}

test('stability commits after 250 ms; neutral/both-hands preserve the side and cancel a pending switch', () => {
  const f = fixture(), stable = new f.HandStability(), s = f.status;
  stable.observe(s.UNKNOWN_STATUS, 0); assert.equal(stable.dueAt(), -1); assert.equal(stable.settle(1000), 'default');
  stable.observe(s.LEFT_HAND_HELD, 1000); assert.equal(stable.dueAt(), 1250);
  assert.equal(stable.settle(1249), 'default'); assert.equal(stable.settle(1250), 'left');
  stable.observe(s.RIGHT_HAND_HELD, 1700); stable.observe(s.BOTH_HANDS_HELD, 1800);
  assert.equal(stable.dueAt(), -1); assert.equal(stable.settle(5000), 'left');
  stable.observe(s.NOT_HELD, 6000); assert.equal(stable.settle(10000), 'left');
  stable.reset(); assert.equal(stable.settle(20000), 'default');
});

test('alternating hands restart stability; repeated same-hand reports do not postpone the deadline', () => {
  const f = fixture(), stable = new f.HandStability(), s = f.status;
  stable.observe(s.LEFT_HAND_HELD, 1000); stable.observe(s.RIGHT_HAND_HELD, 1200);
  stable.observe(s.LEFT_HAND_HELD, 1500); assert.equal(stable.dueAt(), 1750);
  stable.observe(s.LEFT_HAND_HELD, 1700); assert.equal(stable.dueAt(), 1750);
  assert.equal(stable.settle(1749), 'default'); assert.equal(stable.settle(1750), 'left');
});

test('default-off and declined opt-in do not subscribe or request runtime system_grant permission', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground();
  assert.equal(f.hand.enabled, false); assert.equal(f.calls.on.length, 0);
  f.control.dialog = 0; assert.equal(await f.hand.enable(f.ui), false);
  assert.equal(f.calls.on.length, 0); assert.equal(f.calls.runtimeRequests, 0); assert.equal(f.hand.side, 'default');
  assert(f.calls.checks.every(check => check.permission === 'ohos.permission.DETECT_GESTURE'));
});

test('explicit opt-in subscribes once, moves only after stable holding, and persists only the option', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground();
  assert.equal(await f.hand.enable(f.ui), true); assert.equal(f.calls.on.length, 1);
  f.hand.onForeground(); assert.equal(f.calls.on.length, 1);
  f.emit(f.status.LEFT_HAND_HELD); f.advance(249); assert.equal(f.hand.side, 'default');
  f.advance(1); assert.equal(f.hand.side, 'left'); assert.equal(f.hand.status, 'active');
  f.emit(f.status.BOTH_HANDS_HELD); f.advance(1000); assert.equal(f.hand.side, 'left');
  f.emit(f.status.RIGHT_HAND_HELD); f.advance(200); f.emit(f.status.UNKNOWN_STATUS); f.advance(1000);
  assert.equal(f.hand.side, 'left');
  f.emit(f.status.RIGHT_HAND_HELD); f.advance(250); assert.equal(f.hand.side, 'right');
  assert.deepEqual([...f.stored], [['enabled', true]]); assert.equal(f.calls.runtimeRequests, 0);
});

test('background detaches the exact callback, cancels pending moves and ignores queued native events', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); await f.hand.enable(f.ui);
  const first = f.calls.on[0].callback;
  f.emit(f.status.LEFT_HAND_HELD); f.advance(200); f.hand.onBackground();
  assert.equal(f.calls.off[0].callback, first); assert.equal(f.listeners.size, 0); assert.equal(f.hand.status, 'paused');
  first(f.status.RIGHT_HAND_HELD); f.advance(3000); assert.equal(f.hand.side, 'default');
  f.hand.onForeground(); assert.equal(f.calls.on.length, 2); assert.notEqual(f.calls.on[1].callback, first);
  f.emit(f.status.RIGHT_HAND_HELD); f.advance(250); assert.equal(f.hand.side, 'right');
  f.hand.disable(); assert.equal(f.hand.enabled, false); assert.equal(f.hand.side, 'default'); assert.equal(f.listeners.size, 0);
  assert.deepEqual([...f.stored], [['enabled', false]]);
});

test('unsupported capability or denied permission preserve default without opening a misleading dialog', async () => {
  for (const mode of ['capability', 'permission']) {
    const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); f.control[mode] = false;
    assert.equal(await f.hand.enable(f.ui), false); assert.equal(f.hand.side, 'default');
    assert.equal(f.hand.enabled, false); assert.equal(f.calls.on.length, 0); assert.equal(f.calls.dialogs.length, 0);
    assert.equal(f.hand.status, mode === 'capability' ? 'unsupported' : 'denied');
  }
});

test('801 and 201 registration failures degrade safely and can be retried after support recovers', async () => {
  for (const code of [801, 201]) {
    const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); f.control.onError = code;
    assert.equal(await f.hand.enable(f.ui), false); assert.equal(f.hand.enabled, false); assert.equal(f.hand.side, 'default');
    assert.equal(f.hand.status, code === 801 ? 'unsupported' : 'denied'); assert.equal(f.listeners.size, 0);
    f.control.onError = 0; assert.equal(await f.hand.enable(f.ui), true); assert.equal(f.listeners.size, 1);
  }
});

test('permission is checked again when returning to the foreground', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); await f.hand.enable(f.ui);
  f.hand.onBackground(); f.control.permission = false; f.hand.onForeground();
  assert.equal(f.hand.enabled, false); assert.equal(f.hand.status, 'denied'); assert.equal(f.hand.side, 'default');
  assert.equal(f.calls.on.length, 1); assert.equal(f.stored.get('enabled'), false);
});

test('disabling while an opt-in dialog is pending invalidates its eventual acceptance', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground();
  let finish; f.control.dialogPromise = new Promise(resolve => { finish = resolve; });
  const pending = f.hand.enable(f.ui); assert.equal(f.hand.busy, true);
  f.hand.disable(); finish({ index: 1 }); assert.equal(await pending, false);
  assert.equal(f.hand.enabled, false); assert.equal(f.calls.on.length, 0); assert.equal(f.hand.busy, false);
});

test('accepting opt-in after moving to background waits until foreground before subscribing', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground();
  let finish; f.control.dialogPromise = new Promise(resolve => { finish = resolve; });
  const pending = f.hand.enable(f.ui); f.hand.onBackground(); finish({ index: 1 });
  assert.equal(await pending, true); assert.equal(f.calls.on.length, 0); assert.equal(f.hand.status, 'paused');
  f.hand.onForeground(); assert.equal(f.calls.on.length, 1);
});

test('failed native unsubscribe invalidates events and prevents duplicate subscriptions', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); await f.hand.enable(f.ui);
  f.control.offError = 31500003; f.hand.onBackground();
  f.emit(f.status.LEFT_HAND_HELD); f.advance(1000); assert.equal(f.hand.side, 'default');
  f.hand.onForeground(); assert.equal(f.calls.on.length, 1); assert.equal(f.hand.enabled, false);
  f.control.offError = 0; f.hand.disable(); assert.equal(f.listeners.size, 0);
});

test('preference failure never reports enabled and rolls back a just-started subscription', async () => {
  const f = fixture(); f.hand.init(f.context); f.hand.onForeground(); f.control.flushError = true;
  assert.equal(await f.hand.enable(f.ui), false); assert.equal(f.hand.enabled, false); assert.equal(f.hand.side, 'default');
  assert.equal(f.listeners.size, 0); assert.equal(f.hand.status, 'error'); assert(f.hand.notice.includes('未能保存'));
});

test('remembered opt-in resumes only in foreground; disposal cancels all UI changes', async () => {
  const f = fixture(); f.stored.set('enabled', true); f.hand.init(f.context);
  assert.equal(f.hand.enabled, true); assert.equal(f.calls.on.length, 0);
  f.hand.onForeground(); assert.equal(f.calls.on.length, 1);
  f.emit(f.status.RIGHT_HAND_HELD); f.hand.dispose(); f.advance(1000);
  assert.equal(f.hand.side, 'default'); assert.equal(f.listeners.size, 0);
});
