'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const root=path.resolve(__dirname,'../entry/src/main/ets');
const curriculum=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../entry/src/main/resources/rawfile/curriculum.json'),'utf8'));

// Only operating-system boundaries are mocked: controller, store, AI provider,
// training rules/templates, worker module and interpreter are production code.
function fixture(){
 const files=new Map(),handles=new Map(),cache=new Map();let fd=0,secret=null;
 const control={failWrite:false,failRename:false,failWriteNumber:0,writes:0,httpCalls:[],pendingHttp:null,httpStatus:200,httpBody:null,replyContent:'{"templateId":"c-arith-add","seed":77}',workerJobs:[],pendingWorker:null,workerError:false,beforeWorkerReply:null};
 const nativeFs={OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4,WRITE_ONLY:8,READ_ONLY:16},accessSync:p=>files.has(p),
  readTextSync(p){if(!files.has(p))throw Error('missing');return files.get(p).toString('utf8')},
  openSync(p,mode){if(mode&1||mode&4)files.set(p,Buffer.alloc(0));if(!files.has(p))throw Error('missing');const n=++fd;handles.set(n,{p,offset:0});return {fd:n}},
  closeSync:n=>handles.delete(n),writeSync(n,b){control.writes++;if(control.failWrite||control.writes===control.failWriteNumber)throw Error('disk full');const h=handles.get(n),bytes=Buffer.from(new Uint8Array(b)),old=files.get(h.p);files.set(h.p,Buffer.concat([old.subarray(0,h.offset),bytes,old.subarray(h.offset+bytes.length)]));h.offset+=bytes.length;return bytes.length},
  fsyncSync(){},copyFileSync(a,b){files.set(b,Buffer.from(files.get(a)))},renameSync(a,b){if(control.failRename)throw Error('rename failed');files.set(b,files.get(a));files.delete(a)},
  statSync:n=>({size:files.get(handles.get(n).p).length}),readSync(n,b){const bytes=files.get(handles.get(n).p);new Uint8Array(b).set(bytes);return bytes.length}
 };
 const asset={Tag:{ALIAS:1,SECRET:2,RETURN_TYPE:3,ACCESSIBILITY:4,CONFLICT_RESOLUTION:5,SYNC_TYPE:6},ReturnType:{ALL:0,ATTRIBUTES:1},Accessibility:{DEVICE_UNLOCKED:2},ConflictResolution:{OVERWRITE:0},SyncType:{NEVER:0},
  async add(value){secret=new Map(value)},async remove(){secret=null},async query(query){if(!secret)return [];const value=new Map(secret);if(query.get(3)===1)value.delete(2);return [value]}
 };
 const kit={
  '@kit.AbilityKit':{},'@kit.ArkUI':{},'@kit.ArkData':{},'@kit.AssetStoreKit':{asset},
  '@kit.CoreFileKit':{fileIo:nativeFs,picker:{DocumentSaveOptions:class{},DocumentSelectOptions:class{},DocumentViewPicker:class{async select(){return []}async save(){return []}}}},
  '@kit.ArkTS':{util:{TextEncoder:class{encodeInto(s){return new Uint8Array(Buffer.from(s))}},TextDecoder:{create(){return {decodeToString:b=>Buffer.from(b).toString('utf8')}}}},worker:{ThreadWorker:class{
   postMessage(job){control.workerJobs.push(job);setImmediate(async()=>{if(control.pendingWorker)await control.pendingWorker;if(control.workerError){this.onerror?.(new Error('worker unavailable'));return;}try{const port={postMessage:summary=>{control.beforeWorkerReply?.();this.onmessage?.({data:summary})}};load(path.join(root,'workers/PracticeWorker.ets'),{'@kit.ArkTS':{worker:{workerPort:port}}});port.onmessage({data:job});}catch(e){this.onerror?.(e)}})}terminate(){}
  }}},
  '@kit.NetworkKit':{http:{RequestMethod:{POST:'POST',GET:'GET'},HttpDataType:{STRING:0},createHttp(){return {async request(url,options){control.httpCalls.push({url,options});if(control.pendingHttp)await control.pendingHttp;if(url.endsWith('/models'))return {responseCode:200,result:JSON.stringify({data:[{id:'deepseek-flash',effort:{supported_levels:['low','high','max']}}]})};return {responseCode:control.httpStatus,result:control.httpBody??JSON.stringify({choices:[{message:{content:control.replyContent},finish_reason:control.replyContent?'stop':'length'}],usage:{prompt_tokens:7,completion_tokens:8}})}},destroy(){}}}}}
 };
 function load(full,overrides){
  if(!overrides&&cache.has(full))return cache.get(full).exports;
  const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full.replace(/\.ets$/,'.ts'),compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}});
  const module={exports:{}};if(!overrides)cache.set(full,module);
  const requireLocal=id=>{if(overrides?.[id])return overrides[id];if(kit[id])return kit[id];let p=path.resolve(path.dirname(full),id);if(!path.extname(p))p+=fs.existsSync(p+'.ets')?'.ets':'.ts';return load(p)};
  vm.runInThisContext('(function(require,module,exports,ObservedV2,Trace){'+compiled.outputText+'\n})',{filename:full})(requireLocal,module,module.exports,value=>value,()=>{});return module.exports;
 }
 const context={filesDir:'/phone/private',resourceManager:{async getRawFileContent(){return new Uint8Array(Buffer.from(JSON.stringify(curriculum)))}},async openLink(){}};
 const {StudyController}=load(path.join(root,'services/StudyController.ets'));
 const controller=new StudyController();
 const bank=load(path.join(root,'training/TrainingBank.ts')),rules=load(path.join(root,'training/TrainingRules.ts'));
 return {files,control,controller,context,bank,rules,load};
}
async function ready(ai=false){const f=fixture();await f.controller.init(f.context);if(ai)await f.controller.saveApiKey('FAKE_ONLY_TRAINING_TEST_KEY_123');return f;}
const stored=f=>JSON.parse(f.files.get('/phone/private/learning-state.json').toString('utf8'));

test('selection persists canonical identity and failures do not publish a new selection',async()=>{
 const f=await ready(),c=f.controller;
 const q=c.selectTraining(2,'variables');assert.equal(q.skillId,'variables');assert.equal(q.level,2);assert.equal(stored(f).training.lastQuestionId,q.id);
 const before=JSON.stringify(c.state);f.control.failWrite=true;assert.equal(c.selectTraining(1,'output'),undefined);assert.equal(JSON.stringify(c.state),before);
 f.control.failWrite=false;assert.equal(c.selectTraining(3,'output'),undefined);assert.equal(c.selectTraining(1,'unknown'),undefined);assert.equal(JSON.stringify(c.state),before);
});

test('training drafts cap characters and evict least recently saved without touching help or attempts',async()=>{
 const f=await ready(),c=f.controller;
 for(let i=0;i<288;i++)c.state.training.drafts['tr:c-arith-add:'+i]='draft '+i;
 const oldest='tr:c-arith-add:0',second='tr:c-arith-add:1';
 assert(c.saveTrainingDraft(oldest,'updated'));assert(c.saveTrainingDraft('tr:c-arith-add:500','x'.repeat(12001)));
 assert.equal(Object.keys(c.state.training.drafts).length,288);assert.equal(c.state.training.drafts[second],undefined);assert.equal(c.state.training.drafts[oldest],'updated');assert.equal(c.state.training.drafts['tr:c-arith-add:500'].length,12000);
 assert.equal(c.saveTrainingDraft('tr:stm32-foundations:0','bad'),false);assert.equal(c.saveTrainingDraft('invalid','bad'),false);
 const before=JSON.stringify(c.state);f.control.failRename=true;assert.equal(c.saveTrainingDraft(oldest,'not persisted'),false);assert.equal(JSON.stringify(c.state),before);
});

test('quiz feedback is real, incorrect answers do not disclose answers and help is permanently sticky',async()=>{
 const f=await ready(),c=f.controller,q=f.bank.getTrainingQuestion('tr:c-output-precedence:0');
 const wrong=c.submitTrainingQuiz(q.id,(q.answer+1)%4);assert.equal(wrong.correct,false);assert(!wrong.explanation.includes(q.explanation));
 assert.equal(c.submitTrainingQuiz(q.id,q.answer).correct,true);assert.equal(c.state.training.attempts.at(-1).assisted,false);
 assert(c.trainingHelp(q.id));assert(c.state.training.attempts.every(a=>a.assisted));
 c.submitTrainingQuiz(q.id,q.answer);assert.equal(c.state.training.attempts.at(-1).assisted,true);assert.equal(c.state.attempts.length,0);
 assert.equal(c.submitTrainingQuiz(q.id,NaN),undefined);
 const before=JSON.stringify(c.state);f.control.failWrite=true;
 const unsaved=c.submitTrainingQuiz(q.id,q.answer);assert.equal(unsaved.correct,true);assert.match(unsaved.explanation,/未保存/);assert.equal(JSON.stringify(c.state),before);
 assert.equal(c.trainingHelp('tr:c-arith-add:0'),false);assert.equal(JSON.stringify(c.state),before);
});

test('production worker grades canonical tests; unsupported and failed worker never earn attempts',async()=>{
 const f=await ready(),c=f.controller,q=f.bank.getTrainingQuestion('tr:c-arith-add:12');
 const passed=await c.runTrainingCode(q.id,q.solution);assert.equal(passed.status,'passed');assert.equal(c.state.training.attempts.at(-1).status,'passed');assert.deepEqual(f.control.workerJobs[0].tests,q.tests);
 const count=c.state.training.attempts.length;
 const unsupported=await c.runTrainingCode(q.id,'int main(void){system("bad");return 0;}');assert.equal(unsupported.status,'unsupported');assert.equal(c.state.training.attempts.length,count);
 f.control.workerError=true;assert.equal((await c.runTrainingCode(q.id,q.solution)).status,'tool_error');assert.equal(c.state.training.attempts.length,count);assert.equal(c.runBusy,false);
 f.control.workerError=false;f.control.beforeWorkerReply=()=>{f.control.failWrite=true};
 const unsaved=await c.runTrainingCode(q.id,q.solution);assert.equal(unsaved.status,'passed');assert.match(unsaved.diagnostic,/未保存/);assert.equal(c.state.training.attempts.length,count);
});

test('training and course execution share the worker lock; help during execution remains assisted',async()=>{
 const f=await ready(),c=f.controller,q=f.bank.getTrainingQuestion('tr:c-arith-add:0'),course=curriculum.exercises.find(e=>e.type==='code');
 let release;f.control.pendingWorker=new Promise(r=>release=r);const running=c.runTrainingCode(q.id,q.solution);
 assert(c.runBusy);assert.equal(await c.runTrainingCode(q.id,q.solution),undefined);await c.runCode(course.id,course.solution);assert.equal(f.control.workerJobs.length,1);
 assert(c.trainingHelp(q.id));release();await running;assert.equal(c.state.training.attempts.at(-1).assisted,true);
 assert.equal(c.state.attempts.length,0);assert.equal(c.runBusy,false);
});

test('AI sends only bounded skill summary and allowlist, produces local answers, and records use',async()=>{
 const f=await ready(true),c=f.controller;
 c.state.notes['c-01']='PRIVATE_NOTE';c.state.drafts['x']='PRIVATE_CODE';c.state.chats.push({role:'user',content:'PRIVATE_CHAT',id:'private',lessonId:'c-01',createdAt:new Date().toISOString()});c.state.training.drafts['tr:c-arith-add:0']='PRIVATE_TRAINING_CODE';
 const q=await c.generateTrainingVariant(1,'variables');assert.equal(q.id,'tr:c-arith-add:77');assert.equal(q.solution,f.bank.generate({templateId:'c-arith-add',seed:77}).solution);
 const request=f.control.httpCalls.at(-1),payload=JSON.parse(request.options.extraData);
 assert(!JSON.stringify(payload).includes('PRIVATE_'));assert.equal(payload.messages.length,2);assert.match(payload.messages[1].content,/c-arith-add, c-arith-scale/);assert(!payload.messages[1].content.includes('c-divmod'));
 assert.equal(c.state.usage.requests,1);assert.equal(c.state.usage.inputTokens,7);assert.equal(c.state.usage.outputTokens,8);assert.equal(c.state.training.lastQuestionId,q.id);assert.equal(c.state.training.attempts.length,0);assert.equal(c.state.chats.length,1);
 for(const content of f.files.values())assert(!content.toString().includes('FAKE_ONLY_TRAINING_TEST_KEY'));
});

test('invalid, mismatched, fixed-template and base-seed AI recipes consume usage but create nothing',async()=>{
 const f=await ready(true),c=f.controller;
 const invalid=['not json','```json\n{"templateId":"c-arith-add","seed":50}\n```','{"templateId":"c-arith-add","seed":50,"answer":999}','{"templateId":"c-arith-add","seed":11}','{"templateId":"c-divmod","seed":50}','{"templateId":"stm32-foundations","seed":50}','{"templateId":"c-arith-add","seed":10000}',''];
 for(const reply of invalid){f.control.replyContent=reply;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);}
 assert.equal(c.state.usage.requests,invalid.length);assert.equal(c.state.training.lastQuestionId,'');assert.equal(c.state.training.attempts.length,0);assert.equal(c.state.chats.length,0);
 const calls=f.control.httpCalls.length;assert.equal(await c.generateTrainingVariant(1,'stm32'),undefined);assert.equal(f.control.httpCalls.length,calls);
 f.control.httpStatus=401;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);assert.equal(c.state.usage.requests,invalid.length);assert.match(c.notice,/API Key/);
});

test('training preserves usage from unusable provider responses and never invents a recipe',async()=>{
 const f=await ready(true),c=f.controller,usage={prompt_tokens:19,completion_tokens:23};
 const bodies=[{usage},{choices:[],usage},{choices:[null],usage},{choices:[{}],usage},{choices:[{message:{content:''},finish_reason:'stop'}],usage}];
 for(let i=0;i<bodies.length;i++){
  f.control.httpBody=JSON.stringify(bodies[i]);assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);
  assert.deepEqual(c.state.usage,{requests:i+1,inputTokens:(i+1)*19,outputTokens:(i+1)*23});
  assert.equal(c.state.training.lastQuestionId,'');assert.equal(c.state.training.attempts.length,0);assert.equal(c.state.training.assistedQuestionIds.length,0);assert.equal(c.state.chats.length,0);assert.equal(c.aiBusy,false);
 }
 f.control.httpBody='{broken JSON';assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);
 assert.equal(c.state.usage.requests,bodies.length+1);assert.equal(c.state.usage.inputTokens,bodies.length*19);assert.equal(c.state.usage.outputTokens,bodies.length*23);assert.equal(c.state.training.lastQuestionId,'');
});

test('AI recipe/usage persistence failures and lock/capacity gates never fake a generated question',async()=>{
 const f=await ready(true),c=f.controller;
 f.control.failWriteNumber=f.control.writes+2;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);
 assert.equal(c.state.usage.requests,1);assert.equal(c.state.training.lastQuestionId,'');assert.equal(stored(f).usage.requests,1);
 f.control.failWrite=true;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);assert.equal(c.state.usage.requests,1);assert.equal(c.state.training.lastQuestionId,'');f.control.failWrite=false;
 let release;f.control.pendingHttp=new Promise(r=>release=r);const pending=c.generateTrainingVariant(1,'variables');assert(c.aiBusy);await new Promise(r=>setImmediate(r));
 const calls=f.control.httpCalls.length;await c.ask('do not send','c-01','',false);assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);await c.clearApiKey();assert(c.hasApiKey);assert.equal(c.saveAISettings('deepseek-flash','max',55,true),false);assert.equal(f.control.httpCalls.length,calls);
 release();await pending;f.control.pendingHttp=null;assert.equal(c.aiBusy,false);
 const before=f.control.httpCalls.length;c.credentialBusy=true;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);c.credentialBusy=false;
 c.state.settings.reasoningEffort='invalid';assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);c.state.settings.reasoningEffort='high';c.state.usage.requests=1e12;assert.equal(await c.generateTrainingVariant(1,'variables'),undefined);assert.equal(f.control.httpCalls.length,before);
});

test('adaptive AI respects local promotion and all-skills accepts only its selected target',async()=>{
 const f=await ready(true),c=f.controller;
 for(let seed=0;seed<3;seed++){const q=f.bank.getTrainingQuestion('tr:c-branch-threshold:'+seed);c.state.training=f.rules.recordTrainingAttempt(c.state.training,q,'passed',false);}
 f.control.replyContent='{"templateId":"c-branch-clamp","seed":19}';const q=await c.generateTrainingVariant('adaptive','branches');assert.equal(q.level,2);
 const originalRandom=Math.random;Math.random=()=>0;
 try {
  f.control.replyContent='{"templateId":"c-output-line","seed":19}';const all=await c.generateTrainingVariant(1,'');assert(all);assert.equal(all.skillId,'output');
  const fresh=f.rules.freshTrainingState();let seed=0;while(f.rules.selectTrainingQuestion(fresh,1,'',seed).skillId!=='stm32')seed++;
  c.state.training=fresh;Math.random=()=>seed/4294967296;
  const fallback=await c.generateTrainingVariant(1,'');assert(fallback);assert.equal(fallback.skillId,'output');
 }
 finally {Math.random=originalRandom;}
});
