import { QuizFeedback, RunSummary } from './Models';

export enum StudyScreen { Main, Lesson, Exercise, Review, Report, Settings, Privacy, Training, Assistant }

export interface ScrollPosition { x: number; y: number; }

// In-memory return state only. API keys are deliberately excluded from navigation history.
export interface PageLocation {
  screen: StudyScreen;
  tab: number;
  visitId: number;
  lessonId: string;
  exerciseId: string;
  scroll: ScrollPosition;
  codeDraft: string;
  noteDraft: string;
  selectedAnswer: number;
  quizSubmitted: boolean;
  runVisible: boolean;
  hintCount: number;
  solutionVisible: boolean;
  quizFeedback: QuizFeedback;
  runFeedback: RunSummary;
  trainingMode: 1 | 2 | 3 | 'adaptive';
  trainingSkill: string;
  exerciseFilter: string;
  reportDay: string;
  reportNote: string;
  editModel: string;
  editEffort: string;
  editDaily: string;
  editAiEnabled: boolean;
  chatDraft: string;
  chatLessonId: string;
  chatExerciseId: string;
  includeCode: boolean;
  localMessage: string;
  dismissedNotice: string;
}

export function copyRunFeedback(value: RunSummary): RunSummary {
  return JSON.parse(JSON.stringify(value)) as RunSummary;
}

export function copyQuizFeedback(value: QuizFeedback): QuizFeedback {
  return { exerciseId: value.exerciseId, correct: value.correct, explanation: value.explanation };
}

function safePosition(position: ScrollPosition): ScrollPosition {
  return {
    x: Number.isFinite(position.x) ? Math.max(0, position.x) : 0,
    y: Number.isFinite(position.y) ? Math.max(0, position.y) : 0
  };
}

function copyLocation(location: PageLocation): PageLocation {
  const copy: PageLocation = JSON.parse(JSON.stringify(location)) as PageLocation;
  copy.scroll = safePosition(location.scroll);
  return copy;
}

export class NavigationHistory {
  private locations: PageLocation[] = [];

  push(location: PageLocation): void { this.locations.push(copyLocation(location)); }

  peek(): PageLocation | undefined { return this.locations.length ? copyLocation(this.locations[this.locations.length - 1]) : undefined; }

  back(): PageLocation | undefined { return this.locations.pop(); }

  clear(): void { this.locations = []; }

  // A worker may finish while its page is in history. Keep its result with that
  // particular visit, never with a different exercise or a newly opened attempt.
  receiveRun(visitId: number, result: RunSummary): void {
    this.locations.forEach((location: PageLocation) => {
      if (location.visitId === visitId && (location.screen === StudyScreen.Exercise || location.screen === StudyScreen.Training) && location.exerciseId === result.exerciseId) {
        location.runFeedback = copyRunFeedback(result);
      }
    });
  }
}

// Each UI transition requests one after-layout scroll. Superseded frame callbacks
// must not move the new page; a capture before layout uses the pending target,
// rather than the previous page's still-mounted Scroll offset.
export class ScrollRestoration {
  private generation: number = 0;
  private pending: boolean = false;
  private target: ScrollPosition = { x: 0, y: 0 };

  request(position: ScrollPosition): number {
    this.generation++;
    this.target = safePosition(position);
    this.pending = true;
    return this.generation;
  }

  capture(actual: ScrollPosition): ScrollPosition {
    return safePosition(this.pending ? this.target : actual);
  }

  consume(generation: number): ScrollPosition | undefined {
    if (!this.pending || generation !== this.generation) return undefined;
    this.pending = false;
    return safePosition(this.target);
  }

  cancel(): void {
    this.generation++;
    this.pending = false;
  }
}
