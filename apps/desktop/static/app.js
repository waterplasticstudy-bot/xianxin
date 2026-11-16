'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  book:'<path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  repeat:'<path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4-4m-4 4 4 4"/>',
  chart:'<path d="M4 3v17h17M8 15v-5m5 5V6m5 9v-3"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 10h9M7 14h6"/>',
  settings:'<path d="m9 3-1 3-3 1v4l-2 1 2 2v4l3 1 1 2h6l1-2 3-1v-4l2-2-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  back:'<path d="m15 5-7 7 7 7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>',
  pause:'<path d="M8 4v16M16 4v16"/>',
  chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx=".5"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  flag:'<path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  external:'<path d="M13 4h7v7m0-7L10 14m-1-9H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  light:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9Z"/>',
  file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3M7 17h3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  send:'<path d="m3 11 18-8-8 18-2-8Zm8 2L21 3"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>'
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.book}</svg>`;
const button = (label, action, cls = '', extra = '', symbol = '') => `<button class="button ${cls}" type="button" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label}</button>`;
const linkButton = (label, hash, cls = '', symbol = '') => `<a class="button ${cls}" href="${hash}">${symbol ? icon(symbol) : ''}${label}</a>`;
const successStatuses = new Set(['passed', 'correct']);
let app = {curriculum:{modules:[],lessons:[],exercises:[],resources:[]},state:{},environment:{},csrfToken:''};
let activeLessonId = '';
let route = {name:'today',id:'',params:new URLSearchParams()};
let initialized = false;
let pageEpoch = 0;
let chatBusy = false;
let pendingMessage = '';
let chatDraft = '';
let contextExerciseId = '';
let includeChatCode = false;
let models = [];
let modelLoading = false;
let modelKeySaving = false;
let modelStatus = '';
let modelStatusError = false;
let modelsLoaded = false;
let settingsDraft = null;
let settingsSaving = false;
let askSettingsSaving = false;
let askSettingsPending = null;
let askSettingsStatus = {text:'选择后自动保存，用于下一条问题。',error:false};
let latestChatWarning = null;
const knownModelIds = ['deepseek-flash','deepseek-v4-pro','deepseek-chat','deepseek-reasoner'];
const effortLabels = {low:'低 · 更快响应',high:'高 · 深入思考',max:'最高 · 更充分思考'};
let practiceType = 'all';
let practiceLesson = 'all';
let practiceStatus = 'all';
let practiceSearch = '';
let selectedExerciseId = '';
let reportDate = today();
const exerciseResults = new Map();
const answers = new Map();
const hintCounts = new Map();
const visibleSolutions = new Set();
const busyExercises = new Set();
const pendingDrafts = new Map();
const pendingNotes = new Map();
const draftTimers = new Map();
const noteTimers = new Map();
const draftSaves = new Map();
const noteSaves = new Map();
let reportDraft = null;
let dialogResolve = null;
let resetBusy = false;
const pendingMutations = new Set();
const readingKey = 'xianxin-reading-positions-v1';
let readingPositions = {};
try { readingPositions = JSON.parse(sessionStorage.getItem(readingKey) || '{}') || {}; } catch {}
if (typeof readingPositions !== 'object' || Array.isArray(readingPositions)) readingPositions = {};
let readingSaveTimer = null;

function rememberReadingPosition() {
  if (route.name !== 'lesson' || !lessonById(route.id)?.available) return;
  const anchors = $$('.lesson-article > [id]');
  const anchor = anchors.filter(node => node.getBoundingClientRect().top <= 120).at(-1);
  readingPositions[route.id] = {y: window.scrollY, anchor: anchor?.id || '', offset: anchor ? anchor.getBoundingClientRect().top : 0};
  clearTimeout(readingSaveTimer);
  readingSaveTimer = setTimeout(() => {
    try { sessionStorage.setItem(readingKey, JSON.stringify(readingPositions)); } catch {}
  }, 250);
}
function restoreReadingPosition(id) {
  const position = readingPositions[id];
  const epoch = pageEpoch;
  requestAnimationFrame(() => {
    if (epoch !== pageEpoch || route.name !== 'lesson' || route.id !== id) return;
    const anchor = position?.anchor && document.getElementById(position.anchor);
    const y = anchor ? window.scrollY + anchor.getBoundingClientRect().top - position.offset : Number(position?.y) || 0;
    window.scrollTo({top: Math.max(0, y), behavior: 'instant'});
  });
}

function storageGet(key, fallback) { try { const value=localStorage.getItem(key); return value===null?fallback:JSON.parse(value); } catch { return fallback; } }
function storageSet(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch { return false; } }
function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function dateLabel(date = today(), options = {}) { return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',month:'long',day:'numeric',...options}).format(new Date(date+'T12:00:00+08:00')); }
function addDays(date, delta) { const d=new Date(date+'T12:00:00+08:00'); d.setUTCDate(d.getUTCDate()+delta); return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
function dayDifference(a,b) { return Math.floor((new Date(a+'T12:00:00+08:00')-new Date(b+'T12:00:00+08:00'))/86400000); }
function eventDate(item) { if (/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')) return item.date; try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.createdAt));}catch{return '';} }
function localTime(timestamp) { try{return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(timestamp));}catch{return '';} }
function normalizeState(state) { return {...state,progress:state.progress||{},drafts:state.drafts||{},notes:state.notes||{},settings:{dailyMinutes:55,model:'',aiEnabled:false,hasApiKey:false,thinkingMode:'enabled',reasoningEffort:'high',...state.settings},sessions:state.sessions||[],attempts:state.attempts||[],chats:state.chats||[],reports:state.reports||{},usage:{requests:0,inputTokens:0,outputTokens:0,...state.usage}}; }
function adoptState(state, only) { if(!state)return; const normalized=normalizeState(state); app.state=only?{...app.state,...Object.fromEntries(only.map(k=>[k,normalized[k]]))}:normalized; pendingDrafts.forEach((code,id)=>{app.state.drafts[id]=code;}); pendingNotes.forEach((text,id)=>{app.state.notes[id]=text;}); }
function lessons() { return [...app.curriculum.lessons].sort((a,b)=>{const ma=app.curriculum.modules.find(m=>m.id===a.moduleId)?.order||0; const mb=app.curriculum.modules.find(m=>m.id===b.moduleId)?.order||0;return ma-mb||a.order-b.order;}); }
function availableLessons() { return lessons().filter(l=>l.available); }
function lessonById(id) { return app.curriculum.lessons.find(l=>l.id===id); }
function exerciseById(id) { return app.curriculum.exercises.find(e=>e.id===id); }
function lessonExercises(lesson) { if(!lesson)return [];return (lesson.exerciseIds||[]).map(exerciseById).filter(Boolean); }
function progress(id) { return app.state.progress[id]||{passedExercises:[],independentExercises:[],status:'',assisted:false}; }
function passed(exercise) { return (progress(exercise.lessonId).passedExercises||[]).includes(exercise.id); }
function independent(exercise) { return (progress(exercise.lessonId).independentExercises||[]).includes(exercise.id); }
function assisted(exercise) { return app.state.attempts.some(a=>a.exerciseId===exercise.id&&a.assisted) || (passed(exercise)&&!independent(exercise)) || (hintCounts.get(exercise.id)||0)>0 || visibleSolutions.has(exercise.id); }
function nextLesson() { return availableLessons().find(l=>progress(l.id).status==='learning') || availableLessons().find(l=>progress(l.id).status!=='completed') || availableLessons()[0]; }
function currentLesson() { return lessonById(activeLessonId)||nextLesson(); }
function savedSeconds(date = today()) { return app.state.sessions.filter(s=>eventDate(s)===date).reduce((n,s)=>n+Math.max(0,Number(s.seconds)||0),0); }
function effectiveTodaySeconds() { const savedIds=new Set(app.state.sessions.map(s=>s.id));return savedSeconds()+timer.pending+sessionQueue.filter(s=>s.date===today()&&!savedIds.has(s.id)).reduce((n,s)=>n+s.seconds,0); }
function completedLessons() { return availableLessons().filter(l=>progress(l.id).status==='completed'); }
function independentCount() { return app.curriculum.exercises.filter(independent).length; }
function completedCount() { return app.curriculum.exercises.filter(passed).length; }
function exerciseStatusTag(exercise) { if(independent(exercise))return `<span class="tag green">${icon('check')}独立通过</span>`; if(passed(exercise))return `<span class="tag amber">助学通过</span>`;if(assisted(exercise))return '<span class="tag amber">已使用提示</span>';return ''; }
function rawDraft(exercise) { return app.state.drafts[exercise.id] ?? exercise.starter ?? ''; }
function resourceURL(resource) { try{const url=new URL(resource.url);return url.protocol==='https:'?url.href:'';}catch{return '';} }
function plainInline(text) { return esc(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>'); }
function prose(text) { const chunks=String(text||'').split(/\n\s*\n/);return chunks.map(chunk=>{const lines=chunk.trim().split('\n');if(lines.every(l=>/^\s*[-•]\s+/.test(l)))return '<ul>'+lines.map(l=>'<li>'+plainInline(l.replace(/^\s*[-•]\s+/,''))+'</li>').join('')+'</ul>';if(lines.every(l=>/^\s*\d+[.)、]\s*/.test(l)))return '<ol>'+lines.map(l=>'<li>'+plainInline(l.replace(/^\s*\d+[.)、]\s*/,''))+'</li>').join('')+'</ol>';return '<p>'+lines.map(plainInline).join('<br>')+'</p>';}).join(''); }
function chatMarkup(text) { return String(text).split(/```[^\n]*\n([\s\S]*?)```/g).map((part,i)=>i%2?'<pre><code>'+esc(part.trim())+'</code></pre>':prose(part)).join(''); }
function codeBlock(code, label='C · 示例代码') { return `<div class="code-block"><div class="code-bar"><span>${esc(label)}</span><button type="button" class="copy-button" data-action="copy-code">复制</button></div><pre><code>${esc(code)}</code></pre></div>`; }

function api(path, data, options={}) {
  const request = requestAPI(path, data, options);
  if (data === undefined) return request;
  const tracked = request.finally(() => pendingMutations.delete(tracked));
  pendingMutations.add(tracked);
  return tracked;
}
async function requestAPI(path, data, options={}) {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),options.timeout||45000);
  try { const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Local-Token':app.csrfToken},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,cache:'no-store',keepalive:options.keepalive||false});
    let result;try{result=await response.json();}catch{throw new Error('本地服务返回了无法读取的内容。请刷新或检查服务窗口。');}
    if(!response.ok||result.error)throw new Error(result.error||`请求未完成（${response.status}）`);return result;
  } catch(error) { if(error.name==='AbortError')throw new Error('请求超时，请稍后重试。你输入的内容仍保留在页面中。');if(error instanceof TypeError)throw new Error('暂时连不上本地服务。请确认学习空间的服务窗口仍在运行。');throw error; }
  finally { clearTimeout(timeout); }
}
function toast(message,type='success') { const el=document.createElement('div');el.className='toast'+(type==='error'?' error':'');el.innerHTML=icon(type==='error'?'info':'check')+'<span>'+esc(message)+'</span>';$('#toasts').append(el);setTimeout(()=>el.remove(),type==='error'?7000:4000); }
function pageHeading(kicker,title,subtitle='') { return `<div class="page-heading"><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>`; }
function emptyState(symbol,title,message,cta='',href='') { return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h2>${esc(title)}</h2><p>${esc(message)}</p>${cta?linkButton(esc(cta),href,'primary','arrow'):''}</div>`; }

function dueReviews() {
  return completedLessons().map(l=>{const p=progress(l.id);const attempts=app.state.attempts.filter(a=>a.lessonId===l.id&&successStatuses.has(a.status));const dates=attempts.map(eventDate).filter(Boolean).sort();const last=dates.at(-1)||String(p.updatedAt||'').slice(0,10)||today();const age=Math.max(0,dayDifference(today(),last));return {lesson:l,last,age,due:age>=1};}).sort((a,b)=>b.age-a.age);
}
function renderSidebar() {
  const nav=[['today','home','今日学习'],['courses','book','课程地图'],['practice','code','动手练习'],['review','repeat','温故知新'],['report','chart','学习日报']];
  const active=route.name==='lesson'?'courses':route.name;const count=dueReviews().filter(r=>r.due).length;
  $('#sidebar').innerHTML=`<a class="brand" href="#today" aria-label="闲芯，返回今日学习"><img class="brand-mark" src="/xianxin-icon.png" alt="" width="44" height="44"><div><div class="brand-title">闲芯</div><div class="brand-subtitle">慢慢学，认真懂</div></div></a><div class="nav-label">学习空间</div><nav class="nav-group">${nav.map(([id,symbol,label])=>`<a class="nav-link ${active===id?'active':''}" href="#${id}" ${active===id?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span>${id==='review'&&count?`<span class="nav-count">${count}</span>`:''}</a>`).join('')}</nav><div class="nav-label">一起探索</div><nav class="nav-group"><a class="nav-link ${active==='ask'?'active':''}" href="#ask" ${active==='ask'?'aria-current="page"':''}>${icon('chat')}<span>问问 AI</span></a></nav><div class="sidebar-bottom"><a class="nav-link ${active==='settings'?'active':''}" href="#settings" ${active==='settings'?'aria-current="page"':''}>${icon('settings')}<span>设置与环境</span></a><div class="local-indicator"><span class="status-dot"></span>本地学习空间<span style="margin-left:auto;font-family:var(--mono);font-size:10px">DESKTOP</span></div></div>`;
}
function renderTopbar() {
  const titles={today:'今日学习',courses:'课程地图',lesson:lessonById(route.id)?.title||'课程',practice:'动手练习',review:'温故知新',report:'学习日报',ask:'问问 AI',settings:'设置与环境'};
  $('#topbar').innerHTML=`<button type="button" class="icon-button menu-toggle" data-action="open-menu" aria-label="打开导航" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-home">学习空间</span>${icon('chevron')}<span>${esc(titles[route.name]||'今日学习')}</span></div><div class="topbar-right"><span class="topbar-date">${dateLabel(today(),{weekday:'long'})}</span><button type="button" class="timer-control" data-action="toggle-timer" id="header-timer" title="点击开始或暂停学习计时">${icon('play')}<span class="timer-label">今日专注</span><strong data-timer-display>00:00</strong></button></div>`;
  document.title='闲芯 · 慢慢学，认真懂';
}
function chipArt() { return `<div class="hero-art" aria-hidden="true"><svg viewBox="0 0 360 310" fill="none"><defs><pattern id="chip-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#d8dfe8"/></pattern><linearGradient id="chip-top" x1="115" y1="65" x2="260" y2="230" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf1f6"/></linearGradient><filter id="chip-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#51657e" flood-opacity=".08"/></filter></defs><rect x="15" y="15" width="330" height="280" fill="url(#chip-grid)"/><g stroke="#dce3ec" stroke-width="1.3"><path d="M15 103h50l26 26h27M16 213h49l29-29h24M40 156h78M40 248h42l22-22h36M242 111h25l24-24h40M242 156h101M242 201h26l22 22h44M156 56V25M203 56V15M156 254v35M203 254v45"/><circle cx="15" cy="103" r="3" fill="white"/><circle cx="16" cy="213" r="3" fill="white"/><circle cx="40" cy="156" r="3" fill="white"/><circle cx="40" cy="248" r="3" fill="white"/><circle cx="331" cy="87" r="3" fill="white"/><circle cx="343" cy="156" r="3" fill="white"/><circle cx="334" cy="223" r="3" fill="white"/></g><g stroke="#bac8da" stroke-width="5" stroke-linecap="round"><path d="M134 70V57m23 13V57m23 13V57m23 13V57m23 13V57M134 242v13m23-13v13m23-13v13m23-13v13m23-13v13M94 110h15m-15 23h15m-15 23h15m-15 23h15m-15 23h15M251 110h15m-15 23h15m-15 23h15m-15 23h15m-15 23h15"/></g><g filter="url(#chip-shadow)"><rect x="109" y="76" width="142" height="165" rx="17" fill="#e4eaf2" stroke="#d8e0eb"/><rect x="109" y="70" width="142" height="165" rx="17" fill="url(#chip-top)" stroke="#c9d4e3"/><rect x="121" y="82" width="118" height="141" rx="10" stroke="#e4eaf1"/><circle cx="132" cy="93" r="2" fill="#bcc9d9"/><path d="m163 127-14 12 14 12m34-24 14 12-14 12m-11-29-10 35" stroke="#6a8cb7" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><text x="180" y="180" text-anchor="middle" fill="#5a6b82" font-size="16" font-family="-apple-system,Segoe UI,sans-serif" letter-spacing="2">STM32</text><text x="180" y="198" text-anchor="middle" fill="#a2adbd" font-size="7" font-family="Consolas,monospace" letter-spacing="1.4">START WITH C</text></g><path d="M15 103h50l26 26h18" stroke="#79a7e6" stroke-width="1.5"/><circle cx="15" cy="103" r="3" fill="#6b9fdf" stroke="white" stroke-width="1.4"/><circle cx="295" cy="156" r="4.5" fill="#eef5ff" stroke="#8eb2e2"/><circle cx="295" cy="156" r="1.5" fill="#6d9bd7"/><rect x="250" y="262" width="68" height="20" rx="5" fill="white" stroke="#e1e7ef"/><circle cx="261" cy="272" r="2" fill="#82a395"/><text x="270" y="275" fill="#8b99ad" font-size="7" font-family="Consolas,monospace">NO BOARD</text></svg><div class="hero-art-label">A SMALL START. A REAL SKILL.</div></div>`; }
function renderToday() {
  const next=nextLesson();const daily=app.state.settings.dailyMinutes;const mins=Math.floor(effectiveTodaySeconds()/60);const total=availableLessons().length;const complete=completedLessons().length;const first=complete===0&&!Object.keys(app.state.progress).length;const due=dueReviews().filter(r=>r.due);const study=Math.round(daily*15/55),practice=Math.round(daily*30/55),recap=daily-study-practice;
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div><h1>从第一行 C，<br><span class="quiet">到一颗真正的芯片。</span></h1><p class="description">不需要开发板，也不必一次学会所有。<br>每天 ${daily} 分钟，让知识在你的手里慢慢成形。</p><div class="hero-actions">${next?linkButton(first?'开始第一课':'继续学习',`#lesson/${encodeURIComponent(next.id)}`,'primary','arrow'):''}<a class="text-link" href="#courses">查看学习路线${icon('chevron')}</a></div></div>${chipArt()}</section><section class="stat-strip" aria-label="学习概况"><div class="stat"><div class="stat-label">${icon('clock')}今日专注</div><div class="stat-value"><span data-today-minutes>${mins}</span><span class="unit">/ ${daily} 分钟</span></div><div class="progress-line"><span data-daily-progress style="width:${Math.min(100,mins/daily*100)}%"></span></div></div><div class="stat"><div class="stat-label">${icon('book')}已完成课程</div><div class="stat-value">${complete}<span class="unit">/ ${total} 课</span></div><div class="stat-caption">按实际完成情况记录</div></div><div class="stat"><div class="stat-label">${icon('check')}独立通过</div><div class="stat-value">${independentCount()}<span class="unit">道练习</span></div><div class="stat-caption">使用提示的练习另行记录</div></div></section><div class="today-grid"><section><div class="section-head"><h2>今天，往前一点。</h2><span class="small-label">${daily} MIN / DAY</span></div><div class="plan-list"><div class="plan-item current"><div class="plan-number">01</div><div class="plan-content"><h3>${next?esc(next.title):'你已经准备好了'}</h3><p>${next?esc(next.subtitle||'先理解一个概念，再试着把它说清楚。'):'从课程地图选择你感兴趣的起点。'}</p>${next?`<a class="text-link" href="#lesson/${encodeURIComponent(next.id)}">${first?'从这里开始':'进入课程'}${icon('arrow')}</a>`:''}</div><span class="plan-minutes">${study} 分钟</span></div><div class="plan-item"><div class="plan-number">02</div><div class="plan-content"><h3>写一写，让概念落地</h3><p>从一个小练习开始，读懂反馈，再改一次。</p><a class="text-link" href="#practice${next?.exerciseIds?.[0]?'?exercise='+encodeURIComponent(next.exerciseIds[0]):''}">打开练习${icon('arrow')}</a></div><span class="plan-minutes">${practice} 分钟</span></div><div class="plan-item"><div class="plan-number">03</div><div class="plan-content"><h3>留下一句今天的收获</h3><p>看看学习记录，把还不确定的地方写下来。</p><a class="text-link" href="#report">写今日复盘${icon('arrow')}</a></div><span class="plan-minutes">${recap} 分钟</span></div></div></section><aside class="today-aside"><div class="quiet-panel"><div class="icon-badge">${icon(due.length?'repeat':'light')}</div><h3>${due.length?'把学过的，再想一遍。':'理解，比赶进度更重要。'}</h3><p>${due.length?`有 ${due.length} 节课程适合今天回顾。试着不看笔记，独立完成其中一道题。`:'卡住时，先读错误提示，再尝试解释自己的想法。你可以逐级查看提示，也可以请 AI 帮你梳理。'}</p>${linkButton(due.length?'去复习':'和 AI 一起思考',due.length?'#review':'#ask','small',due.length?'repeat':'chat')}<div class="mini-status"><span>${app.environment.compiler?.available?'C 编译环境已就绪':'C 编译器尚未就绪'}</span><a href="#settings">查看环境</a></div></div></aside></div><div class="footer-note">${icon('shield')}进度与笔记保存在本机 · 只有主动提问时才会连接 DeepSeek</div>`;
}
function renderCourses() {
  const all=availableLessons();return pageHeading('THE LEARNING PATH','每一步，都有方向。','先建立 C 语言和数字电路的直觉，再读懂 STM32。前半程只需要这台电脑。')+`<div class="course-summary"><div><strong>${all.length}</strong><span>节可学习课程</span></div><div><strong>${app.curriculum.exercises.length}</strong><span>道动手练习</span></div><div><strong>${completedLessons().length}</strong><span>节已完成</span></div></div>`+[...app.curriculum.modules].sort((a,b)=>a.order-b.order).map((module,i)=>{const items=lessons().filter(l=>l.moduleId===module.id);const available=items.filter(l=>l.available).length;return `<section class="module-section"><div class="module-title"><span class="module-number">${String(i+1).padStart(2,'0')}</span><div class="module-header-copy"><h2>${esc(module.title)}</h2><p>${esc(module.subtitle||module.description)}</p></div><span class="tag ${available?'blue':''}">${available?'现在可以开始':'后续路线'}</span></div><div class="lesson-list">${items.map((l,index)=>{const p=progress(l.id),done=p.status==='completed',started=p.status==='learning';return `<${l.available?'a':'div'} ${l.available?`href="#lesson/${encodeURIComponent(l.id)}"`:''} class="lesson-row ${!l.available?'unavailable':''}"><span class="lesson-index">${String(index+1).padStart(2,'0')}</span><span class="lesson-status-circle ${done?'done':started?'started':''}">${icon(done?'check':!l.available?'lock':started?'play':'book')}</span><div class="lesson-row-copy"><div class="lesson-row-title">${esc(l.title)}</div><p>${esc(l.subtitle||'')}</p></div><div class="lesson-row-meta">${l.minutes?`<span>${l.minutes} 分钟</span>`:''}${done?'<span class="tag green">已完成</span>':started?'<span class="tag blue">学习中</span>':!l.available?'<span class="tag">路线预告</span>':''}${l.available?icon('chevron'):''}</div></${l.available?'a':'div'}>`;}).join('')}</div>${!available?'<p class="roadmap-note">这一阶段目前是路线预告；需在基础扎实后准备相应课程与硬件。</p>':''}</section>`;}).join('');
}
function renderResources(lesson) { const resources=(lesson.resourceIds||[]).map(id=>app.curriculum.resources.find(r=>r.id===id)).filter(Boolean);if(!resources.length)return '';return `<section class="article-section" id="resources"><h2>往外，再看一点。</h2><p class="inline-note">课程内已给出入门所需内容。下面的资料适合继续查阅。</p><div class="resource-list">${resources.map(r=>{const url=resourceURL(r);return `<${url?'a':'div'} ${url?`href="${esc(url)}" target="_blank" rel="noopener noreferrer"`:''} class="resource-link">${icon(r.kind==='video'?'play':'book')}<div><strong>${esc(r.title)}</strong><p>${esc(r.author||'')}${r.author&&r.note?' · ':''}${esc(r.note||'')}</p>${r.route?`<div class="resource-verification">${esc(r.route)}</div>`:''}<div class="resource-verification">${esc(r.verifiedDate||'')} · ${esc(r.verification||'来源待核对')}</div></div>${url?icon('external','external-icon'):''}</${url?'a':'div'}>`;}).join('')}</div></section>`; }
function renderLesson() {
  const lesson=lessonById(route.id);if(!lesson)return emptyState('book','这节课暂时找不到','请从课程地图选择一个可学习的课程。','返回课程地图','#courses');if(!lesson.available)return `<div class="lesson-locked">${emptyState('lock',lesson.title,'这节课属于后续学习路线，目前尚未开放。先完成基础课程，再逐步进入硬件实践。','返回课程地图','#courses')}</div>`;
  const exercises=lessonExercises(lesson);const passCount=exercises.filter(passed).length;const p=progress(lesson.id);const done=p.status==='completed';const canComplete=exercises.every(passed);const module=app.curriculum.modules.find(m=>m.id===lesson.moduleId);const next=availableLessons()[availableLessons().findIndex(l=>l.id===lesson.id)+1];
  return `<div class="reading-meta"><a href="#courses">课程地图</a>${icon('chevron')}<span>${esc(module?.title||'基础课程')}</span><span style="margin-left:auto">${lesson.minutes} 分钟 · ${esc(lesson.level||'零基础')}</span></div>${pageHeading('ONE IDEA AT A TIME',lesson.title,lesson.subtitle)}<div class="lesson-layout"><article class="lesson-article"><nav class="lesson-subnav" aria-label="本课内容"><a href="#concepts" data-scroll="concepts">读一读</a><a href="#exercises" data-scroll="exercises">动手练</a><a href="#notes" data-scroll="notes">我的笔记</a>${exercises.length?`<a class="practice-jump" href="#practice?exercise=${encodeURIComponent((exercises.find(e=>!passed(e))||exercises[0]).id)}">专注练习${icon('arrow')}</a>`:''}</nav><div class="lesson-intro" id="concepts"><div class="eyebrow">这一课，你将学会</div><ul class="objective-list">${(lesson.objectives||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div>${(lesson.sections||[]).map((section,i)=>`<section class="article-section" id="section-${i}"><h2>${esc(section.title)}</h2><div class="prose">${prose(section.body)}</div>${section.code?codeBlock(section.code):''}</section>`).join('')}${lesson.takeaway?`<div class="takeaway"><strong>带走这一句话</strong>${esc(lesson.takeaway)}</div>`:''}<hr class="divider"><section id="exercises" class="article-section"><div class="section-head"><h2>现在，轮到你了。</h2><span class="small-label">${passCount} / ${exercises.length} 已通过</span></div>${exercises.some(e=>e.type==='code')?runNotice():''}${exercises.length?exercises.map(renderExercise).join(''):'<p class="inline-note">本课以阅读和理解为主。整理笔记后，即可标记完成。</p>'}</section>${renderResources(lesson)}<hr class="divider"><section id="notes" class="article-section"><div class="note-heading"><h2>写给自己的笔记</h2><span class="save-status" id="note-status-${esc(lesson.id)}">自动保存到本机</span></div><label class="sr-only" for="lesson-note">本课笔记</label><textarea class="notes-area" id="lesson-note" data-note="${esc(lesson.id)}" placeholder="用自己的话解释今天学会的概念。还有什么地方不太确定？">${esc(app.state.notes[lesson.id]||'')}</textarea></section><div class="lesson-footer"><div class="complete-copy"><p>${done?'这节课已经完成。随时回来，再练一次。':canComplete?'练习已通过。确认理解后，给这一课画上句号。':'完成本课所有练习后，就可以标记课程完成。'}</p>${p.assisted?'<p class="tiny muted">含助学记录；独立完成与助学完成会分别保留。</p>':''}</div>${done&&next?linkButton('下一课',`#lesson/${encodeURIComponent(next.id)}`,'primary','arrow'):button(done?'已完成本课':'完成这一课','complete-lesson',done?'':'primary',`data-lesson="${esc(lesson.id)}" ${done||!canComplete?'disabled':''}`,'check')}</div></article><aside class="lesson-aside"><div class="focus-panel"><div class="eyebrow">留一点时间，给专注。</div><div class="focus-time"><strong data-timer-display style="font-weight:400">00:00</strong><span>今日</span></div><div class="progress-line"><span data-daily-progress style="width:0%"></span></div><div class="focus-panel-status" data-timer-state>计时未开始</div>${button('开始专注','toggle-timer','primary','data-timer-button','play')}<p>主动开始才计时。离开页面或 2 分钟无操作时自动暂停；同一时间只记录一个标签页。</p></div><nav class="lesson-toc" aria-label="章节目录"><h3>这一课的路标</h3>${(lesson.sections||[]).map((s,i)=>`<a href="#section-${i}" data-scroll="section-${i}">${esc(s.title)}</a>`).join('')}<a href="#exercises" data-scroll="exercises">动手练习</a><a href="#notes" data-scroll="notes">我的笔记</a></nav><div class="learning-note">${icon('light')}<p style="margin-top:9px">不必背下每一行代码。<br>先理解它为什么这样工作。</p><a class="text-link" href="#ask" style="margin-top:12px">带着问题问 AI${icon('arrow')}</a></div></aside></div>`;
}
function runNotice() { return `<div class="run-warning">${icon('info')}<span>C 代码会由本机 GCC 编译运行，带有超时限制，但不是安全沙箱。请只运行自己理解的学习代码；STM32 的 ARM 编译与开发板验证是后续独立步骤。</span></div>`; }
function renderExercise(exercise) {
  const busy=busyExercises.has(exercise.id),isQuiz=exercise.type==='quiz',result=exerciseResults.get(exercise.id),hints=hintCounts.get(exercise.id)||0,solution=visibleSolutions.has(exercise.id);const code=rawDraft(exercise);const lineCount=Math.max(10,code.split('\n').length);const chosen=answers.get(exercise.id);
  return `<section class="exercise" id="exercise-${esc(exercise.id)}" data-exercise="${esc(exercise.id)}"><div class="exercise-header"><div class="exercise-kicker">${icon(isQuiz?'light':'terminal')}<span>${isQuiz?'CHECK YOUR UNDERSTANDING':'WRITE. RUN. UNDERSTAND.'}</span>${exerciseStatusTag(exercise)}</div><h3>${esc(exercise.title)}</h3><p class="exercise-prompt">${esc(exercise.prompt)}</p></div>${isQuiz?`<fieldset class="quiz-choices"><legend class="sr-only">${esc(exercise.title)}，请选择一个答案</legend>${(exercise.choices||[]).map((choice,i)=>`<label class="quiz-choice"><input type="radio" name="quiz-${esc(exercise.id)}" value="${i}" data-quiz="${esc(exercise.id)}" ${chosen===i?'checked':''} ${busy?'disabled':''}><span class="choice-letter">${String.fromCharCode(65+i)}</span><span>${esc(choice)}</span></label>`).join('')}</fieldset>`:`<div class="editor-shell"><div class="editor-topbar"><code>main.c</code><span class="save-status" id="draft-status-${esc(exercise.id)}">${pendingDrafts.has(exercise.id)?'保存中…':'草稿自动保存'}</span><button type="button" class="copy-button" data-action="reset-code" data-id="${esc(exercise.id)}" ${busy?"disabled":""}>恢复起始代码</button></div><div class="editor-body"><div class="editor-line-numbers" aria-hidden="true" id="lines-${esc(exercise.id)}">${Array.from({length:lineCount},(_,i)=>i+1).join('\n')}</div><label class="sr-only" for="code-${esc(exercise.id)}">${esc(exercise.title)}代码编辑器</label><textarea class="code-editor" id="code-${esc(exercise.id)}" data-code="${esc(exercise.id)}" title="Tab 插入缩进；按 Esc 再按 Tab 可离开编辑器；Shift+Tab 返回上一个控件。" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" ${busy?"readonly":""} aria-busy="${busy}">${esc(code)}</textarea></div></div>`}<div class="exercise-actions">${button(busy?(isQuiz?'正在检查…':'正在编译…'):(isQuiz?'检查答案':'编译并测试'),isQuiz?'submit-quiz':'run-code','primary',`data-id="${esc(exercise.id)}" ${busy||(isQuiz&&!answers.has(exercise.id))||(!isQuiz&&!app.environment.compiler?.available)?'disabled':''}`,busy?'':isQuiz?'check':'play')}<div class="hint-actions">${(exercise.hints||[]).length?button(hints>=exercise.hints.length?'提示已展开':`提示 ${Math.min(hints+1,exercise.hints.length)} / ${exercise.hints.length}`,'show-hint','ghost small',`data-id="${esc(exercise.id)}" ${hints>=exercise.hints.length||busy?'disabled':''}`,'light'):''}${exercise.solution||exercise.explanation?button(solution?'收起解析':'参考解析','show-solution','ghost small',`data-id="${esc(exercise.id)}" ${busy?'disabled':''}`):''}</div></div>${!isQuiz&&!app.environment.compiler?.available?'<div class="exercise-result error"><p>未检测到可用 C 编译器。草稿仍可保存；请前往<a href="#settings">设置与环境</a>查看检查结果。</p></div>':''}${result?renderResult(result,isQuiz):''}${hints?`<div class="hint-box">${exercise.hints.slice(0,hints).map((hint,i)=>`<strong>提示 ${i+1}</strong><p>${esc(hint)}</p>`).join('')}</div>`:''}${solution?`<div class="solution-box"><div class="hint-box no-margin"><strong>参考解析 · 已记录助学</strong><p>${esc(exercise.explanation||'读一读下面的参考，再试着说出每一步的作用。')}</p></div>${exercise.solution?codeBlock(exercise.solution,'C · 参考代码（不会自动执行）'):''}</div>`:''}${hints||solution?'<div class="hint-caption">提示与解析会保留助学记录；本题将不再计入独立通过统计。</div>':''}</section>`;
}
function compilerAdvice(result) {
  if(result.status==='wrong_answer') return '先对比输入、预期输出与实际输出。检查是否多输出了提示文字，以及循环边界、整数除法和换行。';
  if(result.status==='timeout') return '检查循环条件是否会变为假，以及循环变量是否在变化。也请确认是否读取了题目未提供的额外输入。';
  if(result.status!=='compile_error') return '';
  const output=result.compilerOutput||'';
  if(/missing terminating/i.test(output)) return '字符串或字符的引号可能没有成对闭合。检查英文引号、反斜杠和换行位置。';
  if(/undeclared/i.test(output)) return '有名字尚未声明。检查变量是否先声明、大小写是否一致，以及变量的作用范围。';
  if(/undefined reference/i.test(output)) return '链接器找不到某个函数的实现。检查函数名称、定义和调用是否对应。';
  if(/expected/i.test(output)) return '编译器在等待一个符号。先查看第一条 error 所在行和上一行，检查分号、括号及花括号是否配对。';
  return '先看第一条 error 的文件行号；后面的多条错误可能由同一处引起。一次修改一个问题，再重新编译。';
}
function renderResult(result,isQuiz) {
  if(isQuiz) return `<div class="exercise-result ${result.correct?'passed':'error'}" role="status"><h4>${icon(result.correct?'check':'info')}${result.correct?'理解正确，继续往前。':'再想一想。'}</h4><p>${esc(result.correct?result.explanation:'这个选项还不准确。可以回到概念部分再试一次，或逐级查看提示。')}</p></div>`;
  const labels={passed:'所有测试已通过',wrong_answer:'程序运行了，但输出还需要调整',compile_error:'编译没有通过',runtime_error:'程序运行时出现问题',timeout:'程序超过运行时间限制',busy:'编译器正在处理其他任务'};const success=result.status==='passed';
  return `<div class="exercise-result ${success?'passed':'error'}" role="status"><h4>${icon(success?'check':'info')}${esc(labels[result.status]||'测试反馈')}</h4>${result.status==='busy'?'<p>稍等片刻，再点击编译并测试。本次不会计为答错。</p>':''}${compilerAdvice(result)?`<p>${esc(compilerAdvice(result))}</p>`:''}${result.compilerOutput?`<pre>${esc(result.compilerOutput)}</pre>`:''}${(result.tests||[]).length?`<div class="test-list">${result.tests.map((t,i)=>`<div class="test-row"><div class="test-row-header"><span>测试 ${i+1}</span><span>${t.passed?'通过':'待调整'}</span></div><div class="test-values"><div><span>输入</span><pre>${esc(t.input||'（无输入）')}</pre></div><div><span>预期输出</span><pre>${esc(t.expected||'（空）')}</pre></div><div><span>实际输出</span><pre>${esc(t.actual||'（空）')}</pre></div></div></div>`).join('')}</div>`:''}</div>`;
}
function filteredExercises() { return app.curriculum.exercises.filter(e=>lessonById(e.lessonId)?.available&&(practiceType==='all'||e.type===practiceType)&&(practiceLesson==='all'||e.lessonId===practiceLesson)&&(practiceStatus==='all'||(practiceStatus==='todo'&&!passed(e))||(practiceStatus==='passed'&&passed(e)))&&(!practiceSearch||(e.title+' '+e.prompt).toLowerCase().includes(practiceSearch.toLowerCase()))); }
function renderPractice() {
  const items=filteredExercises();if(!items.some(e=>e.id===selectedExerciseId))selectedExerciseId=items[0]?.id||'';const selected=exerciseById(selectedExerciseId);if(selected){if(timer.running&&timer.lessonId!==selected.lessonId)pauseTimer('已切换练习课程，计时已暂停。');activeLessonId=selected.lessonId;}
  return pageHeading('LEARN BY MAKING','让每一行，都有意义。','从选择题检查理解，到亲手写下一小段 C。反馈来自真实编译与测试。')+`<div class="filter-bar"><div class="segmented" role="group" aria-label="练习类型">${[['all','全部练习'],['quiz','理解题'],['code','写代码']].map(([value,label])=>`<button type="button" data-action="practice-type" data-value="${value}" class="${practiceType===value?'active':''}" aria-pressed="${practiceType===value}">${label}</button>`).join('')}</div><select class="filter-select" id="practice-lesson" aria-label="按课程筛选"><option value="all">所有课程</option>${availableLessons().map(l=>`<option value="${esc(l.id)}" ${practiceLesson===l.id?'selected':''}>${esc(l.title)}</option>`).join('')}</select><select class="filter-select" id="practice-status" aria-label="按完成状态筛选" style="max-width:135px"><option value="all" ${practiceStatus==='all'?'selected':''}>所有状态</option><option value="todo" ${practiceStatus==='todo'?'selected':''}>还未通过</option><option value="passed" ${practiceStatus==='passed'?'selected':''}>已经通过</option></select></div>${!items.length?emptyState('search','还没有匹配的练习','试着切换课程、题型或完成状态。'): `<div class="practice-layout"><nav class="practice-picker" aria-label="选择一道练习">${items.map(e=>`<button class="practice-option ${selected?.id===e.id?'active':''}" data-action="select-exercise" data-id="${esc(e.id)}" aria-pressed="${selected?.id===e.id}" type="button">${icon(passed(e)?'check':e.type==='quiz'?'light':'code')}<div class="practice-option-copy"><strong>${esc(e.title)}</strong><small>${esc(lessonById(e.lessonId)?.title||'')}</small>${exerciseStatusTag(e)}</div></button>`).join('')}</nav><div class="practice-workspace"><div class="practice-source"><span>${items.length} 道练习 · ${selected?.type==='code'?'C11 · 本机 GCC':'单选理解题'}</span><a href="#lesson/${encodeURIComponent(selected.lessonId)}?resume=1">${icon('back')}${readingPositions[selected.lessonId]?'返回阅读位置':'回到本课'}</a></div>${selected.type==='code'?runNotice():''}${renderExercise(selected)}<p class="bottom-caption">允许反复尝试。先独立思考，遇到困难再逐级查看提示。提示、参考解析和针对本题的 AI 求助会留下助学记录。</p></div></div>`}`;
}
function renderReview() {
  const reviews=dueReviews(),due=reviews.filter(r=>r.due),upcoming=reviews.filter(r=>!r.due);return pageHeading('MAKE IT STAY','学过的，慢慢变成自己的。','复习从已经完成的课程出发。先不看答案，试着把概念讲清楚，再做一道题。')+`<section class="review-intro"><div><h2>不是重来，是多理解一层。</h2><p>完成后隔天回看，再在第 3 天、第 7 天主动回顾。列表依据最近一次通过练习的日期提醒，重新通过后会更新。</p></div><div class="review-rhythm" aria-label="建议复习节奏：1、3、7天"><div class="rhythm-step"><strong>01</strong><span>隔天想一遍</span></div><span class="rhythm-line"></span><div class="rhythm-step"><strong>03</strong><span>再写一遍</span></div><span class="rhythm-line"></span><div class="rhythm-step"><strong>07</strong><span>连起来理解</span></div></div></section><div class="section-head"><h2>今天适合回顾</h2><span class="small-label">${due.length} 节课程</span></div>${due.length?renderReviewList(due):emptyState('repeat',reviews.length?'今天没有待复习课程':'从完成第一课开始','完成课程后，这里会根据真实学习日期提醒你回来巩固。','继续学习',nextLesson()?`#lesson/${encodeURIComponent(nextLesson().id)}`:'#courses')}${upcoming.length?`<section style="margin-top:30px"><div class="section-head"><h2>刚刚学会的</h2><span class="small-label">明天再见</span></div>${renderReviewList(upcoming)}</section>`:''}`;
}
function renderReviewList(items) { return `<div class="review-list">${items.map(r=>`<div class="review-row"><span class="bookmark-number">${r.due?icon('repeat'):icon('check')}</span><div class="review-row-copy"><h3>${esc(r.lesson.title)}</h3><p>${r.age?`最近一次通过在 ${r.age} 天前`:'今天刚刚通过'} · ${lessonExercises(r.lesson).length} 道练习${progress(r.lesson.id).assisted?' · 含助学记录':''}</p></div>${linkButton('回顾这一课',`#lesson/${encodeURIComponent(r.lesson.id)}`,'small','arrow')}</div>`).join('')}</div>`; }
function dailyAttempts(date) { return app.state.attempts.filter(a=>eventDate(a)===date); }
function renderReport() {
  const attempts=dailyAttempts(reportDate),practiceAttempts=attempts.filter(a=>!['hint','ai_help'].includes(a.status));const passes=attempts.filter(a=>successStatuses.has(a.status));const uniquePass=new Set(passes.map(a=>a.exerciseId));const independentPass=new Set(passes.filter(a=>!a.assisted).map(a=>a.exerciseId));const seconds=savedSeconds(reportDate);const days=Array.from({length:7},(_,i)=>addDays(reportDate,i-6));const totals=days.map(d=>savedSeconds(d));const max=Math.max(app.state.settings.dailyMinutes*60,...totals,1);const records=[...app.state.sessions.filter(s=>eventDate(s)===reportDate).map(s=>({...s,kind:'session'})),...attempts.map(a=>({...a,kind:'attempt'}))].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const reportNote=reportDraft?.date===reportDate?reportDraft.note:app.state.reports[reportDate]?.note||'';
  return `<div class="page-heading-row">${pageHeading('YOUR PROGRESS, HONESTLY','每天一点，都算数。','没有虚拟连续打卡，也没有预设成绩。这里只记录实际学习和练习。')}<div class="report-controls">${button('','report-prev','ghost small','aria-label="前一天"','back')}<input class="date-input" type="date" id="report-date" value="${reportDate}" max="${today()}" aria-label="查看哪天的日报">${button('','report-next','ghost small',`aria-label="后一天" ${reportDate>=today()?'disabled':''}`,'chevron')}</div></div><section class="stat-strip"><div class="stat"><div class="stat-label">${icon('clock')}记录时长</div><div class="stat-value">${Math.floor(seconds/60)}<span class="unit">分 ${seconds%60} 秒</span></div><div class="stat-caption">${dateLabel(reportDate)} · 已保存时间</div></div><div class="stat"><div class="stat-label">${icon('code')}练习尝试</div><div class="stat-value">${practiceAttempts.length}<span class="unit">次</span></div><div class="stat-caption">通过 ${uniquePass.size} 道不同练习</div></div><div class="stat"><div class="stat-label">${icon('check')}独立通过</div><div class="stat-value">${independentPass.size}<span class="unit">道</span></div><div class="stat-caption">提示与 AI 求助另行标记</div></div></section><div class="report-grid"><section><div class="chart-panel"><div class="section-head"><h2>过去七天，留下的足迹</h2><span class="small-label">分钟</span></div><div class="bar-chart" role="img" aria-label="${days.map((d,i)=>dateLabel(d)+' '+Math.floor(totals[i]/60)+'分钟').join('；')}">${days.map((d,i)=>`<div class="bar-column"><span class="bar-value">${totals[i]?Math.floor(totals[i]/60):'—'}</span><div class="bar ${d===reportDate?'today':''}" style="height:${Math.max(totals[i]?3:1,totals[i]/max*110)}px"></div></div>`).join('')}</div><div class="chart-labels">${days.map(d=>`<span>${d.slice(5).replace('-','/')}</span>`).join('')}</div><p class="chart-note">每天目标 ${app.state.settings.dailyMinutes} 分钟 · 空白日期表示没有记录</p></div><section style="margin-top:29px"><div class="section-head"><h2>${reportDate===today()?'今天':'这一天'}的学习记录</h2><span class="small-label">${records.length} 条事件</span></div>${records.length?`<div class="activity-list">${records.slice(0,40).map(renderActivity).join('')}</div>${records.length>40?'<p class="bottom-caption">页面显示最近 40 条；完整记录可在设置中导出。</p>':''}`:'<p class="report-zero">还没有学习记录。主动开始计时或提交一道练习后，这里就会留下足迹。</p>'}</section></section><aside class="report-aside"><div class="quiet-panel"><h3>把理解，放在数字前面。</h3><p>今天最有价值的进步，可能是你终于看懂了一条报错。</p><div class="summary-list"><div class="summary-row"><span>累计完成课程</span><strong>${completedLessons().length} <span class="value-note">课</span></strong></div><div class="summary-row"><span>累计通过练习</span><strong>${completedCount()} <span class="value-note">道</span></strong></div><div class="summary-row"><span>今日助学事件</span><strong>${attempts.filter(a=>['hint','ai_help'].includes(a.status)).length} <span class="value-note">次</span></strong></div></div></div><section class="report-note-box"><h2>给今天留一句话</h2><label for="report-note" class="sr-only">当日复盘</label><textarea id="report-note" class="notes-area" placeholder="今天理解了什么？卡在哪里？下一次想继续做什么？">${esc(reportNote)}</textarea><div class="report-actions"><p>这份复盘只保存在本机。</p>${button('保存复盘','save-report','small primary')}</div></section></aside></div><p class="session-details">日报按 Asia/Taipei（UTC+8）汇总事件日期，不把当前累计进度算作当天成绩。专注时长每 30 秒保存；开始、暂停和空闲状态由你控制。</p>`;
}
function renderActivity(record) { const l=lessonById(record.lessonId),e=exerciseById(record.exerciseId);let title,detail,symbol;if(record.kind==='session'){title=l?.title||'专注学习';detail=`专注 ${Math.floor(record.seconds/60)} 分 ${record.seconds%60} 秒`;symbol='clock';}else{title=e?.title||l?.title||'练习记录';const labels={passed:'通过',correct:'通过',wrong_answer:'待调整',compile_error:'编译报错',runtime_error:'运行问题',timeout:'运行超时',hint:'查看提示或解析',ai_help:'针对本题向 AI 求助'};detail=(labels[record.status]||record.status)+(successStatuses.has(record.status)?(record.assisted?' · 助学完成':' · 独立完成'):'');symbol=successStatuses.has(record.status)?'check':['hint','ai_help'].includes(record.status)?'light':'code';}return `<div class="activity-row">${icon(symbol)}<div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div><time datetime="${esc(record.createdAt)}">${localTime(record.createdAt)}</time></div>`; }
function aiReady() { return !!(app.state.settings.hasApiKey&&app.state.settings.aiEnabled&&app.state.settings.model); }
function modelCapability(id) {
  const entry=models.find(item=>item.id===id);
  const advertised=Array.isArray(entry?.effort?.supported_levels)?[...new Set(entry.effort.supported_levels.filter(level=>Object.hasOwn(effortLabels,level)))]:[];
  if(entry?.thinkingSupported===false)return {supported:false,levels:[],defaultLevel:'high'};
  const levels=advertised.length?advertised:knownModelIds.includes(id)?['low','high','max']:[];
  return {supported:levels.length>0,levels,defaultLevel:levels.includes(entry?.effort?.default_level)?entry.effort.default_level:levels.includes('high')?'high':levels[0]||'high'};
}
function modelOptions(selected) {
  const available=models.length?models:knownModelIds.map(id=>({id}));
  const list=[...available];if(selected&&!list.some(item=>item.id===selected))list.unshift({id:selected});
  return `<option value="" ${selected?'':'selected'} disabled>请选择模型</option>`+list.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.name&&item.name!==item.id?item.name+' · '+item.id:item.id)}</option>`).join('');
}
function thinkingChoice(settings) {
  if(settings.thinkingMode==='disabled')return 'off';
  return modelCapability(settings.model).levels.includes(settings.reasoningEffort)?settings.reasoningEffort:'';
}
function validThinkingSettings(settings) { return settings.thinkingMode==='disabled'||modelCapability(settings.model).levels.includes(settings.reasoningEffort); }
function thinkingOptions(settings) {
  const capability=modelCapability(settings.model);
  if(!capability.supported)return '<option value="off" selected>服务商默认 · 不可调节</option>';
  const choice=thinkingChoice(settings);
  return `${choice?'':'<option value="" selected disabled>请选择思考强度</option>'}<option value="off" ${choice==='off'?'selected':''}>关闭思考 · 直接回答</option>`+capability.levels.map(level=>`<option value="${level}" ${choice===level?'selected':''}>${effortLabels[level]}</option>`).join('');
}
function modelHelp(settings) {
  if(!settings.model)return '选择模型后，可以调整它支持的思考强度。';
  if(!modelCapability(settings.model).supported)return '此模型未公布可调节的思考能力，将使用服务商默认，不发送思考参数。';
  if(!validThinkingSettings(settings))return '此模型不支持已保存的思考强度，请重新选择后再发送。';
  return settings.thinkingMode==='enabled'&&settings.reasoningEffort==='max'?'最高强度可能等待更久，也会使用更多 tokens。':'关闭思考更直接；提高强度适合需要推导的问题。';
}
function renderAIControls(scope, settings) {
  const isAsk=scope==='ask',modelId=isAsk?'ask-model':'model',thinkingId=isAsk?'ask-thinking':'thinking-level';
  const locked=chatBusy||settingsSaving||askSettingsSaving||modelKeySaving;
  const capability=modelCapability(settings.model);
  const loadText=modelLoading?'正在读取模型…':modelStatus||(modelsLoaded?'已读取官方模型列表。':'当前显示常用模型；连接后会自动读取账户的可用模型。');
  return `<div class="ai-selection-row"><div class="field"><label for="${modelId}">模型</label><select id="${modelId}" name="model" data-ai-model="${scope}" aria-describedby="${scope}-capability" ${locked?'disabled':''}>${modelOptions(settings.model)}</select></div><div class="field"><label for="${thinkingId}">${icon('spark')}思考强度</label><select id="${thinkingId}" name="thinkingLevel" data-ai-thinking="${scope}" aria-describedby="${scope}-capability" ${locked||!capability.supported?'disabled':''}>${thinkingOptions(settings)}</select></div><button type="button" class="button small model-refresh" data-action="load-models" ${locked||modelLoading?'disabled':''} aria-label="刷新可用模型">${modelLoading?'<span class="spinner"></span>':icon('repeat')}<span>刷新模型</span></button></div><p class="ai-control-hint" id="${scope}-capability">${esc(modelHelp(settings))}${isAsk&&settings.model&&!capability.supported&&settings.thinkingMode!=='disabled'?` <button type="button" class="text-button" data-action="use-model-default" ${locked?'disabled':''}>确认使用服务商默认</button>`:''}</p><div class="ai-controls-feedback"><p class="model-list-status ${modelStatusError&&!modelLoading?'error':''}" id="${isAsk?'ask-model-status':'model-status'}" role="status">${esc(loadText)}</p>${isAsk?`<p class="ai-save-status ${askSettingsStatus.error?'error':''}" id="ask-settings-status" role="status" aria-live="polite" data-state="${askSettingsSaving?'saving':askSettingsStatus.error?'error':'saved'}">${askSettingsSaving?'<span class="spinner"></span>':icon(askSettingsStatus.error?'info':'check')}${esc(askSettingsSaving?'正在保存，请稍候…':askSettingsStatus.text)}</p>`:''}</div>`;
}
function settingsValues() { return {...app.state.settings,...settingsDraft,hasApiKey:app.state.settings.hasApiKey}; }
function captureSettingsDraft(form=$('#settings-form')) {
  if(!form)return settingsDraft;
  const current=settingsValues(),control=$('#thinking-level',form),choice=control&&!control.disabled?control.value:'';
  settingsDraft={dailyMinutes:$('#daily-minutes',form).value,model:$('#model',form).value,aiEnabled:$('#ai-enabled',form).checked,apiKey:$('#api-key',form).value,thinkingMode:choice==='off'?'disabled':current.thinkingMode,reasoningEffort:choice&&choice!=='off'?choice:current.reasoningEffort};
  if(choice&&choice!=='off')settingsDraft.thinkingMode='enabled';
  return settingsDraft;
}
function selectedConfiguration(settings,model,choice) {
  const capability=modelCapability(model);
  return {model,thinkingMode:!capability.supported||choice==='off'?'disabled':'enabled',reasoningEffort:capability.levels.includes(choice)?choice:capability.levels.includes(settings.reasoningEffort)?settings.reasoningEffort:capability.defaultLevel};
}
function refreshAIControls() {
  const focused=document.activeElement?.id;
  $$('[data-ai-controls]').forEach(wrapper=>{const scope=wrapper.dataset.aiControls;wrapper.innerHTML=renderAIControls(scope,scope==='ask'?askSettingsPending||app.state.settings:settingsValues());});
  const locked=chatBusy||settingsSaving||askSettingsSaving||modelKeySaving;
  ['daily-minutes','api-key','ai-enabled','settings-save'].forEach(id=>{const element=document.getElementById(id);if(element)element.disabled=locked;});
  const clear=$('[data-action="clear-key"]');if(clear)clear.disabled=locked;
  const reset=$('[data-action="reset-data"]');if(reset)reset.disabled=resetBusy||locked||modelLoading||busyExercises.size>0;
  const send=$('#chat-send');if(send)send.disabled=!aiReady()||locked||!validThinkingSettings(app.state.settings);
  const selected=$('#chat-model-label');if(selected&&aiReady())selected.textContent=app.state.settings.model||'未选择模型';
  if(focused){const element=document.getElementById(focused);if(element&&!element.disabled)element.focus({preventScroll:true});}
}
async function saveAskConfiguration(target) {
  if(chatBusy||settingsSaving||askSettingsSaving||modelKeySaving){refreshAIControls();return;}
  const current=app.state.settings,model=$('#ask-model')?.value||current.model;
  const choice=target.dataset.aiModel?thinkingChoice(current):$('#ask-thinking')?.value;
  if(!model)return;
  askSettingsPending=selectedConfiguration(current,model,choice);
  askSettingsSaving=true;askSettingsStatus={text:'正在保存，请稍候…',error:false};refreshAIControls();
  try{const result=await api('settings',askSettingsPending);adoptState(result.state,['settings']);askSettingsStatus={text:'已保存，下一条问题使用此设置。',error:false};}
  catch(error){askSettingsStatus={text:'保存失败，已恢复原设置。'+error.message,error:true};toast(askSettingsStatus.text,'error');}
  finally{askSettingsSaving=false;askSettingsPending=null;refreshAIControls();}
}
function requestSettingsLabel(settings) { if(!settings?.model)return '';const supported=typeof settings.thinkingSupported==='boolean'?settings.thinkingSupported:knownModelIds.includes(settings.model);return settings.model+' · '+(settings.thinkingMode==='disabled'?(supported?'思考关闭':'服务商默认'):{low:'低强度',high:'高强度',max:'最高强度'}[settings.reasoningEffort]||'思考开启'); }
function renderChatMessage(message) {
  const isUser=message.role==='user';
  return `<div class="message ${isUser?'user':'assistant'}"><div class="message-label">${icon(isUser?'user':'spark')}${isUser?'你':'DEEPSEEK'}<span class="message-time">${localTime(message.createdAt)}</span></div>${!isUser&&message.requestSettings?`<p class="message-settings">${esc(requestSettingsLabel(message.requestSettings))}</p>`:''}<div class="message-body">${chatMarkup(message.content)}</div>${!isUser&&message.warning?`<div class="chat-warning" role="status">${icon('info')}<span>${esc(message.warning)}</span></div>`:''}</div>`;
}
function contextText() { const l=currentLesson(),e=exerciseById(contextExerciseId);return `${l?'课程：'+l.title+'\n\n学习目标：\n'+(l.objectives||[]).join('\n')+'\n\n'+(l.sections||[]).map(s=>s.title+'\n'+s.body+(s.code?'\n'+s.code:'')).join('\n\n')+'\n\n本课要点：'+(l.takeaway||''):'未选择课程。'}${e?'\n\n练习：'+e.title+'\n'+e.prompt+(e.starter?'\n\n题目起始代码：\n'+e.starter:''):''}`; }
function renderAsk() {
  const l=currentLesson();if(contextExerciseId&&exerciseById(contextExerciseId)?.lessonId!==l?.id)contextExerciseId='';const e=exerciseById(contextExerciseId);const ready=aiReady();const chatList=app.state.chats.filter(c=>!l||c.lessonId===l.id);let notReady=!app.state.settings.hasApiKey?'连接 DeepSeek，才会有 AI 回答。':!app.state.settings.aiEnabled?'AI 助学目前处于关闭状态。':'请先在设置中选择一个可用模型。';
  return pageHeading('A LITTLE HELP, WHEN YOU NEED IT','带着问题，一起想清楚。','AI 会结合选中的课程辅助讲解。你决定要附带哪些代码，生成的代码不会自动运行。')+`<div class="ai-layout"><section class="chat-panel"><div class="chat-topbar"><strong>${icon('spark')}DeepSeek 助学</strong><span id="chat-model-label">${ready?esc(app.state.settings.model):'<a href="#settings">设置连接</a>'}</span></div><div class="ai-controls ask-ai-controls" data-ai-controls="ask">${renderAIControls('ask',askSettingsPending||app.state.settings)}</div><div class="chat-messages" id="chat-messages" aria-live="polite">${chatList.length?chatList.map(renderChatMessage).join(''):`<div class="chat-empty"><div class="empty-icon">${icon('spark')}</div><h2>${ready?'先说说，你卡在哪里？':'理解的路上，可以有个帮手。'}</h2><p>${ready?'无需组织完美的问题。说说你已经尝试了什么，让 AI 从你的思路开始。':notReady+' 配置完成前，这里不会生成模拟回答。'}</p>${!ready?linkButton('设置 DeepSeek','#settings','small','arrow'):`<div class="suggestions"><button class="suggestion-button" type="button" data-action="suggest-question" data-value="请用一个生活中的比喻解释这节课的核心概念，先不要给我练习答案。">用一个生活中的比喻解释这个概念</button><button class="suggestion-button" type="button" data-action="suggest-question" data-value="请问我一个简单问题，检查我是否理解这节课。每次只问一个，等我回答。">问我一个问题，检查我的理解</button></div>`}</div>`}${chatBusy?`<div class="message user"><div class="message-label">${icon('user')}你</div><div class="message-body">${esc(pendingMessage)}</div></div><div class="ai-working"><span class="loading-dot"></span>正在等待 DeepSeek 回复…</div>`:''}</div>${latestChatWarning&&latestChatWarning.lessonId===(l?.id||'')&&!chatList.some(c=>c.warning===latestChatWarning.warning)?`<div class="chat-warning chat-warning-latest" role="status">${icon('info')}<span>${esc(latestChatWarning.warning)}</span></div>`:''}<form class="chat-composer" id="chat-form"><label class="sr-only" for="chat-input">你的问题</label><textarea id="chat-input" placeholder="${ready?'描述你的问题，或者写下你目前的理解…':'先连接 DeepSeek，再开始对话。'}" ${chatBusy?'disabled':''}>${esc(chatDraft)}</textarea><div class="composer-footer"><span>Enter 发送 · Shift + Enter 换行<br>AI 可能出错，请结合课程和测试验证。</span><button type="submit" id="chat-send" class="button primary small" ${!ready||chatBusy||settingsSaving||askSettingsSaving||!validThinkingSettings(app.state.settings)?'disabled':''}>${chatBusy?'<span class="spinner"></span>':icon('send')}发送</button></div></form></section><aside class="ai-aside"><div class="context-panel"><h3>这次对话的上下文</h3><div class="field"><label for="ask-lesson">当前课程</label><select id="ask-lesson" ${chatBusy?'disabled':''}>${availableLessons().map(item=>`<option value="${esc(item.id)}" ${item.id===l?.id?'selected':''}>${esc(item.title)}</option>`).join('')}</select></div><div class="field"><label for="ask-exercise">正在思考的练习（可选）</label><select id="ask-exercise" ${chatBusy?'disabled':''}><option value="">仅讲解课程概念</option>${lessonExercises(l).map(item=>`<option value="${esc(item.id)}" ${item.id===contextExerciseId?'selected':''}>${esc(item.title)}</option>`).join('')}</select><p>选择练习并成功求助后，该练习会记为助学；不会自动判定通过。</p></div><label class="checkbox-label"><input type="checkbox" id="include-code" ${includeChatCode&&e?.type==='code'?'checked':''} ${e?.type!=='code'||chatBusy?'disabled':''}><span>同时发送这道题的代码草稿</span></label><div class="context-preview"><details><summary>查看将发送的课程与题目</summary><pre>${esc(contextText())}</pre></details>${includeChatCode&&e?.type==='code'?`<details open><summary>将附带的代码 · ${esc(e.title)}</summary><pre>${esc(rawDraft(e))}</pre></details>`:'<p class="notice-line" style="margin-top:9px">没有附带代码草稿。</p>'}</div><p class="context-caption">点击发送后，问题、最近 8 条本课对话与上述学习内容会发送至 DeepSeek 官方 API。密钥与私人笔记不会作为学习上下文发送。</p></div><div class="ai-usage"><h3>实际 API 用量</h3><div class="summary-list"><div class="summary-row"><span>累计请求</span><strong>${app.state.usage.requests}</strong></div><div class="summary-row"><span>输入 tokens</span><strong>${Number(app.state.usage.inputTokens).toLocaleString()}</strong></div><div class="summary-row"><span>输出 tokens</span><strong>${Number(app.state.usage.outputTokens).toLocaleString()}</strong></div></div><p class="context-caption">用量来自接口返回。费用以 DeepSeek 账户账单为准。</p></div></aside></div>`;
}
function renderSettings() {
  const s=settingsValues(),env=app.environment;return pageHeading('MAKE IT YOURS','一个顺手的学习空间。','调整学习节奏，连接 AI，确认环境。所有设置都围绕你现在的阶段。')+`<div class="settings-grid"><div><form class="settings-section" id="settings-form"><h2>你的学习节奏</h2><p class="description">给每天一个可持续的小目标。</p><div class="field" style="max-width:200px"><label for="daily-minutes">每天计划学习（分钟）</label><input type="number" id="daily-minutes" name="dailyMinutes" min="20" max="120" value="${s.dailyMinutes}" required><p>20–120 分钟，当前建议每天 55 分钟。</p></div><hr class="divider"><h2>连接 DeepSeek</h2><p class="description" style="margin:6px 0 22px">使用你自己的 API 密钥，仅连接 DeepSeek 官方接口。</p><div class="field"><label for="api-key">API 密钥</label><input type="password" id="api-key" name="apiKey" value="${esc(s.apiKey||'')}" autocomplete="new-password" spellcheck="false" placeholder="${s.hasApiKey?'已安全保存。留空保持当前密钥':'粘贴你的 DeepSeek API 密钥'}"><div class="key-state"><span class="status-dot" style="background:${s.hasApiKey?'#6f9e89':'#b9c0ca'}"></span><span>${s.hasApiKey?'已配置 · 密钥不会回显':'尚未配置'}</span>${s.hasApiKey?`<button type="button" class="copy-button" data-action="clear-key" style="margin-left:auto">移除密钥</button>`:''}</div><p>Windows 使用 DPAPI 加密保存在本机；备份中不包含密钥。</p></div><div class="ai-controls settings-ai-controls" data-ai-controls="settings">${renderAIControls('settings',s)}</div><p class="settings-form-note">填写新密钥后，刷新模型会先保存密钥。模型和思考强度需点击下方按钮保存。</p><div class="toggle-row"><div><strong>启用 AI 助学</strong><p>只有你主动点击发送时才发起请求。</p></div><label class="switch"><input type="checkbox" id="ai-enabled" name="aiEnabled" aria-label="启用 AI 助学" ${s.aiEnabled?'checked':''}><span class="switch-track"></span></label></div><button class="button primary" type="submit" id="settings-save" ${chatBusy||settingsSaving||askSettingsSaving?'disabled':''}>${settingsSaving?'<span class="spinner"></span>':icon('check')}${settingsSaving?'正在保存…':'保存设置'}</button><p class="settings-form-note">密钥不回显、不写入导出文件。未配置时，课程、练习与笔记仍可使用。</p></form><section class="settings-section"><h2>把自己的进步带走</h2><p class="description">备份包含进度、练习草稿、笔记、学习记录和对话，不包含 API 密钥。</p><div class="backup-actions">${button('导出学习备份','export-backup','','','download')}${button('导入备份','choose-import','','','upload')}<input type="file" id="import-file" accept=".json,application/json" hidden></div><div class="path-info">学习数据保存在本机<code>${esc(env.dataDir||'等待服务返回路径')}</code></div></section><section class="settings-section reset-section"><h2>重新开始</h2><p class="description">清空本机的学习进度、练习草稿、笔记、日报和对话，保留每日目标、模型和密钥等设置。重置前会自动备份，AI 助学会关闭。</p>${button('重置学习数据','reset-data','danger',`${chatBusy||settingsSaving||askSettingsSaving||modelKeySaving||modelLoading||busyExercises.size?'disabled':''}`,'repeat')}<p class="settings-form-note">只影响这台电脑的学习数据。手机上的课程和记录不受影响。</p></section></div><aside class="settings-aside"><section class="settings-section"><h2>当前学习环境</h2><p class="description">来自本机实际检查结果。</p><div class="environment-list"><div class="environment-item"><div class="environment-item-head"><span>C 编译器</span><span class="tag ${env.compiler?.available?'green':''}">${env.compiler?.available?'已就绪':'未就绪'}</span></div><p>${esc(env.compiler?.version||'没有检测到可用编译器。')}</p>${env.compiler?.path?`<code>${esc(env.compiler.path)}</code>`:''}</div><div class="environment-item"><div class="environment-item-head"><span>Python 运行时</span><span class="tag green">运行中</span></div><p>${esc(env.python?.version||'由本地服务提供')}</p></div><div class="environment-item"><div class="environment-item-head"><span>STM32 软件环境</span><span class="tag ${env.stm32?.available?'green':''}">${env.stm32?.available?'已检测到':'未检测到'}</span></div><p>${esc(env.stm32?.note||'后续进入 ARM 编译阶段时，再检查相关工具。')}</p>${env.stm32?.path?`<code>${esc(env.stm32.path)}</code>`:''}</div><div class="environment-item"><div class="environment-item-head"><span>开发板 / ST-Link</span><span class="tag">尚未验证</span></div><p>当前按无开发板路线学习。电脑上的 C 测试和 ARM 编译都不能证明实物硬件工作正常。</p></div></div>${env.checkedAt?`<p class="bottom-caption">检查时间：${esc(new Date(env.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Taipei',hour12:false}))}</p>`:''}</section><div class="quiet-panel"><div class="icon-badge">${icon('chip')}</div><h3>先把基础，学扎实。</h3><p>你现在不需要购买开发板。先用 C 理解变量、分支、循环和位操作，再认识芯片中的寄存器。</p><a class="text-link" href="#courses" style="margin-top:17px">回到课程地图${icon('arrow')}</a></div></aside></div>`;
}

function parseRoute() { const hash=location.hash.slice(1)||'today';const [path,query='']=hash.split('?');const [name,id='']=path.split('/');let decoded='';try{decoded=decodeURIComponent(id);}catch{decoded='';}return {name:['today','courses','lesson','practice','review','report','ask','settings'].includes(name)?name:'today',id:decoded,params:new URLSearchParams(query)}; }
function render(options={}) {
  if(!initialized)return;pageEpoch++;renderSidebar();renderTopbar();const renderers={today:renderToday,courses:renderCourses,lesson:renderLesson,practice:renderPractice,review:renderReview,report:renderReport,ask:renderAsk,settings:renderSettings};$('#main').innerHTML=(renderers[route.name]||renderToday)();updateTimerUI();if(['ask','settings'].includes(route.name))refreshAIControls();if(route.name==='ask')scrollChat();if(options.focus)$('#main').focus({preventScroll:true});
}
function closeMenu(restoreFocus=false) { const wasOpen=$('#sidebar').classList.contains('open');$('#sidebar').classList.remove('open');document.body.classList.remove('menu-open');$('#sidebar-scrim').hidden=true;$('.menu-toggle')?.setAttribute('aria-expanded','false');if(wasOpen&&restoreFocus)$('.menu-toggle')?.focus(); }
async function navigate() {
  if(!initialized||resetBusy)return;rememberReadingPosition();const oldLesson=activeLessonId;route=parseRoute();if(route.name==='lesson'&&lessonById(route.id)?.available)activeLessonId=route.id;if(route.name==='practice'){const id=route.params.get('exercise');if(id&&exerciseById(id)){selectedExerciseId=id;practiceLesson='all';practiceType='all';practiceStatus='all';activeLessonId=exerciseById(id).lessonId;}}if(route.name==='ask'&&route.params.get('exercise')){const e=exerciseById(route.params.get('exercise'));if(e){activeLessonId=e.lessonId;contextExerciseId=e.id;}}
  if(oldLesson!==activeLessonId&&timer.running)pauseTimer('已切换课程，计时已暂停。');storageSet('studio-active-lesson',activeLessonId);closeMenu();render({focus:true});if(route.name==='lesson')restoreReadingPosition(route.id);else window.scrollTo({top:0,behavior:'instant'});if(['ask','settings'].includes(route.name)&&app.state.settings.hasApiKey)void loadModels({silent:true});if(route.name==='lesson'&&lessonById(route.id)?.available&&!app.state.progress[route.id]){const id=route.id;try{const response=await api('progress',{lessonId:id,status:'learning'});adoptState(response.state,['progress']);renderSidebar();}catch(error){toast(error.message,'error');}}
}
function refreshExercise(id) { const node=document.getElementById('exercise-'+id),e=exerciseById(id);if(node&&e){const top=node.getBoundingClientRect().top;node.outerHTML=renderExercise(e);if(route.name==='lesson'){const was=window.scrollY;const fresh=document.getElementById('exercise-'+id);if(fresh&&Math.abs(fresh.getBoundingClientRect().top-top)>5)window.scrollTo(0,was+fresh.getBoundingClientRect().top-top);} }renderSidebar(); }
function refreshLessonCompletion() {
  if(route.name!=='lesson')return;const lesson=lessonById(route.id);if(!lesson)return;
  const exercises=lessonExercises(lesson),done=progress(lesson.id).status==='completed',canComplete=exercises.every(passed);
  const count=$('#exercises > .section-head .small-label');if(count)count.textContent=exercises.filter(passed).length+' / '+exercises.length+' 已通过';
  const footer=$('.lesson-footer');if(!footer)return;const next=availableLessons()[availableLessons().findIndex(l=>l.id===lesson.id)+1];
  footer.innerHTML=`<div class="complete-copy"><p>${done?'这节课已经完成。随时回来，再练一次。':canComplete?'练习已通过。确认理解后，给这一课画上句号。':'完成本课所有练习后，就可以标记课程完成。'}</p>${progress(lesson.id).assisted?'<p class="tiny muted">含助学记录；独立完成与助学完成会分别保留。</p>':''}</div>${done&&next?linkButton('下一课',`#lesson/${encodeURIComponent(next.id)}`,'primary','arrow'):button(done?'已完成本课':'完成这一课','complete-lesson',done?'':'primary',`data-lesson="${esc(lesson.id)}" ${done||!canComplete?'disabled':''}`,'check')}`;
}
function markDraft(id,code) { app.state.drafts[id]=code;pendingDrafts.set(id,code);clearTimeout(draftTimers.get(id));setSaveStatus('draft',id,'正在保存…');draftTimers.set(id,setTimeout(()=>saveDraft(id),650)); }
function setSaveStatus(kind,id,text) { const el=document.getElementById(kind+'-status-'+id);if(el)el.textContent=text; }
async function saveDraft(id) { if(draftSaves.has(id))return draftSaves.get(id);if(!pendingDrafts.has(id))return;const code=pendingDrafts.get(id);const saving=(async()=>{try{await api('draft',{exerciseId:id,code});if(pendingDrafts.get(id)===code){pendingDrafts.delete(id);setSaveStatus('draft',id,'已保存到本机');}}catch{setSaveStatus('draft',id,'未保存 · 稍后重试');}})();draftSaves.set(id,saving);try{await saving;}finally{draftSaves.delete(id);} }
function markNote(id,text) { app.state.notes[id]=text;pendingNotes.set(id,text);clearTimeout(noteTimers.get(id));setSaveStatus('note',id,'正在保存…');noteTimers.set(id,setTimeout(()=>saveNote(id),700)); }
async function saveNote(id) { if(noteSaves.has(id))return noteSaves.get(id);if(!pendingNotes.has(id))return;const text=pendingNotes.get(id);const saving=(async()=>{try{await api('note',{lessonId:id,text});if(pendingNotes.get(id)===text){pendingNotes.delete(id);setSaveStatus('note',id,'已保存到本机');}}catch{setSaveStatus('note',id,'未保存 · 稍后重试');}})();noteSaves.set(id,saving);try{await saving;}finally{noteSaves.delete(id);} }
async function submitQuiz(id) { const e=exerciseById(id);if(!answers.has(id)){toast('先选择一个答案，再检查。','error');return;}busyExercises.add(id);refreshExercise(id);try{const result=await api('quiz',{exerciseId:id,answer:answers.get(id),assisted:assisted(e)});adoptState(result.state,['progress','attempts']);exerciseResults.set(id,result);}catch(error){toast(error.message,'error');}finally{busyExercises.delete(id);refreshExercise(id);refreshLessonCompletion();} }
async function runCode(id) { const e=exerciseById(id);busyExercises.add(id);refreshExercise(id);try{const result=await api('run',{exerciseId:id,code:rawDraft(e),assisted:assisted(e)},{timeout:50000});adoptState(result.state,['progress','attempts','drafts']);exerciseResults.set(id,result);}catch(error){toast(error.message,'error');}finally{busyExercises.delete(id);refreshExercise(id);refreshLessonCompletion();} }
async function discloseHint(id,solution=false) { const e=exerciseById(id);if(solution&&visibleSolutions.has(id)){visibleSolutions.delete(id);refreshExercise(id);return;}try{const result=await api('hint',{exerciseId:id});adoptState(result.state,['progress','attempts']);if(solution)visibleSolutions.add(id);else hintCounts.set(id,Math.min((hintCounts.get(id)||0)+1,(e.hints||[]).length));}catch(error){toast(error.message,'error');}finally{refreshExercise(id);refreshLessonCompletion();} }

const tabId=crypto.randomUUID?crypto.randomUUID():'tab-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const leaseKey='studio-timer-lease-v1';
const queueKey='studio-session-queue-v1';
let sessionQueue=storageGet(queueKey,[]);if(!Array.isArray(sessionQueue))sessionQueue=[];
sessionQueue=sessionQueue.filter(s=>s&&typeof s.id==='string'&&typeof s.lessonId==='string'&&Number.isInteger(s.seconds)&&s.seconds>0&&s.seconds<=300);
const timer={running:false,pending:0,lessonId:'',lastTick:0,lastActive:Date.now(),fraction:0,release:null,starting:false,reason:'计时未开始',flushBusy:false,flushPromise:null,lastQueueError:0};
function timerText(seconds) { const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
function updateTimerUI() { if(!initialized)return;const seconds=effectiveTodaySeconds();$$('[data-timer-display]').forEach(el=>el.textContent=timerText(seconds));$$('[data-today-minutes]').forEach(el=>el.textContent=Math.floor(seconds/60));$$('[data-daily-progress]').forEach(el=>el.style.width=Math.min(100,seconds/(app.state.settings.dailyMinutes*60)*100)+'%');$$('[data-timer-state]').forEach(el=>el.textContent=timer.running?'正在记录 · '+(lessonById(timer.lessonId)?.title||'专注学习'):timer.reason);$$('[data-timer-button]').forEach(el=>{el.innerHTML=icon(timer.running?'pause':'play')+(timer.running?'暂停计时':'开始专注');el.setAttribute('aria-label',timer.running?'暂停学习计时':'开始学习计时');});const header=$('#header-timer');if(header){header.classList.toggle('running',timer.running);header.setAttribute('aria-label',(timer.running?'暂停':'开始')+'学习计时，今日 '+timerText(seconds));header.firstElementChild?.replaceWith(svgElement(timer.running?'pause':'play'));} }
function svgElement(name) { const template=document.createElement('template');template.innerHTML=icon(name);return template.content.firstElementChild; }
function takeLease() { const lease=storageGet(leaseKey,null);if(lease&&lease.owner!==tabId&&Date.now()-lease.at<6000)return false;return storageSet(leaseKey,{owner:tabId,at:Date.now()}); }
function activateTimer(release) { if(resetBusy||document.hidden){release?.();timer.starting=false;toast('请回到这个页面后再开始计时。','error');return;}timer.release=release||null;timer.running=true;timer.starting=false;timer.lessonId=currentLesson()?.id||'';timer.lastTick=performance.now();timer.lastActive=Date.now();timer.fraction=0;timer.reason='';storageSet(leaseKey,{owner:tabId,at:Date.now()});updateTimerUI(); }
async function startTimer() { if(resetBusy||timer.running||timer.starting)return;if(!currentLesson()){toast('先选择一节可学习的课程。','error');return;}timer.starting=true;if(navigator.locks){navigator.locks.request('stm32-studio-learning-timer',{ifAvailable:true},async lock=>{if(!lock){timer.starting=false;toast('另一个学习空间标签页正在计时。请先在那里暂停。','error');return;}await new Promise(resolve=>activateTimer(resolve));}).catch(()=>{timer.starting=false;toast('无法取得计时锁，请关闭其他学习标签页后重试。','error');});}else{if(!takeLease()){timer.starting=false;toast('另一个标签页正在计时。请先在那里暂停。','error');return;}setTimeout(()=>{const lease=storageGet(leaseKey,null);if(lease?.owner!==tabId){timer.starting=false;toast('另一个标签页正在计时。','error');return;}activateTimer(null);},90);} }
function tickTimer() { if(!timer.running)return;const now=performance.now();const delta=(now-timer.lastTick)/1000;timer.lastTick=now;if(document.hidden){pauseTimer('页面离开前台，计时已暂停。');return;}if(Date.now()-timer.lastActive>120000){pauseTimer('超过 2 分钟未操作，计时已暂停。',true);return;}const lease=storageGet(leaseKey,null);if(lease&&lease.owner!==tabId&&Date.now()-lease.at<6000){pauseTimer('另一个标签页已接管计时。',true);return;}storageSet(leaseKey,{owner:tabId,at:Date.now()});if(delta>5){pauseTimer('检测到电脑休眠或页面挂起，计时已暂停。',true);return;}timer.fraction+=Math.max(0,delta);const whole=Math.floor(timer.fraction);timer.fraction-=whole;timer.pending+=whole;if(timer.pending>=30)flushTimer();updateTimerUI(); }
function pauseTimer(reason='已暂停，准备好后继续。',announce=false) { if(!timer.running)return;timer.running=false;timer.reason=reason;flushTimer();const lease=storageGet(leaseKey,null);if(lease?.owner===tabId){try{localStorage.removeItem(leaseKey);}catch{}}timer.release?.();timer.release=null;updateTimerUI();if(announce)toast(reason); }
function syncQueue(add=[],removeId='') { const disk=storageGet(queueKey,[]);const combined=new Map([...sessionQueue,...(Array.isArray(disk)?disk:[]),...add].filter(s=>s&&s.id!==removeId&&typeof s.id==='string'&&typeof s.lessonId==='string'&&Number.isInteger(s.seconds)&&s.seconds>0&&s.seconds<=300).map(s=>[s.id,s]));sessionQueue=[...combined.values()];storageSet(queueKey,sessionQueue); }
function flushTimer() { if(timer.pending>0&&timer.lessonId){const seconds=Math.min(300,Math.floor(timer.pending));if(seconds>0){syncQueue([{id:tabId+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),lessonId:timer.lessonId,seconds,date:today(),occurredAt:new Date().toISOString()}]);timer.pending-=seconds;}}drainSessions(); }
async function drainSessions() {
  if(timer.flushBusy)return timer.flushPromise;if(!initialized||!sessionQueue.length)return;timer.flushBusy=true;
  const task=(async()=>{try{while(sessionQueue.length){const item=sessionQueue[0];const response=await api('session',{lessonId:item.lessonId,seconds:item.seconds,id:item.id,...(item.occurredAt?{occurredAt:item.occurredAt}:{})});adoptState(response.state,['sessions']);syncQueue([],item.id);updateTimerUI();}}catch(error){if(Date.now()-timer.lastQueueError>60000){timer.lastQueueError=Date.now();toast('计时暂未同步，记录已保留，连接恢复后会重试。','error');}}})();
  timer.flushPromise=task;try{await task;}finally{timer.flushBusy=false;timer.flushPromise=null;}
}
function rememberActivity() { if(timer.running)timer.lastActive=Date.now(); }

async function confirmAction(title,message,summary='',confirmLabel='确认') { const dialog=$('#confirm-dialog');if(dialog.open)return false;dialog.innerHTML=`<div class="dialog-content"><h2 id="dialog-title">${esc(title)}</h2><p>${esc(message)}</p>${summary?`<div class="dialog-summary">${esc(summary)}</div>`:''}<div class="dialog-actions">${button('取消','dialog-cancel')}${button(esc(confirmLabel),'dialog-confirm','primary')}</div></div>`;dialog.showModal();$('[data-action="dialog-cancel"]',dialog)?.focus();return new Promise(resolve=>{dialogResolve=resolve;}); }
function finishDialog(value) { const resolve=dialogResolve;dialogResolve=null;$('#confirm-dialog').close();resolve?.(value); }
async function saveSettings(form) {
  if(chatBusy||settingsSaving||askSettingsSaving||modelKeySaving)return;
  const draft=captureSettingsDraft(form),key=draft.apiKey.trim(),daily=Number(draft.dailyMinutes),choice=$('#thinking-level',form).value;
  if(!Number.isInteger(daily)||daily<20||daily>120){toast('每天学习目标应为 20–120 之间的整数。','error');return;}
  if(modelCapability(draft.model).supported&&!choice){toast('请为这个模型选择支持的思考强度。','error');return;}
  const configuration=selectedConfiguration(draft,draft.model,choice);
  settingsSaving=true;refreshAIControls();const submit=$('#settings-save',form);if(submit)submit.innerHTML='<span class="spinner"></span>正在保存…';
  let saved=false;
  try{const result=await api('settings',{dailyMinutes:daily,...configuration,aiEnabled:draft.aiEnabled,...(key?{apiKey:key}:{})});adoptState(result.state,['settings']);settingsDraft=null;askSettingsStatus={text:'已保存，下一条问题使用此设置。',error:false};saved=true;toast('设置已保存。');}
  catch(error){toast(error.message,'error');}
  finally{settingsSaving=false;if(saved)render();else{refreshAIControls();if(submit?.isConnected)submit.innerHTML=icon('check')+'保存设置';}if(saved&&app.state.settings.hasApiKey)void loadModels({silent:true});}
}
async function loadModels({silent=false}={}) {
  if(modelLoading||chatBusy||settingsSaving||askSettingsSaving)return;
  if(!silent)captureSettingsDraft();
  const key=!silent&&route.name==='settings'?(settingsDraft?.apiKey||'').trim():'';
  if(!app.state.settings.hasApiKey&&!key){modelStatus='连接 DeepSeek 后会自动读取可用模型，也可以先选择常用模型。';modelStatusError=false;refreshAIControls();if(!silent)toast('先在设置中填写 API 密钥，再刷新模型。','error');return;}
  modelLoading=true;modelKeySaving=!!key;modelStatusError=false;refreshAIControls();
  try{
    if(key){const saved=await api('settings',{apiKey:key});adoptState(saved.state,['settings']);if(settingsDraft?.apiKey.trim()===key)settingsDraft.apiKey='';const field=$('#api-key');if(field?.value.trim()===key)field.value='';const state=$('.key-state');if(state)state.innerHTML='<span class="status-dot"></span><span>已配置 · 密钥不会回显</span><button type="button" class="copy-button" data-action="clear-key" style="margin-left:auto">移除密钥</button>';modelKeySaving=false;refreshAIControls();}
    const result=await api('models');models=[...new Map((Array.isArray(result.models)?result.models:[]).filter(item=>typeof item.id==='string'&&item.id).map(item=>[item.id,item])).values()];modelsLoaded=true;
    modelStatus=models.length?`已从官方接口读取 ${models.length} 个模型。`:'接口没有返回可用模型；当前保留你的选择与常用模型。';modelStatusError=!models.length;
    if(!silent)toast(models.length?'可用模型已刷新。':'接口没有返回可用模型。',models.length?'success':'error');
  }catch(error){modelStatus='模型列表读取失败，已保留当前选择。'+error.message;modelStatusError=true;if(!silent)toast(modelStatus,'error');}
  finally{modelLoading=false;modelKeySaving=false;refreshAIControls();}
}
async function flushPendingData() {
  flushTimer();
  // Existing requests must finish before the last version of each draft is saved.
  await Promise.allSettled([...pendingMutations]);
  for (let pass = 0; pass < 2; pass++) {
    await Promise.all([...draftSaves.values(), ...noteSaves.values()]);
    await Promise.all([...pendingDrafts.keys()].map(saveDraft).concat([...pendingNotes.keys()].map(saveNote)));
  }
  if (reportDraft) {
    const draft = {...reportDraft};
    const result = await api('report', draft);
    adoptState(result.state, ['reports']);
    if (reportDraft?.date === draft.date && reportDraft?.note === draft.note) reportDraft = null;
  }
  await drainSessions();
  if (sessionQueue.length || timer.pending || pendingDrafts.size || pendingNotes.size) {
    throw new Error('还有内容尚未同步。已保留你的数据，请恢复本地服务后再试。');
  }
}
function clearLearningCache() {
  draftTimers.forEach(clearTimeout); noteTimers.forEach(clearTimeout); clearTimeout(readingSaveTimer);
  draftTimers.clear(); noteTimers.clear(); draftSaves.clear(); noteSaves.clear();
  pendingDrafts.clear(); pendingNotes.clear(); exerciseResults.clear(); answers.clear();
  hintCounts.clear(); visibleSolutions.clear(); busyExercises.clear();
  sessionQueue = []; timer.pending = 0; timer.fraction = 0; timer.lessonId = '';
  timer.reason = '已重新开始，计时未开始'; timer.lastQueueError = 0;
  readingPositions = {}; selectedExerciseId = ''; activeLessonId = '';
  practiceType = 'all'; practiceLesson = 'all'; practiceStatus = 'all'; practiceSearch = '';
  reportDate = today(); reportDraft = null; chatDraft = ''; pendingMessage = '';
  contextExerciseId = ''; includeChatCode = false; settingsDraft = null; latestChatWarning = null;
  models = []; modelsLoaded = false; modelStatus = ''; modelStatusError = false;
  askSettingsPending = null; askSettingsStatus = {text:'选择后自动保存，用于下一条问题。', error:false};
  try { [queueKey, leaseKey, 'studio-active-lesson'].forEach(key => localStorage.removeItem(key)); } catch {}
  try { sessionStorage.removeItem(readingKey); } catch {}
}
async function resetLearningData() {
  if (resetBusy) return;
  if (chatBusy || settingsSaving || askSettingsSaving || modelKeySaving || modelLoading || busyExercises.size) {
    toast('请等待正在进行的对话、保存或练习完成后再重置。', 'error'); return;
  }
  const accepted = await confirmAction('重新开始这台电脑上的学习？',
    '当前进度、草稿、笔记、日报和对话会被清空。我们会先保存待同步内容并创建自动备份，然后清空学习记录，保留每日目标、模型和密钥等设置，并关闭 AI 助学。',
    '手机数据不受影响。需要保留一份随身副本时，可先取消并导出学习备份。', '确认重置');
  if (!accepted) return;
  resetBusy = true;
  const shell = $('.app-shell'); shell.inert = true; shell.setAttribute('aria-busy', 'true');
  const resetButton = $('[data-action="reset-data"]');
  if (resetButton) {resetButton.disabled = true; resetButton.textContent = '正在保存并重置…';}
  pauseTimer('准备重置，计时已暂停。');
  try {
    await flushPendingData();
    const result = await api('reset', {confirmation:'RESET'});
    if (!result.state || result.backupCreated !== true) throw new Error('服务没有确认重置和备份结果，请检查本地服务后刷新核对。');
    clearLearningCache(); adoptState(result.state);
    activeLessonId = nextLesson()?.id || '';
    history.replaceState(null, '', '#today'); route = parseRoute();
    render({focus:true}); window.scrollTo({top:0, behavior:'instant'});
    toast('已重新开始。重置前的数据已自动备份，AI 助学已关闭。');
  } catch (error) {
    toast(error.message, 'error');
    if (resetButton?.isConnected) {resetButton.disabled = false; resetButton.innerHTML = icon('repeat') + '重置学习数据';}
  } finally {
    resetBusy = false; shell.inert = false; shell.removeAttribute('aria-busy');
    if (route.name === 'today') $('#main').focus({preventScroll:true});
    else if (resetButton?.isConnected) resetButton.focus({preventScroll:true});
  }
}
async function clearKey() { if(!await confirmAction('移除 DeepSeek 密钥？','移除后，AI 对话需要重新配置密钥。课程、笔记与已有对话仍会保留。','','移除密钥'))return;try{const result=await api('settings',{clearApiKey:true,aiEnabled:false});adoptState(result.state,['settings']);models=[];modelsLoaded=false;modelStatus='';modelStatusError=false;if(settingsDraft){settingsDraft.apiKey='';settingsDraft.aiEnabled=false;}render();toast('密钥已移除。');}catch(error){toast(error.message,'error');} }
async function exportBackup() { try{flushTimer();for(let pass=0;pass<2;pass++)await Promise.all([...pendingDrafts.keys()].map(saveDraft).concat([...pendingNotes.keys()].map(saveNote)));await drainSessions();if(sessionQueue.length||pendingDrafts.size||pendingNotes.size)throw new Error('有内容尚未保存，请恢复本地服务后重新导出。');const backup=await api('export');const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='闲芯-学习备份-'+today()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('学习备份已导出，不包含 API 密钥。');}catch(error){toast(error.message,'error');} }
async function importBackup(file) {
  if(!file)return;if(file.size>10*1024*1024){toast('备份文件过大，请选择 10 MB 以内的 JSON 文件。','error');return;}
  let backup;try{backup=JSON.parse(await file.text());}catch{toast('无法读取这个 JSON 备份，请选择导出的学习备份。','error');return;}
  if(backup.format!=='stm32-studio-backup'||backup.version!==1||!backup.state){toast('这不是支持的闲芯学习备份格式。','error');return;}
  const summary=`${file.name} · ${Object.keys(backup.state.progress||{}).length} 节课程记录 · ${(backup.state.sessions||[]).length} 段专注记录`;
  if(!await confirmAction('用备份替换当前学习数据？','导入会替换当前进度、笔记、草稿和对话。服务会先自动备份当前状态；本机 API 密钥单独保留，导入不会启用 AI。',summary,'确认导入'))return;
  pauseTimer('正在导入备份，计时保持暂停。');
  for(let pass=0;pass<2;pass++)await Promise.all([...pendingDrafts.keys()].map(saveDraft).concat([...pendingNotes.keys()].map(saveNote)));
  await drainSessions();
  if(sessionQueue.length||pendingDrafts.size||pendingNotes.size){toast('有记录尚未同步，请恢复本地服务后再导入。','error');return;}
  try{const result=await api('import',{backup});pendingDrafts.clear();pendingNotes.clear();adoptState(result.state);exerciseResults.clear();hintCounts.clear();visibleSolutions.clear();answers.clear();reportDraft=null;settingsDraft=null;latestChatWarning=null;activeLessonId=nextLesson()?.id||'';render();toast('学习备份已导入。');}catch(error){toast(error.message,'error');}
}
async function sendChat() {
  if(chatBusy||askSettingsSaving||settingsSaving||modelKeySaving)return;
  const input=$('#chat-input'),message=input?.value.trim()||'';
  if(!message){toast('先写下你想问的问题。','error');return;}
  if(!aiReady()){location.hash='#settings';return;}
  if(!validThinkingSettings(app.state.settings)){toast('请先选择此模型支持的思考强度并保存。','error');return;}
  const l=currentLesson(),e=exerciseById(contextExerciseId),withCode=includeChatCode&&e?.type==='code',code=withCode?rawDraft(e):undefined;
  chatBusy=true;pendingMessage=message;chatDraft='';render();
  try{const response=await api('chat',{message,lessonId:l?.id,...(e?{exerciseId:e.id}:{}),includeCode:!!withCode,...(withCode?{code}:{})},{timeout:210000});adoptState(response.state,['chats','usage','progress','attempts']);latestChatWarning=response.warning?{lessonId:l?.id||'',warning:response.warning}:null;}
  catch(error){chatDraft=message;toast(error.message,'error');}
  finally{chatBusy=false;pendingMessage='';if(route.name==='ask')render();else{renderSidebar();refreshAIControls();}}
}
function scrollChat() { requestAnimationFrame(()=>{const panel=$('#chat-messages');if(panel)panel.scrollTop=panel.scrollHeight;}); }

document.addEventListener('click',async event=>{
  if(resetBusy)return;
  if(event.target.closest('.skip-link')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}
  const scrollLink=event.target.closest('[data-scroll]');if(scrollLink){event.preventDefault();document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action,id=target.dataset.id;
  try { switch(action){
    case 'open-menu':document.body.classList.add('menu-open');$('#sidebar').classList.add('open');$('#sidebar-scrim').hidden=false;target.setAttribute('aria-expanded','true');$('.nav-link.active')?.focus();break;
    case 'toggle-timer':if(timer.running)pauseTimer();else startTimer();break;
    case 'submit-quiz':await submitQuiz(id);break;
    case 'run-code':await runCode(id);break;
    case 'show-hint':target.disabled=true;await discloseHint(id);break;
    case 'show-solution':target.disabled=true;await discloseHint(id,true);break;
    case 'reset-code':{const e=exerciseById(id);if(await confirmAction('恢复这道题的起始代码？','当前草稿会替换成题目提供的初始代码。已保存的通过与助学记录不会改变。','','恢复代码')){markDraft(id,e.starter||'');exerciseResults.delete(id);refreshExercise(id);}break;}
    case 'complete-lesson':{target.disabled=true;const result=await api('progress',{lessonId:target.dataset.lesson,status:'completed'});adoptState(result.state,['progress']);render();toast('这一课，完成了。');break;}
    case 'practice-type':practiceType=target.dataset.value;render();break;
    case 'select-exercise':{const e=exerciseById(id);if(timer.running&&timer.lessonId!==e.lessonId)pauseTimer('已切换练习课程，计时已暂停。');selectedExerciseId=id;activeLessonId=e.lessonId;storageSet('studio-active-lesson',activeLessonId);history.replaceState(null,'','#practice?exercise='+encodeURIComponent(id));render();break;}
    case 'report-prev':reportDate=addDays(reportDate,-1);reportDraft=null;render();break;
    case 'report-next':if(reportDate<today()){reportDate=addDays(reportDate,1);reportDraft=null;render();}break;
    case 'save-report':{target.disabled=true;const note=$('#report-note').value;const result=await api('report',{date:reportDate,note});adoptState(result.state,['reports']);reportDraft=null;target.disabled=false;toast('这一天的复盘已保存。');break;}
    case 'suggest-question':chatDraft=target.dataset.value;$('#chat-input').value=chatDraft;$('#chat-input').focus();break;
    case 'load-models':await loadModels();break;
    case 'use-model-default':await saveAskConfiguration(target);break;
    case 'clear-key':await clearKey();break;
    case 'export-backup':target.disabled=true;await exportBackup();target.disabled=false;break;
    case 'choose-import':$('#import-file').click();break;
    case 'reset-data':await resetLearningData();break;
    case 'dialog-cancel':finishDialog(false);break;
    case 'dialog-confirm':finishDialog(true);break;
    case 'copy-code':{const text=target.closest('.code-block').querySelector('code').textContent;try{await navigator.clipboard.writeText(text);target.textContent='已复制';setTimeout(()=>{if(target.isConnected)target.textContent='复制';},1800);}catch{toast('浏览器未允许复制，请选中代码手动复制。','error');}break;}
    case 'reload':location.reload();break;
  }}catch(error){toast(error.message,'error');if(target.isConnected)target.disabled=false;}
});
document.addEventListener('submit',event=>{if(resetBusy){event.preventDefault();return;}if(event.target.id==='settings-form'){event.preventDefault();saveSettings(event.target);}if(event.target.id==='chat-form'){event.preventDefault();sendChat();}});
document.addEventListener('input',event=>{const target=event.target;if(target.dataset.code){const id=target.dataset.code;markDraft(id,target.value);const lines=document.getElementById('lines-'+id);if(lines)lines.textContent=Array.from({length:Math.max(10,target.value.split('\n').length)},(_,i)=>i+1).join('\n');}if(target.dataset.note)markNote(target.dataset.note,target.value);if(target.id==='chat-input')chatDraft=target.value;if(target.id==='report-note')reportDraft={date:reportDate,note:target.value};if(target.closest('#settings-form'))captureSettingsDraft();});
document.addEventListener('change',async event=>{const target=event.target;
  if(target.dataset.aiModel==='ask'||target.dataset.aiThinking==='ask'){await saveAskConfiguration(target);return;}
  if(target.dataset.aiModel==='settings'){const current=settingsValues(),configuration=selectedConfiguration(current,target.value,thinkingChoice(current));captureSettingsDraft();settingsDraft={...settingsDraft,...configuration};refreshAIControls();return;}
  if(target.closest('#settings-form'))captureSettingsDraft();
  if(target.dataset.aiThinking==='settings'){refreshAIControls();return;}
  if(target.dataset.quiz){answers.set(target.dataset.quiz,Number(target.value));const submit=document.querySelector('[data-action="submit-quiz"][data-id="'+CSS.escape(target.dataset.quiz)+'"]');if(submit)submit.disabled=busyExercises.has(target.dataset.quiz);}if(target.id==='practice-lesson'){practiceLesson=target.value;render();}if(target.id==='practice-status'){practiceStatus=target.value;render();}if(target.id==='report-date'&&/^\d{4}-\d{2}-\d{2}$/.test(target.value)){reportDate=target.value>today()?today():target.value;reportDraft=null;render();}if(target.id==='ask-lesson'){if(timer.running&&timer.lessonId!==target.value)pauseTimer('已切换课程，计时已暂停。');activeLessonId=target.value;contextExerciseId='';includeChatCode=false;storageSet('studio-active-lesson',activeLessonId);render();}if(target.id==='ask-exercise'){contextExerciseId=target.value;includeChatCode=false;render();}if(target.id==='include-code'){includeChatCode=target.checked;render();}if(target.id==='import-file'){await importBackup(target.files?.[0]);target.value='';}});
document.addEventListener('keydown',event=>{const target=event.target;if(event.key==='Escape'){closeMenu(true);}if(event.key==='Tab'&&$('#sidebar').classList.contains('open')){const links=$$('a[href],button:not([disabled])',$('#sidebar')),first=links[0],last=links.at(-1);if(event.shiftKey&&target===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&target===last){event.preventDefault();first?.focus();}}if(target.classList.contains('code-editor')&&!target.readOnly){if(event.key==='Escape'){target.dataset.tabEscape='true';return;}if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){if(target.dataset.tabEscape==='true'){delete target.dataset.tabEscape;return;}event.preventDefault();const start=target.selectionStart,end=target.selectionEnd;target.setRangeText('    ',start,end,'end');target.dispatchEvent(new Event('input',{bubbles:true}));}else if(!['Shift','Control','Meta'].includes(event.key)){delete target.dataset.tabEscape;}}if(target.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();sendChat();}});
document.addEventListener('scroll',event=>{if(event.target===document&&!resetBusy)rememberReadingPosition();if(event.target.classList?.contains('code-editor')){const lines=document.getElementById('lines-'+event.target.dataset.code);if(lines)lines.scrollTop=event.target.scrollTop;}rememberActivity();},true);
['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,rememberActivity,{passive:true}));
let moveThrottled=0;document.addEventListener('pointermove',()=>{if(Date.now()-moveThrottled>3000){moveThrottled=Date.now();rememberActivity();}},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTimer('页面离开前台，计时已暂停。');savePendingOnExit();}});
window.addEventListener('pagehide',()=>{pauseTimer('已暂停。');savePendingOnExit();});
window.addEventListener('storage',event=>{if(event.key===leaseKey&&timer.running){const lease=storageGet(leaseKey,null);if(lease?.owner&&lease.owner!==tabId)pauseTimer('另一个标签页已接管计时。',true);}if(event.key===queueKey){const queue=storageGet(queueKey,[]);if(Array.isArray(queue)){sessionQueue=queue;updateTimerUI();}}});
window.addEventListener('hashchange',navigate);
$('#sidebar-scrim').addEventListener('click',()=>closeMenu(true));
window.addEventListener('resize',()=>{if(innerWidth>780)closeMenu();});
$('#confirm-dialog').addEventListener('cancel',event=>{event.preventDefault();finishDialog(false);});
function savePendingOnExit() { if(resetBusy)return;rememberReadingPosition();try{sessionStorage.setItem(readingKey,JSON.stringify(readingPositions));}catch{}pendingDrafts.forEach((code,id)=>fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':app.csrfToken},body:JSON.stringify({exerciseId:id,code}),keepalive:true}).catch(()=>{}));pendingNotes.forEach((text,id)=>fetch('/api/note',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':app.csrfToken},body:JSON.stringify({lessonId:id,text}),keepalive:true}).catch(()=>{})); }
setInterval(tickTimer,1000);
setInterval(()=>{if(!initialized||resetBusy)return;pendingDrafts.forEach((_,id)=>saveDraft(id));pendingNotes.forEach((_,id)=>saveNote(id));drainSessions();},10000);

async function boot() {
  try { const response=await api('bootstrap');app={...app,...response,state:normalizeState(response.state)};app.curriculum={modules:[],lessons:[],exercises:[],resources:[],...response.curriculum};activeLessonId=storageGet('studio-active-lesson','');if(!lessonById(activeLessonId)?.available)activeLessonId=nextLesson()?.id||'';initialized=true;await navigate();if(app.state.settings.hasApiKey&&!['ask','settings'].includes(route.name))void loadModels({silent:true});drainSessions();}
  catch(error){$('#main').innerHTML=`<div class="lesson-locked">${emptyState('info','学习空间暂时没有连上',error.message)}<div class="row-end">${button('重新连接','reload','primary','','repeat')}</div></div>`;}
}
boot();
