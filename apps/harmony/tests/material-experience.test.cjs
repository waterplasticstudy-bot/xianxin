'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const file = path.resolve(__dirname, '../entry/src/main/ets/services/MaterialExperience.ets');

function fixture(initial) {
  const cached = new Map(), persisted = new Map();
  if (initial !== undefined) { cached.set('enabled', initial); persisted.set('enabled', initial); }
  const control = { openError: false, readError: false, putFailures: 0, flushFailures: 0, lateFlushFailures: 0, pendingFlush: null };
  const calls = { opens: [], puts: [], flushes: 0 };
  const prefs = {
    getSync(key, fallback) {
      if (control.readError) throw Error('read failed');
      return cached.has(key) ? cached.get(key) : fallback;
    },
    putSync(key, value) {
      calls.puts.push({ key, value });
      if (control.putFailures > 0) { control.putFailures--; throw Error('cache write failed'); }
      cached.set(key, value);
    },
    async flush() {
      calls.flushes++;
      if (control.pendingFlush) await control.pendingFlush;
      if (control.flushFailures > 0) { control.flushFailures--; throw Error('disk write failed'); }
      for (const [key, value] of cached) persisted.set(key, value);
      // 模拟底层已写入但返回失败，确认服务仍会回写原选择。
      if (control.lateFlushFailures > 0) { control.lateFlushFailures--; throw Error('late disk failure'); }
    }
  };
  const emptyMaterial = Object.freeze({ type: 'native-empty-material' });
  const kits = {
    '@kit.AbilityKit': {},
    '@kit.ArkUI': { uiMaterial: { Material: { empty: emptyMaterial } } },
    '@kit.ArkData': { preferences: { getPreferencesSync(context, options) {
      calls.opens.push(options.name);
      if (control.openError) throw Error('open failed');
      return prefs;
    } } }
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file.replace(/\.ets$/, '.ts'),
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true }
  });
  vm.runInThisContext(`(function(require,module,exports,ObservedV2,Trace){${compiled.outputText}\n})`, { filename: file })(
    name => { assert(kits[name], `unexpected credential, learning-data or native dependency ${name}`); return kits[name]; },
    module, module.exports, value => value, () => {}
  );
  const material = new module.exports.MaterialExperience();
  return { material, MaterialExperience: module.exports.MaterialExperience, emptyMaterial, cached, persisted, control, calls, context: {} };
}

test('native controls keep the system default while enabled and explicitly opt out while disabled', async () => {
  const f = fixture();
  assert.equal(f.material.defaultMaterial(), undefined);
  await f.material.init(f.context);
  assert.equal(await f.material.setEnabled(false), true);
  assert.equal(f.material.defaultMaterial(), f.emptyMaterial);
  const reopened = new f.MaterialExperience();
  await reopened.init(f.context);
  assert.equal(reopened.defaultMaterial(), f.emptyMaterial);
  assert.equal(await reopened.setEnabled(true), true);
  assert.equal(reopened.defaultMaterial(), undefined);
});

test('failed enable restores the explicit empty material for native controls', async () => {
  const f = fixture(false);
  await f.material.init(f.context);
  f.control.flushFailures = 1;
  assert.equal(await f.material.setEnabled(true), false);
  assert.equal(f.material.defaultMaterial(), f.emptyMaterial);
});

test('first launch defaults on without writing and old saved false survives a new service', async () => {
  const f = fixture();
  assert.equal(f.material.enabled, true);
  assert.equal(f.material.ready, false);
  await f.material.init(f.context);
  assert.equal(f.material.enabled, true);
  assert.equal(f.material.ready, true);
  assert.deepEqual(f.calls.opens, ['qicheng-material-experience']);
  assert.equal(f.calls.puts.length, 0);
  assert.equal(f.calls.flushes, 0);
  const previous = fixture(false);
  await previous.material.init(previous.context);
  assert.equal(previous.material.enabled, false);
});

test('independent preference persists off/on and reinitialization restores the stored selection', async () => {
  const f = fixture();
  await f.material.init(f.context);
  assert.equal(await f.material.setEnabled(false), true);
  assert.deepEqual([...f.persisted], [['enabled', false]]);
  assert.equal(f.material.enabled, false);
  assert.match(f.material.notice, /已关闭/);
  const reopened = new f.MaterialExperience();
  await reopened.init(f.context);
  assert.equal(reopened.enabled, false);
  assert.equal(await reopened.setEnabled(true), true);
  assert.deepEqual([...f.persisted], [['enabled', true]]);
  assert.match(reopened.notice, /跟随系统强弱/);
});

test('invalid preference type falls back to on and remains editable', async () => {
  const f = fixture('false');
  await f.material.init(f.context);
  assert.equal(f.material.enabled, true);
  assert.equal(f.material.ready, true);
  assert.match(f.material.notice, /格式异常/);
  assert.equal(await f.material.setEnabled(false), true);
  assert.equal(f.persisted.get('enabled'), false);
});

test('uninitialized and failed reads cannot silently change or write the option', async () => {
  const f = fixture(false);
  assert.equal(await f.material.setEnabled(false), false);
  assert.equal(f.material.enabled, true);
  f.control.openError = true;
  await f.material.init(f.context);
  assert.equal(f.material.ready, false);
  assert.equal(await f.material.setEnabled(false), false);
  assert.equal(f.calls.puts.length, 0);
  f.control.openError = false;
  f.control.readError = true;
  await f.material.init(f.context);
  assert.equal(f.material.ready, false);
  f.control.readError = false;
  await f.material.init(f.context);
  assert.equal(f.material.enabled, false);
  assert.equal(f.material.ready, true);
});

test('failed cache write restores the observed selection and allows retry', async () => {
  const f = fixture(true);
  await f.material.init(f.context);
  f.control.putFailures = 1;
  assert.equal(await f.material.setEnabled(false), false);
  assert.equal(f.material.enabled, true);
  assert.equal(f.cached.get('enabled'), true);
  assert.equal(f.persisted.get('enabled'), true);
  assert.equal(f.material.busy, false);
  assert.equal(f.material.ready, true);
  assert.match(f.material.notice, /保存失败.*保留原设置/);
  assert.equal(await f.material.setEnabled(false), true);
});

test('flush failure rolls back the cache and even a late disk write before reporting failure', async () => {
  for (const mode of ['flushFailures', 'lateFlushFailures']) {
    const f = fixture(false);
    await f.material.init(f.context);
    f.control[mode] = 1;
    assert.equal(await f.material.setEnabled(true), false);
    assert.equal(f.material.enabled, false);
    assert.equal(f.cached.get('enabled'), false);
    assert.equal(f.persisted.get('enabled'), false);
    const reopened = new f.MaterialExperience();
    await reopened.init(f.context);
    assert.equal(reopened.enabled, false);
    assert.equal(f.material.ready, true);
  }
});

test('failed rollback keeps the old visual state and reports uncertainty instead of saved success', async () => {
  const f = fixture(true);
  await f.material.init(f.context);
  f.control.flushFailures = 2;
  assert.equal(await f.material.setEnabled(false), false);
  assert.equal(f.material.enabled, true);
  assert.equal(f.material.busy, false);
  assert.equal(f.material.ready, false);
  assert.match(f.material.notice, /保存失败.*重新打开应用后确认/);
  const count = f.calls.puts.length;
  assert.equal(await f.material.setEnabled(false), false);
  assert.equal(f.calls.puts.length, count);
});

test('pending persistence locks duplicate changes and window reinitialization until it settles', async () => {
  const f = fixture(true);
  await f.material.init(f.context);
  let release;
  f.control.pendingFlush = new Promise(resolve => { release = resolve; });
  const saving = f.material.setEnabled(false);
  assert.equal(f.material.enabled, false);
  assert.equal(f.material.busy, true);
  assert.equal(f.persisted.get('enabled'), true);
  assert.equal(await f.material.setEnabled(true), false);
  await f.material.init(f.context);
  assert.equal(f.calls.opens.length, 1);
  assert.equal(f.material.enabled, false);
  assert.equal(f.calls.puts.length, 1);
  release();
  assert.equal(await saving, true);
  assert.equal(f.material.busy, false);
  assert.equal(f.persisted.get('enabled'), false);
  const count = f.calls.flushes;
  assert.equal(await f.material.setEnabled(false), true);
  assert.equal(f.calls.flushes, count);
});
