import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { UIContext } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { BusinessError } from '@kit.BasicServicesKit';
import { motion } from '@kit.MultimodalAwarenessKit';
import { materialExperience } from './MaterialExperience';

export type HandSide = 'default' | 'left' | 'right';
export type HandExperienceStatus = 'disabled' | 'waiting' | 'active' | 'paused' | 'unsupported' | 'denied' | 'error';

// 收到系统事件后再稳定 250 ms，过滤短暂抖动而不追加明显的半秒等待。
const STABLE_HAND_MS: number = 250;

// Holds only the current in-memory decision. No raw gesture history is retained.
export class HandStability {
  private stable: HandSide = 'default';
  private candidate: HandSide = 'default';
  private candidateSince: number = 0;

  observe(status: motion.HoldingHandStatus, now: number): void {
    let side: HandSide = 'default';
    if (status === motion.HoldingHandStatus.LEFT_HAND_HELD) side = 'left';
    else if (status === motion.HoldingHandStatus.RIGHT_HAND_HELD) side = 'right';
    // Both hands, no holding and unknown cancel a pending switch. They do not
    // force a stable action bar to jump back and forth between screen edges.
    if (side === 'default' || side === this.stable) {
      this.candidate = 'default';
      return;
    }
    if (this.candidate !== side) {
      this.candidate = side;
      this.candidateSince = now;
    }
  }

  dueAt(): number { return this.candidate === 'default' ? -1 : this.candidateSince + STABLE_HAND_MS; }

  settle(now: number): HandSide {
    if (this.candidate !== 'default' && now >= this.candidateSince + STABLE_HAND_MS) {
      this.stable = this.candidate;
      this.candidate = 'default';
    }
    return this.stable;
  }

  reset(): void {
    this.stable = 'default';
    this.candidate = 'default';
    this.candidateSince = 0;
  }
}

@ObservedV2
export class HandExperience {
  @Trace enabled: boolean = false;
  @Trace side: HandSide = 'default';
  @Trace status: HandExperienceStatus = 'disabled';
  @Trace notice: string = '智感握姿默认关闭，使用默认按钮布局。';
  @Trace busy: boolean = false;
  private context?: common.UIAbilityContext;
  private settings?: preferences.Preferences;
  private foreground: boolean = false;
  private operation: number = 0;
  private subscription: number = 0;
  private listener?: (status: motion.HoldingHandStatus) => void;
  private settleTimer: number = -1;
  private stability: HandStability = new HandStability();

  init(context: common.UIAbilityContext): void {
    this.context = context;
    try {
      this.settings = preferences.getPreferencesSync(context, { name: 'qicheng-hand-experience' });
      this.enabled = this.settings.getSync('enabled', false) === true;
      this.status = this.enabled ? 'paused' : 'disabled';
      this.notice = this.enabled ? '已记住启用选择，进入前台后感知握姿。' : '智感握姿默认关闭，使用默认按钮布局。';
      if (this.foreground && this.enabled) this.resume();
    } catch (_) {
      this.enabled = false;
      this.status = 'error';
      this.notice = '握姿偏好无法读取，已保留默认布局。';
    }
  }

  // DETECT_GESTURE is normal/system_grant from API 20. It is declared in
  // module.json5 and is not passed to requestPermissionsFromUser. This dialog
  // obtains the user's explicit feature opt-in; permission is then checked.
  async enable(uiContext: UIContext): Promise<boolean> {
    if (this.busy) return false;
    if (!this.context || !this.settings) {
      this.status = 'error';
      this.notice = '握姿服务尚未就绪，当前保留默认布局。';
      return false;
    }
    if (this.enabled) {
      if (this.foreground) this.resume();
      return this.enabled;
    }
    if (!this.checkSupportAndPermission()) return false;
    const operation: number = ++this.operation;
    this.busy = true;
    try {
      const answer = await uiContext.getPromptAction().showDialog({
        systemMaterial: materialExperience.defaultMaterial(),
        title: '开启智感握姿？',
        message: '开启后，仅在应用前台感知握持手，将详情页底部返回按钮靠向稳定握持的一侧。主导航保持居中，双手或未识别时不来回移动，后台停止感知。不保存或上传握姿数据，可随时关闭。',
        buttons: [{ text: '暂不开启', color: '#687386' }, { text: '开启', color: '#386CE8' }]
      });
      if (operation !== this.operation) return false;
      if (answer.index !== 1) {
        this.status = 'disabled';
        this.notice = '未开启智感握姿，继续使用默认布局。';
        return false;
      }
      if (!this.checkSupportAndPermission()) return false;
      this.enabled = true;
      if (this.foreground && !this.subscribe()) {
        this.enabled = false;
        return false;
      }
      if (!this.savePreference(true)) {
        this.enabled = false;
        this.unsubscribe();
        this.status = 'error';
        this.notice = '启用偏好未能保存，已停止感知并保留默认布局。';
        return false;
      }
      if (!this.foreground) {
        this.status = 'paused';
        this.notice = '已启用；回到应用前台后开始感知。';
      }
      return true;
    } catch (_) {
      if (operation === this.operation) {
        this.enabled = false;
        this.unsubscribe();
        this.status = 'error';
        this.notice = '未能完成启用，当前保留默认布局，请重试。';
      }
      return false;
    } finally {
      if (operation === this.operation) this.busy = false;
    }
  }

  disable(): void {
    this.operation++;
    this.busy = false;
    this.enabled = false;
    const stopped: boolean = this.unsubscribe();
    const saved: boolean = this.savePreference(false);
    this.status = stopped && saved ? 'disabled' : 'error';
    this.notice = !stopped ? '已恢复默认布局，系统退订未完成；请重新打开应用。' :
      saved ? '智感握姿已关闭，恢复默认布局。' : '本次感知已停止，但关闭偏好未能保存；请检查存储后再次关闭。';
  }

  onForeground(): void {
    this.foreground = true;
    if (this.enabled && !this.busy) this.resume();
  }

  onBackground(): void {
    this.foreground = false;
    const stopped: boolean = this.unsubscribe();
    if (this.enabled && stopped) {
      this.status = 'paused';
      this.notice = '应用在后台，握姿感知已暂停。';
    }
  }

  dispose(): void {
    this.operation++;
    this.busy = false;
    this.foreground = false;
    this.unsubscribe();
    this.context = undefined;
    this.settings = undefined;
  }

  private savePreference(value: boolean): boolean {
    if (!this.settings) return false;
    try {
      this.settings.putSync('enabled', value);
      this.settings.flushSync();
      return true;
    } catch (_) { return false; }
  }

  private checkSupportAndPermission(): boolean {
    try {
      if (!canIUse('SystemCapability.MultimodalAwareness.Motion')) {
        this.status = 'unsupported';
        this.notice = '当前设备不支持动作感知，保留默认布局。';
        return false;
      }
      if (!this.context || abilityAccessCtrl.createAtManager().checkAccessTokenSync(
        this.context.applicationInfo.accessTokenId, 'ohos.permission.DETECT_GESTURE') !== abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        this.status = 'denied';
        this.notice = '系统未授予握姿感知权限，保留默认布局；无需开启运动或位置权限。';
        return false;
      }
      return true;
    } catch (_) {
      this.status = 'error';
      this.notice = '握姿能力检查未完成，保留默认布局。';
      return false;
    }
  }

  private resume(): void {
    if (!this.subscribe()) {
      this.enabled = false;
      this.savePreference(false);
    }
  }

  private subscribe(): boolean {
    if (!this.enabled || !this.foreground || !this.context) return false;
    if (this.listener && (this.status === 'waiting' || this.status === 'active')) return true;
    // Retry detaching an invalidated listener before starting another one.
    if (this.listener && !this.unsubscribe()) return false;
    if (!this.checkSupportAndPermission()) return false;
    const subscription: number = ++this.subscription;
    this.stability.reset();
    this.side = 'default';
    this.listener = (status: motion.HoldingHandStatus) => {
      if (subscription !== this.subscription || !this.enabled || !this.foreground) return;
      this.handleHoldingHand(status, subscription);
    };
    try {
      motion.on('holdingHandChanged', this.listener);
      this.status = 'waiting';
      this.notice = '已开启，等待稳定的左手或右手握持；双手时保持布局。';
      return true;
    } catch (error) {
      const code: number = (error as BusinessError).code;
      if (code === 801 || code === 201) {
        // These errors reject the registration itself; there is no live
        // subscription to remove on an unsupported/unauthorized device.
        this.listener = undefined;
        this.subscription++;
        this.clearSettleTimer();
        this.stability.reset();
        this.side = 'default';
      } else this.unsubscribe();
      if (code === 801) {
        this.status = 'unsupported';
        this.notice = '当前设备或系统未提供智感握姿，已保留默认布局。';
      } else if (code === 201) {
        this.status = 'denied';
        this.notice = '系统未允许握姿感知，已保留默认布局。';
      } else {
        this.status = 'error';
        this.notice = '握姿感知暂时无法启动，已保留默认布局。';
      }
      return false;
    }
  }

  private clearSettleTimer(): void {
    if (this.settleTimer >= 0) clearTimeout(this.settleTimer);
    this.settleTimer = -1;
  }

  private handleHoldingHand(status: motion.HoldingHandStatus, subscription: number): void {
    this.stability.observe(status, Date.now());
    this.clearSettleTimer();
    const dueAt: number = this.stability.dueAt();
    if (dueAt < 0) return;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = -1;
      if (subscription !== this.subscription || !this.enabled || !this.foreground) return;
      this.side = this.stability.settle(Date.now());
      if (this.side !== 'default') {
        this.status = 'active';
        this.notice = this.side === 'left' ? '已识别稳定左手握持，详情页返回按钮靠左。' : '已识别稳定右手握持，详情页返回按钮靠右。';
      }
    }, Math.max(0, dueAt - Date.now()));
  }

  private unsubscribe(): boolean {
    this.subscription++;
    this.clearSettleTimer();
    this.stability.reset();
    this.side = 'default';
    if (!this.listener) return true;
    try {
      motion.off('holdingHandChanged', this.listener);
      this.listener = undefined;
      return true;
    } catch (_) {
      // Keep the exact callback for a later off() retry. Its epoch is already
      // invalidated, so even queued native callbacks cannot affect the UI.
      this.status = 'error';
      this.notice = '握姿订阅暂时无法移除，已停止布局更新；请重新打开应用。';
      return false;
    }
  }
}

export const handExperience: HandExperience = new HandExperience();
