import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { uiMaterial } from '@kit.ArkUI';

// 体验偏好单独保存，不进入学习备份，也不读取凭据或学习记录。
const SETTINGS_NAME: string = 'qicheng-material-experience';
const ENABLED_KEY: string = 'enabled';

@ObservedV2
export class MaterialExperience {
  // 默认开启，保留升级前的视觉；实际强弱始终由系统材质能力控制。
  @Trace enabled: boolean = true;
  @Trace ready: boolean = false;
  @Trace busy: boolean = false;
  @Trace notice: string = '沉浸光感开启时跟随系统强弱，关闭后使用普通背景。';
  private settings?: preferences.Preferences;

  // 原生选择器、开关和确认框开启时保持系统默认，关闭时显式移除材质。
  defaultMaterial(): uiMaterial.Material | undefined {
    return this.enabled ? undefined : uiMaterial.Material.empty;
  }

  async init(context: common.UIAbilityContext): Promise<void> {
    // 窗口重建时不覆盖正在写入的选择，也不新建任何系统材质。
    if (this.busy) return;
    this.ready = false;
    this.settings = undefined;
    try {
      const settings: preferences.Preferences = preferences.getPreferencesSync(context, { name: SETTINGS_NAME });
      const saved: preferences.ValueType = settings.getSync(ENABLED_KEY, true);
      this.enabled = typeof saved === 'boolean' ? saved : true;
      this.settings = settings;
      this.ready = true;
      this.notice = typeof saved === 'boolean' ? this.selectionNotice() :
        '沉浸光感偏好格式异常，当前使用默认开启；可重新选择开关。';
    } catch (_) {
      // 首次读取失败保留默认开启；再次初始化失败保留本次已知选择。
      this.notice = '沉浸光感偏好无法读取，当前保留原设置；请重新打开应用后重试。';
    }
  }

  async setEnabled(value: boolean): Promise<boolean> {
    if (this.busy) return false;
    if (!this.ready || !this.settings) {
      this.notice = '沉浸光感偏好尚未就绪，暂未修改开关；请重新打开应用后重试。';
      return false;
    }
    if (value === this.enabled) {
      this.notice = this.selectionNotice();
      return true;
    }

    const previous: boolean = this.enabled;
    const settings: preferences.Preferences = this.settings;
    this.busy = true;
    // 先更新观察值，使 Toggle 与材质立即响应；失败时显式恢复同一观察值。
    this.enabled = value;
    try {
      settings.putSync(ENABLED_KEY, value);
      // 等待实际落盘后才报告保存成功，磁盘操作不阻塞界面线程。
      await settings.flush();
      this.notice = this.selectionNotice();
      return true;
    } catch (_) {
      this.enabled = previous;
      try {
        // putSync 已可能改动共享缓存；同时恢复缓存和磁盘中的旧选择。
        settings.putSync(ENABLED_KEY, previous);
        await settings.flush();
        this.notice = '沉浸光感偏好保存失败，已保留原设置，请重试。';
      } catch (_) {
        // 两次写入均失败时不能声称下次启动的持久化值已经确定。
        this.ready = false;
        this.settings = undefined;
        this.notice = '沉浸光感偏好保存失败，当前保留原设置；请重新打开应用后确认。';
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  private selectionNotice(): string {
    return this.enabled ? '沉浸光感已开启，效果跟随系统强弱；设备不支持时使用普通背景。' :
      '沉浸光感已关闭，使用普通背景；下次打开应用仍保留此选择。';
  }
}

// 全应用共享同一个开关状态；服务本身不创建、订阅或重建材质对象。
export const materialExperience: MaterialExperience = new MaterialExperience();
