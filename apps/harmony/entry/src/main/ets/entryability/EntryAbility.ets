import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { studio } from '../services/StudyController';
import { handExperience } from '../services/HandExperience';
import { materialExperience } from '../services/MaterialExperience';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    studio.init(this.context);
    handExperience.init(this.context);
    materialExperience.init(this.context);
    stage.loadContent('pages/Index');
  }
  onForeground(): void { handExperience.onForeground(); }
  onBackground(): void { handExperience.onBackground(); studio.pauseTimer(); }
  onWindowStageDestroy(): void { handExperience.onBackground(); studio.pauseTimer(); }
  onDestroy(): void { handExperience.dispose(); studio.pauseTimer(); }
}
