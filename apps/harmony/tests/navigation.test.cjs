'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const root = path.resolve(__dirname, '../entry/src/main/ets');

// Execute the production navigation/controller methods, without pretending to
// render ArkUI. Frame callbacks and the Scroller are explicitly controlled here.
function fixture() {
  const frames = [], cache = new Map(), jobs = [];
  const materialExperience = { enabled: true, ready: true, busy: false, notice: '' };
  const handExperience = { enabled: false, side: 'default', status: 'disabled' };
  const emptyMaterial = { empty: true };
  const exercises = [
    { id: 'quiz-a', lessonId: 'lesson-a', type: 'quiz', title: 'A', hints: ['hint-a'] },
    { id: 'quiz-b', lessonId: 'lesson-b', type: 'quiz', title: 'B', hints: ['hint-b'] },
    { id: 'code-a', lessonId: 'lesson-a', type: 'code', title: 'A code', starter: 'starter-a', hints: [] },
    { id: 'code-b', lessonId: 'lesson-b', type: 'code', title: 'B code', starter: 'starter-b', hints: [] }
  ];
  const studio = {
    state: {
      settings: { model: 'deepseek-flash', thinkingMode: 'enabled', reasoningEffort: 'high', dailyMinutes: 55, aiEnabled: false },
      notes: { 'lesson-a': 'saved note' }, drafts: {}, reports: {}, chats: [], progress: {}, sessions: [], attempts: []
    },
    curriculum: { exercises, lessons: [], modules: [], resources: [] },
    lastQuiz: { exerciseId: '', correct: false, explanation: '' },
    lastRun: { exerciseId: '', status: '', diagnostic: '', tests: [] },
    runBusy: false,
    today: () => '2026-11-16',
    nextLesson: () => ({ id: 'lesson-a' }),
    setUIContext() {},
    submitQuiz(id, answer) { this.lastQuiz = { exerciseId: id, correct: answer === 1, explanation: `feedback-${id}` }; },
    runCode(id, code) {
      this.runBusy = true;
      this.lastRun = { exerciseId: id, status: 'running', diagnostic: '', tests: [] };
      return new Promise(resolve => jobs.push({
        id, code,
        finish: () => {
          this.lastRun = { exerciseId: id, status: 'passed', diagnostic: `result-${id}`, tests: [{ input: '', expected: code, actual: code, passed: true }] };
          this.runBusy = false;
          resolve();
        }
      }));
    }
  };
  class FakeScroller {
    constructor() { this.offset = { xOffset: 0, yOffset: 0 }; this.calls = []; }
    currentOffset() { return { ...this.offset }; }
    scrollTo(options) { this.calls.push({ ...options }); this.offset = { xOffset: options.xOffset, yOffset: options.yOffset }; }
  }
  function load(file, sourceOverride) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = sourceOverride ?? fs.readFileSync(file, 'utf8');
    const result = ts.transpileModule(source, { fileName: file.replace(/\.ets$/, '.ts'), compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } });
    const requireLocal = name => {
      if (name === '@kit.ArkUI') return { FrameCallback: class {}, uiMaterial: { Material: { empty: emptyMaterial } } };
      if (name.endsWith('/services/StudyController')) return { studio };
      if (name.endsWith('/services/HandExperience')) return { handExperience };
      if (name.endsWith('/services/MaterialExperience')) return { materialExperience };
      let target = path.resolve(path.dirname(file), name);
      if (!path.extname(target)) target += '.ts';
      return load(target);
    };
    vm.runInThisContext(`(function(require,module,exports,Scroller,Curve,FlexAlign){${result.outputText}\n})`, { filename: file })(requireLocal, module, module.exports, FakeScroller, { Friction: 'friction', EaseOut: 'ease-out' }, { Start: 'start', End: 'end', Center: 'center' });
    return module.exports;
  }
  const file = path.join(root, 'pages/Index.ets');
  const original = fs.readFileSync(file, 'utf8');
  const logic = original.slice(0, original.indexOf('  @Styles'))
    .replace(/@Entry\s*@ComponentV2\s*struct Index/, 'class Index')
    .replace(/@Local\s+/g, '') + '\n}\nexports.Index = Index;\n';
  const { Index } = load(file, logic);
  const navigation = load(path.join(root, 'core/NavigationState.ts'));
  const page = new Index();
  // Apply animation state synchronously here; native interpolation remains a device check.
  page.getUIContext = () => ({ postFrameCallback: callback => frames.push(callback), animateTo: (options, update) => { update(); options.onFinish?.(); } });
  const render = () => { const pending = frames.splice(0); pending.forEach(callback => callback.onIdle(1000000)); };
  return { page, studio, frames, jobs, render, materialExperience, emptyMaterial, handExperience, ...navigation };
}

test('stable holding side moves only the measured detail bar and freezes while pressed', () => {
  const f = fixture(), p = f.page;
  p.openSettings(); f.render(); const session = p.rootSession;
  p.detailTabsWidth = 400; p.detailBarWidth = 188;
  f.handExperience.enabled = true; f.handExperience.side = 'left';
  assert.equal(p.detailDockOffset(), -90);
  f.handExperience.side = 'right'; assert.equal(p.detailDockOffset(), 90);
  p.pressDetailBar(session); f.handExperience.side = 'left'; assert.equal(p.detailDockOffset(), 90);
  p.releaseDetailBar(session); assert.equal(p.detailDockOffset(), -90);
  f.handExperience.enabled = false; assert.equal(p.detailDockOffset(), 0);
  f.handExperience.enabled = true; f.handExperience.side = 'default'; assert.equal(p.detailDockOffset(), 0);
  f.handExperience.side = 'left'; p.detailTabsWidth = 200; assert.equal(p.detailDockOffset(), 0);
  p.detailTabsWidth = NaN; assert.equal(p.detailDockOffset(), 0);
  p.detailTabsWidth = 400; p.pressDetailBar(session); p.goBack(); f.render();
  assert.equal(p.detailBarPressed, false); assert.equal(p.tab, 0);
  p.pressDetailBar(session); assert.equal(p.detailBarPressed, false, 'disposed detail callbacks cannot freeze a later bar');
});

test('independent material preference explicitly removes and restores the same native material', () => {
  const f = fixture(), p = f.page, material = { native: 'immersive' };
  p.materialSupported = true;
  assert.equal(p.materialFor(material), material);
  f.materialExperience.enabled = false;
  assert.equal(p.materialFor(material), f.emptyMaterial, 'undefined would retain native default material');
  f.materialExperience.enabled = true; assert.equal(p.materialFor(material), material);
  p.materialSupported = false; assert.equal(p.materialFor(material), f.emptyMaterial);
  assert.equal(p.tab, 0); assert.equal(p.rootSession, 0, 'appearance preference must not navigate or rebuild roots');
});

test('root pages own distinct scrollers and decorative dock animation cannot change navigation', () => {
  const f = fixture(), p = f.page;
  const scrollers = [];
  for (let index = 0; index < 5; index++) {
    p.tab = index;
    p.mainScroller.offset.yOffset = 100 + index;
    scrollers.push(p.mainScroller);
  }
  assert.equal(new Set(scrollers).size, 5);
  p.screen = f.StudyScreen.Lesson;
  assert(!scrollers.includes(p.mainScroller));
  p.screen = f.StudyScreen.Main; p.tab = 1;
  p.moveDockTo(4); // interrupted/starting native animation may update decoration early
  assert.equal(p.tab, 1); assert.equal(p.screen, f.StudyScreen.Main);
  assert.equal(p.mainScroller, scrollers[1]); assert.equal(p.mainScroller.offset.yOffset, 101);
  assert.equal(p.dockTab, 4); assert.equal(f.frames.length, 0);
  p.moveDockTo(1);
  assert.equal(p.dockTab, 1); assert.equal(p.mainScroller.offset.yOffset, 101);
});
test('dock preview follows fractional movement immediately and commits only on release', () => {
  const f = fixture(), p = f.page;
  p.dockItemWidth = 60;
  p.pressDock(0, 30, 0); p.startDockDrag(0, 1, 0);
  p.updateDockDrag(141, 0);
  assert.equal(p.dockPosition, 2.35); assert.equal(p.dockTab, 2);
  assert.equal(p.tab, 0, 'preview must not select or rebuild intermediate pages');
  assert.equal(f.frames.length, 0);
  p.nativeTabChanged(1, 0); assert.equal(p.tab, 0, 'native events cannot commit during a dock drag');
  p.updateDockDrag(219, 0); assert(Math.abs(p.dockPosition - 3.65) < 1e-10);
  p.finishDockDrag(240, 0);
  assert.equal(p.tab, 4); assert.equal(p.dockPosition, 4); assert.equal(p.pressedTab, -1);
  assert.equal(f.frames.length, 0, 'prebuilt roots do not need an after-layout scroll reset');
  p.nativeTabChanged(0, 0); assert.equal(p.tab, 4, 'an old completion cannot undo release');
});

test('dock dragging handles both directions, real press offset, bounds and cancel', () => {
  const f = fixture(), p = f.page;
  p.dockItemWidth = 60; p.changeTab(4);
  p.pressDock(4, 30, 0); p.startDockDrag(4, -1, 0); p.finishDockDrag(-240, 0);
  assert.equal(p.tab, 0);
  p.pressDock(1, 30, 0); p.startDockDrag(1, 1, 0); p.finishDockDrag(120, 0);
  assert.equal(p.tab, 3);
  p.pressDock(3, 30, 0); p.startDockDrag(3, -1, 0); p.finishDockDrag(-120, 0);
  assert.equal(p.tab, 1);
  p.pressDock(1, 59, 0); p.startDockDrag(1, 2, 0); p.finishDockDrag(3, 0);
  assert.equal(p.tab, 2, 'release uses the actual finger position, not a slot-center assumption');
  p.pressDock(2, 30, 0); p.startDockDrag(2, 1, 0); p.updateDockDrag(10000, 0);
  assert.equal(p.dockPosition, 4); p.updateDockDrag(-10000, 0); assert.equal(p.dockPosition, 0);
  p.updateDockDrag(NaN, 0); assert.equal(p.dockPosition, 0);
  p.cancelDockDrag(0); assert.equal(p.tab, 2); assert.equal(p.dockPosition, 2);
  p.finishDockDrag(100, 0); assert.equal(p.tab, 2, 'cancelled release cannot navigate');
});

test('latest click is immediate, filters stale native completions, and preserves root scrolls', () => {
  const f = fixture(), p = f.page;
  p.rootScrollers[1].offset.yOffset = 321;
  p.rootScrollers[4].offset.yOffset = 987;
  p.flushTrainingDraft = () => { throw new Error('root navigation must not save synchronously'); };
  p.clickDock(1, 0); assert.equal(p.tab, 1); assert.equal(p.dockTab, 1);
  p.clickDock(4, 0); p.nativeTabChanged(1, 0);
  assert.equal(p.tab, 4); assert.equal(p.mainScroller.offset.yOffset, 987);
  p.nativeTabChanged(4, 0); p.clickDock(1, 0);
  assert.equal(p.tab, 1); assert.equal(p.mainScroller.offset.yOffset, 321);
  assert.equal(f.frames.length, 0);
  p.nativeSwipeStarted(0); p.nativeTabChanged(2, 0);
  assert.equal(p.tab, 2, 'a fresh native content swipe can select its own result');
});

test('disposed root sessions cannot resume a drag or redirect a detail and rebuilt root', () => {
  const f = fixture(), p = f.page;
  p.pressDock(0, 30, 0); p.startDockDrag(0, 100, 0);
  p.openLesson('lesson-a');
  p.updateDockDrag(240, 0); p.finishDockDrag(240, 0); p.clickDock(4, 0); p.nativeTabChanged(4, 0);
  assert.equal(p.screen, f.StudyScreen.Lesson); assert.equal(p.tab, 0);
  p.goBack(); f.render(); const session = p.rootSession;
  assert(session > 0);
  p.nativeSwipeStarted(0); p.nativeTabChanged(4, 0); p.pressDock(4, 30, 0);
  assert.equal(p.tab, 0); assert.equal(p.pressedTab, -1);
  p.clickDock(4, session); assert.equal(p.tab, 4);
});

test('a press without horizontal drag never moves selection and native keyboard selection records intent only', () => {
  const f = fixture(), p = f.page;
  p.pressDock(3, 30, 0); assert.equal(p.dockTab, 0);
  p.nativeTabSelected(2, 0); p.nativeTabChanged(2, 0);
  assert.equal(p.tab, 0); assert.equal(p.dockTab, 0, 'a held dock owns input, without a premature selection');
  p.releaseDockTouch(0);
  assert.equal(p.dockTab, 0); assert.equal(p.pressedTab, -1);
  p.nativeTabSelected(2, 0);
  assert.equal(p.tab, 0, 'onSelected must never write the Tabs bound index');
  assert.equal(p.expectedNativeTab, 2); assert.equal(p.dockTab, 2);
  p.nativeTabChanged(2, 0); assert.equal(p.tab, 2);
  p.clickDock(4, 0); p.nativeTabChanged(2, 0); assert.equal(p.tab, 4);
  p.pressDock(1, 30, 0); p.cancelDockDrag(0);
  assert.equal(p.pressedTab, -1); assert.equal(p.dockTab, 4);
});

test('tap animations retarget immediately without a completion queue, while drag updates have zero duration', () => {
  const f = fixture(), p = f.page, animations = [];
  p.getUIContext = () => ({ postFrameCallback: callback => f.frames.push(callback),
    animateTo(options, update) { animations.push(options); update(); } });
  p.clickDock(1, 0); p.clickDock(4, 0); p.clickDock(2, 0);
  assert.deepEqual(animations.map(item => item.duration), [160, 160, 160]);
  assert(animations.every(item => item.onFinish === undefined));
  assert.equal(p.tab, 2); assert.equal(p.dockPosition, 2);
  p.pressDock(2, 30, 0); p.startDockDrag(2, 4, 0); p.updateDockDrag(45, 0);
  assert.equal(animations.at(-1).duration, 0); assert.equal(p.tab, 2);
  p.finishDockDrag(45, 0); assert.equal(p.tab, 3); assert.equal(animations.at(-1).duration, 160);
});

test('material layout changes preserve the viewport/drafts and failed saves do not replace the native subtree', async () => {
  const f = fixture(), p = f.page;
  p.tab = 4; p.openSettings(); f.render(); p.noteDraft = 'keep this draft';
  p.mainScroller.offset.yOffset = 414; const session = p.rootSession;
  f.materialExperience.setEnabled = async value => { f.materialExperience.enabled = value; return true; };
  await p.setMaterialEnabled(false);
  assert.equal(p.dockFloating, false); assert.equal(p.rootSession, session + 1);
  f.render(); assert.equal(p.mainScroller.offset.yOffset, 414); assert.equal(p.noteDraft, 'keep this draft');
  f.handExperience.enabled = true; f.handExperience.side = 'left'; assert.equal(p.fixedBackAlignment(), 'start');
  p.pressDetailBar(p.rootSession); f.handExperience.side = 'right'; assert.equal(p.fixedBackAlignment(), 'start');
  p.releaseDetailBar(p.rootSession); assert.equal(p.fixedBackAlignment(), 'end');
  f.materialExperience.setEnabled = async () => false;
  const stableSession = p.rootSession; await p.setMaterialEnabled(true);
  assert.equal(p.dockFloating, false); assert.equal(p.rootSession, stableSession);
  p.goBack(); f.render(); assert.equal(p.tab, 4); assert.equal(p.screen, f.StudyScreen.Main);
});

test('successful reset clears pending UI drafts before navigation can save them again', async () => {
  const f = fixture(), p = f.page;
  p.openSettings(); f.render(); p.pendingDraftId = 'old-training'; p.pendingDraftCode = 'old code';
  p.chatDraft = 'old conversation'; p.noteDraft = 'old note'; p.codeDraft = 'old source';
  f.studio.resetLearningData = async () => false;
  await p.resetCurrentLearningData(); assert.equal(p.chatDraft, 'old conversation'); assert.equal(p.pendingDraftId, 'old-training');
  f.studio.resetLearningData = async () => true;
  f.studio.saveTrainingDraft = () => { throw new Error('old draft must not be saved after reset'); };
  await p.resetCurrentLearningData();
  assert.equal(p.screen, f.StudyScreen.Main); assert.equal(p.tab, 4); assert.equal(p.pendingDraftId, '');
  assert.equal(p.chatDraft, ''); assert.equal(p.noteDraft, ''); assert.equal(p.codeDraft, '');
  assert.equal(p.navigation.back(), undefined);
});

test('lesson -> exercise -> back preserves the lesson offset and unsaved note, then restores its original tab', () => {
  const f = fixture(), p = f.page;
  p.tab = 1; p.mainScroller.offset.yOffset = 420;
  p.openLesson('lesson-a');
  assert.equal(p.mainScroller.calls.length, 0, 'forward scrolling must wait for layout');
  f.render(); assert.equal(p.mainScroller.offset.yOffset, 0);
  p.mainScroller.offset.yOffset = 1428.5;
  p.noteDraft = 'unsaved lesson note';
  p.openExercise('quiz-a'); f.render();
  p.selectedAnswer = 1; p.submitCurrentQuiz();
  p.mainScroller.offset.yOffset = 230;
  const before = p.mainScroller.calls.length;
  p.goBack();
  assert.equal(p.screen, f.StudyScreen.Lesson);
  assert.equal(p.lessonId, 'lesson-a');
  assert.equal(p.noteDraft, 'unsaved lesson note');
  assert.equal(p.mainScroller.calls.length, before, 'back must not scroll against the exercise layout');
  f.render(); assert.equal(p.mainScroller.offset.yOffset, 1428.5);
  p.goBack(); f.render();
  assert.equal(p.screen, f.StudyScreen.Main); assert.equal(p.tab, 1);
  assert.equal(p.mainScroller.offset.yOffset, 420);
});

test('multilevel navigation restores each quiz answer, assistance disclosure and its own feedback', () => {
  const f = fixture(), p = f.page;
  p.changeTab(2); f.render();
  p.exerciseFilter = 'quiz'; p.mainScroller.offset.yOffset = 321;
  p.openExercise('quiz-a'); f.render();
  p.selectedAnswer = 1; p.submitCurrentQuiz(); p.hintCount = 1;
  p.mainScroller.offset.yOffset = 790;
  p.openLesson('lesson-b'); f.render();
  p.openExercise('quiz-b'); f.render();
  assert.equal(p.selectedAnswer, -1); assert.equal(p.quizSubmitted, false);
  p.selectedAnswer = 0; p.submitCurrentQuiz();
  assert.equal(f.studio.lastQuiz.exerciseId, 'quiz-b');
  p.goBack(); f.render(); p.goBack(); f.render();
  assert.equal(p.exerciseId, 'quiz-a'); assert.equal(p.selectedAnswer, 1);
  assert.equal(p.quizSubmitted, true); assert.equal(p.hintCount, 1);
  assert.deepEqual(p.quizFeedback, { exerciseId: 'quiz-a', correct: true, explanation: 'feedback-quiz-a' });
  assert.equal(p.mainScroller.offset.yOffset, 790);
  p.goBack(); f.render();
  assert.equal(p.tab, 2); assert.equal(p.exerciseFilter, 'quiz'); assert.equal(p.mainScroller.offset.yOffset, 321);
});

test('superseded after-frame callbacks cannot move a more recently selected page', () => {
  const f = fixture(), p = f.page;
  p.screen = f.StudyScreen.Lesson; p.lessonId = 'lesson-a'; p.mainScroller.offset.yOffset = 980;
  p.openExercise('quiz-a');
  const forward = f.frames.shift();
  p.goBack(); const back = f.frames.shift();
  p.changeTab(2); const tab = f.frames.shift();
  back.onIdle(1000000); forward.onIdle(1000000);
  assert.equal(p.mainScroller.calls.length, 0);
  tab.onIdle(1000000); assert.equal(p.mainScroller.calls.length, 1);
  assert.deepEqual(p.mainScroller.calls[0], { xOffset: 0, yOffset: 0, animation: false });
  back.onIdle(1000000); assert.equal(p.mainScroller.calls.length, 1);
});

test('capture before layout uses the pending destination offset, not the old screen offset', () => {
  const f = fixture(), p = f.page;
  p.screen = f.StudyScreen.Lesson; p.lessonId = 'lesson-a'; p.mainScroller.offset.yOffset = 980;
  p.openExercise('quiz-a');
  p.openLesson('lesson-b');
  p.goBack();
  f.render();
  assert.equal(p.exerciseId, 'quiz-a');
  assert.equal(p.mainScroller.offset.yOffset, 0, 'the exercise had not yet laid out and must start at its intended top');
  p.goBack(); f.render(); assert.equal(p.mainScroller.offset.yOffset, 980);
});

test('worker result follows the originating page visit while a different exercise is visible', async () => {
  const f = fixture(), p = f.page;
  p.openExercise('code-a'); f.render(); p.codeDraft = 'draft A';
  const runA = p.runCurrentCode();
  p.mainScroller.offset.yOffset = 640;
  p.openLesson('lesson-b'); f.render(); p.openExercise('code-b'); f.render();
  f.jobs[0].finish(); await runA;
  assert.equal(p.runFeedback.exerciseId, '', 'A result must not appear in B');
  p.codeDraft = 'draft B'; const runB = p.runCurrentCode(); f.jobs[1].finish(); await runB;
  assert.equal(p.runFeedback.exerciseId, 'code-b');
  p.goBack(); f.render(); p.goBack(); f.render();
  assert.equal(p.exerciseId, 'code-a'); assert.equal(p.codeDraft, 'draft A'); assert.equal(p.runVisible, true);
  assert.equal(p.runFeedback.exerciseId, 'code-a'); assert.equal(p.runFeedback.status, 'passed');
  assert.equal(p.runFeedback.tests[0].actual, 'draft A'); assert.equal(p.mainScroller.offset.yOffset, 640);
});

test('a newly opened visit to the same exercise cannot inherit the previous visit asynchronous result', async () => {
  const f = fixture(), p = f.page;
  p.openExercise('code-a'); f.render(); p.codeDraft = 'first attempt';
  const pending = p.runCurrentCode();
  p.openLesson('lesson-a'); f.render(); p.openExercise('code-a'); f.render();
  f.jobs[0].finish(); await pending;
  assert.equal(p.runVisible, false); assert.equal(p.runFeedback.exerciseId, '');
  p.goBack(); f.render(); p.goBack(); f.render();
  assert.equal(p.codeDraft, 'first attempt'); assert.equal(p.runFeedback.status, 'passed');
});

test('report/settings draft snapshots are captured before destination initialization; keys are excluded', () => {
  const f = fixture(), p = f.page;
  p.screen = f.StudyScreen.Report; p.reportDay = '2026-11-12'; p.reportNote = 'unsaved report';
  p.editModel = 'unsaved-model'; p.editDaily = '65'; p.mainScroller.offset.yOffset = 500;
  p.openSettings(); f.render();
  p.editDaily = '80'; p.keyDraft = 'DO_NOT_KEEP_IN_HISTORY';
  p.navigate(f.StudyScreen.Privacy); f.render();
  assert(!JSON.stringify(p.navigation).includes('DO_NOT_KEEP_IN_HISTORY'));
  p.goBack(); f.render();
  assert.equal(p.editDaily, '80'); assert.equal(p.keyDraft, '');
  p.goBack(); f.render();
  assert.equal(p.reportDay, '2026-11-12'); assert.equal(p.reportNote, 'unsaved report');
  assert.equal(p.editModel, 'unsaved-model'); assert.equal(p.editDaily, '65'); assert.equal(p.mainScroller.offset.yOffset, 500);
});

test('history copies feedback and disposal invalidates scheduled restore callbacks', () => {
  const f = fixture(), p = f.page;
  p.openExercise('quiz-a'); f.render(); p.selectedAnswer = 1; p.submitCurrentQuiz();
  const original = p.quizFeedback;
  p.openLesson('lesson-a');
  original.explanation = 'later mutation';
  p.aboutToDisappear(); f.render();
  assert.equal(p.mainScroller.calls.length, 1, 'disposed callback must not scroll');
  p.goBack(); f.render(); assert.equal(p.quizFeedback.explanation, 'feedback-quiz-a');
  const coordinator = new f.ScrollRestoration();
  const token = coordinator.request({ x: -5, y: NaN });
  assert.deepEqual(coordinator.consume(token), { x: 0, y: 0 });
  assert.equal(coordinator.consume(token), undefined);
});

test('exercise -> AI -> back and return-to-lesson restore exact visits', () => {
  const f = fixture(), p = f.page;
  p.openLesson('lesson-a'); f.render(); p.mainScroller.offset.yOffset = 812;
  p.openExercise('quiz-a'); f.render(); p.selectedAnswer = 1; p.submitCurrentQuiz();
  p.mainScroller.offset.yOffset = 304;
  p.askAboutExercise(); f.render();
  assert.equal(p.screen, f.StudyScreen.Assistant);
  assert.equal(p.chatExerciseId, 'quiz-a');
  p.onBackPress(); f.render();
  assert.equal(p.screen, f.StudyScreen.Exercise);
  assert.equal(p.selectedAnswer, 1); assert.equal(p.quizSubmitted, true);
  assert.equal(p.mainScroller.offset.yOffset, 304);
  p.returnToLesson(); f.render();
  assert.equal(p.screen, f.StudyScreen.Lesson);
  assert.equal(p.mainScroller.offset.yOffset, 812);
});
