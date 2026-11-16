import { CommonModifier, FrameCallback, uiMaterial } from '@kit.ArkUI';
import { handExperience } from '../services/HandExperience';
import { materialExperience } from '../services/MaterialExperience';
import { TrainingQuestion, TrainingSkill, TrainingMode, DraftDiagnostic } from '../training/TrainingModels';
import { getTrainingQuestion, getTrainingSkills, getTrainingTemplates, TRAINING_BANK_SIZE } from '../training/TrainingBank';
import { analyzeDraft } from '../training/TrainingRules';
import { studio } from '../services/StudyController';
import { AIModel, Attempt, Chat, Exercise, Lesson, QuizFeedback, RunSummary, Section, StudyModule, TestOutcome, VideoResource, dateKey } from '../core/Models';
import { NavigationHistory, PageLocation, ScrollPosition, ScrollRestoration, StudyScreen, copyQuizFeedback, copyRunFeedback } from '../core/NavigationState';

class RestoreScrollFrame extends FrameCallback {
  private restore: () => void;
  constructor(restore: () => void) {
    super();
    this.restore = restore;
  }
  // API 12+: onIdle runs after the subsequent frame has rendered, so the new
  // Scroll content has a measured extent before its old offset is restored.
  onIdle(_timeLeftInNano: number): void { this.restore(); }
}

const INK: string = '#202938';
const MUTED: string = '#687386';
const BLUE: string = '#386CE8';
const PALE: string = '#EDF2FF';
const CANVAS: string = '#F5F6F8';
const LINE: string = '#E8ECF2';
const GREEN: string = '#287554';
const AMBER: string = '#94631D';

function blankExercise(): Exercise {
  return { id: '', lessonId: '', type: 'quiz', title: '', prompt: '', hints: [] };
}

@Entry
@ComponentV2
struct Index {
  @Local trainingMode: TrainingMode = 'adaptive';
  @Local trainingSkill: string = '';
  @Local draftDiagnostics: DraftDiagnostic[] = [];
  @Local materialSupported: boolean = false;
  @Local dockFloating: boolean = true;
  private titleMaterial?: uiMaterial.ImmersiveMaterial;
  private dockMaterial?: uiMaterial.ImmersiveMaterial;
  private dockButtonMaterial?: uiMaterial.ImmersiveMaterial;
  private diagnosticTimer: number = -1;
  private pendingDraftId: string = '';
  private pendingDraftCode: string = '';
  @Local tab: number = 0;
  @Local dockTab: number = 0;
  @Local dockPosition: number = 0;
  @Local dockItemWidth: number = 60;
  @Local dockBarWidth: number = 0;
  @Local dockInset: number = 0;
  @Local mainTabsWidth: number = 0;
  @Local pressedTab: number = -1;
  @Local detailTabsWidth: number = 0;
  @Local detailBarWidth: number = 0;
  @Local detailBarPressed: boolean = false;
  private detailBarHeldOffset: number = 0;
  private detailBarHeldSide: string = 'default';
  private rootSession: number = 0;
  private dockDragSource: number = -1;
  private dockTouchX: number = 0;
  private dockWindowX: number = 0;
  private expectedNativeTab: number = 0;
  @Local screen: StudyScreen = StudyScreen.Main;
  @Local lessonId: string = '';
  @Local exerciseId: string = '';
  @Local codeDraft: string = '';
  @Local noteDraft: string = '';
  @Local selectedAnswer: number = -1;
  @Local quizSubmitted: boolean = false;
  @Local runVisible: boolean = false;
  @Local hintCount: number = 0;
  @Local solutionVisible: boolean = false;
  @Local quizFeedback: QuizFeedback = { exerciseId: '', correct: false, explanation: '' };
  @Local runFeedback: RunSummary = { exerciseId: '', status: '', diagnostic: '', tests: [] };
  @Local exerciseFilter: string = 'all';
  @Local reportDay: string = dateKey();
  @Local reportNote: string = '';
  @Local editModel: string = 'deepseek-flash';
  @Local editEffort: string = 'high';
  @Local editDaily: string = '55';
  @Local editAiEnabled: boolean = false;
  @Local keyDraft: string = '';
  @Local chatDraft: string = '';
  @Local chatLessonId: string = '';
  @Local chatExerciseId: string = '';
  @Local includeCode: boolean = false;
  @Local localMessage: string = '';
  @Local dismissedNotice: string = '';
  // Each live root page owns its Scroll; detail pages keep a separate navigation scroll.
  private rootScrollers: Scroller[] = [new Scroller(), new Scroller(), new Scroller(), new Scroller(), new Scroller()];
  private detailScroller: Scroller = new Scroller();
  private get mainScroller(): Scroller {
    return this.screen === StudyScreen.Main ? this.rootScrollers[this.tab] : this.detailScroller;
  }
  private navigation: NavigationHistory = new NavigationHistory();
  private scrollRestoration: ScrollRestoration = new ScrollRestoration();
  private visitId: number = 0;
  private visitSequence: number = 0;

  aboutToAppear(): void {
    studio.setUIContext(this.getUIContext());
    try {
      this.materialSupported = uiMaterial.isImmersiveMaterialSupported();
      if (this.materialSupported) {
        this.titleMaterial = new uiMaterial.ImmersiveMaterial({
          style: uiMaterial.ImmersiveStyle.THIN, materialColor: '#20FFFFFF',
          applyShadow: false, interactive: false, lightEffect: { color: '#EAF2FF' }
        });
        this.dockMaterial = new uiMaterial.ImmersiveMaterial({
          style: uiMaterial.ImmersiveStyle.THIN,
          applyShadow: true, interactive: true, lightEffect: { color: '#EAF2FF' }
        });
        this.dockButtonMaterial = new uiMaterial.ImmersiveMaterial({
          style: uiMaterial.ImmersiveStyle.ULTRA_THIN, materialColor: '#20386CE8',
          applyShadow: false, interactive: true, lightEffect: { color: '#FFFFFF' }
        });
      }
    } catch (_) { this.materialSupported = false; }
    this.dockFloating = materialExperience.enabled;
    this.readSettings();
  }

  aboutToDisappear(): void {
    this.rootSession++;
    this.resetDockState();
    this.flushTrainingDraft();
    this.scrollRestoration.cancel();
    if (this.diagnosticTimer >= 0) clearTimeout(this.diagnosticTimer);
  }

  onBackPress(): boolean {
    if (this.screen !== StudyScreen.Main) {
      this.goBack();
      return true;
    }
    if (this.tab !== 0) {
      this.changeTab(0);
      return true;
    }
    return false;
  }

  private readSettings(): void {
    this.editModel = studio.state.settings.model;
    this.editEffort = studio.state.settings.thinkingMode === 'disabled' ? 'off' : studio.state.settings.reasoningEffort;
    this.editDaily = studio.state.settings.dailyMinutes.toString();
    this.editAiEnabled = studio.state.settings.aiEnabled;
  }

  private materialFor(material?: uiMaterial.ImmersiveMaterial): uiMaterial.Material {
    // undefined keeps native defaults; Material.empty explicitly removes a
    // previously applied material when the independent app preference is off.
    return this.materialSupported && materialExperience.enabled && material ? material : uiMaterial.Material.empty;
  }

  private async setMaterialEnabled(value: boolean): Promise<void> {
    if (!materialExperience.ready || materialExperience.busy || value === materialExperience.enabled) return;
    if (!await materialExperience.setEnabled(value) || this.dockFloating === materialExperience.enabled) return;
    // Commit a new layout subtree only after the preference is safely saved.
    // All draft/history state remains on this Index; restore the current viewport.
    const position: ScrollPosition = this.captureLocation().scroll;
    this.rootSession++;
    this.dockFloating = materialExperience.enabled;
    this.resetDockState();
    this.restoreScrollAfterLayout(position);
  }

  private async resetCurrentLearningData(): Promise<void> {
    if (!await studio.resetLearningData()) return;
    if (this.diagnosticTimer >= 0) clearTimeout(this.diagnosticTimer);
    this.diagnosticTimer = -1;
    this.pendingDraftId = ''; this.pendingDraftCode = ''; this.draftDiagnostics = [];
    this.codeDraft = ''; this.noteDraft = ''; this.reportNote = ''; this.chatDraft = '';
    this.lessonId = ''; this.exerciseId = ''; this.chatLessonId = ''; this.chatExerciseId = '';
    this.includeCode = false; this.selectedAnswer = -1; this.quizSubmitted = false; this.runVisible = false;
    this.hintCount = 0; this.solutionVisible = false; this.exerciseFilter = 'all';
    this.trainingSkill = ''; this.trainingMode = 'adaptive';
    this.quizFeedback = { exerciseId: '', correct: false, explanation: '' };
    this.runFeedback = { exerciseId: '', status: '', diagnostic: '', tests: [] };
    this.dismissedNotice = ''; this.localMessage = '';
    this.navigation.clear(); this.readSettings(); this.changeTab(4);
  }

  private handStatusText(): string {
    if (!handExperience.enabled) return '当前识别：已关闭';
    if (handExperience.status === 'active' && handExperience.side === 'left') return '当前识别：稳定左手握持';
    if (handExperience.status === 'active' && handExperience.side === 'right') return '当前识别：稳定右手握持';
    if (handExperience.status === 'paused') return '当前识别：前台恢复后继续感知';
    if (handExperience.status === 'waiting') return '当前识别：等待稳定的单手握持';
    return '当前识别：暂未识别，请查看下方状态说明';
  }

  private isDetailSession(session: number): boolean {
    return this.screen !== StudyScreen.Main && session === this.rootSession;
  }

  private detailDockOffset(): number {
    if (!Number.isFinite(this.detailTabsWidth) || !Number.isFinite(this.detailBarWidth) ||
      this.detailTabsWidth <= 0 || this.detailBarWidth <= 0) return 0;
    const reach: number = Math.max(0, (this.detailTabsWidth - this.detailBarWidth) / 2 - 16);
    if (reach === 0) return 0;
    if (this.detailBarPressed) return Math.max(-reach, Math.min(reach, this.detailBarHeldOffset));
    if (!handExperience.enabled) return 0;
    return handExperience.side === 'left' ? -reach : handExperience.side === 'right' ? reach : 0;
  }

  private detailBarModifier(session: number): CommonModifier {
    const modifier: CommonModifier = new CommonModifier();
    modifier.systemMaterial(materialExperience.defaultMaterial());
    // Always provide x, including zero: an undefined modifier retains old native
    // properties. Move only the native bar, preserving content and material.
    modifier.translate({ x: this.dockFloating ? this.detailDockOffset() : 0 });
    modifier.onAreaChange((_old: Area, area: Area) => {
      const width: number = Number(area.width);
      if (this.isDetailSession(session) && Number.isFinite(width) && width > 0) this.detailBarWidth = width;
    });
    return modifier;
  }

  private pressDetailBar(session: number): void {
    if (!this.isDetailSession(session) || this.detailBarPressed) return;
    this.detailBarHeldOffset = this.detailDockOffset();
    this.detailBarHeldSide = handExperience.enabled ? handExperience.side : 'default';
    this.detailBarPressed = true;
  }

  private releaseDetailBar(session: number): void {
    if (this.isDetailSession(session)) this.detailBarPressed = false;
  }

  private fixedBackAlignment(): FlexAlign {
    const side: string = this.detailBarPressed ? this.detailBarHeldSide :
      handExperience.enabled ? handExperience.side : 'default';
    return side === 'left' ? FlexAlign.Start : side === 'right' ? FlexAlign.End : FlexAlign.Center;
  }

  private changeTab(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > 4) return;
    this.expectedNativeTab = index;
    // Re-selecting the current root tab must preserve its scroll position and drafts.
    if (this.screen === StudyScreen.Main && index === this.tab) { this.moveDockTo(index); return; }
    const returningToRoot: boolean = this.screen !== StudyScreen.Main;
    // Root pages keep independent Scrollers. Switching them must not synchronously
    // save a training draft or reset their previous scroll positions.
    if (returningToRoot) { this.flushTrainingDraft(); this.rootSession++; }
    this.scrollRestoration.cancel();
    this.tab = index;
    this.screen = StudyScreen.Main;
    if (returningToRoot) this.resetDockState(); else this.moveDockTo(index);
    this.navigation.clear();
    this.visitId = ++this.visitSequence;
    this.localMessage = '';
    if (index === 3) {
      this.readSettings();
      if (!this.chatLessonId) this.chatLessonId = studio.nextLesson().id;
    }
    if (returningToRoot) this.restoreScrollAfterLayout({ x: 0, y: 0 });
  }

  private moveDockTo(index: number, animate: boolean = true): void {
    const target: number = Math.max(0, Math.min(4, index));
    if (!Number.isFinite(target) || target === this.dockPosition) return;
    // Re-target the same property immediately. There is no animation queue and
    // no completion callback able to overwrite newer input. Content never waits.
    this.getUIContext().animateTo({ duration: animate ? 160 : 0, curve: Curve.EaseOut }, () => {
      this.dockPosition = target;
      this.dockTab = Math.round(target);
    });
  }

  private resetDockState(): void {
    this.detailBarPressed = false;
    this.detailBarHeldOffset = 0;
    this.detailBarHeldSide = 'default';
    this.dockDragSource = -1;
    this.expectedNativeTab = this.tab;
    this.moveDockTo(this.tab, false);
    this.pressedTab = -1;
  }

  private isRootSession(session: number): boolean {
    return this.screen === StudyScreen.Main && session === this.rootSession;
  }

  private pressDock(index: number, localX: number, session: number): void {
    if (!this.isRootSession(session)) return;
    this.dockTouchX = this.dockInset + index * this.dockItemWidth + localX;
    this.pressedTab = index;
  }

  private startDockDrag(index: number, offset: number, session: number): void {
    if (!this.isRootSession(session)) return;
    this.dockDragSource = index;
    this.updateDockDrag(offset, session);
  }

  private updateDockDrag(offset: number, session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource < 0 || !Number.isFinite(offset)) return;
    this.moveDockTo((this.dockTouchX + offset - this.dockInset) / this.dockItemWidth - 0.5, false);
    this.pressedTab = this.dockTab;
  }

  private finishDockDrag(offset: number, session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource < 0) return;
    this.updateDockDrag(offset, session);
    const target: number = this.dockTab;
    this.dockDragSource = -1;
    this.pressedTab = -1;
    this.changeTab(target);
  }

  private cancelDockDrag(session: number): void {
    if (!this.isRootSession(session)) return;
    this.dockDragSource = -1;
    this.pressedTab = -1;
    this.moveDockTo(this.tab);
  }

  private releaseDockTouch(session: number): void {
    if (!this.isRootSession(session)) return;
    this.pressedTab = -1;
    // A press alone never changes selection, so a vertically cancelled tap does
    // not leave a highlighted destination that was never actually selected.
  }

  private dockIndexAt(x: number): number {
    return Math.max(0, Math.min(4, Math.floor((x - this.dockInset) / this.dockItemWidth)));
  }

  private clickDock(index: number, session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource >= 0) return;
    this.pressedTab = -1;
    this.changeTab(index);
  }

  private nativeTabSelected(index: number, session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource >= 0 || this.pressedTab >= 0) return;
    if (!Number.isInteger(index) || index < 0 || index > 4) return;
    // onSelected also covers keyboard/accessibility navigation. The SDK forbids
    // writing Tabs.index here, so only record intent and preview its decoration.
    this.expectedNativeTab = index;
    this.moveDockTo(index);
  }

  private nativeTabChanged(index: number, session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource >= 0 || this.pressedTab >= 0) return;
    // A delayed native completion must not undo a newer click or dock release.
    if (this.expectedNativeTab >= 0 && index !== this.expectedNativeTab) return;
    if (index !== this.tab) this.changeTab(index);
    else this.moveDockTo(index);
  }

  private nativeSwipeStarted(session: number): void {
    if (!this.isRootSession(session) || this.dockDragSource >= 0 || this.pressedTab >= 0) return;
    this.expectedNativeTab = -1;
  }

  private navigate(destination: StudyScreen): void {
    this.flushTrainingDraft();
    this.navigation.push(this.captureLocation());
    if (this.screen === StudyScreen.Main) this.rootSession++;
    this.visitId = ++this.visitSequence;
    this.screen = destination;
    this.resetDockState();
    this.localMessage = '';
    this.restoreScrollAfterLayout({ x: 0, y: 0 });
  }

  private goBack(): void {
    this.flushTrainingDraft();
    const previous: PageLocation | undefined = this.navigation.back();
    if (!previous) {
      this.changeTab(this.tab);
      return;
    }
    this.screen = previous.screen;
    this.tab = previous.tab;
    if (previous.screen === StudyScreen.Main) this.rootSession++;
    this.resetDockState();
    this.visitId = previous.visitId;
    this.lessonId = previous.lessonId;
    this.exerciseId = previous.exerciseId;
    this.codeDraft = previous.codeDraft;
    this.noteDraft = previous.noteDraft;
    this.selectedAnswer = previous.selectedAnswer;
    this.quizSubmitted = previous.quizSubmitted;
    this.runVisible = previous.runVisible;
    this.hintCount = previous.hintCount;
    this.solutionVisible = previous.solutionVisible;
    this.quizFeedback = previous.quizFeedback;
    this.runFeedback = previous.runFeedback;
    this.trainingMode = previous.trainingMode as TrainingMode;
    this.trainingSkill = previous.trainingSkill;
    this.draftDiagnostics = this.screen === StudyScreen.Training ? analyzeDraft(this.codeDraft) : [];
    this.exerciseFilter = previous.exerciseFilter;
    this.reportDay = previous.reportDay;
    this.reportNote = previous.reportNote;
    this.editModel = previous.editModel;
    this.editEffort = previous.editEffort;
    this.editDaily = previous.editDaily;
    this.editAiEnabled = previous.editAiEnabled;
    this.chatDraft = previous.chatDraft;
    this.chatLessonId = previous.chatLessonId;
    this.chatExerciseId = previous.chatExerciseId;
    this.includeCode = previous.includeCode;
    this.localMessage = previous.localMessage;
    this.dismissedNotice = previous.dismissedNotice;
    this.keyDraft = '';
    this.restoreScrollAfterLayout(previous.scroll);
  }

  private captureLocation(): PageLocation {
    const current: OffsetResult = this.mainScroller.currentOffset();
    return {
      screen: this.screen, tab: this.tab, visitId: this.visitId,
      lessonId: this.lessonId, exerciseId: this.exerciseId,
      scroll: this.scrollRestoration.capture({ x: current.xOffset, y: current.yOffset }),
      codeDraft: this.codeDraft, noteDraft: this.noteDraft,
      selectedAnswer: this.selectedAnswer, quizSubmitted: this.quizSubmitted,
      runVisible: this.runVisible, hintCount: this.hintCount, solutionVisible: this.solutionVisible,
      quizFeedback: this.quizFeedback, runFeedback: this.runFeedback,
      trainingMode: this.trainingMode, trainingSkill: this.trainingSkill,
      exerciseFilter: this.exerciseFilter, reportDay: this.reportDay, reportNote: this.reportNote,
      editModel: this.editModel, editEffort: this.editEffort, editDaily: this.editDaily, editAiEnabled: this.editAiEnabled,
      chatDraft: this.chatDraft, chatLessonId: this.chatLessonId, chatExerciseId: this.chatExerciseId, includeCode: this.includeCode,
      localMessage: this.localMessage, dismissedNotice: this.dismissedNotice
    };
  }

  private restoreScrollAfterLayout(position: ScrollPosition): void {
    const generation: number = this.scrollRestoration.request(position);
    this.getUIContext().postFrameCallback(new RestoreScrollFrame(() => {
      const target: ScrollPosition | undefined = this.scrollRestoration.consume(generation);
      if (target) this.mainScroller.scrollTo({ xOffset: target.x, yOffset: target.y, animation: false });
    }));
  }

  private openLesson(id: string): void {
    this.navigate(StudyScreen.Lesson);
    this.lessonId = id;
    this.noteDraft = studio.state.notes[id] ?? '';
  }

  private openExercise(id: string): void {
    this.navigate(StudyScreen.Exercise);
    this.exerciseId = id;
    const exercise: Exercise = this.currentExercise();
    this.lessonId = exercise.lessonId;
    this.codeDraft = studio.state.drafts[id] ?? exercise.starter ?? '';
    this.selectedAnswer = -1;
    this.quizSubmitted = false;
    this.runVisible = false;
    this.hintCount = 0;
    this.solutionVisible = false;
    this.quizFeedback = { exerciseId: '', correct: false, explanation: '' };
    this.runFeedback = { exerciseId: '', status: '', diagnostic: '', tests: [] };
  }

  private openReport(): void {
    this.navigate(StudyScreen.Report);
    this.reportDay = studio.today();
    this.reportNote = studio.state.reports[this.reportDay]?.note ?? '';
  }

  private openSettings(): void {
    this.navigate(StudyScreen.Settings);
    this.readSettings();
    this.keyDraft = '';
  }

  private submitCurrentQuiz(): void {
    if (this.screen === StudyScreen.Training) {
      const feedback = studio.submitTrainingQuiz(this.exerciseId, this.selectedAnswer);
      if (feedback) { this.quizFeedback = feedback; this.quizSubmitted = true; }
      return;
    }
    const previous: QuizFeedback = studio.lastQuiz;
    studio.submitQuiz(this.exerciseId, this.selectedAnswer);
    if (studio.lastQuiz !== previous && studio.lastQuiz.exerciseId === this.exerciseId) {
      this.quizFeedback = copyQuizFeedback(studio.lastQuiz);
      this.quizSubmitted = true;
    }
  }

  private async runCurrentCode(): Promise<void> {
    if (studio.runBusy) return;
    const visit: number = this.visitId;
    const id: string = this.exerciseId;
    if (this.screen === StudyScreen.Training) {
      this.runVisible = true;
      this.runFeedback = { exerciseId: id, status: 'running', diagnostic: '正在本机执行…', tests: [] };
      const result = await studio.runTrainingCode(id, this.codeDraft);
      if (!result && this.visitId === visit && this.exerciseId === id) this.runVisible = false;
      if (result) {
        if (this.visitId === visit && this.screen === StudyScreen.Training && this.exerciseId === id) this.runFeedback = result;
        else this.navigation.receiveRun(visit, result);
      }
      return;
    }
    const previous: RunSummary = studio.lastRun;
    const pending: Promise<void> = studio.runCode(id, this.codeDraft);
    if (studio.lastRun !== previous && studio.lastRun.exerciseId === id) {
      this.runVisible = true;
      this.runFeedback = copyRunFeedback(studio.lastRun);
    }
    await pending;
    if (studio.lastRun === previous || studio.lastRun.exerciseId !== id) return;
    const result: RunSummary = copyRunFeedback(studio.lastRun);
    if (this.visitId === visit && this.screen === StudyScreen.Exercise && this.exerciseId === id) this.runFeedback = result;
    else this.navigation.receiveRun(visit, result);
  }

  private currentExercise(): Exercise {
    if (this.screen === StudyScreen.Training) {
      const q = getTrainingQuestion(this.exerciseId);
      if (q) return { id: q.id, lessonId: '', type: q.type, title: q.title, prompt: q.prompt,
        choices: q.choices, answer: q.answer, starter: q.starter, solution: q.solution,
        tests: q.tests, hints: q.hints, explanation: q.explanation };
    }
    return studio.curriculum.exercises.find((item: Exercise) => item.id === this.exerciseId) ?? blankExercise();
  }

  private currentLesson(): Lesson { return studio.getLesson(this.lessonId); }

  private exerciseContext(): Exercise {
    return studio.curriculum.exercises.find((item: Exercise) => item.id === this.chatExerciseId) ?? blankExercise();
  }

  private moduleLessons(id: string): Lesson[] {
    return studio.availableLessons().filter((lesson: Lesson) => lesson.moduleId === id);
  }

  private lessonResources(): VideoResource[] {
    return studio.curriculum.resources.filter((resource: VideoResource) => this.currentLesson().resourceIds.includes(resource.id));
  }

  private filteredExercises(): Exercise[] {
    return studio.curriculum.exercises.filter((exercise: Exercise) => {
      if (this.exerciseFilter === 'todo') return !studio.isPassed(exercise.id);
      if (this.exerciseFilter === 'code' || this.exerciseFilter === 'quiz') return exercise.type === this.exerciseFilter;
      return true;
    });
  }

  private lessonStatus(lesson: Lesson): string {
    const passed: number = studio.lessonProgress(lesson.id).passedExercises.length;
    if (passed >= lesson.exerciseIds.length && lesson.exerciseIds.length > 0) return '已完成';
    return passed > 0 ? `${passed}/${lesson.exerciseIds.length} 练习` : `${lesson.minutes} 分钟`;
  }

  private exerciseStatus(exercise: Exercise): string {
    if (studio.lessonProgress(exercise.lessonId).independentExercises.includes(exercise.id)) return '独立通过';
    if (studio.isPassed(exercise.id)) return '助学通过';
    if (studio.isAssisted(exercise.id)) return '已用助学';
    return exercise.type === 'code' ? '代码练习' : '概念自测';
  }

  private completedLessons(): number {
    return studio.availableLessons().filter((lesson: Lesson) => studio.lessonProgress(lesson.id).status === 'completed').length;
  }

  private independentCount(): number {
    return studio.curriculum.exercises.filter((exercise: Exercise) => studio.lessonProgress(exercise.lessonId).independentExercises.includes(exercise.id)).length;
  }

  private passedExerciseCount(): number {
    return studio.curriculum.exercises.filter((exercise: Exercise) => studio.isPassed(exercise.id)).length;
  }

  private timerLabel(): string {
    const minutes: number = Math.floor(studio.timerSeconds / 60);
    const seconds: number = studio.timerSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private recentDays(): string[] {
    const dates: string[] = [];
    for (let offset: number = 0; offset < 7; offset++) dates.push(dateKey(new Date(Date.now() - offset * 86400000)));
    return dates;
  }

  private reportAttempts(): Attempt[] {
    return studio.state.attempts.filter((attempt: Attempt) => attempt.date === this.reportDay);
  }

  private reportPassed(): number {
    return this.reportAttempts().filter((attempt: Attempt) => attempt.status === 'passed' || attempt.status === 'correct').length;
  }

  private reportLessons(): Lesson[] {
    return studio.availableLessons().filter((lesson: Lesson) => studio.state.sessions.some((session) => session.date === this.reportDay && session.lessonId === lesson.id) || this.reportAttempts().some((attempt: Attempt) => attempt.lessonId === lesson.id));
  }

  private chooseReportDay(day: string): void {
    this.reportDay = day;
    this.reportNote = studio.state.reports[day]?.note ?? '';
    this.localMessage = '';
  }

  private availableModels(): AIModel[] {
    if (studio.modelOptions.length > 0) return studio.modelOptions;
    return [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', levels: ['high', 'max'] }, { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', levels: ['high', 'max'] }];
  }

  private effortOptions(): string[] {
    const model: AIModel | undefined = this.availableModels().find((item: AIModel) => item.id === this.editModel);
    const levels: string[] = model?.levels ?? [];
    return ['off', ...levels.filter((level: string) => level !== 'off')];
  }

  private effortLabel(level: string): string {
    if (level === 'off') return '关闭思考';
    if (level === 'low') return '轻量';
    if (level === 'high') return '深入';
    if (level === 'max') return '最强';
    return level;
  }

  private selectModel(id: string): void {
    this.editModel = id;
    if (!this.effortOptions().includes(this.editEffort)) this.editEffort = this.effortOptions()[0];
  }

  private saveSettings(): boolean {
    const requested: number = Number(this.editDaily);
    if (!Number.isFinite(requested) || requested < 20 || requested > 120) {
      this.localMessage = '每日目标请填写 20～120 分钟。';
      return false;
    }
    if (studio.aiBusy || studio.credentialBusy) {
      this.localMessage = '请等当前请求结束，再修改 AI 设置。';
      return false;
    }
    if (!this.effortOptions().includes(this.editEffort)) {
      this.localMessage = '请选择当前模型支持的思考强度。';
      return false;
    }
    this.localMessage = '';
    this.dismissedNotice = '';
    return studio.saveAISettings(this.editModel, this.editEffort, Math.round(requested), this.editAiEnabled);
  }

  private async storeKey(): Promise<void> {
    if (studio.aiBusy || studio.credentialBusy) return;
    if (this.keyDraft.trim().length === 0) {
      this.localMessage = '请先粘贴你自己的 DeepSeek API Key。';
      return;
    }
    this.localMessage = '';
    this.dismissedNotice = '';
    await studio.saveApiKey(this.keyDraft.trim());
    if (studio.hasApiKey) {
      this.keyDraft = '';
      this.readSettings();
    }
  }

  private async sendQuestion(): Promise<void> {
    if (!this.chatDraft.trim() || studio.aiBusy || studio.credentialBusy) return;
    const message: string = this.chatDraft.trim();
    if (!this.saveSettings()) return;
    if (!this.editAiEnabled || !studio.hasApiKey) {
      this.localMessage = '先在设置中保存手机端密钥，并开启 AI。';
      return;
    }
    const previousChatCount: number = studio.state.chats.length;
    await studio.ask(message, this.effectiveChatLessonId(), this.chatExerciseId, this.includeCode && this.exerciseContext().type === 'code');
    if (studio.state.chats.length > previousChatCount && this.chatDraft.trim() === message) this.chatDraft = '';
  }

  private askAboutExercise(): void {
    const lesson = this.lessonId;
    const exercise = this.exerciseId;
    this.navigate(StudyScreen.Assistant);
    this.readSettings();
    this.chatLessonId = lesson;
    this.chatExerciseId = exercise;
    this.includeCode = false;
    this.chatDraft = '请先给我一个思路提示，不要直接告诉我答案。';
  }

  private returnToLesson(): void {
    const previous = this.navigation.peek();
    if (previous && previous.screen === StudyScreen.Lesson && previous.lessonId === this.lessonId) this.goBack();
    else this.openLesson(this.lessonId);
  }

  private trainingSkills(): TrainingSkill[] { return getTrainingSkills(); }
  private trainingLevels(): TrainingMode[] {
    const skill = this.trainingSkills().find((item: TrainingSkill) => item.id === this.trainingSkill);
    return skill ? ['adaptive', ...skill.levels] : ['adaptive', 1, 2, 3];
  }
  private levelTitle(mode: TrainingMode): string {
    return mode === 'adaptive' ? '跟随掌握程度' : mode === 1 ? '入门' : mode === 2 ? '巩固' : '挑战';
  }
  private trainingSkillTitle(): string {
    return this.trainingSkills().find((item: TrainingSkill) => item.id === this.trainingSkill)?.title ?? '全部知识点';
  }
  private openTraining(): void {
    this.navigate(StudyScreen.Training);
    const saved = getTrainingQuestion(studio.state.training.lastQuestionId);
    if (saved) this.adoptTraining(saved);
    else this.drawTraining();
  }
  private adoptTraining(question: TrainingQuestion): void {
    this.flushTrainingDraft();
    this.visitId = ++this.visitSequence;
    this.exerciseId = question.id;
    this.codeDraft = studio.state.training.drafts[question.id] ?? question.starter;
    this.selectedAnswer = -1; this.quizSubmitted = false; this.runVisible = false;
    this.hintCount = 0; this.solutionVisible = false;
    this.quizFeedback = { exerciseId: '', correct: false, explanation: '' };
    this.runFeedback = { exerciseId: '', status: '', diagnostic: '', tests: [] };
    this.draftDiagnostics = analyzeDraft(this.codeDraft);
    this.restoreScrollAfterLayout({ x: 0, y: 0 });
  }
  private drawTraining(): void {
    const question = studio.selectTraining(this.trainingMode, this.trainingSkill);
    if (question) this.adoptTraining(question);
  }
  private async drawAIVariant(): Promise<void> {
    const visit = this.visitId;
    const question = await studio.generateTrainingVariant(this.trainingMode, this.trainingSkill);
    if (question && this.visitId === visit && this.screen === StudyScreen.Training) this.adoptTraining(question);
  }
  private updateCode(value: string): void {
    this.codeDraft = value; this.dismissedNotice = '';
    if (this.screen !== StudyScreen.Training) { studio.saveDraft(this.exerciseId, value); return; }
    if (this.diagnosticTimer >= 0) clearTimeout(this.diagnosticTimer);
    const id = this.exerciseId;
    const visit = this.visitId;
    this.pendingDraftId = id; this.pendingDraftCode = value;
    this.diagnosticTimer = setTimeout(() => {
      this.flushTrainingDraft();
      if (this.visitId === visit && this.screen === StudyScreen.Training && this.exerciseId === id) this.draftDiagnostics = analyzeDraft(value);
    }, 450);
  }
  private flushTrainingDraft(): void {
    if (this.pendingDraftId) {
      if (studio.saveTrainingDraft(this.pendingDraftId, this.pendingDraftCode)) {
        this.pendingDraftId = ''; this.pendingDraftCode = '';
      }
    }
  }
  private trainingHelp(): boolean { return studio.trainingHelp(this.exerciseId); }
  private async openVideoResource(resource: VideoResource): Promise<void> {
    try {
      const decision = await this.getUIContext().getPromptAction().showDialog({
        title: '即将打开 B 站视频',
        systemMaterial: materialExperience.defaultMaterial(),
        message: `UP 主：${resource.author}\n视频：${resource.title}\n类型：${resource.kind}\n${resource.note}\n\n链接：${resource.url}`,
        buttons: [{ text: '留在课程', color: '#687386' }, { text: '打开这个视频', color: '#386CE8' }]
      });
      if (decision.index === 1) studio.openVideo(resource.url);
    } catch (_) { this.localMessage = '暂时无法打开视频，请稍后重试。'; }
  }
  private trainingPasses(): number {
    return studio.state.training.attempts.filter((item) => item.status === 'passed' && !item.assisted).length;
  }

  private effectiveChatLessonId(): string { return this.chatLessonId || studio.nextLesson().id; }

  private relevantChats(): Chat[] {
    return studio.state.chats.filter((chat: Chat) => chat.lessonId === this.effectiveChatLessonId()).slice(-16);
  }

  private chatLessonOptions(): SelectOption[] {
    return studio.availableLessons().map((lesson: Lesson): SelectOption => ({ value: lesson.title }));
  }

  private chatExerciseOptions(): SelectOption[] {
    return [{ value: '仅讨论课程概念' }, ...studio.lessonExercises(this.effectiveChatLessonId()).map((exercise: Exercise): SelectOption => ({ value: exercise.title }))];
  }

  private screenTitle(): string {
    if (this.screen === StudyScreen.Training) return '进阶练习';
    if (this.screen === StudyScreen.Assistant) return '问问 AI';
    if (this.screen === StudyScreen.Lesson) return '课程学习';
    if (this.screen === StudyScreen.Exercise) return '动手练习';
    if (this.screen === StudyScreen.Review) return '温故知新';
    if (this.screen === StudyScreen.Report) return '学习日报';
    if (this.screen === StudyScreen.Settings) return '设置';
    return '隐私与学习边界';
  }

  @Styles
  panel() {
    .width('100%')
    .padding(18)
    .backgroundColor(Color.White)
    .borderRadius(22)
  }

  @Builder
  caption(text: () => string) {
    Text(text()).fontSize(14).fontColor(MUTED).lineHeight(21)
  }

  @Builder
  sectionHeading(title: string, subtitle: string) {
    Column({ space: 7 }) {
      Text(title).fontSize(24).fontWeight(FontWeight.Bold).fontColor(INK)
      if (subtitle.length > 0) Text(subtitle).fontSize(15).fontColor(MUTED).lineHeight(23)
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: 5, bottom: 4 })
  }

  @Builder
  quietTag(label: () => string, color: () => string = () => BLUE) {
    Text(label()).fontSize(12).fontColor(color()).padding({ left: 9, right: 9, top: 5, bottom: 5 })
      .backgroundColor(color() === AMBER ? '#FFF5E2' : color() === GREEN ? '#EBF6EF' : PALE).borderRadius(8)
  }

  @Builder
  primaryButton(label: () => string, selector: string, action: () => void, enabled: () => boolean = () => true) {
    Button(label(), { type: ButtonType.Normal }).fontSize(16).fontWeight(FontWeight.Medium)
      .fontColor(Color.White).backgroundColor(BLUE).height(48).width('100%').borderRadius(14)
      .enabled(enabled()).opacity(enabled() ? 1 : 0.45).id(selector).onClick(action)
  }

  @Builder
  secondaryButton(label: () => string, selector: string, action: () => void, enabled: () => boolean = () => true) {
    Button(label(), { type: ButtonType.Normal }).fontSize(15).fontColor(BLUE).backgroundColor(PALE)
      .height(48).width('100%').borderRadius(13).enabled(enabled()).opacity(enabled() ? 1 : 0.45).id(selector).onClick(action)
  }

  @Builder
  textCode(code: () => string) {
    Text(code()).fontSize(14).fontFamily('monospace').fontColor('#33425C').lineHeight(22)
      .copyOption(CopyOptions.InApp).width('100%').padding(14).backgroundColor('#F0F3F8').borderRadius(12)
  }

  @Builder
  stat(value: () => string, label: string) {
    Column({ space: 5 }) {
      Text(value()).fontSize(25).minFontSize(16).maxFontSize(25).maxLines(1).fontWeight(FontWeight.Bold).fontColor(INK)
      Text(label).fontSize(13).fontColor(MUTED)
    }.layoutWeight(1).alignItems(HorizontalAlign.Start)
  }

  @Builder
  appHeader() {
    Row({ space: 11 }) {
      if (this.screen === StudyScreen.Main) {
        Image($r('app.media.xianxin_icon')).width(38).height(38).borderRadius(12).accessibilityText('闲与 C++ 学习标志')
        Column({ space: 2 }) {
          Text('闲芯').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
          Text('C · STM32 · 一步一步来').fontSize(11).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      } else {
        Button('‹', { type: ButtonType.Normal }).fontSize(30).fontColor(INK).buttonStyle(ButtonStyleMode.TEXTUAL)
          .backgroundColor(this.materialSupported && materialExperience.enabled ? undefined : Color.White)
          .width(48).height(48).borderRadius(12).systemMaterial(this.materialFor(this.titleMaterial)).id('nav-back').accessibilityText('返回上一页').onClick(() => this.goBack())
        Text(this.screenTitle()).fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK).layoutWeight(1)
        if (studio.timerRunning) Text(this.timerLabel()).fontSize(14).fontColor(BLUE)
      }
    }.width('100%').height(72).padding({ left: 20, right: 20 })
  }

  @Builder
  messages() {
    if ((studio.notice.length > 0 && studio.notice !== this.dismissedNotice) || this.localMessage.length > 0) {
      Row({ space: 10 }) {
        Text((this.localMessage.length > 0 ? this.localMessage : '') +
          (studio.notice.length > 0 && studio.notice !== this.dismissedNotice ? `${this.localMessage.length > 0 ? '\n' : ''}${studio.notice}` : '')).fontSize(14).fontColor('#354565')
          .lineHeight(21).layoutWeight(1).id('status-message')
        Button('×', { type: ButtonType.Normal }).fontSize(23).width(48).height(48).padding(0).flexShrink(0)
          .constraintSize({ minWidth: 44, minHeight: 44 }).fontColor(MUTED)
          .backgroundColor(Color.Transparent).accessibilityText('关闭提示').id('dismiss-message').onClick(() => {
            this.localMessage = '';
            this.dismissedNotice = studio.notice;
          })
      }.padding(13).width('100%').backgroundColor(PALE).borderRadius(14)
    }
  }

  @Builder
  lessonCard(lesson: Lesson) {
    Row({ space: 13 }) {
      Text(lesson.order.toString().padStart(2, '0')).fontSize(16).fontWeight(FontWeight.Bold).fontColor(BLUE)
        .width(42).height(42).textAlign(TextAlign.Center).backgroundColor(PALE).borderRadius(13)
      Column({ space: 6 }) {
        Text(lesson.title).fontSize(17).fontWeight(FontWeight.Medium).fontColor(INK)
        Text(lesson.subtitle).fontSize(14).fontColor(MUTED).lineHeight(21)
        Text(this.lessonStatus(lesson)).fontSize(12).fontColor(this.lessonStatus(lesson) === '已完成' ? GREEN : MUTED)
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      Text('›').fontSize(26).fontColor('#A1A9B7')
    }.width('100%').padding(17).backgroundColor(Color.White).borderRadius(19)
      .id(`lesson-${lesson.id}`).accessibilityText(`${lesson.title}，${this.lessonStatus(lesson)}`)
      .onClick(() => this.openLesson(lesson.id))
  }

  @Builder
  exerciseCard(exercise: Exercise) {
    Row({ space: 13 }) {
      Text(exercise.type === 'code' ? '{ }' : '?').fontSize(20).fontWeight(FontWeight.Bold).fontColor(studio.isPassed(exercise.id) ? GREEN : BLUE)
        .width(43).height(43).textAlign(TextAlign.Center).backgroundColor(studio.isPassed(exercise.id) ? '#EBF6EF' : PALE).borderRadius(13)
      Column({ space: 7 }) {
        Text(exercise.title).fontSize(17).fontWeight(FontWeight.Medium).fontColor(INK)
        Text(studio.getLesson(exercise.lessonId).title).fontSize(13).fontColor(MUTED)
        this.quietTag(() => (this.exerciseStatus(exercise)),() => (studio.isPassed(exercise.id) ? GREEN : studio.isAssisted(exercise.id) ? AMBER : BLUE))
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      Text('›').fontSize(26).fontColor('#A1A9B7')
    }.width('100%').padding(17).backgroundColor(Color.White).borderRadius(19).id(`exercise-${exercise.id}`)
      .onClick(() => this.openExercise(exercise.id))
  }

  @Builder
  todayPage() {
    Column({ space: 18 }) {
      Column({ space: 14 }) {
        Text('每天一点，离目标更近一点').fontSize(13).fontColor(BLUE).fontWeight(FontWeight.Medium)
        Text('从第一行 C，\n到一颗真正的芯片。').fontSize(30).fontWeight(FontWeight.Bold).fontColor(INK).lineHeight(41)
        Text(`不必一次学会所有。今天用 ${studio.state.settings.dailyMinutes} 分钟，读一节课，动手试一试。`)
          .fontSize(16).lineHeight(25).fontColor(MUTED)
        this.primaryButton(() => ('继续学习  →'), 'today-continue', () => this.openLesson(studio.nextLesson().id),() => (studio.availableLessons().length > 0))
        Text(`下一课 · ${studio.nextLesson().title}`).fontSize(13).fontColor(MUTED)
      }.panel().alignItems(HorizontalAlign.Start).padding(22)

      Column({ space: 17 }) {
        Row() {
          Text('今日专注').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK).layoutWeight(1)
          Text(studio.today()).fontSize(12).fontColor(MUTED)
        }.width('100%')
        Row() {
          this.stat(() => (`${Math.floor(studio.todaySeconds() / 60)}`), '已学 / 分钟')
          this.stat(() => (`${studio.state.settings.dailyMinutes}`), '每日目标')
          this.stat(() => (`${this.passedExerciseCount()}`), '已通过练习')
        }.width('100%')
        Progress({ value: Math.min(100, studio.todaySeconds() / (studio.state.settings.dailyMinutes * 60) * 100), total: 100, type: ProgressType.Linear })
          .width('100%').color(BLUE).backgroundColor('#E8EDF5').style({ strokeWidth: 7 })
        Row({ space: 12 }) {
          Text(this.timerLabel()).fontSize(24).fontWeight(FontWeight.Medium).fontColor(INK).layoutWeight(1).id('focus-timer')
          Button(studio.timerRunning ? '暂停专注' : '开始专注', { type: ButtonType.Normal }).height(48).fontSize(15)
            .padding({ left: 17, right: 17 }).backgroundColor(PALE).fontColor(BLUE).borderRadius(13).id('timer-toggle')
            .onClick(() => studio.toggleTimer(studio.nextLesson().id))
        }.width('100%')
        this.caption(() => ('计时会记录到当前学习课程；切到后台自动暂停。'))
      }.panel().alignItems(HorizontalAlign.Start)

      Row({ space: 12 }) {
        Column({ space: 9 }) {
          Text('温故知新').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
          Text(`${studio.dueLessons().length} 节课程待复习`).fontSize(14).fontColor(MUTED)
          Text('回顾一下  →').fontSize(14).fontColor(BLUE)
        }.panel().alignItems(HorizontalAlign.Start).layoutWeight(1).id('today-review').onClick(() => this.navigate(StudyScreen.Review))
        Column({ space: 9 }) {
          Text('学习日报').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
          Text('看见每一步积累').fontSize(14).fontColor(MUTED)
          Text('写下收获  →').fontSize(14).fontColor(BLUE)
        }.panel().alignItems(HorizontalAlign.Start).layoutWeight(1).id('today-report').onClick(() => this.openReport())
      }.width('100%')
      this.caption(() => ('无需开发板即可完成当前课程。手机练习使用离线 C 学习解释器；编译与真机验证仍在电脑和开发板上完成。'))
    }.width('100%')
  }

  @Builder
  coursesPage() {
    Column({ space: 16 }) {
      this.sectionHeading('一条清楚的学习路线', 'C 基础 → STM32 原理 → C++ 入门')
      Row() {
        Text(`${studio.availableLessons().length} 节课程`).fontSize(14).fontColor(MUTED).layoutWeight(1)
        Text(`已完成 ${this.completedLessons()} 节`).fontSize(14).fontColor(BLUE)
      }.width('100%')
      ForEach(studio.curriculum.modules, (module: StudyModule) => {
        Column({ space: 12 }) {
          Column({ space: 5 }) {
            Text(module.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
            Text(module.description).fontSize(14).fontColor(MUTED).lineHeight(22)
          }.alignItems(HorizontalAlign.Start).width('100%').padding({ top: 10, bottom: 4 })
          ForEach(this.moduleLessons(module.id), (lesson: Lesson) => { this.lessonCard(lesson) }, (lesson: Lesson) => lesson.id)
        }.width('100%')
      }, (module: StudyModule) => module.id)
    }.width('100%')
  }

  @Builder
  filterButton(label: string, value: string) {
    Button(label, { type: ButtonType.Normal }).fontSize(14).height(48).constraintSize({ minWidth: 48 })
      .padding({ left: 13, right: 13 }).borderRadius(11)
      .fontColor(this.exerciseFilter === value ? Color.White : MUTED).backgroundColor(this.exerciseFilter === value ? BLUE : Color.White)
      .id(`filter-${value}`).onClick(() => { this.exerciseFilter = value; })
  }

  @Builder
  practicePage() {
    Column({ space: 16 }) {
      Column({ space: 13 }) {
        this.quietTag(() => ('新增 · 从入门到挑战'))
        Text('每天练一点，慢慢变熟练').fontSize(22).fontWeight(FontWeight.Bold).fontColor(INK)
        this.caption(() => (`${getTrainingTemplates().length} 类题型 · ${TRAINING_BANK_SIZE} 道基础变式 · 自适应难度`))
        this.primaryButton(() => ('进入进阶练习'), 'training-open', () => this.openTraining())
        this.caption(() => (`近期记录 ${studio.state.training.attempts.length} 次作答，${this.trainingPasses()} 次独立通过。课程必修进度单独计算。`))
      }.panel().alignItems(HorizontalAlign.Start)
      this.sectionHeading('理解以后，亲手试试', '小题目、真实反馈。使用提示会标记为助学，不会冒充独立掌握。')
      Row() {
        this.stat(() => (`${studio.curriculum.exercises.length}`), '全部练习')
        this.stat(() => (`${this.passedExerciseCount()}`), '已经通过')
        this.stat(() => (`${this.independentCount()}`), '独立通过')
      }.panel()
      Row({ space: 7 }) {
        this.filterButton('全部', 'all')
        this.filterButton('待完成', 'todo')
        this.filterButton('写代码', 'code')
        this.filterButton('概念题', 'quiz')
      }.width('100%')
      if (this.filteredExercises().length === 0) {
        Column({ space: 10 }) {
          Text('这一组已经完成了').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
          this.caption(() => ('可以在「全部」中再次练习，检验自己是否独立掌握。'))
        }.panel().alignItems(HorizontalAlign.Start)
      }
      ForEach(this.filteredExercises(), (exercise: Exercise) => { this.exerciseCard(exercise) }, (exercise: Exercise) => exercise.id)
    }.width('100%')
  }

  @Builder
  lessonPage() {
    Column({ space: 17 }) {
      Column({ space: 12 }) {
        this.quietTag(() => (`${this.currentLesson().level} · 约 ${this.currentLesson().minutes} 分钟`))
        Text(this.currentLesson().title).fontSize(27).fontWeight(FontWeight.Bold).fontColor(INK).lineHeight(37)
        Text(this.currentLesson().subtitle).fontSize(16).fontColor(MUTED).lineHeight(25)
        this.secondaryButton(() => (studio.timerRunning ? `正在专注 ${this.timerLabel()} · 暂停` : '开始本课专注计时'), 'lesson-timer', () => studio.toggleTimer(this.lessonId))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 11 }) {
        Text('这节课，你会学到').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
        ForEach(this.currentLesson().objectives, (objective: string) => {
          Row({ space: 9 }) {
            Text('•').fontSize(18).fontColor(BLUE)
            Text(objective).fontSize(16).lineHeight(25).fontColor(INK).layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Top)
        }, (objective: string) => objective)
      }.panel().alignItems(HorizontalAlign.Start)
      ForEach(this.currentLesson().sections, (section: Section) => {
        Column({ space: 13 }) {
          Text(section.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK).lineHeight(29)
          Text(section.body).fontSize(17).lineHeight(28).fontColor('#3D485B').copyOption(CopyOptions.InApp)
          if (section.code) this.textCode(() => (section.code ?? ''))
        }.panel().alignItems(HorizontalAlign.Start)
      }, (section: Section) => section.title)
      Column({ space: 10 }) {
        Text('记住这一点').fontSize(17).fontWeight(FontWeight.Bold).fontColor(BLUE)
        Text(this.currentLesson().takeaway).fontSize(17).fontColor(INK).lineHeight(27)
      }.panel().alignItems(HorizontalAlign.Start).backgroundColor(PALE)
      this.sectionHeading('动手巩固', '完成测试后自动更新课程进度。')
      ForEach(studio.lessonExercises(this.lessonId), (exercise: Exercise) => { this.exerciseCard(exercise) }, (exercise: Exercise) => exercise.id)
      Column({ space: 13 }) {
        Text('我的课堂笔记').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        TextArea({ text: this.noteDraft, placeholder: '用自己的话，写下今天理解了什么…' }).height(160)
          .fontSize(16).fontColor(INK).backgroundColor(CANVAS).borderRadius(12).id('lesson-note')
          .onChange((value: string) => { this.noteDraft = value; })
        this.secondaryButton(() => ('保存笔记'), 'note-save', () => {
          this.localMessage = '';
          this.dismissedNotice = '';
          if (studio.saveNote(this.lessonId, this.noteDraft)) this.localMessage = '课堂笔记已保存。';
        })
      }.panel().alignItems(HorizontalAlign.Start)
      if (this.lessonResources().length > 0) {
        this.sectionHeading('配合视频，换个角度理解', '按知识点选看，无需重复刷完所有教程。')
        ForEach(this.lessonResources(), (resource: VideoResource) => {
          Column({ space: 10 }) {
            this.quietTag(() => (resource.kind))
            Text(resource.title).fontSize(18).fontWeight(FontWeight.Medium).fontColor(INK).lineHeight(27)
            Text(`${resource.author} · ${resource.route}`).fontSize(14).fontColor(MUTED).lineHeight(22)
            Text(resource.note).fontSize(15).fontColor('#4E5C70').lineHeight(24)
            this.caption(() => (`核对日期 ${resource.verifiedDate} · ${resource.verification}`))
            Text(`跳转链接：${resource.url}`).fontSize(12).fontColor(MUTED).copyOption(CopyOptions.InApp).width('100%')
            this.secondaryButton(() => ('打开这个视频  ↗'), `video-${resource.id}`, () => { this.openVideoResource(resource); })
          }.panel().alignItems(HorizontalAlign.Start)
        }, (resource: VideoResource) => resource.id)
      }
      this.caption(() => ('课程原文保留电脑端学习路线。文中「本机 GCC」「F446 工程」指电脑环境；手机端不会执行 GCC 或验证开发板。'))
    }.width('100%')
  }

  @Builder
  quizEditor() {
    Column({ space: 12 }) {
      ForEach(this.currentExercise().choices ?? [], (choice: string, index: number) => {
        Row({ space: 12 }) {
          Text(String.fromCharCode(65 + index)).fontSize(15).fontWeight(FontWeight.Bold).fontColor(this.selectedAnswer === index ? Color.White : MUTED)
            .width(31).height(31).textAlign(TextAlign.Center).backgroundColor(this.selectedAnswer === index ? BLUE : '#E9EDF3').borderRadius(10)
          Text(choice).fontSize(16).lineHeight(25).fontColor(INK).layoutWeight(1)
        }.width('100%').padding(15).backgroundColor(this.selectedAnswer === index ? PALE : CANVAS).borderRadius(14)
          .border({ width: 1, color: this.selectedAnswer === index ? '#AEC3FA' : Color.Transparent })
          .id(`quiz-option-${index}`).onClick(() => { this.selectedAnswer = index; this.quizSubmitted = false; })
      }, (choice: string) => choice)
      this.primaryButton(() => ('提交答案'), 'quiz-submit', () => this.submitCurrentQuiz(),() => (this.selectedAnswer >= 0))
      if (this.quizSubmitted && this.quizFeedback.exerciseId === this.exerciseId) {
        Column({ space: 9 }) {
          Text(this.quizFeedback.correct ? '答对了，继续保持' : '再想一步，你可以的').fontSize(18).fontWeight(FontWeight.Bold)
            .fontColor(this.quizFeedback.correct ? GREEN : AMBER).id('quiz-result')
          Text(this.quizFeedback.explanation).fontSize(16).lineHeight(26).fontColor(INK)
        }.width('100%').padding(16).backgroundColor(this.quizFeedback.correct ? '#EBF6EF' : '#FFF6E6').borderRadius(14).alignItems(HorizontalAlign.Start)
      }
    }.width('100%')
  }

  @Builder
  codeEditor() {
    Column({ space: 13 }) {
      Row() {
        Text('main.c').fontSize(14).fontFamily('monospace').fontColor(MUTED).layoutWeight(1)
        Text('草稿自动保存 · 失败时提示').fontSize(12).fontColor(MUTED)
      }.width('100%')
      TextArea({ text: this.codeDraft, placeholder: '在这里写 C 代码…' }).height(320).maxLength(this.screen === StudyScreen.Training ? 12000 : 60000).fontSize(15).fontFamily('monospace')
        .fontColor('#243652').backgroundColor('#F0F3F8').borderRadius(14).padding(14).id('code-editor')
        .onChange((value: string) => {
          this.updateCode(value);
        })
      if (this.screen === StudyScreen.Training) {
        Text('实时检查 · 静态提示').fontSize(14).fontWeight(FontWeight.Medium).fontColor(BLUE)
        if (this.draftDiagnostics.length === 0) this.caption(() => ('暂未发现常见问题；是否正确，请点击运行检测。'))
        ForEach(this.draftDiagnostics, (item: DraftDiagnostic, index: number) => {
          Text(`第 ${item.line} 行 · ${item.message}`).fontSize(14).lineHeight(22).fontColor(item.severity === 'error' ? AMBER : MUTED)
        }, (item: DraftDiagnostic, index: number) => index.toString() + JSON.stringify(item))
      }
      this.primaryButton(() => (studio.runBusy ? '正在检测…' : '运行检测'), 'code-run', () => { this.runCurrentCode(); },() => (!studio.runBusy && this.codeDraft.trim().length > 0))
      this.caption(() => ('使用手机 C 学习解释器，在本机离线执行受限语法与题目测试。它不是 GCC，也不连接 STM32；不支持的语法会明确报错。'))
      if (this.runVisible && this.runFeedback.exerciseId === this.exerciseId && this.runFeedback.status !== 'running') {
        Column({ space: 12 }) {
          Text(this.runFeedback.status === 'passed' ? '所有测试通过' : '运行反馈').fontSize(19).fontWeight(FontWeight.Bold)
            .fontColor(this.runFeedback.status === 'passed' ? GREEN : AMBER).id('run-status')
          if (this.runFeedback.diagnostic.length > 0) {
            Text(this.runFeedback.diagnostic).fontSize(15).lineHeight(24).fontColor(INK).copyOption(CopyOptions.InApp).id('run-diagnostic')
          }
          ForEach(this.runFeedback.tests, (test: TestOutcome, index: number) => {
            Column({ space: 8 }) {
              Text(`${test.passed ? '✓' : '○'} 测试 ${index + 1} · ${test.passed ? '通过' : '尚未通过'}`).fontSize(16)
                .fontWeight(FontWeight.Medium).fontColor(test.passed ? GREEN : AMBER)
              this.caption(() => ('输入'))
              this.textCode(() => (test.input.length > 0 ? test.input : '（无输入）'))
              this.caption(() => ('预期输出'))
              this.textCode(() => (test.expected.length > 0 ? test.expected : '（空）'))
              this.caption(() => ('实际输出'))
              this.textCode(() => (test.actual.length > 0 ? test.actual : '（空）'))
            }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: 8, bottom: 8 }).id(`run-test-${index}`)
          }, (test: TestOutcome, index: number) => index.toString() + JSON.stringify(test))
        }.width('100%').padding(16).backgroundColor('#F7F9FC').borderRadius(15).alignItems(HorizontalAlign.Start)
      }
    }.width('100%')
  }

  @Builder
  exercisePage() {
    Column({ space: 17 }) {
      Column({ space: 13 }) {
        this.quietTag(() => (this.exerciseStatus(this.currentExercise())),() => (studio.isPassed(this.exerciseId) ? GREEN : BLUE))
        Text(this.currentExercise().title).fontSize(26).fontWeight(FontWeight.Bold).fontColor(INK)
        Text(this.currentExercise().prompt).fontSize(17).lineHeight(28).fontColor('#3D485B')
        Text(`来自「${this.currentLesson().title}」`).fontSize(13).fontColor(MUTED)
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 14 }) {
        if (this.currentExercise().type === 'code') this.codeEditor()
        else this.quizEditor()
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 13 }) {
        Text('卡住也没关系').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        this.caption(() => ('先试一试自己的想法。查看提示或答案后，本题会保留助学标记。'))
        ForEach(this.currentExercise().hints.slice(0, this.hintCount), (hint: string, index: number) => {
          Text(`${index + 1}. ${hint}`).fontSize(16).lineHeight(26).fontColor('#4C5B71').width('100%')
        }, (hint: string) => hint)
        if (this.hintCount < this.currentExercise().hints.length) {
          this.secondaryButton(() => (`给我一点提示（${this.hintCount}/${this.currentExercise().hints.length}）`), 'hint-next', () => {
            this.localMessage = '';
            this.dismissedNotice = '';
            if (studio.markHint(this.exerciseId)) this.hintCount++;
          })
        }
        if (this.currentExercise().type === 'code' && !this.solutionVisible) {
          Button('查看参考解法 · 记为助学', { type: ButtonType.Normal }).fontSize(14).height(48).fontColor(MUTED)
            .backgroundColor(Color.Transparent).width('100%').id('solution-show').onClick(() => {
              this.localMessage = '';
              this.dismissedNotice = '';
              if (studio.markHint(this.exerciseId)) this.solutionVisible = true;
            })
        }
        if (this.solutionVisible) {
          this.textCode(() => (this.currentExercise().solution ?? ''))
          Text(this.currentExercise().explanation ?? '').fontSize(15).lineHeight(24).fontColor(MUTED)
        }
        this.secondaryButton(() => ('带着这道题问问 AI'), 'exercise-ask-ai', () => this.askAboutExercise())
      }.panel().alignItems(HorizontalAlign.Start)
      this.secondaryButton(() => ('返回这节课，重新理解'), 'exercise-to-lesson', () => this.returnToLesson())
    }.width('100%')
  }

  @Builder
  trainingPage() {
    Column({ space: 16 }) {
      this.sectionHeading('练会一道，再向前一步', '先选知识点和难度，再抽题。答错后看提示，理解后换一道重新尝试。')
      Column({ space: 12 }) {
        Select([{ value: '全部知识点' }, ...this.trainingSkills().map((item: TrainingSkill): SelectOption => ({ value: item.title }))])
          .systemMaterial(materialExperience.defaultMaterial()).menuSystemMaterial(materialExperience.defaultMaterial())
          .value(this.trainingSkillTitle()).width('100%').height(48).id('training-skill')
          .onSelect((index: number) => { this.trainingSkill = index === 0 ? '' : this.trainingSkills()[index - 1].id; this.trainingMode = 'adaptive'; })
        Select(this.trainingLevels().map((item: TrainingMode): SelectOption => ({ value: this.levelTitle(item) })))
          .systemMaterial(materialExperience.defaultMaterial()).menuSystemMaterial(materialExperience.defaultMaterial())
          .value(this.levelTitle(this.trainingMode)).width('100%').height(48).id('training-level')
          .onSelect((index: number) => { this.trainingMode = this.trainingLevels()[index]; })
        this.primaryButton(() => ('随机抽一道'), 'training-next', () => this.drawTraining(),() => (!studio.runBusy && !studio.aiBusy))
        this.secondaryButton(() => (studio.aiBusy ? '正在生成变式…' : '让 AI 出一道变式'), 'training-ai', () => { this.drawAIVariant(); },() => (!studio.runBusy && !studio.aiBusy && !studio.credentialBusy && this.trainingSkill !== 'stm32'))
        this.caption(() => ('随机题离线可用。AI 变式使用已保存的模型与思考强度，仅发送知识点、难度和近期表现摘要；需要联网并产生 API 用量。'))
      }.panel().alignItems(HorizontalAlign.Start)
      if (this.currentExercise().id) {
        Column({ space: 13 }) {
          this.quietTag(() => (`${this.levelTitle(getTrainingQuestion(this.exerciseId)?.level ?? 1)} · ${this.currentExercise().type === 'code' ? '编程题' : '选择题'} · ${(getTrainingQuestion(this.exerciseId)?.seed ?? 0) >= 12 ? 'AI 选参变式' : '离线题库'}`))
          Text(this.currentExercise().title).fontSize(25).fontWeight(FontWeight.Bold).fontColor(INK)
          Text(this.currentExercise().prompt).fontSize(17).lineHeight(28).fontColor(INK)
          if (studio.state.training.assistedQuestionIds.includes(this.exerciseId)) this.quietTag(() => ('本题已使用助学'),() => (AMBER))
          if (this.currentExercise().type === 'code') this.codeEditor()
          else this.quizEditor()
        }.panel().alignItems(HorizontalAlign.Start)
        Column({ space: 12 }) {
          Text('一步一步拆开想').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
          ForEach(this.currentExercise().hints.slice(0, this.hintCount), (hint: string) => {
            Text(hint).fontSize(16).lineHeight(26).fontColor(MUTED)
          }, (hint: string) => hint)
          if (this.hintCount < this.currentExercise().hints.length) this.secondaryButton(() => ('给我下一步提示'), 'training-hint', () => { if (this.trainingHelp()) this.hintCount++; })
          if (!this.solutionVisible) this.secondaryButton(() => ('查看讲解 · 记为助学'), 'training-solution', () => { if (this.trainingHelp()) this.solutionVisible = true; })
          if (this.solutionVisible) {
            if (this.currentExercise().type === 'code') this.textCode(() => (this.currentExercise().solution ?? ''))
            Text(this.currentExercise().explanation ?? '').fontSize(16).lineHeight(26).fontColor(INK)
          }
          this.caption(() => ('实时提示不会给分；提交或运行后才记录成绩。自适应会参考近期独立作答，使用提示后保留助学标记。保留最近 1000 次训练记录。'))
        }.panel().alignItems(HorizontalAlign.Start)
      }
    }.width('100%')
  }

  @Builder
  reviewPage() {
    Column({ space: 16 }) {
      this.sectionHeading('想得起来，才算学进去', '已完成课程隔天进入复习。先回忆，再读笔记，最后独立重做一道题。')
      Row() {
        this.stat(() => (`${studio.dueLessons().length}`), '待复习课程')
        this.stat(() => (`${this.completedLessons()}`), '已完成课程')
      }.panel()
      if (studio.dueLessons().length === 0) {
        Column({ space: 13 }) {
          Text('今天没有到期的复习').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
          this.caption(() => ('完成一节课的练习后，隔天再回来看看。现在也可以主动回顾学习路线中的任何课程。'))
          this.secondaryButton(() => ('去课程看看'), 'review-courses', () => this.changeTab(1))
        }.panel().alignItems(HorizontalAlign.Start)
      }
      ForEach(studio.dueLessons(), (lesson: Lesson) => { this.lessonCard(lesson) }, (lesson: Lesson) => lesson.id)
      Column({ space: 9 }) {
        Text('一个小方法').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
        Text('合上课程，试着用三句话讲清概念。说不顺的地方，就是这次复习最值得花时间的地方。')
          .fontSize(16).lineHeight(27).fontColor(MUTED)
      }.panel().alignItems(HorizontalAlign.Start).backgroundColor(PALE)
    }.width('100%')
  }

  @Builder
  reportPage() {
    Column({ space: 16 }) {
      this.sectionHeading('今天的努力，有迹可循', '统计来自实际计时和作答记录。你也可以补写最近七天的收获。')
      Scroll() {
        Row({ space: 8 }) {
          ForEach(this.recentDays(), (day: string, index: number) => {
            Button(index === 0 ? '今天' : day.slice(5), { type: ButtonType.Normal }).height(48)
              .constraintSize({ minWidth: 48 }).fontSize(14).borderRadius(11)
              .padding({ left: 14, right: 14 }).fontColor(this.reportDay === day ? Color.White : MUTED)
              .backgroundColor(this.reportDay === day ? BLUE : Color.White).id(`report-day-${index}`).onClick(() => this.chooseReportDay(day))
          }, (day: string) => day)
        }
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')
      Column({ space: 20 }) {
        Text(this.reportDay).fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
        Row() {
          this.stat(() => (`${Math.floor(studio.daySeconds(this.reportDay) / 60)}`), '专注 / 分钟')
          this.stat(() => (`${this.reportAttempts().length}`), '作答次数')
          this.stat(() => (`${this.reportPassed()}`), '通过次数')
        }.width('100%')
        this.caption(() => ('同一题重复作答会记录多次；累计掌握情况请看「练习」。'))
        this.caption(() => (`训练区：${studio.state.training.attempts.filter((item) => dateKey(new Date(item.createdAt)) === this.reportDay).length} 次作答，${studio.state.training.attempts.filter((item) => dateKey(new Date(item.createdAt)) === this.reportDay && item.status === 'passed' && !item.assisted).length} 次独立通过。训练区保留最近 1000 次记录。`))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 12 }) {
        Text('学过的内容').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        if (this.reportLessons().length === 0) this.caption(() => ('这一天还没有计时或作答记录。开始专注，或完成一道练习，就会留下学习足迹。'))
        ForEach(this.reportLessons(), (lesson: Lesson) => {
          Text(`• ${lesson.title}`).fontSize(16).fontColor(INK).lineHeight(26)
        }, (lesson: Lesson) => lesson.id)
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 13 }) {
        Text('留给明天的自己').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        TextArea({ text: this.reportNote, placeholder: '今天理解了什么？哪里还不熟？明天想先解决哪一个问题？' })
          .height(200).fontSize(16).fontColor(INK).backgroundColor(CANVAS).borderRadius(13).id('report-note')
          .onChange((value: string) => { this.reportNote = value; })
        this.primaryButton(() => ('保存这一天的收获'), 'report-save', () => {
          this.localMessage = '';
          this.dismissedNotice = '';
          studio.saveReport(this.reportDay, this.reportNote);
        })
      }.panel().alignItems(HorizontalAlign.Start)
    }.width('100%')
  }

  @Builder
  aiOptions() {
    Column({ space: 13 }) {
      Text('对话模型').fontSize(17).fontWeight(FontWeight.Medium).fontColor(INK)
      ForEach(this.availableModels(), (model: AIModel) => {
        Row({ space: 10 }) {
          Text(this.editModel === model.id ? '●' : '○').fontSize(18).fontColor(this.editModel === model.id ? BLUE : MUTED)
          Column({ space: 4 }) {
            Text(model.name).fontSize(15).fontWeight(FontWeight.Medium).fontColor(INK)
            Text(model.id).fontSize(12).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        }.width('100%').padding(13).backgroundColor(this.editModel === model.id ? PALE : CANVAS).borderRadius(12)
          .id(`ai-model-${model.id}`).enabled(!studio.aiBusy && !studio.credentialBusy)
          .onClick(() => this.selectModel(model.id))
      }, (model: AIModel) => model.id)
      Text('思考强度').fontSize(16).fontWeight(FontWeight.Medium).fontColor(INK)
      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.effortOptions(), (level: string) => {
          Button(this.effortLabel(level), { type: ButtonType.Normal }).height(48).constraintSize({ minWidth: 48 })
            .fontSize(14).padding({ left: 13, right: 13 })
            .margin({ right: 7, bottom: 7 }).borderRadius(10).fontColor(this.editEffort === level ? Color.White : MUTED)
            .backgroundColor(this.editEffort === level ? BLUE : CANVAS).id(`ai-effort-${level}`)
            .enabled(!studio.aiBusy && !studio.credentialBusy).onClick(() => { this.editEffort = level; })
        }, (level: string) => level)
      }.width('100%')
      this.caption(() => ('可用档位按模型返回能力展示。更强思考通常需要更长等待。'))
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  aiContext() {
    Column({ space: 12 }) {
      Text('这次想讨论什么').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
      Select(this.chatLessonOptions()).value(studio.getLesson(this.effectiveChatLessonId()).title).font({ size: 15 }).fontColor(INK)
        .systemMaterial(materialExperience.defaultMaterial()).menuSystemMaterial(materialExperience.defaultMaterial())
        .width('100%').height(48).backgroundColor(CANVAS).id('ai-lesson-select').onSelect((index: number) => {
          this.chatLessonId = studio.availableLessons()[index].id;
          this.chatExerciseId = '';
          this.includeCode = false;
        })
      Select(this.chatExerciseOptions()).value(this.chatExerciseId ? this.exerciseContext().title : '仅讨论课程概念')
        .systemMaterial(materialExperience.defaultMaterial()).menuSystemMaterial(materialExperience.defaultMaterial())
        .font({ size: 15 }).fontColor(INK).width('100%').height(48).backgroundColor(CANVAS).id('ai-exercise-select').onSelect((index: number) => {
          this.chatExerciseId = index > 0 ? studio.lessonExercises(this.effectiveChatLessonId())[index - 1].id : '';
          this.includeCode = false;
        })
      if (this.chatExerciseId && this.exerciseContext().type === 'code') {
        Row({ space: 10 }) {
          Toggle({ type: ToggleType.Switch, isOn: this.includeCode }).selectedColor(BLUE).id('ai-include-code')
            .systemMaterial(materialExperience.defaultMaterial())
            .width(56).height(32).flexShrink(0).responseRegion({ x: 0, y: -8, width: '100%', height: 48 })
            .accessibilityText('附带这道题的代码草稿')
            .onChange((value: boolean) => { this.includeCode = value; })
          Text('附带这道题的代码草稿').fontSize(15).fontColor(INK).layoutWeight(1)
        }.width('100%').constraintSize({ minHeight: 48 })
        if (this.includeCode) this.textCode(() => (studio.state.drafts[this.chatExerciseId] ?? this.exerciseContext().starter ?? ''))
      }
      this.caption(() => (this.chatExerciseId ? '为选中的练习成功求助后，会记录助学标记，不会自动判定通过。' : '仅发送所选课程内容，不附带其他练习或私人笔记。'))
    }.panel().alignItems(HorizontalAlign.Start)
  }

  @Builder
  chatMessage(chat: Chat) {
    Column({ space: 9 }) {
      Text(chat.role === 'user' ? '我' : 'DeepSeek').fontSize(13).fontWeight(FontWeight.Bold).fontColor(chat.role === 'user' ? BLUE : GREEN)
      Text(chat.content).fontSize(16).fontColor(INK).lineHeight(27).copyOption(CopyOptions.InApp)
      if (chat.requestSettings) {
        Text(`${chat.requestSettings?.model ?? ''} · ${chat.requestSettings?.thinkingMode === 'disabled' ? '关闭思考' : this.effortLabel(chat.requestSettings?.reasoningEffort ?? '')}`)
          .fontSize(11).fontColor(MUTED)
      }
      if (chat.warning) Text(chat.warning ?? '').fontSize(13).lineHeight(21).fontColor(AMBER)
    }.panel().alignItems(HorizontalAlign.Start).backgroundColor(chat.role === 'user' ? PALE : Color.White).id(`chat-${chat.id}`)
  }

  @Builder
  aiPage() {
    Column({ space: 16 }) {
      this.sectionHeading('问清楚，再往前一步', '让 AI 给你解释、追问和提示。答案仍需结合课程与测试核对。')
      if (!studio.hasApiKey || !studio.state.settings.aiEnabled) {
        Column({ space: 12 }) {
          Text('先连接你自己的 DeepSeek').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
          this.caption(() => ('手机端密钥需要单独输入。课程和练习可以离线使用，AI 未连接时不会生成模拟回答。'))
          this.primaryButton(() => ('前往设置'), 'ai-open-settings', () => this.openSettings())
        }.panel().alignItems(HorizontalAlign.Start)
      }
      this.aiContext()
      Column({ space: 13 }) {
        this.aiOptions()
        this.secondaryButton(() => ('保存模型与思考设置'), 'ai-save-options', () => this.saveSettings(),() => (!studio.aiBusy && !studio.credentialBusy))
      }.panel().alignItems(HorizontalAlign.Start)
      if (this.relevantChats().length === 0) {
        Column({ space: 12 }) {
          Text('从一个小问题开始').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
          this.secondaryButton(() => ('用生活中的例子解释本课概念'), 'ai-suggest-explain', () => {
            this.chatDraft = '请用一个生活中的例子解释这节课的核心概念，先不要给练习答案。';
          })
          this.secondaryButton(() => ('问我一个问题，检查我的理解'), 'ai-suggest-check', () => {
            this.chatDraft = '请问我一个简单问题，检查我是否理解这节课。每次只问一个，等我回答。';
          })
        }.panel().alignItems(HorizontalAlign.Start)
      }
      ForEach(this.relevantChats(), (chat: Chat) => { this.chatMessage(chat) }, (chat: Chat) => chat.id)
      if (studio.aiBusy) {
        Row({ space: 12 }) {
          LoadingProgress().width(25).height(25).color(BLUE)
          Text('正在等待 DeepSeek 回复…').fontSize(15).fontColor(MUTED)
        }.width('100%').padding(17).id('ai-waiting')
      }
      Column({ space: 13 }) {
        TextArea({ text: this.chatDraft, placeholder: '写下你的疑问，或者你目前的理解…' }).fontSize(16).height(145)
          .fontColor(INK).backgroundColor(CANVAS).borderRadius(13).id('ai-message-input').enabled(!studio.aiBusy)
          .onChange((value: string) => { this.chatDraft = value; })
        this.primaryButton(() => (studio.aiBusy ? '正在回答…' : '发送问题'), 'ai-send', () => { this.sendQuestion(); },() => (!studio.aiBusy && !studio.credentialBusy && studio.hasApiKey && studio.state.settings.aiEnabled && this.chatDraft.trim().length > 0))
        this.caption(() => ('点击发送后，问题、所选课程、相关对话和你明确勾选的代码将发往 DeepSeek 官方 API。私人笔记与密钥不作为学习上下文发送。'))
      }.panel().alignItems(HorizontalAlign.Start)
      Row() {
        this.stat(() => (`${studio.state.usage.requests}`), '累计请求')
        this.stat(() => (`${studio.state.usage.inputTokens}`), '输入 tokens')
        this.stat(() => (`${studio.state.usage.outputTokens}`), '输出 tokens')
      }.panel()
      this.caption(() => ('用量来自接口返回；费用以 DeepSeek 账户账单为准。'))
    }.width('100%')
  }

  @Builder
  profileRow(title: string, subtitle: string, selector: string, action: () => void) {
    Row({ space: 14 }) {
      Column({ space: 6 }) {
        Text(title).fontSize(17).fontWeight(FontWeight.Medium).fontColor(INK)
        Text(subtitle).fontSize(14).fontColor(MUTED).lineHeight(22)
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      Text('›').fontSize(26).fontColor('#A1A9B7')
    }.width('100%').padding(18).backgroundColor(Color.White).borderRadius(18).id(selector).onClick(action)
  }

  @Builder
  profilePage() {
    Column({ space: 15 }) {
      this.sectionHeading('走自己的路，也能走很远', '你的进度、笔记和每一次尝试，都保存在这台手机。')
      Column({ space: 21 }) {
        Row() {
          this.stat(() => (`${this.completedLessons()}/${studio.availableLessons().length}`), '课程已完成')
          this.stat(() => (`${this.passedExerciseCount()}/${studio.curriculum.exercises.length}`), '练习已通过')
        }.width('100%')
        Row() {
          this.stat(() => (`${this.independentCount()}`), '独立通过')
          this.stat(() => (`${studio.state.settings.dailyMinutes} 分钟`), '每日学习目标')
        }.width('100%')
      }.panel().alignItems(HorizontalAlign.Start)
      this.profileRow('学习日报', '回顾记录，写下收获与下一步', 'profile-report', () => this.openReport())
      this.profileRow('温故知新', `${studio.dueLessons().length} 节课程可以再次回顾`, 'profile-review', () => this.navigate(StudyScreen.Review))
      this.profileRow('设置与备份', '学习目标 · DeepSeek · 导入导出', 'profile-settings', () => this.openSettings())
      this.profileRow('隐私与学习边界', '数据去向、手机练习与硬件验证', 'profile-privacy', () => this.navigate(StudyScreen.Privacy))
      Column({ space: 7 }) {
        Text('闲芯 · HarmonyOS 原生版').fontSize(14).fontColor(MUTED)
        Text(`21 节课程 · 35 道课内练习\n${getTrainingTemplates().length} 类题型 · ${TRAINING_BANK_SIZE} 道基础变式`).fontSize(13).lineHeight(22).fontColor('#8B94A3')
      }.width('100%').padding({ top: 14, bottom: 8 })
    }.width('100%')
  }

  @Builder
  settingsPage() {
    Column({ space: 17 }) {
      Column({ space: 13 }) {
        Text('数据与备份').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        this.caption(() => ('备份在本机生成，不上传服务器。导出进度、训练记录、草稿、笔记、日报与对话，不包含 API Key。'))
        this.secondaryButton(() => ('导出学习备份'), 'backup-export', () => { studio.exportBackup(); },
          () => (!studio.dataBusy && !studio.runBusy && !studio.aiBusy && !studio.credentialBusy))
        this.secondaryButton(() => ('选择并导入备份'), 'backup-import', () => {
          studio.importBackup().then(() => { this.readSettings(); });
        }, () => (!studio.dataBusy && !studio.runBusy && !studio.aiBusy && !studio.credentialBusy))
        Button('重置学习数据', { type: ButtonType.Normal }).width('100%').height(48).borderRadius(12)
          .fontSize(16).fontColor(AMBER).backgroundColor('#FFF3E7').id('reset-learning-data')
          .enabled(!studio.dataBusy && !studio.runBusy && !studio.aiBusy && !studio.credentialBusy)
          .onClick(() => { this.resetCurrentLearningData(); })
        this.caption(() => ('重置前会再次确认并保留本机恢复副本。清空学习记录后，API Key 和体验偏好仍保留。'))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 13 }) {
        Text('鸿蒙使用体验').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        Row({ space: 12 }) {
          Text('智感握姿').fontSize(17).fontColor(INK).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: handExperience.enabled }).selectedColor(BLUE).id('settings-hand')
            .systemMaterial(materialExperience.defaultMaterial())
            .width(56).height(32).flexShrink(0).responseRegion({ x: 0, y: -8, width: '100%', height: 48 })
            .accessibilityText('智感握姿')
            .enabled(!handExperience.busy).onChange((value: boolean) => {
              // Native Toggle can echo the committed isOn while consent is pending.
              // Only deliberate changes may cancel or start the service operation.
              if (handExperience.busy || value === handExperience.enabled) return;
              if (value) handExperience.enable(this.getUIContext()); else handExperience.disable();
            })
        }.width('100%').constraintSize({ minHeight: 48 })
        Text(this.handStatusText()).fontSize(14).lineHeight(23).fontColor(MUTED).id('settings-hand-state')
        this.caption(() => (handExperience.notice || '开启后，页面底部的返回按钮会靠近稳定握持的一侧。姿态仅在本机前台使用。'))
        this.caption(() => ('稳定单手握持后，详情页返回按钮靠向对应一侧；普通底栏只调整栏内按钮，光感模式调整悬浮返回栏。双手或未识别时保持位置，五项主导航始终居中。'))
        Row({ space: 12 }) {
          Text('沉浸光感').fontSize(17).fontColor(INK).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: materialExperience.enabled }).selectedColor(BLUE).id('settings-material')
            .systemMaterial(materialExperience.defaultMaterial())
            .width(56).height(32).flexShrink(0).responseRegion({ x: 0, y: -8, width: '100%', height: 48 })
            .accessibilityText('沉浸光感')
            .enabled(materialExperience.ready && !materialExperience.busy).onChange((value: boolean) => {
              if (!materialExperience.ready || materialExperience.busy || value === materialExperience.enabled) return;
              this.setMaterialEnabled(value);
            })
        }.width('100%').constraintSize({ minHeight: 48 })
        this.caption(() => (this.materialSupported ? '开启为悬浮光感底栏，效果受系统设置影响；关闭为普通固定底栏，正文在底栏上方结束。智感握姿可独立使用。' : '当前设备未报告光感材质支持。开启保留悬浮样式，关闭使用不遮挡正文的普通固定底栏。'))
        if (materialExperience.notice) this.caption(() => (materialExperience.notice))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 13 }) {
        Text('每天，留一点时间给自己').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        Row({ space: 12 }) {
          TextInput({ text: this.editDaily, placeholder: '55' }).type(InputType.Number).fontSize(18).height(48)
            .backgroundColor(CANVAS).borderRadius(12).layoutWeight(1).id('settings-daily')
            .onChange((value: string) => { this.editDaily = value; })
          Text('分钟 / 天').fontSize(15).fontColor(MUTED)
        }.width('100%')
        this.caption(() => ('建议从一个容易坚持的目标开始。可设置 20～120 分钟。'))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 15 }) {
        Row({ space: 12 }) {
          Column({ space: 5 }) {
            Text('启用 DeepSeek AI').fontSize(18).fontWeight(FontWeight.Bold).fontColor(INK)
            Text(studio.hasApiKey ? '手机端密钥已安全保存' : '尚未保存手机端密钥').fontSize(13).fontColor(studio.hasApiKey ? GREEN : MUTED)
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          Toggle({ type: ToggleType.Switch, isOn: this.editAiEnabled }).selectedColor(BLUE).id('settings-ai-enable')
            .systemMaterial(materialExperience.defaultMaterial())
            .width(56).height(32).flexShrink(0).responseRegion({ x: 0, y: -8, width: '100%', height: 48 })
            .accessibilityText('启用 DeepSeek AI')
            .enabled(!studio.aiBusy && !studio.credentialBusy)
            .onChange((value: boolean) => { this.editAiEnabled = value; })
        }.width('100%').constraintSize({ minHeight: 48 })
        this.aiOptions()
        this.secondaryButton(() => (studio.modelLoading ? '正在读取可用模型…' : '从 DeepSeek 刷新可用模型'), 'settings-load-models', () => {
          if (!studio.hasApiKey) this.localMessage = '请先在下方安全保存手机端 API Key，再刷新账户模型。';
          else {
            this.localMessage = '';
            this.dismissedNotice = '';
            studio.loadModels();
          }
        },() => (!studio.modelLoading && !studio.credentialBusy))
        this.primaryButton(() => ('保存学习与 AI 设置'), 'settings-save', () => this.saveSettings(),() => (!studio.aiBusy && !studio.credentialBusy))
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 13 }) {
        Text('手机端 API Key').fontSize(19).fontWeight(FontWeight.Bold).fontColor(INK)
        this.caption(() => ('粘贴你自己的 DeepSeek 密钥。手机独立保存，不会从电脑复制密钥，也不会写入学习备份。'))
        TextInput({ text: this.keyDraft, placeholder: studio.hasApiKey ? '输入新密钥可替换当前密钥' : '粘贴 DeepSeek API Key' })
          .type(InputType.Password).showPasswordIcon(false).height(50).fontSize(15).fontColor(INK).backgroundColor(CANVAS)
          .borderRadius(12).id('settings-api-key').enabled(!studio.aiBusy && !studio.credentialBusy)
          .onChange((value: string) => { this.keyDraft = value; })
        this.secondaryButton(() => (studio.credentialBusy ? '正在处理密钥…' : studio.hasApiKey ? '安全替换密钥' : '安全保存密钥'),
          'settings-save-key', () => { this.storeKey(); },() => (!studio.aiBusy && !studio.credentialBusy))
        if (studio.hasApiKey) {
          Button('移除这台手机的密钥', { type: ButtonType.Normal }).fontSize(14).height(48).width('100%')
            .fontColor(AMBER).backgroundColor(Color.Transparent).id('settings-clear-key')
            .enabled(!studio.aiBusy && !studio.credentialBusy).onClick(() => {
              this.localMessage = '';
              this.dismissedNotice = '';
              studio.clearApiKey().then(() => { this.readSettings(); });
            })
        }
      }.panel().alignItems(HorizontalAlign.Start)
      this.profileRow('查看隐私与学习边界', '了解哪些内容留在手机、哪些会发给 AI', 'settings-privacy', () => this.navigate(StudyScreen.Privacy))
    }.width('100%')
  }

  @Builder
  privacyPage() {
    Column({ space: 16 }) {
      this.sectionHeading('把选择权留在你手里', '学习数据与 AI 服务保持清楚的边界。')
      Column({ space: 12 }) {
        Text('默认留在手机').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
        Text('学习进度、练习草稿、笔记、专注计时、日报和对话记录保存在应用本地。课程和代码练习无需登录，离线可用。应用没有自动云同步。可选的智感握姿只在前台监听系统握持事件，用于移动返回操作区，不保存或上传姿态。')
          .fontSize(17).lineHeight(28).fontColor('#3D485B')
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 12 }) {
        Text('主动发送问题或生成变式时使用 AI').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
        Text('启用 AI 并保存你自己的手机端 API Key 后，发送的问题、选定课程、相关对话和明确勾选的练习代码会交给 DeepSeek 官方接口处理。私人课堂笔记不作为 AI 上下文发送。AI 变式仅上传知识点、难度和近期表现摘要，配方经本机校验后生成题目与测试，不由 AI 自行评分。')
          .fontSize(17).lineHeight(28).fontColor('#3D485B')
        Text('密钥由手机安全存储保护，不显示在页面、不写进备份。AI 回答可能出错；模型、思考强度和实际用量会显示在应用内。')
          .fontSize(16).lineHeight(27).fontColor(MUTED)
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 12 }) {
        Text('代码能跑通，不等于硬件能工作').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
        Text('手机内置 C 学习解释器，只执行课程练习需要的有界语法子集，运行时间与资源有限制。它不是 GCC，不会生成 ARM 固件，也不能代替 STM32 下载、接线、串口或调试验证。')
          .fontSize(17).lineHeight(28).fontColor('#3D485B')
        Text('课程中提到的本机 GCC、STM32Cube 工程与 F446 板卡，属于电脑端学习路线。没有开发板也能先学原理，真正的硬件验证留到设备就绪之后。')
          .fontSize(16).lineHeight(27).fontColor(MUTED)
      }.panel().alignItems(HorizontalAlign.Start)
      Column({ space: 12 }) {
        Text('外部视频与学习备份').fontSize(20).fontWeight(FontWeight.Bold).fontColor(INK)
        Text('视频按钮会打开 B 站外部链接，内容与播放服务由对方提供。导出备份后，请自行保管包含学习对话的文件；导入前先保存当前备份，可方便找回已有记录。')
          .fontSize(17).lineHeight(28).fontColor('#3D485B')
      }.panel().alignItems(HorizontalAlign.Start)
    }.width('100%')
  }

  @Builder
  dockCapsuleLayer() {
    Stack({ alignContent: Alignment.TopStart }) {
      // One continuous icon capsule on the full native bar. Only the native
      // backplate carries material; no sliced filters, dividers or nested glass.
      Row().width(Math.max(48, this.dockItemWidth - 8)).height(34).borderRadius(17)
        .backgroundColor('#24386CE8')
        .position({ x: this.dockInset + 4, y: 2 })
        .translate({ x: this.dockPosition * this.dockItemWidth })
        .id('dock-capsule').hitTestBehavior(HitTestMode.None)
    }.width(this.dockBarWidth).height(60).opacity(this.dockBarWidth > 0 ? 1 : 0)
      .hitTestBehavior(HitTestMode.None)
  }

  @Builder
  tabItem(index: number, icon: Resource, label: string, session: number) {
    Column({ space: 5 }) {
      Image(icon).width(24).height(24).objectFit(ImageFit.Contain).draggable(false)
      Text(label).fontSize(12).fontWeight(this.dockTab === index ? FontWeight.Medium : FontWeight.Regular)
        .height(17).lineHeight(17).maxLines(1).fontColor(this.dockTab === index ? BLUE : MUTED)
    }.height(60).layoutWeight(1).justifyContent(FlexAlign.Center).constraintSize({ minWidth: 48 })
      .id(`tab-${index}`).accessibilityText(label)
      .accessibilitySelected(this.tab === index)
      .onClick(() => this.clickDock(index, session))
  }

  @Builder
  dockBar(session: number) {
    Stack({ alignContent: Alignment.TopStart }) {
      this.dockCapsuleLayer()
      Row() {
        this.tabItem(0, $r('app.media.nav_today'), '今日', session)
        this.tabItem(1, $r('app.media.nav_courses'), '课程', session)
        this.tabItem(2, $r('app.media.nav_practice'), '练习', session)
        this.tabItem(3, $r('app.media.nav_ai'), '问问AI', session)
        this.tabItem(4, $r('app.media.nav_profile'), '我的', session)
      }.width('100%').height(60)
    }.width('100%').height(60).id('dock-gesture-surface')
      .onAreaChange((_old: Area, area: Area) => {
        const width: number = Number(area.width);
        if (this.isRootSession(session) && Number.isFinite(width) && width > 0) {
          if (width !== this.dockBarWidth && this.dockDragSource >= 0) this.cancelDockDrag(session);
          this.dockBarWidth = width;
          this.dockItemWidth = width / 5;
          this.dockWindowX = Number(area.globalPosition.x);
        }
      })
      .onTouch((event: TouchEvent) => {
        if (!this.isRootSession(session)) return;
        if (event.type === TouchType.Down && event.touches.length === 1) {
          const x: number = event.touches[0].windowX - this.dockWindowX;
          const index: number = this.dockIndexAt(x);
          this.pressDock(index, x - index * this.dockItemWidth, session);
        } else if (event.type === TouchType.Cancel) this.cancelDockDrag(session);
        else if (event.type === TouchType.Up) this.releaseDockTouch(session);
      })
      .priorityGesture(GestureGroup(GestureMode.Exclusive,
        PanGesture({ direction: PanDirection.Horizontal, distance: 4, fingers: 1, isFingerCountLimited: true })
          .onActionStart((event: GestureEvent) => this.startDockDrag(this.dockIndexAt(this.dockTouchX), event.offsetX, session))
          .onActionUpdate((event: GestureEvent) => this.updateDockDrag(event.offsetX, session))
          .onActionEnd((event: GestureEvent) => this.finishDockDrag(event.offsetX, session))
          .onActionCancel(() => this.cancelDockDrag(session)),
        TapGesture({ count: 1, fingers: 1 })
          .onAction(() => this.clickDock(this.dockIndexAt(this.dockTouchX), session))
      ), GestureMask.IgnoreInternal)
  }

  @Builder
  pageContent(viewTab: number, scroller: Scroller) {
    Column() {
      if ((viewTab < 0 || viewTab === this.tab) && studio.ready && ((studio.notice.length > 0 && studio.notice !== this.dismissedNotice) || this.localMessage.length > 0)) {
        Column() { this.messages() }.width('100%').padding({ left: 20, right: 20, bottom: 10 })
      }
      if (!studio.ready) {
        if (studio.initFailed) {
          Column({ space: 22 }) {
            Text('!').fontSize(29).fontWeight(FontWeight.Bold).fontColor(AMBER).width(60).height(60)
              .textAlign(TextAlign.Center).backgroundColor('#FFF2DC').borderRadius(20)
            Text('学习空间暂时无法打开').fontSize(22).fontWeight(FontWeight.Bold).fontColor(INK)
              .lineHeight(32).textAlign(TextAlign.Center)
            Text(studio.notice || '准备学习数据时遇到了问题，请稍后重试。').fontSize(16).fontColor(MUTED)
              .lineHeight(27).textAlign(TextAlign.Center).width('100%').id('init-error-message')
            this.primaryButton(() => ('重新尝试'), 'init-retry', () => {
              this.localMessage = '';
              this.dismissedNotice = '';
              studio.retryInit();
            })
          }.layoutWeight(1).width('100%').constraintSize({ maxWidth: 480 }).padding({ left: 28, right: 28, bottom: 60 })
            .justifyContent(FlexAlign.Center).id('init-error')
        } else {
          Column({ space: 17 }) {
            LoadingProgress().width(42).height(42).color(BLUE).id('init-spinner')
            Text('正在准备你的学习空间…').fontSize(17).fontColor(MUTED).textAlign(TextAlign.Center)
          }.layoutWeight(1).width('100%').padding(24).justifyContent(FlexAlign.Center).id('init-loading')
        }
      } else {
        Scroll(scroller) {
          Column({ space: 16 }) {
            if (viewTab < 0 && this.screen === StudyScreen.Training) this.trainingPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Assistant) this.aiPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Lesson) this.lessonPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Exercise) this.exercisePage()
            else if (viewTab < 0 && this.screen === StudyScreen.Review) this.reviewPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Report) this.reportPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Settings) this.settingsPage()
            else if (viewTab < 0 && this.screen === StudyScreen.Privacy) this.privacyPage()
            else if (viewTab === 0) this.todayPage()
            else if (viewTab === 1) this.coursesPage()
            else if (viewTab === 2) this.practicePage()
            else if (viewTab === 3) this.aiPage()
            else this.profilePage()
          }.width('100%').constraintSize({ maxWidth: 740 }).padding({ left: 20, right: 20, top: 5, bottom: this.dockFloating ? 128 : 24 })
        }.layoutWeight(1).width('100%').scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
          .align(Alignment.Top).id(viewTab < 0 || viewTab === this.tab ? 'main-scroll' : `tab-scroll-${viewTab}`)
      }
    }.width('100%').height('100%').backgroundColor(CANVAS)
  }

  @Builder
  mainTabs(session: number, floating: boolean) {
    // One native bar item supplies the full drawing/gesture region. The five
    // root pages remain mounted and keep their independent scroll controllers.
    Tabs({ barPosition: BarPosition.End, index: 0 }) {
      TabContent() {
        Stack() {
          Column() { this.pageContent(0, this.rootScrollers[0]) }.width('100%').height('100%').visibility(this.tab === 0 ? Visibility.Visible : Visibility.Hidden)
          Column() { this.pageContent(1, this.rootScrollers[1]) }.width('100%').height('100%').visibility(this.tab === 1 ? Visibility.Visible : Visibility.Hidden)
          Column() { this.pageContent(2, this.rootScrollers[2]) }.width('100%').height('100%').visibility(this.tab === 2 ? Visibility.Visible : Visibility.Hidden)
          Column() { this.pageContent(3, this.rootScrollers[3]) }.width('100%').height('100%').visibility(this.tab === 3 ? Visibility.Visible : Visibility.Hidden)
          Column() { this.pageContent(4, this.rootScrollers[4]) }.width('100%').height('100%').visibility(this.tab === 4 ? Visibility.Visible : Visibility.Hidden)
        }.width('100%').height('100%')
      }.tabBar(this.dockBar(session))
    }.width('100%').height('100%').vertical(false).scrollable(false)
      .animationMode(AnimationMode.NO_ANIMATION).animationDuration(0)
      .barMode(BarMode.Fixed).barHeight(72).barOverlap(floating)
      .barBackgroundColor(floating ? Color.Transparent : Color.White)
      .divider(floating ? undefined : { strokeWidth: 0.5, color: LINE })
      .barFloatingStyle(floating ? { barWidth: {
          smallBarWidth: this.mainTabsWidth > 0 ? this.mainTabsWidth - 32 : undefined,
          mediumBarWidth: this.mainTabsWidth > 0 ? this.mainTabsWidth - 32 : undefined,
          largeBarWidth: this.mainTabsWidth > 0 ? this.mainTabsWidth - 32 : undefined },
        barSideMargin: 16, barBottomMargin: 10, maskHeight: 104,
        maskColor: CANVAS, adaptToHandedness: false, systemMaterial: this.materialFor(this.dockMaterial) } : undefined)
      .onAreaChange((_old: Area, area: Area) => {
        const width: number = Number(area.width);
        if (this.isRootSession(session) && Number.isFinite(width) && width > 0) this.mainTabsWidth = width;
      })
      .id('main-native-tabs')
  }

  @Builder
  returnTabItem(session: number, floating: boolean) {
    Row() {
      Button('‹ 返回上一页', { type: ButtonType.Capsule }).fontSize(15).fontColor(BLUE)
      .height(52).width(floating ? '100%' : 188).buttonStyle(ButtonStyleMode.TEXTUAL)
      .systemMaterial(this.materialFor(this.dockButtonMaterial)).id('bottom-back').accessibilityText('返回上一页')
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.pressDetailBar(session);
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.releaseDetailBar(session);
      })
      .onClick(() => { if (this.isDetailSession(session)) this.goBack(); })
    }.width('100%').height(56).padding({ left: floating ? 0 : 16, right: floating ? 0 : 16 })
      .justifyContent(floating ? FlexAlign.Center : this.fixedBackAlignment())
  }

  @Builder
  detailTabs(session: number, floating: boolean) {
    // A native bottom TabBar provides the supported material region for this button.
    // Detail navigation uses its own Scroll, separate from the five root pages.
    Tabs({ barPosition: BarPosition.End, index: 0, barModifier: this.detailBarModifier(session) }) {
      TabContent() { this.pageContent(-1, this.detailScroller) }.tabBar(this.returnTabItem(session, floating))
    }.width('100%').height('100%').vertical(false).scrollable(false).animationDuration(0)
      .barMode(BarMode.Fixed).barHeight(floating ? 56 : 64).barOverlap(floating)
      .barBackgroundColor(floating ? Color.Transparent : Color.White)
      .divider(floating ? undefined : { strokeWidth: 0.5, color: LINE })
      .barFloatingStyle(floating ? { barWidth: { smallBarWidth: 188, mediumBarWidth: 188, largeBarWidth: 188 },
        barSideMargin: 16, barBottomMargin: 6, maskHeight: 88, maskColor: CANVAS,
        adaptToHandedness: false, systemMaterial: this.materialFor(this.dockMaterial) } : undefined)
      .onAreaChange((_old: Area, area: Area) => {
        const width: number = Number(area.width);
        if (this.isDetailSession(session) && Number.isFinite(width) && width > 0) this.detailTabsWidth = width;
      })
      .id('detail-native-tabs')
  }

  build() {
    Navigation() {
      if (!studio.ready) this.pageContent(-1, this.detailScroller)
      else if (this.screen === StudyScreen.Main) {
        if (this.dockFloating) this.mainTabs(this.rootSession, true)
        else this.mainTabs(this.rootSession, false)
      } else {
        if (this.dockFloating) this.detailTabs(this.rootSession, true)
        else this.detailTabs(this.rootSession, false)
      }
    }.mode(NavigationMode.Stack).hideBackButton(true).titleMode(NavigationTitleMode.Mini)
      .title({ builder: this.appHeader(), height: 72 }, { backgroundColor: this.materialSupported && materialExperience.enabled ? undefined : CANVAS, systemMaterial: this.materialFor(this.titleMaterial) })
      .width('100%').height('100%').backgroundColor(CANVAS)
  }
}
