'use strict';
// Only trusted TypeScript is transpiled/evaluated here. All C solutions run in
// the production LearningC parser/interpreter, never eval, a host shell or GCC.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.LEARNING_TYPESCRIPT || 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const root = path.join(__dirname, '../entry/src/main/ets');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!/\b(?:any|unknown)\b/.test(source), `${file}: keep the source ArkTS compatible`);
  const built = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, strict: true }, reportDiagnostics: true });
  const errors = (built.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const sandbox = { exports: {}, require: name => { assert.ok(name.startsWith('./')); return load(path.resolve(path.dirname(file), name + '.ts')); } };
  vm.runInNewContext(built.outputText, sandbox, { timeout: 5000, filename: file });
  cache.set(file, sandbox.exports);
  return sandbox.exports;
}
const bank = load(path.join(root, 'training/TrainingBank.ts'));
const rules = load(path.join(root, 'training/TrainingRules.ts'));
const { LearningC } = load(path.join(root, 'engine/LearningC.ts'));
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, test) { try { test(); checks++; } catch (error) { error.message = name + ': ' + error.message; throw error; } }
const questions = bank.getTrainingBank();
const templates = bank.getTrainingTemplates();
const time = '2026-11-15T04:05:06.789Z';
const q = (id, seed = 0) => bank.generate({ templateId: id, seed });
const attempt = (state, question, status = 'passed', assisted = false) => rules.recordTrainingAttempt(state, question, status, assisted, time);

check('bank counts and genuinely distinct prompts', () => {
  assert.equal(templates.length, 24);
  assert.equal(questions.length, 288);
  assert.equal(bank.TRAINING_BANK_SIZE, questions.length);
  assert.equal(new Set(questions.map(x => x.id)).size, 288);
  assert.equal(new Set(questions.map(x => x.prompt)).size, 288);
  assert.equal(questions.filter(x => x.type === 'code').length, 228);
  assert.equal(questions.filter(x => x.type === 'quiz').length, 60);
  for (const template of templates) {
    assert.equal(template.variantCount, 12);
    assert.equal(questions.filter(x => x.templateId === template.id).length, 12);
    assert.equal(template.parameterized, !template.id.startsWith('stm32-'));
    if (template.parameterized) assert.ok(!questions.some(x => x.templateId === template.id && x.prompt === q(template.id, 12).prompt), template.id);
  }
  for (const question of questions) {
    for (const field of ['id', 'templateId', 'title', 'prompt', 'skillId', 'explanation']) assert.ok(question[field].length > 0, question.id + ':' + field);
    assert.ok(question.hints.length > 0);
    assert.ok([1, 2, 3].includes(question.level));
    const skill = bank.getTrainingSkills().find(x => x.id === question.skillId);
    assert.ok(skill && skill.levels.includes(question.level));
    if (question.type === 'quiz') {
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices).size, 4, question.id);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4);
      assert.equal(question.tests.length, 0);
      assert.equal(question.solution, '');
    } else {
      assert.equal(question.answer, -1);
      assert.equal(question.choices.length, 0);
      assert.ok(question.starter && question.solution && question.tests.length);
    }
  }
});

let baseCases = 0;
let dynamicCases = 0;
let maxSteps = 0;
function verifySolution(question, dynamic) {
  if (question.type === 'quiz') {
    assert.equal(new Set(question.choices).size, 4, question.id);
    assert.ok(question.answer >= 0 && question.answer < 4);
    return;
  }
  for (const test of question.tests) {
    const result = LearningC.run(question.solution, test.input);
    assert.equal(result.status, 'ok', `${question.id}: ${result.diagnostic}\n${question.solution}`);
    assert.equal(result.output, test.expected, `${question.id}, input=${JSON.stringify(test.input)}`);
    assert.ok(result.steps > 0 && result.steps < 200000);
    maxSteps = Math.max(maxSteps, result.steps);
    if (dynamic) dynamicCases++; else baseCases++;
  }
}
check('every base reference solution passes the production interpreter', () => questions.forEach(x => verifySolution(x, false)));
check('each template at extended seeds 12, 127, 9999', () => {
  for (const template of templates) for (const seed of [12, 127, 9999]) verifySolution(q(template.id, seed), true);
});
check('boundary tests include empty/max loops, signs, equality and indices', () => {
  const inputs = id => q(id).tests.map(x => x.input.trim());
  for (const id of ['c-arith-add', 'c-arith-scale', 'c-branch-threshold', 'c-branch-clamp', 'c-function-affine', 'c-function-distance']) {
    assert.ok(inputs(id).includes('-100'), id);
    assert.ok(inputs(id).includes('100'), id);
  }
  for (const [id, maximum] of [['c-loop-sequence', '8'], ['c-loop-weighted-sum', '20'], ['c-loop-multiples', '100'], ['c-function-filtered-sum', '100'], ['c-digit-sum-offset', '9999']]) {
    assert.ok(inputs(id).includes('0'), id);
    assert.ok(inputs(id).includes(maximum), id);
  }
  assert.deepEqual(clone(inputs('c-array-index')), ['0', '1', '2', '3']);
  for (const input of ['0 6', '6 0', '6 6']) assert.ok(inputs('c-nested-grid').includes(input));
  for (const input of ['9', '10', '11']) assert.ok(inputs('c-branch-threshold').includes(input));
  for (const input of ['9', '10', '19', '20']) assert.ok(inputs('c-branch-bands').includes(input));
  for (const id of ['c-array-sum-offset', 'c-array-reverse-offset', 'c-array-count-threshold']) assert.ok(inputs(id).some(x => x.includes('-100') && x.includes('100')));
});
check('numeric quizzes independently evaluated by the C engine', () => {
  for (const question of questions.filter(x => ['c-parity-trace', 'c-output-precedence', 'c-loop-boundary-trace'].includes(x.templateId))) {
    const body = question.prompt.slice(question.prompt.indexOf('\n') + 1);
    const result = LearningC.run('int main(void){' + body + '\nreturn 0;}', '');
    assert.equal(result.status, 'ok', result.diagnostic);
    assert.equal(result.output, question.choices[question.answer], question.id);
  }
});
check('regeneration and metadata are deterministic defensive values', () => {
  for (const question of questions) assert.deepEqual(clone(bank.getTrainingQuestion(question.id)), clone(question));
  const original = q('c-arith-add', 9999);
  assert.deepEqual(clone(bank.getTrainingQuestion(original.id)), clone(original));
  const altered = q('c-arith-add', 9999); altered.tests[0].expected = 'bad'; altered.hints.push('bad');
  assert.deepEqual(clone(q('c-arith-add', 9999)), clone(original));
  templates[0].title = 'bad';
  assert.notEqual(bank.getTrainingTemplates()[0].title, 'bad');
});
check('recipe rejects untrusted fields and invalid seeds', () => {
  for (const seed of [0, 11, 12, 9999]) assert.deepEqual(clone(bank.validateRecipe(JSON.stringify({ templateId: 'c-arith-add', seed }))), { templateId: 'c-arith-add', seed });
  const invalid = [null, [], true, 1, 'text', {}, { templateId: 'missing', seed: 1 }, { templateId: 'c-arith-add' }, { templateId: 'c-arith-add', seed: 0, solution: 'malicious' }, ...[-1, 1.5, 10000, '1', null].map(seed => ({ templateId: 'c-arith-add', seed }))];
  for (const raw of invalid) assert.throws(() => bank.validateRecipe(JSON.stringify(raw)), JSON.stringify(raw));
  for (const raw of ['', '{', '```json\n{"templateId":"c-arith-add","seed":1}\n```', 'text {"templateId":"c-arith-add","seed":1}', ' '.repeat(2049)]) assert.throws(() => bank.validateRecipe(raw));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => bank.generate({ templateId: 'c-arith-add', seed }));
  assert.throws(() => bank.generate({ templateId: 'c-arith-add', seed: 1, answer: 7 }));
  for (const id of [null, 4, '', 'tr:c-arith-add:01', 'tr:c-arith-add:-1', 'tr:c-arith-add:10000', 'tr:c-arith-add:1.0', 'tr:c-arith-add:1:extra', 'tr:missing:1', 'tr:c-arith-add:1e2', 'tr:c-arith-add: 1']) assert.equal(bank.getTrainingQuestion(id), undefined);
});

check('state has defensive ownership and stable sticky assistance', () => {
  const question = q('c-arith-add', 127);
  const original = rules.freshTrainingState();
  original.drafts[question.id] = 'int main(void){}';
  const before = clone(original);
  const selected = rules.markTrainingSelection(original, question);
  assert.deepEqual(clone(original), before);
  assert.equal(selected.lastQuestionId, question.id);
  const first = attempt(selected, question);
  const helped = rules.markTrainingHelp(first, question);
  assert.equal(first.attempts[0].assisted, false);
  assert.equal(helped.attempts[0].assisted, true);
  const retried = attempt(helped, question, 'passed', false);
  assert.ok(retried.attempts.every(x => x.assisted));
  const restored = rules.validateTrainingState(clone(retried));
  assert.deepEqual(clone(restored), clone(retried));
  restored.attempts[0].status = 'wrong_answer'; restored.assistedQuestionIds.push('bad'); restored.drafts[question.id] = 'changed';
  assert.equal(retried.attempts[0].status, 'passed');
  assert.equal(retried.assistedQuestionIds.length, 1);
  assert.equal(retried.drafts[question.id], original.drafts[question.id]);
  assert.equal(rules.markTrainingHelp(retried, question).assistedQuestionIds.length, 1);
  const newlyAssisted = attempt(first, question, 'passed', true);
  assert.ok(newlyAssisted.attempts.every(x => x.assisted));
});
check('state validation rejects corrupt data and forged question identity', () => {
  const original = attempt(rules.freshTrainingState(), q('c-arith-add'));
  for (const bad of [null, [], 1, {}, { ...clone(original), extra: true }, { ...clone(original), version: 2 }]) assert.throws(() => rules.validateTrainingState(bad));
  const mutations = [
    s => { s.lastQuestionId = 'bad'; }, s => { s.drafts = []; }, s => { s.drafts.bad = ''; },
    s => { s.drafts[q('c-arith-add').id] = 'x'.repeat(12001); }, s => { s.drafts[q('c-arith-add').id] = 4; },
    s => { s.assistedQuestionIds = ['bad']; }, s => { s.assistedQuestionIds = [q('c-arith-add').id, q('c-arith-add').id]; },
    s => { s.attempts[0].skillId = 'loops'; }, s => { s.attempts[0].level = 3; }, s => { s.attempts[0].questionId = 'bad'; },
    s => { s.attempts[0].status = 'ok'; }, s => { s.attempts[0].assisted = 'false'; }, s => { s.attempts[0].assisted = true; },
    s => { s.assistedQuestionIds = [q('c-arith-add').id]; }, s => { s.attempts[0].extra = true; },
    s => { s.attempts[0].sequence = 0; }, s => { s.attempts[0].sequence = 1.5; }, s => { s.attempts.push(clone(s.attempts[0])); },
    s => { s.attempts[0].createdAt = '2026-02-30T01:02:03.000Z'; }, s => { s.attempts[0].createdAt = '2026-11-15'; },
    s => { s.attempts = [null]; }, s => { s.attempts = new Array(1001); }, s => { s.assistedQuestionIds = new Array(2049); }
  ];
  for (const mutate of mutations) { const bad = clone(original); mutate(bad); assert.throws(() => rules.validateTrainingState(bad)); }
  const tooManyDrafts = rules.freshTrainingState();
  for (let seed = 0; seed < 289; seed++) tooManyDrafts.drafts[q('c-arith-add', seed).id] = '';
  assert.throws(() => rules.validateTrainingState(tooManyDrafts));
  const polluted = clone(original); polluted.drafts = JSON.parse('{"__proto__":"bad"}');
  assert.throws(() => rules.validateTrainingState(polluted));
  assert.throws(() => rules.recordTrainingAttempt(original, q('c-arith-add'), 'ok', false, time));
  assert.throws(() => rules.recordTrainingAttempt(original, q('c-arith-add'), 'passed', false, 'bad'));
  assert.throws(() => rules.markTrainingSelection(original, { ...q('c-arith-add'), level: 3 }));
  assert.throws(() => rules.markTrainingHelp(original, { ...q('c-arith-add'), seed: 1 }));
});
check('bounded history preserves sequence and assistance after truncation', () => {
  const question = q('c-arith-add');
  const state = rules.freshTrainingState();
  state.assistedQuestionIds = [question.id];
  state.attempts = Array.from({ length: 1000 }, (_, i) => ({ questionId: question.id, skillId: question.skillId, level: question.level, status: 'passed', assisted: true, sequence: i + 1, createdAt: time }));
  const next = attempt(state, question);
  assert.equal(next.attempts.length, 1000);
  assert.equal(next.attempts[0].sequence, 2);
  assert.equal(next.attempts[999].sequence, 1001);
  assert.equal(next.attempts[999].assisted, true);
  assert.equal(state.attempts[0].sequence, 1);
  const fullHelp = rules.freshTrainingState();
  fullHelp.assistedQuestionIds = Array.from({ length: 2048 }, (_, seed) => q('c-arith-add', seed).id);
  assert.throws(() => rules.markTrainingHelp(fullHelp, q('c-arith-add', 2048)), /2048/);
  assert.equal(rules.markTrainingHelp(fullHelp, q('c-arith-add')).assistedQuestionIds.length, 2048);
});

check('selection deterministic, filtered and avoids the selected question', () => {
  const state = rules.freshTrainingState();
  for (const skill of bank.getTrainingSkills()) for (const level of skill.levels) {
    const first = rules.selectTrainingQuestion(state, level, skill.id, 42);
    assert.equal(first.skillId, skill.id); assert.equal(first.level, level);
    assert.deepEqual(clone(rules.selectTrainingQuestion(state, level, skill.id, 42)), clone(first));
    const selected = rules.markTrainingSelection(state, first);
    assert.notEqual(rules.selectTrainingQuestion(selected, level, skill.id, 42).id, first.id);
  }
  for (const [mode, skill, seed] of [[3, 'output', 1], [1, 'functions', 1], [1, 'missing', 1], [4, 'all', 1], [1, 'all', -1], [1, 'all', 1.2], [1, 'all', 4294967296]]) assert.throws(() => rules.selectTrainingQuestion(state, mode, skill, seed));
  assert.equal(rules.selectTrainingQuestion(state, 'adaptive', 'functions', 4294967295).level, 2);
  assert.deepEqual(clone(state), clone(rules.freshTrainingState()));
});
check('adaptive promotion requires distinct independent passes', () => {
  let state = rules.freshTrainingState();
  const level = () => rules.selectTrainingQuestion(state, 'adaptive', 'branches', 9).level;
  assert.equal(level(), 1);
  for (let i = 0; i < 4; i++) state = attempt(state, q('c-branch-threshold'));
  assert.equal(level(), 1);
  state = attempt(state, q('c-branch-threshold', 1)); assert.equal(level(), 1);
  state = attempt(state, q('c-branch-threshold', 2)); assert.equal(level(), 2);
  state = attempt(state, q('c-branch-clamp'), 'passed', true); assert.equal(level(), 2);
  for (const seed of [1, 2, 3]) state = attempt(state, q('c-branch-clamp', seed));
  assert.equal(level(), 3);
  state = attempt(state, q('c-branch-bands'), 'unsupported');
  state = attempt(state, q('c-branch-bands', 1), 'tool_error'); assert.equal(level(), 3);
  state = attempt(state, q('c-branch-bands', 2), 'wrong_answer'); assert.equal(level(), 3);
  state = attempt(state, q('c-branch-bands', 3), 'compile_error'); assert.equal(level(), 2);
  const helped = rules.markTrainingHelp(state, q('c-branch-threshold', 1));
  assert.equal(rules.selectTrainingQuestion(helped, 'adaptive', 'branches', 9).level, 1);
  let assistedOnly = rules.freshTrainingState();
  for (let seed = 0; seed < 6; seed++) assistedOnly = attempt(assistedOnly, q('c-branch-threshold', seed), 'passed', true);
  assert.equal(rules.selectTrainingQuestion(assistedOnly, 'adaptive', 'branches', 1).level, 1);
  assert.equal(rules.selectTrainingQuestion(state, 'adaptive', 'arrays', 1).level, 1);
});
check('fresh adaptive all stays at the global beginner level across seeds and skips', () => {
  const fresh = rules.freshTrainingState();
  let skipping = fresh;
  for (const seed of [...Array(512).keys(), 9999, 2147483648, 4294967295]) {
    for (const skill of ['', 'all']) {
      const question = rules.selectTrainingQuestion(fresh, 'adaptive', skill, seed);
      assert.equal(question.level, 1, `${skill || 'empty alias'}, seed=${seed}, question=${question.id}`);
      assert.notEqual(question.skillId, 'functions');
    }
    const question = rules.selectTrainingQuestion(skipping, 'adaptive', 'all', seed);
    assert.equal(question.level, 1);
    assert.notEqual(question.id, skipping.lastQuestionId);
    skipping = rules.markTrainingSelection(skipping, question);
  }
  assert.equal(skipping.attempts.length, 0);
  for (const seed of [0, 1, 42, 4294967295]) assert.equal(rules.selectTrainingQuestion(fresh, 'adaptive', 'functions', seed).level, 2);
});
check('adaptive all advances globally one level at a time and demotes on failures', () => {
  let state = rules.freshTrainingState();
  function expectLevel(level) {
    for (const seed of [0, 1, 2, 17, 42, 127, 9999, 4294967295]) {
      assert.equal(rules.selectTrainingQuestion(state, 'adaptive', '', seed).level, level);
      assert.equal(rules.selectTrainingQuestion(state, 'adaptive', 'all', seed).level, level);
    }
  }
  // Advanced work chosen explicitly must not skip the global beginner stage.
  for (let seed = 0; seed < 3; seed++) state = attempt(state, q('c-function-affine', seed));
  expectLevel(1);
  for (let i = 0; i < 4; i++) state = attempt(state, q('c-arith-add'));
  expectLevel(1);
  state = attempt(state, q('c-branch-threshold')); expectLevel(1);
  state = attempt(state, q('c-array-index')); expectLevel(2);
  // Different skills contribute to global mastery; skill-only practice is local.
  assert.equal(rules.selectTrainingQuestion(state, 'adaptive', 'branches', 4).level, 1);
  state = attempt(state, q('c-divmod')); expectLevel(2);
  state = attempt(state, q('c-loop-weighted-sum')); expectLevel(2);
  state = attempt(state, q('c-function-distance')); expectLevel(3);
  state = attempt(state, q('c-nested-grid'), 'unsupported');
  state = attempt(state, q('c-branch-bands'), 'tool_error'); expectLevel(3);
  state = attempt(state, q('c-nested-grid', 1), 'wrong_answer'); expectLevel(3);
  state = attempt(state, q('c-branch-bands', 1), 'compile_error'); expectLevel(2);
  state = attempt(state, q('c-loop-weighted-sum', 1), 'timeout'); expectLevel(2);
  state = attempt(state, q('c-function-distance', 1), 'runtime_error'); expectLevel(1);
  state = attempt(state, q('c-arith-scale'), 'wrong_answer');
  state = attempt(state, q('c-arith-scale', 1), 'wrong_answer'); expectLevel(1);
  for (const [id, seed] of [['c-arith-add', 1], ['c-branch-threshold', 1], ['c-array-index', 1]]) state = attempt(state, q(id, seed));
  expectLevel(2);
});
check('adaptive all ignores assistance and resets distinct passes after failure', () => {
  let state = rules.freshTrainingState();
  const currentLevel = () => rules.selectTrainingQuestion(state, 'adaptive', 'all', 77).level;
  for (const id of ['c-arith-add', 'c-branch-threshold', 'c-array-index']) state = attempt(state, q(id), 'passed', true);
  assert.equal(currentLevel(), 1);
  state = attempt(state, q('c-arith-add', 1));
  state = attempt(state, q('c-branch-threshold', 1));
  state = attempt(state, q('c-array-index', 1), 'wrong_answer');
  state = attempt(state, q('c-array-index', 2)); assert.equal(currentLevel(), 1);
  state = attempt(state, q('c-arith-add', 2)); assert.equal(currentLevel(), 1);
  state = attempt(state, q('c-branch-threshold', 2)); assert.equal(currentLevel(), 2);
  const beforeHelp = state;
  state = rules.markTrainingHelp(state, q('c-arith-add', 2));
  assert.equal(currentLevel(), 1, 'Retroactive assistance must remove that pass from independent mastery.');
  state = clone(beforeHelp);
  state = attempt(state, q('c-divmod'), 'wrong_answer', true);
  state = attempt(state, q('c-divmod', 1), 'wrong_answer', true);
  assert.equal(currentLevel(), 2, 'Assisted failures do not demote independent mastery.');
  assert.deepEqual(clone(rules.validateTrainingState(state)), clone(state));
});
check('weighting favors unseen and failed questions over passed questions', () => {
  const eligible = questions.filter(x => x.skillId === 'output');
  let state = rules.freshTrainingState();
  for (const question of eligible.slice(0, 12)) state = attempt(state, question);
  for (const question of eligible.slice(12, 18)) state = attempt(state, question, 'wrong_answer');
  state = rules.markTrainingSelection(state, q('c-branch-threshold'));
  const counts = { passed: 0, failed: 0, unseen: 0 };
  const passed = new Set(eligible.slice(0, 12).map(x => x.id));
  const failed = new Set(eligible.slice(12, 18).map(x => x.id));
  for (let seed = 0; seed < 300; seed++) {
    const id = rules.selectTrainingQuestion(state, 1, 'output', seed).id;
    counts[passed.has(id) ? 'passed' : failed.has(id) ? 'failed' : 'unseen']++;
  }
  assert.ok(counts.unseen > counts.failed && counts.failed > counts.passed, JSON.stringify(counts));
});

check('static draft hints detect issues without executing code', () => {
  const issues = code => rules.analyzeDraft(code).filter(x => x.severity !== 'info');
  assert.equal(issues('int main(void){printf("while(1) { /0 float"); /* if(x=1) */ return 0;}').length, 0);
  assert.equal(issues('#include "stdio.h"\n#include <string.h>\nint main(void){char c=\'}\'; return 0;}').length, 0);
  assert.equal(issues('// #include <stdlib.h>\nint main(void){return 0;}').length, 0);
  assert.ok(issues('int main(void) {').some(x => x.severity === 'error'));
  assert.ok(issues('int main(void){/* unterminated').some(x => /注释/.test(x.message)));
  assert.ok(issues('int main(void){printf("oops); }').some(x => /引号/.test(x.message)));
  assert.ok(issues('int main(void){\nint x=1;\nif (x=2) {}\n}').some(x => /赋值/.test(x.message) && x.line === 3));
  assert.equal(issues('int main(void){int x=1;if(x==2||x!=3||x<=4||x>=5){}return 0;}').length, 0);
  for (const code of ['#include <stdlib.h>\nint main(void){}', '#define X 2\nint main(void){}', 'int main(void){double n;}', 'int main(void){system("ignored");}', 'int main(void){int n=1/0;}', 'int main(void){while(1){}}']) assert.ok(issues(code).some(x => x.severity === 'warning'), code);
  const pointerHint = issues('int main(void){int x; scanf("%d",x);}');
  assert.ok(pointerHint.some(x => /普通标量/.test(x.message) && x.severity === 'warning'));
  assert.ok(!issues('int main(void){int x;scanf("%d",&x);}').some(x => /普通标量/.test(x.message)));
  assert.ok(issues('x'.repeat(12001)).some(x => x.severity === 'error'));
  const many = rules.analyzeDraft('{'.repeat(100)); assert.ok(many.length <= 40);
  for (const code of ['', 'int main(void){while(1){}}', 'x'.repeat(12001)]) assert.ok(rules.analyzeDraft(code).some(x => /未执行代码/.test(x.message) && /不代表编译或测试通过/.test(x.message)));
});
console.log(JSON.stringify({ status: 'passed', baseQuestions: questions.length, codeQuestions: 228, quizQuestions: 60, baseCases, dynamicQuestions: templates.length * 3, dynamicCases, maximumSolutionSteps: maxSteps, checks }, null, 2));
