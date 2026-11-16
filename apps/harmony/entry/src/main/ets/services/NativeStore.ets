import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { asset } from '@kit.AssetStoreKit';
import { Curriculum, StudyState, freshState, recordId } from '../core/Models';
import { validateStoredState } from '../core/StateRules';

export class NativeStore {
  private base: string = '';
  private curriculum?: Curriculum;
  private primaryValid: boolean = true;
  recoveryNotice: string = '';

  private writeAll(fd: number, text: string): void {
    const bytes = new util.TextEncoder().encodeInto(text);
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('学习备份超过 10 MB，请先减少过长笔记或代码。');
    let offset=0;
    while(offset<bytes.byteLength) {
      const count=fs.writeSync(fd,bytes.slice(offset).buffer as ArrayBuffer);
      if(count<=0||count>bytes.byteLength-offset)throw new Error('文件未完整写入，原记录仍保留。');
      offset+=count;
    }
    fs.fsyncSync(fd);
  }

  load(context: common.UIAbilityContext, curriculum: Curriculum): StudyState {
    this.base = context.filesDir + '/learning-state';
    this.curriculum = curriculum;
    const primary = this.base + '.json';
    const previous = this.base + '.previous.json';
    if (!fs.accessSync(primary) && !fs.accessSync(previous)) return freshState();
    try { return validateStoredState(fs.readTextSync(primary), curriculum); }
    catch (_) {
      try {
        const restored = validateStoredState(fs.readTextSync(previous), curriculum);
        this.recoveryNotice = '已从上一次完整保存恢复学习记录，损坏文件已保留。';
        this.primaryValid = false;
        if (fs.accessSync(primary)) fs.copyFileSync(primary, this.base + '-damaged-' + Date.now().toString() + '.json');
        return restored;
      } catch (_) { throw new Error('学习记录无法读取。原文件已保留，请先导出或恢复备份；应用不会自动清空数据。'); }
    }
  }

  save(state: StudyState): void {
    if (!this.base) throw new Error('本地存储尚未初始化。');
    const primary = this.base + '.json';
    const temp = this.base + '.tmp';
    // The key is stored by Asset Store Kit, never in this JSON.
    const stored = JSON.parse(JSON.stringify(state)) as StudyState;
    stored.settings.hasApiKey = false;
    // Reserve exactly the same envelope as the compact, importable export.
    const exportState=JSON.parse(JSON.stringify(stored)) as StudyState;
    exportState.settings.aiEnabled=false;
    const envelope=JSON.stringify({format:'qicheng-harmony-backup',version:2,exportedAt:new Date().toISOString(),curriculumVersion:this.curriculum?.version||'',state:exportState});
    if(new util.TextEncoder().encodeInto(envelope).byteLength>10*1024*1024)throw new Error('学习记录超过可导出容量，请先缩短笔记或代码。');
    const file = fs.openSync(temp, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try { this.writeAll(file.fd, JSON.stringify(stored)); }
    finally { fs.closeSync(file); }
    if (this.primaryValid && fs.accessSync(primary)) fs.copyFileSync(primary, this.base + '.previous.json');
    fs.renameSync(temp, primary);
    this.primaryValid = true;
  }

  preserveBeforeImport(state: StudyState): void {
    this.preserveRecovery(state,'import');
  }

  preserveBeforeReset(state: StudyState): void {
    this.preserveRecovery(state,'reset');
  }

  private preserveRecovery(state: StudyState, purpose: string): void {
    let target=this.base+'-before-'+purpose+'-'+recordId()+'.json';
    while(fs.accessSync(target)||fs.accessSync(target+'.tmp'))target=this.base+'-before-'+purpose+'-'+recordId()+'.json';
    const stored=JSON.parse(JSON.stringify(state)) as StudyState;
    stored.settings.hasApiKey=false;
    const file=fs.openSync(target+'.tmp',fs.OpenMode.CREATE|fs.OpenMode.READ_WRITE|fs.OpenMode.TRUNC);
    try {this.writeAll(file.fd,JSON.stringify(stored));}
    finally {fs.closeSync(file);}
    // 只有完整写入并 fsync 后才成为正式恢复副本；失败保留临时文件供排查。
    fs.renameSync(target+'.tmp',target);
  }

  async exportFile(context: common.UIAbilityContext, text: string): Promise<boolean> {
    if(new util.TextEncoder().encodeInto(text).byteLength>10*1024*1024)throw new Error('备份超过 10 MB，请先减少过长笔记或代码。');
    const viewPicker = new picker.DocumentViewPicker(context);
    const options = new picker.DocumentSaveOptions();
    options.newFileNames = ['启程学习备份-' + new Date().toISOString().slice(0,10) + '.json'];
    options.fileSuffixChoices = ['学习备份|.json'];
    const targets = await viewPicker.save(options);
    if (!targets.length) return false;
    const file = fs.openSync(targets[0], fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try { this.writeAll(file.fd, text); } finally { fs.closeSync(file); }
    return true;
  }

  async chooseImport(context: common.UIAbilityContext): Promise<string> {
    const options = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    options.fileSuffixFilters = ['.json'];
    const paths = await new picker.DocumentViewPicker(context).select(options);
    if (!paths.length) return '';
    const file = fs.openSync(paths[0], fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size;
      if (size <= 0 || size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的 JSON 学习备份。');
      const buffer = new ArrayBuffer(size);
      const count = fs.readSync(file.fd, buffer);
      if (count !== size) throw new Error('备份未读取完整，请重试。');
      return util.TextDecoder.create('utf-8', {fatal: true}).decodeToString(new Uint8Array(buffer));
    } finally { fs.closeSync(file); }
  }
}

export class SecretVault {
  private alias(): Uint8Array { return new util.TextEncoder().encodeInto('qicheng.deepseek.api-key.v1'); }
  async read(): Promise<string> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias());
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    const values = await asset.query(query);
    if (!values.length) return '';
    const secret = values[0].get(asset.Tag.SECRET) as Uint8Array;
    return util.TextDecoder.create('utf-8').decodeToString(secret);
  }
  async exists(): Promise<boolean> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias());
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ATTRIBUTES);
    try { return (await asset.query(query)).length > 0; } catch (_) { return false; }
  }
  async save(key: string): Promise<void> {
    if (!/^[\x21-\x7e]{12,512}$/.test(key)) throw new Error('请填写完整的 DeepSeek API Key。');
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, this.alias());
    attributes.set(asset.Tag.SECRET, new util.TextEncoder().encodeInto(key));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
    attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    attributes.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
    await asset.add(attributes);
  }
  async clear(): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias());
    await asset.remove(query);
  }
}
