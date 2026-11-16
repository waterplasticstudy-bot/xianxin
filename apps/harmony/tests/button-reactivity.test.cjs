'use strict';
// Regression against Hvigor's actual generated Index, not a handwritten copy of
// the builders. Only native Button modifiers and observation callbacks are
// modeled here. This proves callback data flow, not device touch/layout behavior.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require(process.env.LEARNING_TYPESCRIPT || 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');

function locateCompiledIndex() {
  if (process.env.LEARNING_COMPILED_INDEX) {
    const file = path.resolve(process.env.LEARNING_COMPILED_INDEX);
    assert.ok(fs.existsSync(file), 'LEARNING_COMPILED_INDEX does not exist: ' + file);
    return file;
  }
  const roots = process.env.LEARNING_APP_ROOT ? [path.resolve(process.env.LEARNING_APP_ROOT)] : [path.resolve(__dirname, '..'), 'D:/STM32-Learning/HarmonyLearning'];
  const candidates = [];
  function scan(dir, depth) {
    if (depth > 24 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', 'oh_modules'].includes(entry.name)) scan(full, depth + 1);
      else if (entry.isFile() && /^Index\.(ts|js)$/.test(entry.name) && /[/\\]ets[/\\]pages[/\\]Index\.(ts|js)$/.test(full) && /@CompileArkTS[/\\]/.test(full)) candidates.push(full);
    }
  }
  for (const root of roots) scan(path.join(root, 'entry/build'), 0);
  assert.ok(candidates.length > 0, 'No generated Index found. Build the app first, or set LEARNING_COMPILED_INDEX to the generated Index.ts.');
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs || a.localeCompare(b));
  return candidates[0];
}

const compiledPath = locateCompiledIndex();
assert.ok(!/@PreviewArkTS[/\\]/.test(compiledPath), 'Preview output is not a production compilation artifact.');
const source = fs.readFileSync(compiledPath, 'utf8');
assert.match(source, /observeComponentCreation2/, 'Expected compiler-generated ArkUI code, not the original .ets source.');
const ast = ts.createSourceFile(compiledPath, source, ts.ScriptTarget.Latest, true);
const pageClass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'Index');
assert.ok(pageClass, 'Compiled Index class is missing.');
const buttonHelperNames = ['primaryButton', 'secondaryButton'];
const helperNames = [...buttonHelperNames, 'stat', 'caption', 'quietTag', 'textCode'];
const helpers = helperNames.map(name => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === name);
  assert.ok(method, 'Compiled helper is missing: ' + name);
  return method.getText(ast);
});
const calls = [];
function helperCalled(expression) {
  if (ts.isPropertyAccessExpression(expression) && helperNames.includes(expression.name.text)) return expression.name.text;
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === 'bind') return helperCalled(expression.expression.expression);
  return '';
}
function visit(node) {
  if (ts.isCallExpression(node)) {
    const name = helperCalled(node.expression);
    if (name && node.arguments.length >= 1) calls.push({ name, node });
  }
  ts.forEachChild(node, visit);
}
visit(pageClass);
const constants = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.every(declaration => declaration.initializer && ts.isStringLiteral(declaration.initializer))).map(node => node.getText(ast)).join('\n');

test('compiled grip toggle ignores render echoes during consent and accepts later deliberate changes', () => {
  const callbacks = [];
  function inspect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'Toggle.onChange' && node.arguments[0]?.getText(ast).includes('handExperience.enable')) callbacks.push(node.arguments[0]);
    ts.forEachChild(node, inspect);
  }
  inspect(pageClass);
  assert.equal(callbacks.length, 1, 'Expected the production grip Toggle callback.');
  let enables = 0, disables = 0;
  const handExperience = {
    enabled: false, busy: false,
    enable() { enables++; this.busy = true; },
    disable() { disables++; this.busy = false; this.enabled = false; }
  };
  const sandbox = { handExperience, page: { getUIContext: () => ({}) }, callback: null };
  vm.runInNewContext(compile('callback = (function() { return ' + callbacks[0].getText(ast) + '; }).call(page);'), sandbox);
  const change = sandbox.callback;
  change(true); // deliberate user enable; consent is pending
  change(false); // native Toggle re-renders committed isOn=false
  assert.equal(enables, 1); assert.equal(disables, 0); assert.equal(handExperience.busy, true);
  handExperience.enabled = true; handExperience.busy = false; // consent accepted
  change(true); // programmatic committed-state echo
  assert.equal(enables, 1);
  change(false); // deliberate off
  assert.equal(disables, 1); assert.equal(handExperience.enabled, false);
  change(false); assert.equal(disables, 1);
  change(true); change(false); // second dialog then a render echo
  handExperience.busy = false; // consent cancelled
  change(false); assert.equal(disables, 1);
  change(true); assert.equal(enables, 3); // cancel does not strand the control
});

test('compiled independent material toggle waits for readiness and ignores committed-state echoes', () => {
  const callbacks = [];
  function inspect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'Toggle.onChange' && node.arguments[0]?.getText(ast).includes('this.setMaterialEnabled')) callbacks.push(node.arguments[0]);
    ts.forEachChild(node, inspect);
  }
  inspect(pageClass); assert.equal(callbacks.length, 1);
  const changes = [];
  const materialExperience = { enabled: true, ready: false, busy: false,
    setEnabled(value) { changes.push(value); this.busy = true; } };
  const sandbox = { materialExperience, page: { setMaterialEnabled: value => materialExperience.setEnabled(value) }, callback: null };
  vm.runInNewContext(compile('callback = (function() { return ' + callbacks[0].getText(ast) + '; }).call(page);'), sandbox);
  sandbox.callback(false); assert.deepEqual(changes, []);
  materialExperience.ready = true;
  sandbox.callback(true); assert.deepEqual(changes, []);
  sandbox.callback(false); assert.deepEqual(changes, [false]);
  sandbox.callback(true); assert.deepEqual(changes, [false], 'render echo cannot start another preference save');
  materialExperience.enabled = false; materialExperience.busy = false;
  sandbox.callback(false); assert.deepEqual(changes, [false]);
  sandbox.callback(true); assert.deepEqual(changes, [false, true]);
});

test('compiled material selectors cover explicit materials, selects, switches, and the video dialog', () => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'materialFor');
  assert.ok(method);
  const empty = {}, material = {}, materialExperience = { enabled: true };
  const sandbox = { exports: {}, materialExperience, uiMaterial: { Material: { empty } } };
  vm.runInNewContext(compile('class Probe { ' + method.getText(ast) + ' } exports.Probe = Probe;'), sandbox);
  const page = new sandbox.exports.Probe(); page.materialSupported = true;
  assert.equal(page.materialFor(material), material);
  materialExperience.enabled = false; assert.equal(page.materialFor(material), empty);
  materialExperience.enabled = true; assert.equal(page.materialFor(material), material);
  page.materialSupported = false; assert.equal(page.materialFor(material), empty);
  let materialSites = 0, defaultSites = 0;
  function count(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'this.materialFor') materialSites++;
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'materialExperience.defaultMaterial') defaultSites++;
    ts.forEachChild(node, count);
  }
  count(pageClass);
  assert.equal(materialSites, 5, 'title, top back button, root bar, bottom back button, and detail bar must honor the preference; capsule has no second material');
  assert.equal(defaultSites, 14, 'four Selects+menus, four Toggles, video dialog, and detail bar modifier must honor the preference');
});

test('compiled stable hand side drives the native detail bar modifier and keeps root tabs centered', () => {
  const names = ['detailDockOffset', 'detailBarModifier', 'isDetailSession', 'pressDetailBar', 'releaseDetailBar'];
  const methods = names.map(name => pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === name));
  assert(methods.every(Boolean));
  class CommonModifier {
    systemMaterial(value) { this.material = value; return this; }
    translate(value) { this.translation = value; return this; }
    onAreaChange(callback) { this.areaChanged = callback; return this; }
  }
  const handExperience = { enabled: true, side: 'left' };
  const sandbox = { exports: {}, CommonModifier, handExperience, materialExperience: { defaultMaterial: () => undefined }, StudyScreen: { Main: 'main' } };
  vm.runInNewContext(compile('class Probe { ' + methods.map(method => method.getText(ast)).join('\n') + ' } exports.Probe = Probe;'), sandbox);
  const page = new sandbox.exports.Probe();
  Object.assign(page, { screen: 'settings', dockFloating: true, detailTabsWidth: 400, detailBarWidth: 188, rootSession: 9, detailBarPressed: false, detailBarHeldOffset: 0 });
  assert.equal(page.detailBarModifier(9).translation.x, -90);
  handExperience.side = 'right'; assert.equal(page.detailBarModifier(9).translation.x, 90);
  page.pressDetailBar(9); handExperience.side = 'left'; assert.equal(page.detailBarModifier(9).translation.x, 90);
  page.releaseDetailBar(9); assert.equal(page.detailBarModifier(9).translation.x, -90);
  const stale = page.detailBarModifier(8); stale.areaChanged({}, { width: 300 }); assert.equal(page.detailBarWidth, 188);
  const current = page.detailBarModifier(9); current.areaChanged({}, { width: 220 }); assert.equal(page.detailBarModifier(9).translation.x, -74);
  handExperience.enabled = false; assert.equal(page.detailBarModifier(9).translation.x, 0, 'explicit zero must reset the prior native translation');
  function tabsOptions(name) {
    const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === name);
    let options;
    function find(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'Tabs.create') options = node.arguments[0];
      ts.forEachChild(node, find);
    }
    find(method); return options?.getText(ast);
  }
  assert.match(tabsOptions('detailTabs'), /barModifier:\s*this\.detailBarModifier\(session\)/);
  assert.doesNotMatch(tabsOptions('mainTabs'), /barModifier/, 'root bar uses supported ordinary component drawing/gestures');
  page.dockFloating = false; handExperience.enabled = true;
  assert.equal(page.detailBarModifier(9).translation.x, 0, 'fixed footer must never move as a whole');
});
function compile(text) {
  const built = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, strict: true }, reportDiagnostics: true });
  const errors = (built.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  return built.outputText;
}
test('compiled tab navigation preserves the active root and still exits a detail on the same tab', () => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'changeTab');
  assert.ok(method, 'Compiled navigation method is missing.');
  const sandbox = { exports: {}, StudyScreen: { Main: 'main', Lesson: 'lesson' }, studio: { nextLesson: () => ({ id: 'c-01' }) } };
  vm.runInNewContext(compile('class Probe { ' + method.getText(ast) + ' } exports.Probe = Probe;'), sandbox);
  const page = new sandbox.exports.Probe();
  let flushes = 0, clears = 0, restores = 0;
  Object.assign(page, { screen: 'main', tab: 1, visitId: 7, visitSequence: 7, localMessage: 'preserve',
    flushTrainingDraft() { flushes++; }, navigation: { clear() { clears++; } },
    scrollRestoration: { cancel() {} }, restoreScrollAfterLayout() { restores++; }, readSettings() {}, moveDockTo() {}, resetDockState() {}, rootSession: 0 });
  page.changeTab(1);
  assert.equal(page.visitId, 7); assert.equal(page.localMessage, 'preserve');
  assert.equal(flushes, 0); assert.equal(clears, 0); assert.equal(restores, 0);
  page.changeTab(2);
  assert.equal(page.tab, 2); assert.equal(page.visitId, 8); assert.equal(restores, 0);
  page.screen = 'lesson';
  page.changeTab(2);
  assert.equal(page.screen, 'main'); assert.equal(page.tab, 2); assert.equal(page.visitId, 9);
  assert.equal(flushes, 1); assert.equal(clears, 2); assert.equal(restores, 1);
});
test('compiled root has one native tab and keeps all five business pages mounted independently', () => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'mainTabs');
  let nativeContents = 0, visibilityNodes = 0, nativeChanges = 0, options;
  function find(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (name === 'TabContent.create') nativeContents++;
      if (name === 'Column.visibility') visibilityNodes++;
      if (name === 'Tabs.onChange') nativeChanges++;
      if (name === 'Tabs.create') options = node.arguments[0];
    }
    ts.forEachChild(node, find);
  }
  find(method);
  assert.equal(nativeContents, 1); assert.equal(visibilityNodes, 5); assert.equal(nativeChanges, 0);
  assert.match(options.getText(ast), /index:\s*0/);
  for (let index = 0; index < 5; index++) assert(method.getText(ast).includes(`this.rootScrollers[${index}]`));
});

test('compiled capsule translates continuously inside its observed modifier without remounting', () => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'dockCapsuleLayer');
  const observers = [];
  function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'this.observeComponentCreation2' &&
        node.arguments[0]?.getText(ast).includes('Row.translate')) observers.push(node.arguments[0]);
    ts.forEachChild(node, find);
  }
  find(method); assert.equal(observers.length, 1);
  const attrs = {}, reads = new Set();
  const page = new Proxy({ dockPosition: 0, dockItemWidth: 60, dockInset: 12 }, {
    get(target, name) { reads.add(name); return target[name]; }
  });
  const Row = new Proxy({}, { get: (_target, name) => value => { attrs[name] = value; } });
  const sandbox = { page, Row, HitTestMode: { None: 0 }, callback: null };
  vm.runInNewContext(compile('callback = (function() { return ' + observers[0].getText(ast) + '; }).call(page);'), sandbox);
  sandbox.callback(1, true); assert.equal(attrs.translate.x, 0); assert.equal(attrs.position.x, 16);
  assert(reads.has('dockPosition')); assert(reads.has('dockItemWidth'));
  page.dockPosition = 2.35; sandbox.callback(1, false); assert.equal(attrs.translate.x, 141);
  page.dockPosition = 3; page.dockItemWidth = 72; sandbox.callback(1, false);
  assert.equal(attrs.translate.x, 216); assert.equal(attrs.width, 64);
  const item = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'tabItem');
  assert.doesNotMatch(item.getText(ast), /Row\.(create|translate)|PanGesture|systemMaterial/);
  assert.equal((method.getText(ast).match(/Row\.create\(/g) || []).length, 1, 'exactly one capsule node across the entire bar');
});

test('compiled ordinary full-bar Stack owns exclusive pan/tap and uses window coordinates', () => {
  const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'dockBar');
  const callbacks = {}, configs = {};
  function find(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (['Stack.onTouch', 'PanGesture.onActionStart', 'PanGesture.onActionUpdate', 'PanGesture.onActionEnd', 'PanGesture.onActionCancel', 'TapGesture.onAction'].includes(name)) callbacks[name] = node.arguments[0];
      if (['globalThis.Gesture.create', 'GestureGroup.create', 'PanGesture.create'].includes(name)) configs[name] = node.arguments.map(arg => arg.getText(ast));
    }
    ts.forEachChild(node, find);
  }
  find(method);
  assert.deepEqual(configs['globalThis.Gesture.create'], ['GesturePriority.High', 'GestureMask.IgnoreInternal']);
  assert.deepEqual(configs['GestureGroup.create'], ['GestureMode.Exclusive']);
  assert.match(configs['PanGesture.create'][0], /isFingerCountLimited:\s*true/);
  assert.match(configs['PanGesture.create'][0], /distance:\s*4/);
  const events = [];
  const page = { dockWindowX: 100, dockItemWidth: 60, dockTouchX: 0, isRootSession: session => session === 7,
    dockIndexAt: x => Math.floor(x / 60),
    pressDock(index, localX, session) { this.dockTouchX = index * 60 + localX; events.push(['press', index, localX, session]); } };
  for (const name of ['startDockDrag', 'updateDockDrag', 'finishDockDrag', 'cancelDockDrag', 'clickDock']) page[name] = (...args) => events.push([name, ...args]);
  const sandbox = { page, session: 7, TouchType: { Down: 'down', Up: 'up', Cancel: 'cancel' }, callback: null };
  function callback(name) {
    vm.runInNewContext(compile('callback = (function() { return ' + callbacks[name].getText(ast) + '; }).call(page);'), sandbox);
    return sandbox.callback;
  }
  callback('Stack.onTouch')({ type: 'down', touches: [{ windowX: 250, x: 5 }] });
  assert.deepEqual(events[0], ['press', 2, 30, 7], 'window coordinates must win even when a child reports local x=5');
  for (const name of ['PanGesture.onActionStart', 'PanGesture.onActionUpdate', 'PanGesture.onActionEnd', 'PanGesture.onActionCancel', 'TapGesture.onAction']) callback(name)({ offsetX: 125 });
  assert.deepEqual(events.slice(1), [['startDockDrag', 2, 125, 7], ['updateDockDrag', 125, 7], ['finishDockDrag', 125, 7], ['cancelDockDrag', 7], ['clickDock', 2, 7]]);
  assert.doesNotMatch(source, /modifier\.(background|gestureModifier|onTouch)\(/, 'device-unimplemented CommonModifier paths must stay absent');
});

test('compiled plain footers reserve content space and live in separate branches from floating bars', () => {
  for (const name of ['mainTabs', 'detailTabs']) {
    const method = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === name);
    const attributes = {};
    function find(node) {
      if (ts.isCallExpression(node) && ['Tabs.barOverlap', 'Tabs.barFloatingStyle', 'Tabs.barBackgroundColor', 'Tabs.divider'].includes(node.expression.getText(ast))) attributes[node.expression.getText(ast)] = node.arguments[0];
      ts.forEachChild(node, find);
    }
    find(method);
    const sandbox = { floating: false, Color: { Transparent: 'transparent', White: 'white' }, LINE: 'line', value: null };
    for (const [key, expression] of Object.entries(attributes)) {
      vm.runInNewContext(compile('value = ' + expression.getText(ast)), sandbox);
      if (key === 'Tabs.barOverlap') assert.equal(sandbox.value, false);
      if (key === 'Tabs.barFloatingStyle') assert.equal(sandbox.value, undefined);
      if (key === 'Tabs.barBackgroundColor') assert.equal(sandbox.value, 'white');
      if (key === 'Tabs.divider') assert.equal(sandbox.value.strokeWidth, 0.5);
    }
    assert.equal(Object.keys(attributes).length, 4);
  }
  const initial = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'initialRender').getText(ast);
  for (const name of ['mainTabs', 'detailTabs']) {
    assert(initial.includes(`${name}.bind(this)(this.rootSession, true)`));
    assert(initial.includes(`${name}.bind(this)(this.rootSession, false)`));
  }
  const content = pageClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'pageContent').getText(ast);
  assert.match(content, /bottom:\s*this\.dockFloating\s*\?\s*128\s*:\s*24/);
});
const helperCode = compile(constants + '\nclass Probe {\n' + helpers.join('\n') + '\n}\nexports.Probe = Probe;');

function fixture(selector) {
  const matching = typeof selector === 'string' ? calls.filter(call => call.node.arguments[1] && ts.isStringLiteral(call.node.arguments[1]) && call.node.arguments[1].text === selector) : [selector];
  assert.equal(matching.length, 1, 'Expected one production call site for ' + selector);
  const call = matching[0];
  const records = [];
  const actions = [];
  let active;
  function tracked(object, prefix) {
    return new Proxy(object, { get(target, key, receiver) {
      if (active && typeof key === 'string') active.reads.add(prefix + '.' + key);
      return Reflect.get(target, key, receiver);
    } });
  }
  const studio = tracked({ runBusy: false, aiBusy: false, credentialBusy: false, modelLoading: false, hasApiKey: true, exercisePassed: false, state: { settings: { aiEnabled: true }, usage: { requests: 0 }, drafts: {} } }, 'studio');
  studio.daySeconds = day => day === '2026-11-15' ? 120 : 600;
  studio.isPassed = () => studio.exercisePassed;
  const component = kind => new Proxy({}, { get(_target, name) {
    return (...args) => {
      if (!active) return;
      if (name === 'create' || name === 'createWithLabel') active.kind = kind;
      if (name === 'createWithLabel') active.attrs.label = args[0];
      else if (name === 'create' && kind === 'Text') active.attrs.text = args[0];
      else if (name === 'enabled') active.attrs.enabled = args[0];
      else if (name === 'opacity') active.attrs.opacity = args[0];
      else if (name === 'id') active.attrs.id = args[0];
      else if (name === 'onClick') active.attrs.action = args[0];
      else if (name === 'fontColor') active.attrs.fontColor = args[0];
      else if (name === 'backgroundColor') active.attrs.backgroundColor = args[0];
    };
  } });
  const enumStub = new Proxy({}, { get: (_target, name) => name });
  const sandbox = { exports: {}, Button: component('Button'), Text: component('Text'), Column: component('Column'), ButtonType: enumStub, Color: enumStub, FontWeight: enumStub, CopyOptions: enumStub, HorizontalAlign: enumStub, studio };
  vm.runInNewContext(helperCode, sandbox, { filename: compiledPath + ':button-builders', timeout: 5000 });
  const page = tracked(new sandbox.exports.Probe(), 'page');
  Object.assign(page, { selectedAnswer: -1, codeDraft: 'int main(void) { return 0; }', chatDraft: '', keyDraft: '', reportDay: '2026-11-15', chatExerciseId: '', exerciseId: 'quiz-one', exerciseStatusText: '尚未开始' });
  page.currentExercise = () => ({ id: page.exerciseId });
  page.exerciseStatus = () => page.exerciseStatusText;
  page.exerciseContext = () => ({ starter: 'starter code' });
  for (const name of ['submitCurrentQuiz', 'runCurrentCode', 'sendQuestion', 'saveSettings', 'storeKey']) page[name] = () => actions.push(name);
  function render(record, initial) {
    active = record;
    record.reads.clear();
    try { record.callback(record.id, initial); } finally { active = undefined; }
  }
  page.observeComponentCreation2 = callback => {
    const record = { id: records.length + 1, callback, attrs: {}, reads: new Set() };
    records.push(record);
    render(record, true);
  };
  sandbox.page = page;
  // Execute the real compiled call expression too, so its enable/label predicate
  // cannot drift from a duplicated predicate inside this test.
  const invocation = compile('(function () { ' + call.node.getText(ast) + '; }).call(page);');
  function mount() { vm.runInNewContext(invocation, sandbox, { filename: compiledPath + ':' + selector, timeout: 5000 }); }
  function rerender() { for (const record of records) render(record, false); }
  function button() {
    const record = records.find(item => item.attrs.id === selector);
    assert.ok(record, 'No observed Button modifier callback for ' + selector);
    return record;
  }
  function click() {
    const record = button();
    if (record.attrs.enabled !== false) record.attrs.action();
  }
  return { page, studio, mount, rerender, button, click, actions, helper: call.name, textRecords: () => records.filter(record => record.kind === 'Text') };
}

test('compiled helpers and every call site retain reactive getter parameters', () => {
  const buttonCalls = calls.filter(call => buttonHelperNames.includes(call.name));
  assert.ok(buttonCalls.length >= 15, 'Unexpectedly few compiled primary/secondary button calls.');
  for (const call of buttonCalls) {
    const label = call.node.arguments[0], enabled = call.node.arguments[3];
    const position = ast.getLineAndCharacterOfPosition(call.node.getStart(ast));
    const location = `${call.name} at ${position.line + 1}`;
    assert.ok(ts.isArrowFunction(label) || ts.isFunctionExpression(label), location + ': label must be a getter, not a captured value.');
    if (enabled) assert.ok(ts.isArrowFunction(enabled) || ts.isFunctionExpression(enabled), location + ': enabled must be a getter, not a captured value.');
  }
});

function findCall(name, fragment) {
  const matching = calls.filter(call => call.name === name && call.node.getText(ast).includes(fragment));
  assert.equal(matching.length, 1, 'Expected one compiled ' + name + ' call containing ' + fragment);
  return matching[0];
}

test('all dynamic display-builder values and tag colors are getters', () => {
  for (const call of calls.filter(call => !buttonHelperNames.includes(call.name))) {
    const position = ast.getLineAndCharacterOfPosition(call.node.getStart(ast));
    assert.ok(ts.isArrowFunction(call.node.arguments[0]) || ts.isFunctionExpression(call.node.arguments[0]), `${call.name} at ${position.line + 1} captures its display value.`);
    if (call.name === 'quietTag' && call.node.arguments[1]) assert.ok(ts.isArrowFunction(call.node.arguments[1]) || ts.isFunctionExpression(call.node.arguments[1]), `quietTag at ${position.line + 1} captures its color.`);
  }
});

test('report-day statistics and AI usage refresh without rebuilding the page', () => {
  const f = fixture(findCall('stat', 'studio.daySeconds(this.reportDay)')); f.mount();
  assert.equal(f.textRecords()[0].attrs.text, '2');
  assert.ok(f.textRecords()[0].reads.has('page.reportDay'));
  f.page.reportDay = '2026-11-14'; f.rerender(); assert.equal(f.textRecords()[0].attrs.text, '10');
  const usage = fixture(findCall('stat', 'studio.state.usage.requests')); usage.mount();
  assert.equal(usage.textRecords()[0].attrs.text, '0');
  usage.studio.state = { ...usage.studio.state, usage: { requests: 7 } }; usage.rerender();
  assert.equal(usage.textRecords()[0].attrs.text, '7');
});

test('AI context caption follows the selected exercise', () => {
  const f = fixture(findCall('caption', 'this.chatExerciseId ?')); f.mount();
  assert.match(f.textRecords()[0].attrs.text, /仅发送所选课程内容/);
  assert.ok(f.textRecords()[0].reads.has('page.chatExerciseId'));
  f.page.chatExerciseId = 'quiz-one'; f.rerender();
  assert.match(f.textRecords()[0].attrs.text, /助学标记/);
});

test('exercise tag refreshes its status and foreground/background together', () => {
  const f = fixture(findCall('quietTag', 'this.exerciseStatus(this.currentExercise())')); f.mount();
  const before = { ...f.textRecords()[0].attrs };
  assert.equal(before.text, '尚未开始');
  f.page.exerciseStatusText = '独立通过'; f.studio.exercisePassed = true; f.rerender();
  const after = f.textRecords()[0].attrs;
  assert.equal(after.text, '独立通过');
  assert.notEqual(after.fontColor, before.fontColor);
  assert.notEqual(after.backgroundColor, before.backgroundColor);
});

test('code preview refreshes when selected draft identity or draft state changes', () => {
  const f = fixture(findCall('textCode', 'studio.state.drafts[this.chatExerciseId]'));
  f.page.chatExerciseId = 'code-one'; f.studio.state.drafts = { 'code-one': 'first code', 'code-two': 'second code' }; f.mount();
  assert.equal(f.textRecords()[0].attrs.text, 'first code');
  assert.ok(f.textRecords()[0].reads.has('page.chatExerciseId'));
  f.page.chatExerciseId = 'code-two'; f.rerender(); assert.equal(f.textRecords()[0].attrs.text, 'second code');
  f.studio.state = { ...f.studio.state, drafts: { 'code-two': 'edited code' } }; f.rerender();
  assert.equal(f.textRecords()[0].attrs.text, 'edited code');
});

function compiledListKey(dataExpression) {
  const matches = [];
  function search(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'forEachUpdateFunction' && node.arguments[1]?.getText(ast) === dataExpression) matches.push(node);
    ts.forEachChild(node, search);
  }
  search(pageClass);
  assert.equal(matches.length, 1, 'Expected compiled ForEach for ' + dataExpression);
  const expression = matches[0].arguments[3];
  assert.ok(expression, 'An explicit key generator is required for replaced plain data items.');
  const sandbox = { exports: {} };
  vm.runInNewContext(compile('exports.key = ' + expression.getText(ast) + ';'), sandbox, { timeout: 5000 });
  return sandbox.exports.key;
}

test('run-result keys change for different outcomes at the same index', () => {
  const key = compiledListKey('this.runFeedback.tests');
  const first = { input: '1', expected: '2\n', actual: 'wrong\n', passed: false };
  const changed = [
    { ...first, actual: '2\n', passed: true }, { ...first, actual: 'other\n' },
    { ...first, input: '3' }, { ...first, expected: '4\n' }, { ...first, passed: true }
  ];
  const baseline = key(first, 0);
  for (const item of changed) assert.notEqual(key(item, 0), baseline, 'Updated test result must not reuse the old plain item closure.');
  assert.notEqual(key(first, 1), baseline, 'Identical test cases at different positions must remain distinct.');
});

test('live-diagnostic keys change when a message or location changes', () => {
  const key = compiledListKey('this.draftDiagnostics');
  const first = { severity: 'warning', line: 1, message: 'check the condition' };
  for (const next of [{ ...first, line: 2 }, { ...first, severity: 'error' }, { ...first, message: 'different issue' }]) assert.notEqual(key(first, 0), key(next, 0));
});

test('quiz starts disabled, selection enables it, reset disables it again', () => {
  const f = fixture('quiz-submit'); f.mount();
  assert.equal(f.button().attrs.enabled, false);
  assert.equal(f.button().attrs.opacity, 0.45);
  assert.ok(f.button().reads.has('page.selectedAnswer'), 'selectedAnswer must be read inside the observed Button callback.');
  f.click(); assert.equal(f.actions.length, 0);
  f.page.selectedAnswer = 2; f.rerender();
  assert.equal(f.button().attrs.enabled, true); assert.equal(f.button().attrs.opacity, 1);
  f.click(); assert.deepEqual(f.actions, ['submitCurrentQuiz']);
  f.page.selectedAnswer = -1; f.rerender();
  assert.equal(f.button().attrs.enabled, false);
});

test('code run reacts to busy completion and changed code, including its label', () => {
  const f = fixture('code-run'); f.studio.runBusy = true; f.mount();
  assert.equal(f.button().attrs.enabled, false); assert.match(f.button().attrs.label, /正在检测/);
  assert.ok(f.button().reads.has('studio.runBusy'));
  f.studio.runBusy = false; f.rerender();
  assert.equal(f.button().attrs.enabled, true); assert.equal(f.button().attrs.label, '运行检测');
  assert.ok(f.button().reads.has('page.codeDraft'));
  f.page.codeDraft = ' \n '; f.rerender(); assert.equal(f.button().attrs.enabled, false);
  f.page.codeDraft = 'int main(void){}'; f.rerender(); f.click();
  assert.deepEqual(f.actions, ['runCurrentCode']);
});

test('AI send reacts to text, busy state, key and settings without remounting', () => {
  const f = fixture('ai-send'); f.mount();
  assert.equal(f.button().attrs.enabled, false);
  assert.ok(f.button().reads.has('page.chatDraft'));
  f.page.chatDraft = '解释这个概念'; f.rerender(); assert.equal(f.button().attrs.enabled, true);
  f.studio.aiBusy = true; f.rerender(); assert.equal(f.button().attrs.enabled, false); assert.match(f.button().attrs.label, /正在回答/);
  f.studio.aiBusy = false; f.studio.credentialBusy = true; f.rerender(); assert.equal(f.button().attrs.enabled, false);
  f.studio.credentialBusy = false; f.rerender(); assert.equal(f.button().attrs.enabled, true); assert.equal(f.button().attrs.label, '发送问题');
  f.studio.hasApiKey = false; f.rerender(); assert.equal(f.button().attrs.enabled, false);
  f.studio.hasApiKey = true; f.studio.state = { settings: { aiEnabled: false } }; f.rerender(); assert.equal(f.button().attrs.enabled, false);
  f.studio.state = { settings: { aiEnabled: true } }; f.rerender(); f.click(); assert.deepEqual(f.actions, ['sendQuestion']);
});

test('primary and secondary settings buttons unlock after credentials finish', () => {
  for (const selector of ['settings-save', 'ai-save-options', 'settings-save-key']) {
    const f = fixture(selector); f.studio.credentialBusy = true; f.mount();
    assert.equal(f.button().attrs.enabled, false, selector);
    assert.ok(f.button().reads.has('studio.credentialBusy'), selector);
    f.studio.credentialBusy = false; f.rerender(); assert.equal(f.button().attrs.enabled, true, selector);
    f.studio.aiBusy = true; f.rerender(); assert.equal(f.button().attrs.enabled, false, selector);
    f.studio.aiBusy = false; f.rerender(); assert.equal(f.button().attrs.enabled, true, selector);
  }
});

test('secondary key button follows processing/save/replace labels', () => {
  const f = fixture('settings-save-key'); assert.equal(f.helper, 'secondaryButton');
  f.studio.credentialBusy = true; f.studio.hasApiKey = false; f.mount();
  assert.equal(f.button().attrs.label, '正在处理密钥…');
  f.studio.credentialBusy = false; f.rerender(); assert.equal(f.button().attrs.label, '安全保存密钥');
  f.studio.hasApiKey = true; f.rerender(); assert.equal(f.button().attrs.label, '安全替换密钥');
});

console.log(JSON.stringify({ compiledIndex: compiledPath, sha256: crypto.createHash('sha256').update(source).digest('hex'), compiledButtonCalls: calls.filter(call => buttonHelperNames.includes(call.name)).length, compiledDisplayCalls: calls.filter(call => !buttonHelperNames.includes(call.name)).length, sourceFilesWritten: 0 }));
