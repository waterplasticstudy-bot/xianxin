'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const root=path.resolve(__dirname,'../entry/src/main/ets');
const curriculum=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../entry/src/main/resources/rawfile/curriculum.json'),'utf8'));

function fixture(){
 const files=new Map(),handles=new Map(),cache=new Map();let nextFd=1,secret=null;
 const control={failWrite:false,failWriteNumber:0,writes:0,failRename:false,zeroWrite:false,chunk:Infinity,dialog:1,picker:[],httpCalls:[],httpReply:null,pendingHttp:null,assetDelay:null};
 const nativeFs={OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4,WRITE_ONLY:8,READ_ONLY:16},
  accessSync:p=>files.has(p),readTextSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p).toString('utf8')},
  openSync(p,mode){if((mode&1)||(mode&4)){if(!files.has(p)||(mode&4))files.set(p,Buffer.alloc(0))}if(!files.has(p))throw Error('missing');const fd=nextFd++;handles.set(fd,{p,offset:0});return {fd}},
  closeSync:f=>handles.delete(typeof f==='number'?f:f.fd),statSync:fd=>({size:files.get(handles.get(fd).p).length}),
  writeSync(fd,b){control.writes++;if(control.failWrite||control.writes===control.failWriteNumber)throw Error('disk full');if(control.zeroWrite)return 0;const h=handles.get(fd),bytes=Buffer.from(typeof b==='string'?b:new Uint8Array(b));const n=Math.min(bytes.length,control.chunk);const old=files.get(h.p);files.set(h.p,Buffer.concat([old.subarray(0,h.offset),bytes.subarray(0,n),old.subarray(h.offset+n)]));h.offset+=n;return n},
  readSync(fd,b){const h=handles.get(fd),source=files.get(h.p);new Uint8Array(b).set(source);return source.length},
  fsyncSync(){},copyFileSync(a,b){if(!files.has(a))throw Error('missing');files.set(b,Buffer.from(files.get(a)))},
  renameSync(a,b){if(control.failRename)throw Error('rename failure');if(!files.has(a))throw Error('missing');files.set(b,files.get(a));files.delete(a)}
 };
 const asset={Tag:{ALIAS:1,SECRET:2,RETURN_TYPE:3,ACCESSIBILITY:4,CONFLICT_RESOLUTION:5,SYNC_TYPE:6},ReturnType:{ALL:0,ATTRIBUTES:1},Accessibility:{DEVICE_UNLOCKED:2},ConflictResolution:{OVERWRITE:0},SyncType:{NEVER:0},
  async add(map){if(control.assetDelay)await control.assetDelay;secret=new Map(map)},async remove(){secret=null},
  async query(map){if(!secret)return [];const value=new Map(secret);if(map.get(3)===1)value.delete(2);return [value]}
 };
 const kit={
  '@kit.AbilityKit':{},'@kit.ArkUI':{},'@kit.ArkData':{},'@kit.AssetStoreKit':{asset},
  '@kit.CoreFileKit':{fileIo:nativeFs,picker:{DocumentSaveOptions:class{},DocumentSelectOptions:class{},DocumentViewPicker:class{async select(){return control.picker}async save(){return control.picker}}}},
  '@kit.ArkTS':{util:{TextEncoder:class{encodeInto(s){return new Uint8Array(Buffer.from(s,'utf8'))}},TextDecoder:{create(){return {decodeToString:b=>Buffer.from(b).toString('utf8')}}}},worker:{ThreadWorker:class{
   postMessage(job){setImmediate(()=>{try{const {LearningC}=load(path.join(root,'engine/LearningC.ts'));const summary={exerciseId:job.exerciseId,status:'passed',diagnostic:'',tests:[]};for(const t of job.tests){const r=LearningC.run(job.code,t.input),norm=s=>s.replace(/\r/g,'').trim().split('\n').map(x=>x.trimEnd()).join('\n');const passed=r.status==='ok'&&norm(r.output)===norm(t.expected);summary.tests.push({input:t.input,expected:t.expected,actual:r.output,passed});if(r.status!=='ok'){summary.status=r.status;summary.diagnostic=r.diagnostic;break}if(!passed)summary.status='wrong_answer'}this.onmessage?.({data:summary})}catch(e){this.onerror?.(e)}})}terminate(){}
  }}},
  '@kit.NetworkKit':{http:{RequestMethod:{POST:'POST',GET:'GET'},HttpDataType:{STRING:0},createHttp(){return {async request(url,options){control.httpCalls.push({url,options});if(control.pendingHttp)await control.pendingHttp;if(control.httpReply)return control.httpReply;if(url.endsWith('/models'))return {responseCode:200,result:JSON.stringify({data:[{id:'deepseek-flash',name:'Flash',effort:{supported_levels:['low','high','max']}},{id:'deepseek-v4-pro',name:'Pro'}]})};return {responseCode:200,result:JSON.stringify({choices:[{message:{content:'变量保存数据。'},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:8}})};},destroy(){}}}}}
 };
 function load(full){
  if(cache.has(full))return cache.get(full).exports;
  const source=fs.readFileSync(full,'utf8'),compiled=ts.transpileModule(source,{fileName:full.replace(/\.ets$/,'.ts'),compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}});
  const module={exports:{}};cache.set(full,module);
  const requireLocal=id=>{if(kit[id])return kit[id];let p=path.resolve(path.dirname(full),id);if(!path.extname(p))p+=fs.existsSync(p+'.ets')?'.ets':'.ts';return load(p)};
  vm.runInThisContext('(function(require,module,exports,ObservedV2,Trace){'+compiled.outputText+'\n})',{filename:full})(requireLocal,module,module.exports,value=>value,()=>{});
  return module.exports;
 }
 const context={filesDir:'/phone/private',resourceManager:{async getRawFileContent(){return new Uint8Array(Buffer.from(JSON.stringify(curriculum)))}},async openLink(){}};
 const {StudyController}=load(path.join(root,'services/StudyController.ets'));
 const controller=new StudyController();controller.setUIContext({getHostContext(){return undefined},getPromptAction(){return {async showDialog(){return {index:control.dialog}}}}});
 return {files,control,controller,context,load,secret:()=>secret};
}

test('native storage uses complete UTF8 writes, roundtrips state, and keeps keys outside files',async()=>{
 const f=fixture();await f.controller.init(f.context);f.control.chunk=7;
 assert.equal(f.controller.saveNote('c-01','中文笔记保留完整。'),true);
 await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');
 assert.equal(f.controller.hasApiKey,true);assert(f.secret());
 for(const data of f.files.values())assert(!data.toString().includes('FAKE_ONLY'));
 const {NativeStore}=f.load(path.join(root,'services/NativeStore.ets'));
 const loaded=new NativeStore().load(f.context,curriculum);
 assert.equal(loaded.notes['c-01'],'中文笔记保留完整。');assert.equal(loaded.settings.hasApiKey,false);
});

test('wrong quiz gives generic feedback; explicit hint persists assistance before disclosure',async()=>{
 const f=fixture();await f.controller.init(f.context);const q=curriculum.exercises.find(e=>e.type==='quiz');
 f.controller.submitQuiz(q.id,(q.answer+1)%q.choices.length);
 assert(!f.controller.lastQuiz.explanation.includes(q.hints[0]));
 f.controller.submitQuiz(q.id,q.answer);assert(f.controller.lessonProgress(q.lessonId).independentExercises.includes(q.id));
 assert.equal(f.controller.markHint(q.id),true);assert(!f.controller.lessonProgress(q.lessonId).independentExercises.includes(q.id));
 f.control.failWrite=true;const count=f.controller.state.attempts.length;assert.equal(f.controller.markHint(q.id),false);assert.equal(f.controller.state.attempts.length,count);
});

test('filesystem failure preserves graded state and cannot report settings/report/import success',async()=>{
 const f=fixture();await f.controller.init(f.context);f.controller.saveNote('c-01','Original');
 const original=JSON.stringify(f.controller.state),q=curriculum.exercises.find(e=>e.type==='quiz');
 f.control.failWrite=true;f.controller.submitQuiz(q.id,q.answer);assert.equal(JSON.stringify(f.controller.state),original);
 f.controller.saveReport(f.controller.today(),'Unwritten');assert.equal(JSON.stringify(f.controller.state),original);assert(f.controller.notice.includes('保存失败'));
 assert.equal(f.controller.saveAISettings('deepseek-v4-pro','max',65,false),false);assert.equal(JSON.stringify(f.controller.state),original);
 f.control.failWrite=false;
 const {createBackup}=f.load(path.join(root,'core/StateRules.ts'));const backup=createBackup(f.controller.state,curriculum);backup.state.notes['c-01']='Incoming';
 f.files.set('/chosen.json',Buffer.from(JSON.stringify(backup)));f.control.picker=['/chosen.json'];f.control.failWrite=true;
 await f.controller.importBackup();assert.equal(f.controller.state.notes['c-01'],'Original');assert(!f.controller.notice.includes('已导入'));
 f.control.failWrite=false;f.control.failRename=true;await f.controller.importBackup();
 assert([...f.files.keys()].some(p=>p.includes('-before-import-')));
 assert.equal(f.controller.state.notes['c-01'],'Original');assert(!f.controller.notice.includes('已导入'));
});

test('zero-length write fails safely; damaged primary recovers without overwriting good recovery copy',async()=>{
 const f=fixture();await f.controller.init(f.context);f.controller.saveNote('c-01','First');f.controller.saveNote('c-01','Second');
 const primary='/phone/private/learning-state.json',previous='/phone/private/learning-state.previous.json';
 const good=Buffer.from(f.files.get(previous));f.files.set(primary,Buffer.from('{broken'));
 const {NativeStore}=f.load(path.join(root,'services/NativeStore.ets'));const store=new NativeStore();const recovered=store.load(f.context,curriculum);assert.equal(recovered.notes['c-01'],'First');
 f.control.zeroWrite=true;assert.throws(()=>store.save(recovered));assert.deepEqual(f.files.get(previous),good);
 f.control.zeroWrite=false;store.save(recovered);assert.deepEqual(f.files.get(previous),good);assert.equal(JSON.parse(f.files.get(primary)).notes['c-01'],'First');
});

test('real learning engine results grant only interpreted provenance and unsupported code grants nothing',async()=>{
 const f=fixture();await f.controller.init(f.context);const e=curriculum.exercises.find(e=>e.type==='code');
 await f.controller.runCode(e.id,e.solution);assert.equal(f.controller.lastRun.status,'passed');assert.equal(f.controller.state.attempts.at(-1).engine,'learning-c');
 const before=f.controller.state.attempts.length;await f.controller.runCode(e.id,'#include <stdio.h>\nint main(void){system("bad");return 0;}');
 assert.equal(f.controller.lastRun.status,'unsupported');assert.equal(f.controller.state.attempts.length,before);
});

test('all model/effort payloads map correctly; no unselected code or private notes are transmitted',async()=>{
 const f=fixture();await f.controller.init(f.context);await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');
 const e=curriculum.exercises.find(e=>e.type==='code');f.controller.saveDraft(e.id,'PRIVATE_CODE_SENTINEL');f.controller.saveNote(e.lessonId,'PRIVATE_NOTE_SENTINEL');
 for(const model of ['deepseek-flash','deepseek-v4-pro'])for(const level of ['off','low','high','max']){
  f.controller.saveAISettings(model,level,55,true);await f.controller.ask('解释变量',e.lessonId,'',false);
  const request=f.control.httpCalls.at(-1),body=JSON.parse(request.options.extraData);
  assert.equal(body.model,model);assert.deepEqual(body.thinking,{type:level==='off'?'disabled':'enabled'});
  if(level==='off')assert(!('reasoning_effort'in body));else assert.equal(body.reasoning_effort,level);
  assert(!JSON.stringify(body).includes('PRIVATE_'));assert.equal(request.options.maxRedirects,0);assert.equal(request.options.usingProxy,false);
 }
 assert.equal(f.controller.state.chats.length,16);assert.equal(f.controller.state.attempts.length,0);assert.equal(f.controller.state.usage.requests,8);
 await f.controller.ask('解释代码',e.lessonId,e.id,true);assert(JSON.stringify(f.control.httpCalls.at(-1).options.extraData).includes('PRIVATE_CODE_SENTINEL'));assert(f.controller.isAssisted(e.id));
});

test('failed API preserves drafts/progress; no-final-answer length records usage without fake answer',async()=>{
 const f=fixture();await f.controller.init(f.context);await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');
 const before=JSON.stringify(f.controller.state);f.control.httpReply={responseCode:401,result:'private provider error'};
 await f.controller.ask('问题','c-01','',false);assert.equal(JSON.stringify(f.controller.state),before);assert(f.controller.notice.includes('API Key'));
 f.control.httpReply={responseCode:200,result:JSON.stringify({choices:[{message:{content:''},finish_reason:'length'}],usage:{prompt_tokens:4,completion_tokens:100}})};
 await f.controller.ask('问题','c-01','',false);assert.equal(f.controller.state.chats.length,0);assert.equal(f.controller.state.usage.outputTokens,100);assert(f.controller.notice.includes('尚未生成'));
});

test('HTTP success with unusable content preserves known usage without chats or exercise assistance',async()=>{
 const f=fixture();await f.controller.init(f.context);await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');
 const exercise=curriculum.exercises[0],meter={prompt_tokens:11,completion_tokens:13};
 const bodies=[{usage:meter},{choices:[],usage:meter},{choices:[null],usage:meter},{choices:[{}],usage:meter},{choices:[{message:{content:'  '},finish_reason:'stop'}],usage:meter},{choices:[{message:{content:null},finish_reason:'content_filter'}],usage:meter}];
 for(let i=0;i<bodies.length;i++){
  f.control.httpReply={responseCode:200,result:JSON.stringify(bodies[i])};
  await f.controller.ask('只记录有效回答',exercise.lessonId,exercise.id,false);
  assert.deepEqual(f.controller.state.usage,{requests:i+1,inputTokens:(i+1)*11,outputTokens:(i+1)*13});
  assert.equal(f.controller.state.chats.length,0);assert.equal(f.controller.state.attempts.length,0);assert.equal(f.controller.isAssisted(exercise.id),false);assert.equal(f.controller.aiBusy,false);
 }
 f.control.httpReply={responseCode:200,result:'not valid JSON'};await f.controller.ask('格式错误',exercise.lessonId,exercise.id,false);
 assert.equal(f.controller.state.usage.requests,bodies.length+1);assert.equal(f.controller.state.usage.inputTokens,bodies.length*11);assert.equal(f.controller.state.usage.outputTokens,bodies.length*13);assert.match(f.controller.notice,/token 用量未知/);
 f.control.httpReply={responseCode:200,result:'null'};await f.controller.ask('空响应',exercise.lessonId,exercise.id,false);assert.equal(f.controller.state.usage.requests,bodies.length+2);assert.equal(f.controller.state.chats.length,0);assert.equal(f.controller.state.attempts.length,0);
});

test('ask persists metering before conversation and a failed second write cannot fabricate assistance',async()=>{
 const f=fixture();await f.controller.init(f.context);await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');const exercise=curriculum.exercises[0];
 f.control.failWriteNumber=f.control.writes+2;
 await f.controller.ask('给一点提示',exercise.lessonId,exercise.id,false);
 assert.equal(f.controller.state.usage.requests,1);assert.equal(f.controller.state.chats.length,0);assert.equal(f.controller.state.attempts.length,0);assert.equal(f.controller.isAssisted(exercise.id),false);assert.match(f.controller.notice,/保存失败/);
 const saved=JSON.parse(f.files.get('/phone/private/learning-state.json').toString('utf8'));assert.equal(saved.usage.requests,1);assert.equal(saved.chats.length,0);assert.equal(saved.attempts.length,0);
 const before=JSON.stringify(f.controller.state);f.control.failWriteNumber=f.control.writes+1;await f.controller.ask('用量落盘也失败',exercise.lessonId,exercise.id,false);assert.equal(JSON.stringify(f.controller.state),before);assert.equal(f.controller.aiBusy,false);
});

test('record capacities and active-request settings lock prevent invalid persistent state',async()=>{
 const f=fixture();await f.controller.init(f.context);await f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');
 let release;f.control.pendingHttp=new Promise(r=>release=r);const pending=f.controller.ask('测试','c-01','',false);
 f.controller.saveAISettings('deepseek-v4-pro','max',60,true);assert.equal(f.controller.state.settings.model,'deepseek-flash');
 await f.controller.clearApiKey();assert(f.controller.hasApiKey);release();await pending;f.control.pendingHttp=null;
 f.controller.state.chats=Array(9999).fill(f.controller.state.chats[0]);const before=f.control.httpCalls.length;await f.controller.ask('容量测试','c-01','',false);assert.equal(f.control.httpCalls.length,before);
 f.controller.state.chats=[];f.controller.state.attempts=Array(100000).fill({});const q=curriculum.exercises.find(e=>e.type==='quiz');f.controller.submitQuiz(q.id,q.answer);assert.equal(f.controller.state.attempts.length,100000);
 f.controller.state.attempts=[];for(let i=0;i<10000;i++)f.controller.state.reports['existing-'+i]={note:''};
 f.controller.saveReport('2026-11-15','Must not add');assert.equal(Object.keys(f.controller.state.reports).length,10000);assert(f.controller.notice.includes('容量上限'));
});

test('saved state always fits compact backup envelope; oversized state leaves primary unchanged',async()=>{
 const f=fixture();await f.controller.init(f.context);f.controller.saveNote('c-01','Keep');
 const {NativeStore}=f.load(path.join(root,'services/NativeStore.ets'));const store=new NativeStore();store.load(f.context,curriculum);
 const primary='/phone/private/learning-state.json',before=Buffer.from(f.files.get(primary));
 f.controller.state.notes['c-01']='x'.repeat(10*1024*1024);
 assert.throws(()=>store.save(f.controller.state),/容量/);assert.deepEqual(f.files.get(primary),before);
});

test('credential operations serialize and timer pauses on lifecycle without phantom progress',async()=>{
 const f=fixture();await f.controller.init(f.context);let release;f.control.assetDelay=new Promise(r=>release=r);
 const saving=f.controller.saveApiKey('FAKE_ONLY_NOT_A_REAL_KEY_123');await f.controller.clearApiKey();assert(f.controller.credentialBusy);release();await saving;assert(f.controller.hasApiKey);
 f.controller.toggleTimer('c-01');f.controller.lastFlush=Date.now()-2100;f.controller.pauseTimer();assert.equal(f.controller.timerRunning,false);assert.equal(f.controller.state.sessions.length,1);assert.equal(f.controller.state.sessions[0].seconds,2);assert.equal(f.controller.state.attempts.length,0);
});
