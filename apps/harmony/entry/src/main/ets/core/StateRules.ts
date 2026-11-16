import { Attempt, Backup, Chat, Curriculum, Exercise, Lesson, Progress, RequestSettings, Settings,
  StudyState, copyState, dateKey, recordId } from './Models';

import { freshTrainingState, validateTrainingState } from '../training/TrainingRules';
const MAX_TEXT: number = 24000;
const MAX_CODE: number = 60000;
const MAX_FILE: number = 12 * 1024 * 1024;
const MAX_RECORDS: number = 100000;
const STATE_FIELDS: string[] = ['progress', 'drafts', 'notes', 'settings', 'sessions', 'attempts', 'chats', 'reports', 'usage'];
const STATUSES: string[] = ['passed', 'wrong_answer', 'compile_error', 'runtime_error', 'timeout', 'hint', 'ai_help'];

function check(condition: boolean, message: string): void {
  if (!condition) { throw new Error(message); }
}

function safeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}

function objectFields(value: Object, label: string, allowed: string[] = [], required: string[] = []): void {
  check(typeof value === 'object' && value !== null && !Array.isArray(value), label + '必须是对象。');
  const keys: string[] = Object.keys(value);
  for (const key of keys) {
    check(safeKey(key), label + '含有不允许的字段。');
    check(allowed.length === 0 || allowed.indexOf(key) >= 0, label + '含有不支持的字段。');
  }
  for (const key of required) { check(keys.indexOf(key) >= 0, label + '缺少必要字段。'); }
}

function text(value: string, label: string, maximum: number = MAX_TEXT, empty: boolean = true): void {
  check(typeof value === 'string', label + '必须是文本。');
  check(value.length <= maximum && value.indexOf('\u0000') < 0 && (empty || value.trim().length > 0), label + '文本长度或内容不正确。');
}

function integer(value: number, label: string, minimum: number, maximum: number): void {
  check(typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum, label + '数值不正确。');
}

function booleanValue(value: boolean, label: string): void {
  check(typeof value === 'boolean', label + '必须是布尔值。');
}

function arrayValue(value: Object, label: string, maximum: number): void {
  check(Array.isArray(value), label + '必须是列表。');
  check(Object.keys(value).length <= maximum, label + '数量过多。');
}

function validDate(value: string): void {
  text(value, '日期', 10, false);
  check(/^\d{4}-\d{2}-\d{2}$/.test(value), '日期格式必须为 YYYY-MM-DD。');
  const parsed: Date = new Date(value + 'T00:00:00Z');
  check(Number.isFinite(parsed.getTime()), '日期无效。');
  check(parsed.toISOString().slice(0, 10) === value, '日期无效。');
}

function timestamp(value: string): void {
  text(value, '时间', 50, false);
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value), '时间必须包含时区。');
  validDate(value.slice(0, 10));
  check(Number.isFinite(Date.parse(value)), '时间无效。');
}

function uniqueId(value: string, seen: Set<string>): void {
  text(value, '记录 ID', 120, false);
  check(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value) && safeKey(value), '记录 ID 格式不正确。');
  check(!seen.has(value), '记录 ID 重复。');
  seen.add(value);
}

function modelName(value: string, empty: boolean): void {
  text(value, '模型名称', 100, empty);
  check((empty && value.length === 0) || /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(value), '模型名称格式不正确。');
}

function thinking(mode: string, effort: string): void {
  check(mode === 'enabled' || mode === 'disabled', '思考模式不正确。');
  check(effort === 'low' || effort === 'high' || effort === 'max', '思考强度不正确。');
}

function settings(value: Settings): void {
  objectFields(value, '设置', ['dailyMinutes', 'model', 'thinkingMode', 'reasoningEffort', 'aiEnabled', 'hasApiKey'],
    ['dailyMinutes', 'model', 'aiEnabled', 'hasApiKey']);
  integer(value.dailyMinutes, '每日分钟数', 20, 120);
  modelName(value.model, true);
  booleanValue(value.aiEnabled, 'AI 开关');
  booleanValue(value.hasApiKey, '密钥状态');
  // Only absent legacy fields migrate; explicit null/invalid values must fail.
  const keys: string[] = Object.keys(value);
  if (keys.indexOf('thinkingMode') < 0) { value.thinkingMode = 'enabled'; }
  if (keys.indexOf('reasoningEffort') < 0) { value.reasoningEffort = 'high'; }
  thinking(value.thinkingMode, value.reasoningEffort);
}

function lessonFor(curriculum: Curriculum, id: string): Lesson {
  text(id, '课程 ID', 120, false);
  check(safeKey(id), '课程 ID 不正确。');
  const item: Lesson | undefined = curriculum.lessons.find((lesson: Lesson) => lesson.id === id);
  if (item === undefined) { throw new Error('记录引用了未知课程。'); }
  return item;
}

function exerciseFor(curriculum: Curriculum, id: string): Exercise {
  text(id, '题目 ID', 120, false);
  check(safeKey(id), '题目 ID 不正确。');
  const item: Exercise | undefined = curriculum.exercises.find((exercise: Exercise) => exercise.id === id);
  if (item === undefined) { throw new Error('记录引用了未知题目。'); }
  const lesson: Lesson = lessonFor(curriculum, item.lessonId);
  check(lesson.exerciseIds.indexOf(id) >= 0, '题目与课程配置不匹配。');
  return item;
}

function normalizeStatus(status: string, exercise: Exercise): string {
  text(status, '答题状态', 30, false);
  if (status === 'correct') {
    check(exercise.type === 'quiz', '代码必须使用实际执行结果。');
    return 'passed';
  }
  if (status === 'incorrect') { return 'wrong_answer'; }
  check(STATUSES.indexOf(status) >= 0, '答题状态不正确。');
  if (exercise.type === 'quiz') {
    check(['passed', 'wrong_answer', 'hint', 'ai_help'].indexOf(status) >= 0, '选择题不能含有代码执行状态。');
  }
  return status;
}

function requestSettings(value: RequestSettings): void {
  objectFields(value, '回答设置', ['model', 'thinkingMode', 'reasoningEffort', 'thinkingSupported'], ['model', 'thinkingMode', 'reasoningEffort']);
  modelName(value.model, false);
  thinking(value.thinkingMode, value.reasoningEffort);
  if (Object.keys(value).indexOf('thinkingSupported') >= 0) { booleanValue(value.thinkingSupported as boolean, '思考能力'); }
}

function validateState(state: StudyState, curriculum: Curriculum, imported: boolean): StudyState {
  objectFields(state, '学习数据', [...STATE_FIELDS, 'training'], STATE_FIELDS);
  if (Object.keys(state).indexOf('training') < 0) state.training = freshTrainingState();
  else state.training = validateTrainingState(state.training);
  settings(state.settings);
  objectFields(state.drafts, '代码草稿');
  for (const id of Object.keys(state.drafts)) { exerciseFor(curriculum, id); text(state.drafts[id], '代码草稿', MAX_CODE); }
  objectFields(state.notes, '课程笔记');
  for (const id of Object.keys(state.notes)) { lessonFor(curriculum, id); text(state.notes[id], '课程笔记'); }

  arrayValue(state.attempts, '答题记录', MAX_RECORDS);
  const attemptIds: Set<string> = new Set<string>();
  const successful: Set<string> = new Set<string>();
  const helped: Set<string> = new Set<string>();
  for (const item of state.attempts) {
    objectFields(item, '答题记录', ['id', 'date', 'exerciseId', 'lessonId', 'type', 'status', 'assisted', 'createdAt', 'engine'],
      ['id', 'date', 'exerciseId', 'lessonId', 'type', 'status', 'assisted', 'createdAt']);
    uniqueId(item.id, attemptIds);
    const exercise: Exercise = exerciseFor(curriculum, item.exerciseId);
    check(item.lessonId === exercise.lessonId && item.type === exercise.type, '答题记录与题目不匹配。');
    item.status = normalizeStatus(item.status, exercise);
    booleanValue(item.assisted, '辅助状态');
    validDate(item.date); timestamp(item.createdAt);
    check(item.date === dateKey(new Date(item.createdAt)), '答题日期与记录时间不一致。');
    check((item.status !== 'hint' && item.status !== 'ai_help') || item.assisted, '求助记录必须标记为助学。');
    if (Object.keys(item).indexOf('engine') >= 0) {
      check(item.engine === 'learning-c' && exercise.type === 'code', '代码执行来源不正确。');
    }
    // Missing engine remains missing: desktop imports must not acquire mobile/GCC claims.
    if (item.status === 'passed') { successful.add(exercise.id); }
    if (item.assisted) { helped.add(exercise.id); }
  }

  objectFields(state.progress, '课程进度');
  for (const id of Object.keys(state.progress)) {
    const lesson: Lesson = lessonFor(curriculum, id);
    const progress: Progress = state.progress[id];
    objectFields(progress, '课程进度', ['status', 'assisted', 'passedExercises', 'independentExercises', 'updatedAt'],
      ['status', 'assisted', 'passedExercises', 'independentExercises', 'updatedAt']);
    check(progress.status === 'learning' || progress.status === 'completed', '课程状态不正确。');
    booleanValue(progress.assisted, '课程辅助状态'); timestamp(progress.updatedAt);
    arrayValue(progress.passedExercises, '通过题目', lesson.exerciseIds.length);
    arrayValue(progress.independentExercises, '独立题目', lesson.exerciseIds.length);
    const passed: Set<string> = new Set<string>();
    for (const exerciseId of progress.passedExercises) {
      text(exerciseId, '题目 ID', 120, false);
      check(!passed.has(exerciseId) && lesson.exerciseIds.indexOf(exerciseId) >= 0 && successful.has(exerciseId), '通过记录重复、跨课程或缺少答题证据。');
      passed.add(exerciseId);
    }
    const independent: Set<string> = new Set<string>();
    for (const exerciseId of progress.independentExercises) {
      text(exerciseId, '题目 ID', 120, false);
      check(!independent.has(exerciseId) && passed.has(exerciseId) && !helped.has(exerciseId), '独立记录与通过或求助记录冲突。');
      independent.add(exerciseId);
    }
    const hasHelp: boolean = lesson.exerciseIds.some((exerciseId: string) => helped.has(exerciseId));
    check(progress.assisted || !hasHelp, '课程助学标记与求助记录冲突。');
    check(progress.status !== 'completed' || lesson.exerciseIds.every((exerciseId: string) => passed.has(exerciseId)), '全部练习通过后才能完成课程。');
  }

  arrayValue(state.sessions, '计时记录', MAX_RECORDS);
  const sessionIds: Set<string> = new Set<string>();
  for (const item of state.sessions) {
    const fields: string[] = ['id', 'date', 'lessonId', 'seconds', 'createdAt'];
    objectFields(item, '计时记录', fields, fields);
    uniqueId(item.id, sessionIds); lessonFor(curriculum, item.lessonId);
    validDate(item.date); timestamp(item.createdAt); integer(item.seconds, '计时秒数', 1, 300);
    check(item.date === dateKey(new Date(item.createdAt)), '计时日期与记录时间不一致。');
  }
  arrayValue(state.chats, '对话记录', 10000);
  const chatIds: Set<string> = new Set<string>();
  for (const item of state.chats) {
    objectFields(item, '对话记录', ['id', 'role', 'content', 'lessonId', 'createdAt', 'requestSettings', 'warning'],
      ['id', 'role', 'content', 'lessonId', 'createdAt']);
    uniqueId(item.id, chatIds);
    check(item.role === 'user' || item.role === 'assistant', '对话角色不正确。');
    text(item.content, '对话内容'); timestamp(item.createdAt);
    if (item.lessonId !== null) { lessonFor(curriculum, item.lessonId); }
    if (Object.keys(item).indexOf('requestSettings') >= 0) { requestSettings(item.requestSettings as RequestSettings); }
    if (Object.keys(item).indexOf('warning') >= 0) { text(item.warning as string, '回答提示', 300); }
  }
  objectFields(state.reports, '日报');
  check(Object.keys(state.reports).length <= 10000, '日报数量过多。');
  for (const day of Object.keys(state.reports)) {
    validDate(day); objectFields(state.reports[day], '日报', ['note'], ['note']); text(state.reports[day].note, '日报备注');
  }
  objectFields(state.usage, '用量', ['requests', 'inputTokens', 'outputTokens'], ['requests', 'inputTokens', 'outputTokens']);
  integer(state.usage.requests, '请求次数', 0, 1e12);
  integer(state.usage.inputTokens, '输入用量', 0, 1e12);
  integer(state.usage.outputTokens, '输出用量', 0, 1e12);
  state.settings.hasApiKey = false;
  if (imported) { state.settings.aiEnabled = false; }
  return state;
}

export function validateBackup(source: string, curriculum: Curriculum): StudyState {
  text(source, '备份文件', MAX_FILE, false);
  const backup: Backup = JSON.parse(source) as Backup;
  const fields: string[] = ['format', 'version', 'exportedAt', 'curriculumVersion', 'state'];
  objectFields(backup, '备份', fields, fields);
  check(backup.format === 'qicheng-harmony-backup' || backup.format === 'stm32-studio-backup', '不支持此备份格式。');
  check(backup.version === 1 || (backup.format === 'qicheng-harmony-backup' && backup.version === 2), '不支持此备份版本。');
  check(backup.curriculumVersion === curriculum.version, '备份课程版本与当前版本不匹配。');
  timestamp(backup.exportedAt);
  if (backup.version === 2) objectFields(backup.state, 'v2 学习数据', [...STATE_FIELDS, 'training'], [...STATE_FIELDS, 'training']);
  return validateState(backup.state, curriculum, true);
}

export function validateStoredState(source: string, curriculum: Curriculum): StudyState {
  text(source, '本机学习数据', MAX_FILE, false);
  const state: StudyState = JSON.parse(source) as StudyState;
  return validateState(state, curriculum, false);
}

export function createBackup(state: StudyState, curriculum: Curriculum): Backup {
  const cloned: StudyState = copyState(state);
  validateState(cloned, curriculum, true);
  return {format: 'qicheng-harmony-backup', version: 2, exportedAt: new Date().toISOString(),
    curriculumVersion: curriculum.version, state: cloned};
}

export function recordAttempt(state: StudyState, curriculum: Curriculum, exercise: Exercise,
  status: string, assisted: boolean, engine: string = ''): void {
  const currentExercise: Exercise = exerciseFor(curriculum, exercise.id);
  check(exercise.lessonId === currentExercise.lessonId && exercise.type === currentExercise.type, '题目与课程不匹配。');
  const normalized: string = normalizeStatus(status, currentExercise);
  booleanValue(assisted, '辅助状态');
  check(engine === '' || (engine === 'learning-c' && currentExercise.type === 'code'), '执行来源不正确。');
  if (currentExercise.type === 'code' && normalized !== 'hint' && normalized !== 'ai_help') {
    check(engine === 'learning-c', '手机代码结果必须标记为学习解释器。');
  }
  check(state.attempts.length < MAX_RECORDS, '答题记录已达上限，请先导出备份。');
  const helped: boolean = assisted || normalized === 'hint' || normalized === 'ai_help' ||
    state.attempts.some((item: Attempt) => item.exerciseId === currentExercise.id && item.assisted);
  const now: Date = new Date();
  const createdAt: string = now.toISOString();
  let id: string = recordId();
  while (state.attempts.some((item: Attempt) => item.id === id)) { id = recordId(); }
  const attempt: Attempt = {id: id, date: dateKey(now), exerciseId: currentExercise.id, lessonId: currentExercise.lessonId,
    type: currentExercise.type, status: normalized, assisted: helped, createdAt: createdAt};
  if (engine === 'learning-c') { attempt.engine = engine; }
  const previous: Progress | undefined = state.progress[currentExercise.lessonId];
  const progress: Progress = previous === undefined ? {status: 'learning', assisted: false, passedExercises: [], independentExercises: [], updatedAt: createdAt} :
    {status: previous.status, assisted: previous.assisted, passedExercises: previous.passedExercises.slice(), independentExercises: previous.independentExercises.slice(), updatedAt: createdAt};
  if (helped) {
    progress.assisted = true;
    progress.independentExercises = progress.independentExercises.filter((exerciseId: string) => exerciseId !== currentExercise.id);
  }
  if (normalized === 'passed') {
    if (progress.passedExercises.indexOf(currentExercise.id) < 0) { progress.passedExercises.push(currentExercise.id); }
    if (!helped && progress.independentExercises.indexOf(currentExercise.id) < 0) { progress.independentExercises.push(currentExercise.id); }
    const lesson: Lesson = lessonFor(curriculum, currentExercise.lessonId);
    if (lesson.exerciseIds.every((exerciseId: string) => progress.passedExercises.indexOf(exerciseId) >= 0)) { progress.status = 'completed'; }
  }
  state.attempts.push(attempt);
  state.progress[currentExercise.lessonId] = progress;
}
