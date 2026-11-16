import { DraftDiagnostic, TrainingAttempt, TrainingLevel, TrainingMode, TrainingQuestion, TrainingSkill, TrainingState } from './TrainingModels';
import { getTrainingBank, getTrainingQuestion, getTrainingSkills } from './TrainingBank';

export const TRAINING_MAX_ATTEMPTS: number = 1000;
export const TRAINING_MAX_DRAFTS: number = 288;
export const TRAINING_MAX_DRAFT_LENGTH: number = 12000;
export const TRAINING_MAX_HELP_IDS: number = 2048;
const STATUSES: string[] = ['passed', 'wrong_answer', 'compile_error', 'runtime_error', 'timeout', 'unsupported', 'tool_error'];

export function freshTrainingState(): TrainingState {
  return { version: 1, lastQuestionId: '', assistedQuestionIds: [], drafts: {}, attempts: [] };
}

function validTime(value: string): boolean {
  // Store UTC so daily reports can convert one unambiguous instant to local time.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value;
}

export function validateTrainingState(value: TrainingState): TrainingState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('练习存档必须是对象。');
  const keys = Object.keys(value);
  const expected = ['version', 'lastQuestionId', 'assistedQuestionIds', 'drafts', 'attempts'];
  if (keys.length !== expected.length || keys.some((key: string) => !expected.includes(key)) || value.version !== 1) throw new Error('练习存档字段或版本不正确。');
  if (typeof value.lastQuestionId !== 'string' || (value.lastQuestionId !== '' && !getTrainingQuestion(value.lastQuestionId))) throw new Error('上次练习题号无效。');
  if (!Array.isArray(value.assistedQuestionIds) || value.assistedQuestionIds.length > TRAINING_MAX_HELP_IDS) throw new Error('提示记录数量不合法。');
  if (!value.drafts || typeof value.drafts !== 'object' || Array.isArray(value.drafts) || Object.keys(value.drafts).length > TRAINING_MAX_DRAFTS) throw new Error('代码草稿数量不合法。');
  if (!Array.isArray(value.attempts) || value.attempts.length > TRAINING_MAX_ATTEMPTS) throw new Error('练习记录数量不合法。');
  const copy = freshTrainingState();
  copy.lastQuestionId = value.lastQuestionId;
  const helped: Set<string> = new Set<string>();
  for (const id of value.assistedQuestionIds) {
    if (!getTrainingQuestion(id) || helped.has(id)) throw new Error('提示记录包含无效或重复题号。');
    helped.add(id);
    copy.assistedQuestionIds.push(id);
  }
  for (const id of Object.keys(value.drafts)) {
    if (!getTrainingQuestion(id) || typeof value.drafts[id] !== 'string' || value.drafts[id].length > TRAINING_MAX_DRAFT_LENGTH) throw new Error('代码草稿题号或长度不合法。');
    copy.drafts[id] = value.drafts[id];
  }
  let previousSequence = 0;
  for (const attempt of value.attempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) throw new Error('练习记录格式不合法。');
    const attemptKeys = Object.keys(attempt);
    const fields = ['questionId', 'skillId', 'level', 'status', 'assisted', 'sequence', 'createdAt'];
    if (attemptKeys.length !== fields.length || attemptKeys.some((key: string) => !fields.includes(key))) throw new Error('练习记录字段不正确。');
    const question = getTrainingQuestion(attempt.questionId);
    if (!question || question.skillId !== attempt.skillId || question.level !== attempt.level) throw new Error('练习记录题号、技能或等级不一致。');
    if (typeof attempt.status !== 'string' || !STATUSES.includes(attempt.status) || typeof attempt.assisted !== 'boolean') throw new Error('练习结果或提示标记不合法。');
    if (!Number.isSafeInteger(attempt.sequence) || attempt.sequence <= previousSequence || !validTime(attempt.createdAt)) throw new Error('练习记录顺序或时间不合法。');
    if (attempt.assisted !== helped.has(attempt.questionId)) throw new Error('提示使用记录不一致，不能将辅助完成算作独立完成。');
    previousSequence = attempt.sequence;
    copy.attempts.push({ questionId: attempt.questionId, skillId: attempt.skillId, level: attempt.level, status: attempt.status, assisted: attempt.assisted, sequence: attempt.sequence, createdAt: attempt.createdAt });
  }
  return copy;
}

function checkedQuestion(question: TrainingQuestion): TrainingQuestion {
  if (!question || typeof question !== 'object' || Array.isArray(question)) throw new Error('练习题不合法。');
  const canonical = getTrainingQuestion(question.id);
  if (!canonical || canonical.templateId !== question.templateId || canonical.seed !== question.seed || canonical.skillId !== question.skillId || canonical.level !== question.level || canonical.type !== question.type) throw new Error('练习题身份信息不一致。');
  return canonical;
}

export function markTrainingSelection(state: TrainingState, question: TrainingQuestion): TrainingState {
  const copy = validateTrainingState(state);
  copy.lastQuestionId = checkedQuestion(question).id;
  return copy;
}

function addHelp(state: TrainingState, id: string): void {
  if (!state.assistedQuestionIds.includes(id)) {
    if (state.assistedQuestionIds.length >= TRAINING_MAX_HELP_IDS) throw new Error('提示记录已达2048题上限，请先导出存档；不会清除已有提示标记。');
    state.assistedQuestionIds.push(id);
  }
  // Help is sticky for the question, including earlier attempts and later retries.
  for (const attempt of state.attempts) if (attempt.questionId === id) attempt.assisted = true;
}

export function markTrainingHelp(state: TrainingState, question: TrainingQuestion): TrainingState {
  const copy = validateTrainingState(state);
  addHelp(copy, checkedQuestion(question).id);
  return copy;
}

export function recordTrainingAttempt(state: TrainingState, question: TrainingQuestion, status: string, assisted: boolean, createdAt: string = new Date().toISOString()): TrainingState {
  const copy = validateTrainingState(state);
  const canonical = checkedQuestion(question);
  if (!STATUSES.includes(status) || typeof assisted !== 'boolean' || !validTime(createdAt)) throw new Error('练习结果、提示标记或时间不合法。');
  const sequence = copy.attempts.length === 0 ? 1 : copy.attempts[copy.attempts.length - 1].sequence + 1;
  if (!Number.isSafeInteger(sequence)) throw new Error('练习记录序号已达上限。');
  if (assisted) addHelp(copy, canonical.id);
  copy.lastQuestionId = canonical.id;
  copy.attempts.push({ questionId: canonical.id, skillId: canonical.skillId, level: canonical.level, status: status, assisted: copy.assistedQuestionIds.includes(canonical.id), sequence: sequence, createdAt: createdAt });
  if (copy.attempts.length > TRAINING_MAX_ATTEMPTS) copy.attempts = copy.attempts.slice(-TRAINING_MAX_ATTEMPTS);
  return copy;
}

function adaptiveLevel(state: TrainingState, levels: TrainingLevel[], skillId: string): TrainingLevel {
  let position = 0;
  let successes: Set<string> = new Set<string>();
  let failures = 0;
  for (const attempt of state.attempts) {
    if ((skillId !== '' && attempt.skillId !== skillId) || attempt.level !== levels[position] || attempt.assisted || attempt.status === 'unsupported' || attempt.status === 'tool_error') continue;
    if (attempt.status === 'passed') {
      successes.add(attempt.questionId);
      failures = 0;
      if (successes.size >= 3 && position < levels.length - 1) {
        position++;
        successes = new Set<string>();
      }
    } else {
      successes.clear();
      failures++;
      if (failures >= 2) {
        position = Math.max(0, position - 1);
        failures = 0;
      }
    }
  }
  return levels[position];
}

export function selectTrainingQuestion(state: TrainingState, level: TrainingMode, skillId: string, seed: number): TrainingQuestion {
  const copy = validateTrainingState(state);
  if ((level !== 'adaptive' && level !== 1 && level !== 2 && level !== 3) || typeof skillId !== 'string' || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('练习筛选条件或随机种子不合法。');
  const skills = getTrainingSkills();
  const all = skillId === '' || skillId === 'all';
  if (!all && !skills.some((skill: TrainingSkill) => skill.id === skillId)) throw new Error('未知的练习技能。');
  const availableLevels: TrainingLevel[] = [];
  for (const skill of skills) {
    if (all || skill.id === skillId) for (const supported of skill.levels) {
      if (!availableLevels.includes(supported)) availableLevels.push(supported);
    }
  }
  availableLevels.sort((a: TrainingLevel, b: TrainingLevel) => a - b);
  // All-skills practice has one global progression, starting at the lowest
  // supported level. Otherwise a skill whose first level is 2 would bypass the
  // beginner stage. Explicit skill selection keeps that skill's own progression.
  // Both use the retained recent history: 3 distinct independent passes advance
  // one level; 2 failures drop one level; a failure clears the pass streak.
  const target = level === 'adaptive' ? adaptiveLevel(copy, availableLevels, all ? '' : skillId) : level;
  let candidates = getTrainingBank().filter((question: TrainingQuestion) => (all || question.skillId === skillId) && question.level === target);
  if (candidates.length === 0) throw new Error('该技能在所选等级暂无题目，请选择已有等级或自适应。');
  if (candidates.length > 1) candidates = candidates.filter((question: TrainingQuestion) => question.id !== copy.lastQuestionId);
  const latest: Map<string, TrainingAttempt> = new Map<string, TrainingAttempt>();
  for (const attempt of copy.attempts) latest.set(attempt.questionId, attempt);
  const weights = candidates.map((question: TrainingQuestion) => {
    const attempt = latest.get(question.id);
    if (!attempt) return 6;
    if (attempt.status !== 'passed') return 4;
    return attempt.assisted ? 2 : 1;
  });
  const total = weights.reduce((sum: number, weight: number) => sum + weight, 0);
  // Integer mixing makes nearby seeds useful while remaining portable and pure.
  let random = seed >>> 0;
  random = Math.imul(random ^ (random >>> 16), 0x7feb352d);
  random = Math.imul(random ^ (random >>> 15), 0x846ca68b);
  random = (random ^ (random >>> 16)) >>> 0;
  let ticket = random / 4294967296 * total;
  for (let i = 0; i < candidates.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

interface Delimiter { text: string; line: number; }
interface DraftText { masked: string; uncommented: string; }

function addDiagnostic(diagnostics: DraftDiagnostic[], severity: 'info' | 'warning' | 'error', line: number, message: string): void {
  if (diagnostics.length < 39) diagnostics.push({ severity: severity, line: line, message: message });
}

function maskDraft(code: string, diagnostics: DraftDiagnostic[]): DraftText {
  let masked = '';
  let uncommented = '';
  let mode = 'code';
  let openingLine = 1;
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : '';
    if (mode === 'line') {
      if (ch === '\n') { mode = 'code'; masked += '\n'; uncommented += '\n'; line++; }
      else { masked += ' '; uncommented += ' '; }
    } else if (mode === 'block') {
      if (ch === '*' && next === '/') { masked += '  '; uncommented += '  '; i++; mode = 'code'; }
      else { masked += ch === '\n' ? '\n' : ' '; uncommented += ch === '\n' ? '\n' : ' '; if (ch === '\n') line++; }
    } else if (mode === '"' || mode === "'") {
      if (ch === '\\' && next !== '') {
        masked += next === '\n' ? ' \n' : '  ';
        uncommented += ch + next;
        if (next === '\n') line++;
        i++;
      } else if (ch === mode) { masked += ' '; uncommented += ch; mode = 'code'; }
      else if (ch === '\n') {
        addDiagnostic(diagnostics, 'error', openingLine, '字符串或字符常量在换行前缺少结束引号。');
        masked += '\n'; uncommented += '\n'; line++; mode = 'code';
      } else { masked += ' '; uncommented += ch; }
    } else if (ch === '/' && (next === '/' || next === '*')) {
      mode = next === '/' ? 'line' : 'block'; openingLine = line;
      masked += '  '; uncommented += '  '; i++;
    } else if (ch === '"' || ch === "'") {
      mode = ch; openingLine = line; masked += ' '; uncommented += ch;
    } else { masked += ch; uncommented += ch; if (ch === '\n') line++; }
  }
  if (mode === 'block') addDiagnostic(diagnostics, 'error', openingLine, '块注释缺少结束标记 */。');
  if (mode === '"' || mode === "'") addDiagnostic(diagnostics, 'error', openingLine, '字符串或字符常量缺少结束引号。');
  return { masked: masked, uncommented: uncommented };
}

function lineAt(code: string, index: number): number { return code.slice(0, index).split('\n').length; }

function warnMatches(code: string, pattern: RegExp, message: string, diagnostics: DraftDiagnostic[]): void {
  let match = pattern.exec(code);
  while (match !== null && diagnostics.length < 39) {
    addDiagnostic(diagnostics, 'warning', lineAt(code, match.index), message);
    match = pattern.exec(code);
  }
}

export function analyzeDraft(code: string): DraftDiagnostic[] {
  const diagnostics: DraftDiagnostic[] = [];
  if (typeof code !== 'string') addDiagnostic(diagnostics, 'error', 1, '草稿必须是文本。');
  else if (code.length > TRAINING_MAX_DRAFT_LENGTH) addDiagnostic(diagnostics, 'error', 1, '练习草稿最多12000个字符，请先缩短代码。');
  else if (code.trim().length === 0) addDiagnostic(diagnostics, 'info', 1, '先从 int main(void) 和题目需要的输入输出开始。');
  else {
    const text = maskDraft(code, diagnostics);
    const stack: Delimiter[] = [];
    let line = 1;
    for (const ch of text.masked) {
      if (ch === '\n') line++;
      else if ('([{'.includes(ch)) stack.push({ text: ch, line: line });
      else if (')]}'.includes(ch)) {
        const opening = stack.pop();
        if (!opening || '([{'.indexOf(opening.text) !== ')]}'.indexOf(ch)) addDiagnostic(diagnostics, 'error', line, '括号 ' + ch + ' 缺少匹配的开始符号。');
      }
    }
    for (const opening of stack) addDiagnostic(diagnostics, 'error', opening.line, '括号 ' + opening.text + ' 缺少结束符号。');
    const directives = /^[ \t]*#[ \t]*(\w+)([^\r\n]*)/gm;
    let directive = directives.exec(text.uncommented);
    while (directive !== null && diagnostics.length < 39) {
      const supported = directive[1] === 'include' && /^[ \t]*(<stdio\.h>|<string\.h>|"stdio\.h"|"string\.h")[ \t]*$/.test(directive[2]);
      if (!supported) addDiagnostic(diagnostics, 'warning', lineAt(code, directive.index), '当前解释器只支持 stdio.h、string.h 的有限函数，不支持宏、条件编译或其他头文件。');
      directive = directives.exec(text.uncommented);
    }
    warnMatches(text.masked, /\b(struct|union|enum|typedef|float|double|long|short|const|volatile|static|extern|register|auto|switch|case|default|goto|sizeof|_Bool)\b/g, '此关键字不在当前教学解释器支持的 C 子集中，请查看运行说明。', diagnostics);
    warnMatches(text.masked, /\b(malloc|calloc|realloc|free|fopen|fclose|fread|fwrite|system|exec|socket)\s*\(/g, '当前解释器不提供文件、系统、网络或动态内存接口。', diagnostics);
    warnMatches(text.masked, /\bif\s*\([^;{}]*?[^=!<>]=(?!=)/g, 'if 条件中出现赋值；若想比较是否相等，请检查是否应为 ==。赋值条件也可能是有意的。', diagnostics);
    warnMatches(text.masked, /(?:\/|%)\s*0(?:[uU])?(?![\w.])/g, '发现字面量0作除数；请检查执行到这里时是否会发生除零。', diagnostics);
    warnMatches(text.masked, /\bwhile\s*\(\s*1\s*\)|\bfor\s*\(\s*;\s*;\s*\)/g, '此循环条件不会自行结束；若没有可达的 break 或 return，可能触发步数上限。', diagnostics);
    // A bare scanf target can be a valid pointer or array, so this is conditional.
    warnMatches(text.masked, /\bscanf\s*\(\s*,\s*[A-Za-z_]\w*\s*[,)]/g, 'scanf 的目标没有写 &：若它是普通标量变量，需要取地址；若已是指针或数组，则可能正确。', diagnostics);
  }
  diagnostics.push({ severity: 'info', line: 1, message: '这是初步静态提示，未执行代码，也不代表编译或测试通过；请运行题目测试确认。' });
  return diagnostics;
}
