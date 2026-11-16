export type TrainingLevel = 1 | 2 | 3;
export type TrainingMode = TrainingLevel | 'adaptive';
export type TrainingQuestionType = 'quiz' | 'code';
export type DraftSeverity = 'info' | 'warning' | 'error';

export interface TrainingRecipe { templateId: string; seed: number; }
export interface TrainingCodeTest { input: string; expected: string; }
export interface TrainingQuestion {
  id: string;
  templateId: string;
  seed: number;
  title: string;
  prompt: string;
  level: TrainingLevel;
  skillId: string;
  type: TrainingQuestionType;
  choices: string[];
  answer: number;
  starter: string;
  solution: string;
  tests: TrainingCodeTest[];
  hints: string[];
  explanation: string;
}
export interface TrainingSkill {
  id: string; title: string; description: string; levels: TrainingLevel[];
}
export interface TrainingTemplate {
  id: string; title: string; level: TrainingLevel; skillId: string;
  type: TrainingQuestionType; variantCount: number; parameterized: boolean;
}
export interface TrainingAttempt {
  questionId: string; skillId: string; level: TrainingLevel; status: string;
  assisted: boolean; sequence: number; createdAt: string;
}
export interface TrainingState {
  version: number;
  lastQuestionId: string;
  assistedQuestionIds: string[];
  drafts: Record<string, string>;
  attempts: TrainingAttempt[];
}
export interface DraftDiagnostic { severity: DraftSeverity; line: number; message: string; }
