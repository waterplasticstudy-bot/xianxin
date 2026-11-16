import { TrainingState } from '../training/TrainingModels';
import { freshTrainingState } from '../training/TrainingRules';
export interface StudyModule { id: string; title: string; subtitle: string; description: string; icon: string; order: number; }
export interface Section { title: string; body: string; code?: string; }
export interface Lesson { id: string; moduleId: string; order: number; title: string; subtitle: string; minutes: number; level: string; available: boolean; objectives: string[]; sections: Section[]; resourceIds: string[]; exerciseIds: string[]; takeaway: string; }
export interface VideoResource { id: string; title: string; author: string; url: string; kind: string; route: string; note: string; verifiedDate: string; verification: string; }
export interface CodeTest { input: string; expected: string; }
export interface Exercise { id: string; lessonId: string; type: string; title: string; prompt: string; choices?: string[]; answer?: number; explanation?: string; starter?: string; solution?: string; tests?: CodeTest[]; hints: string[]; }
export interface Curriculum { version: number; modules: StudyModule[]; lessons: Lesson[]; exercises: Exercise[]; resources: VideoResource[]; }
export interface Settings { dailyMinutes: number; model: string; thinkingMode: string; reasoningEffort: string; aiEnabled: boolean; hasApiKey: boolean; }
export interface Progress { status: string; assisted: boolean; passedExercises: string[]; independentExercises: string[]; updatedAt: string; }
export interface Session { id: string; date: string; lessonId: string; seconds: number; createdAt: string; }
export interface Attempt { id: string; date: string; exerciseId: string; lessonId: string; type: string; status: string; assisted: boolean; createdAt: string; engine?: string; }
export interface RequestSettings { model: string; thinkingMode: string; reasoningEffort: string; thinkingSupported?: boolean; }
export interface Chat { id: string; role: string; content: string; lessonId: string | null; createdAt: string; requestSettings?: RequestSettings; warning?: string; }
export interface Report { note: string; }
export interface Usage { requests: number; inputTokens: number; outputTokens: number; }
export interface StudyState { progress: Record<string, Progress>; drafts: Record<string, string>; notes: Record<string, string>; settings: Settings; sessions: Session[]; attempts: Attempt[]; chats: Chat[]; reports: Record<string, Report>; usage: Usage; training: TrainingState; }
export interface Backup { format: string; version: number; exportedAt: string; curriculumVersion: number; state: StudyState; }
export interface AIModel { id: string; name: string; levels: string[]; }
export interface QuizFeedback { exerciseId: string; correct: boolean; explanation: string; }
export interface TestOutcome { input: string; expected: string; actual: string; passed: boolean; }
export interface RunSummary { exerciseId: string; status: string; diagnostic: string; tests: TestOutcome[]; }
export interface PracticeJob { exerciseId: string; code: string; tests: CodeTest[]; }

export function emptyCurriculum(): Curriculum { return {version: 1, modules: [], lessons: [], exercises: [], resources: []}; }
export function freshState(): StudyState {
  return {progress: {}, drafts: {}, notes: {}, settings: {dailyMinutes: 55, model: 'deepseek-flash', thinkingMode: 'enabled', reasoningEffort: 'high', aiEnabled: false, hasApiKey: false}, sessions: [], attempts: [], chats: [], reports: {}, usage: {requests: 0, inputTokens: 0, outputTokens: 0}, training: freshTrainingState()};
}
export function emptyProgress(): Progress { return {status: '', assisted: false, passedExercises: [], independentExercises: [], updatedAt: ''}; }
export function emptyLesson(): Lesson { return {id:'',moduleId:'',order:0,title:'开始学习',subtitle:'',minutes:0,level:'',available:false,objectives:[],sections:[],resourceIds:[],exerciseIds:[],takeaway:''}; }
export function dateKey(now: Date = new Date()): string { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10); }
export function recordId(): string { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12); }
export function normalizedOutput(text: string): string { return text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n').map((line: string) => line.trimEnd()).join('\n'); }
export function copyState(state: StudyState): StudyState { return JSON.parse(JSON.stringify(state)) as StudyState; }
