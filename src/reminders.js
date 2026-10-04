import {escape,icon} from './ui.js';
const TOKEN_KEY='matchpoint:push-token:v1';
const ENDPOINT_KEY='matchpoint:push-endpoint:v1',PREFERENCES_KEY='matchpoint:preferences:v2';
export function reminderPreferences(value={}){
 return {enabled:value.enabled===true,minutes:Number.isInteger(value.minutes)&&value.minutes>=1&&value.minutes<=1440?value.minutes:15,calendar:value.calendar===true,pendingRemoval:value.pendingRemoval===true};
}
export function createReminderController({state,save,env=globalThis,fetcher=globalThis.fetch,onChange=()=>{}}){
 let registration,config,preparing,queue=Promise.resolve();
 const notify=()=>onChange();
 function support(){
  const ios=/iPad|iPhone|iPod/.test(env.navigator.userAgent)||(env.navigator.platform==='MacIntel'&&env.navigator.maxTouchPoints>1);
  if(!env.isSecureContext)return {supported:false,reason:'通知需要通过 HTTPS 地址访问赛点。'};
  if(ios&&!env.navigator.standalone&&!env.matchMedia('(display-mode: standalone)').matches)return {supported:false,reason:'请先添加到主屏幕，再从桌面打开赛点（需要 iOS / iPadOS 16.4 或更新版本）。'};
  if(!env.Notification||!env.PushManager||!env.navigator.serviceWorker)return {supported:false,reason:'当前浏览器不支持后台通知，可选择日历提醒。'};
  if(env.Notification.permission==='denied')return {supported:false,reason:'通知权限已被关闭，请在系统或浏览器设置中允许赛点发送通知。'};
  return {supported:true,reason:'开启后，即使关闭网页，也能收到关注比赛的开赛提醒。'};
 }
 function token(){
  let value=env.localStorage.getItem(TOKEN_KEY);if(/^[a-f0-9]{64}$/.test(value||''))return value;
  value=[...env.crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
  env.localStorage.setItem(TOKEN_KEY,value);if(env.localStorage.getItem(TOKEN_KEY)!==value)throw new Error('设备设置无法保存，请允许浏览器存储后再开启提醒');return value;
 }
 async function request(path,method='GET',body){
  const response=await fetcher('/api/reminders/'+path,{method,cache:'no-store',headers:{'Content-Type':'application/json',...(path==='config'?{}:{Authorization:'Bearer '+token()})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'提醒设置暂时无法同步');return data;
 }
 function keyBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 function serial(work){const task=queue.catch(()=>{}).then(()=>env.navigator.locks?env.navigator.locks.request('matchpoint:push-device',work):work());queue=task;return task;}
 function reconcile(){
  try{
   const saved=JSON.parse(env.localStorage.getItem(PREFERENCES_KEY));
   if(saved?.reminders)Object.assign(state.reminders,reminderPreferences(saved.reminders));
   if(Array.isArray(saved?.follows))state.follows=new Set(saved.follows.filter(id=>typeof id==='string'));
  }catch{}
 }
 async function syncSubscription(sub){
  const data=await request('subscription','PUT',{subscription:sub.toJSON(),matchIds:[...state.follows],minutes:state.reminders.minutes});
  if(!data.subscribed)throw new Error('提醒订阅未成功保存');state.reminders.syncError='';return data;
 }
 const controller={
  support,
  reconcile,
  async prepare(){
   if(preparing)return preparing;if(!support().supported)return false;
   preparing=(async()=>{
    [registration,config]=await Promise.all([env.navigator.serviceWorker.register('/sw.js').then(()=>env.navigator.serviceWorker.ready),request('config')]);
    return true;
   })().catch(error=>{preparing=null;throw error;});return preparing;
  },
  async enable(){
   const availability=support();if(!availability.supported)throw new Error(availability.reason);
   // Request permission before the first await: iOS requires the button's user gesture.
   const permission=env.Notification.permission==='granted'?Promise.resolve('granted'):env.Notification.requestPermission();
   state.reminders.busy=true;notify();
   try{
    await serial(async()=>{
     let created;
     try{
     if(await permission!=='granted')throw new Error('未获得通知权限。你仍可手动添加日历提醒。');
     token();await controller.prepare();
     reconcile();let sub=await registration.pushManager.getSubscription();
     const desired=keyBytes(config.publicKey),old=sub?.options?.applicationServerKey;
     if(old&&String(new Uint8Array(old))!==String(desired)){await sub.unsubscribe();sub=null;}
     if(!sub){sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:desired});created=sub;}
     await syncSubscription(sub);env.localStorage.setItem(ENDPOINT_KEY,sub.toJSON().endpoint);
     state.reminders.enabled=true;state.reminders.pendingRemoval=false;if(!save())throw new Error('提醒偏好无法保存，请允许浏览器存储');
     }catch(error){if(created)await created.unsubscribe().catch(()=>{});state.reminders.enabled=false;state.reminders.syncError=error.message;save();throw error;}
    });
   }finally{state.reminders.busy=false;notify();}
  },
  async disable(){
   state.reminders.busy=true;notify();
   try{
    await serial(async()=>{
     reconcile();const worker=registration||await env.navigator.serviceWorker?.getRegistration?.('/');const sub=await worker?.pushManager.getSubscription();
     const endpoint=sub?.toJSON().endpoint||env.localStorage.getItem(ENDPOINT_KEY);
     if(sub)await sub.unsubscribe();
     if(endpoint)env.localStorage.setItem(ENDPOINT_KEY,endpoint);
     state.reminders.enabled=false;state.reminders.pendingRemoval=true;save();
     await request('subscription','DELETE',endpoint?{endpoint}:undefined);state.reminders.pendingRemoval=false;state.reminders.syncError='';save();
    });
   }catch(error){state.reminders.syncError=state.reminders.enabled?error.message:'本机已停止通知，联网后将重试取消服务器提醒。';throw error;}
   finally{state.reminders.busy=false;notify();}
  },
  sync(){
   return serial(async()=>{
    try{
     reconcile();
     if(state.reminders.pendingRemoval){const endpoint=env.localStorage.getItem(ENDPOINT_KEY);await request('subscription','DELETE',endpoint?{endpoint}:undefined);state.reminders.pendingRemoval=false;state.reminders.syncError='';save();notify();return;}
     if(!state.reminders.enabled)return;
     if(!support().supported)throw new Error(support().reason);
     await controller.prepare();const sub=await registration.pushManager.getSubscription();
     if(!sub){state.reminders.enabled=false;save();throw new Error('通知订阅已失效，请重新开启提醒。');}
     await syncSubscription(sub);notify();
    }catch(error){state.reminders.syncError=error.message;notify();throw error;}
   });
  },
  async setPreferences({minutes,calendar}){
   if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('请输入 1～1440 的整数分钟数');
   Object.assign(state.reminders,{minutes,calendar:calendar===true});
   if(!save())throw new Error('设置无法保存，请允许浏览器存储');
   await controller.sync();notify();
  },
  async test(){
   if(!state.reminders.enabled)throw new Error('请先开启提醒');
   const result=await request('test','POST',{});
   if(!result.delivered){if(!result.subscribed){state.reminders.enabled=false;save();notify();}throw new Error(result.subscribed?'测试通知暂时发送失败，请稍后重试':'通知订阅已失效，请重新开启提醒');}
  }
 };
 return controller;
}
export function reminderSettingsView(state,availability){
 const settings=state.reminders,enabled=settings.enabled&&availability.supported;
 return `<div class="modal-eyebrow">MATCH REMINDERS</div><h2>开赛前，提醒我。</h2><p class="modal-subtitle">关注比赛，不错过下一场热爱。</p><section class="reminder-status ${enabled&&!settings.syncError?'enabled':''}"><span class="reminder-status-icon">${icon('bell')}</span><div><b>${settings.syncError?'设置待同步':enabled?'通知提醒已开启':'通知提醒未开启'}</b><p>${escape(settings.syncError||availability.reason)}</p></div></section><div class="reminder-field"><label for="reminder-minutes">提前多久提醒</label><div class="reminder-minute-input"><input id="reminder-minutes" type="number" min="1" max="1440" step="1" inputmode="numeric" value="${settings.minutes}"/><span>分钟</span></div><div class="reminder-presets">${[5,10,15,30,60].map(n=>`<button data-action="reminder-preset" data-minutes="${n}" aria-pressed="${settings.minutes===n}">${n} 分钟</button>`).join('')}</div><p>可输入 1～1440 分钟，应用于本设备所有关注比赛。</p></div><label class="reminder-calendar-choice"><input id="reminder-calendar" type="checkbox" ${settings.calendar?'checked':''}/><span><b>显示添加到日历选项</b><small>默认关闭。开启后可为关注比赛手动添加日历事件。</small></span>${icon('calendar')}</label><p class="reminder-calendar-note">日历需要你确认导入；比赛改期后，请重新导入或修改日历事件。</p><div class="reminder-actions"><button class="button secondary" data-action="reminder-save" ${settings.busy?'disabled':''}>${icon('check')}保存设置</button><button class="button primary" data-action="${settings.enabled?'reminder-disable':'reminder-enable'}" ${settings.busy||!availability.supported&&!settings.enabled?'disabled':''}>${icon('bell')}${settings.busy?'正在处理…':settings.enabled?'关闭通知提醒':'开启通知提醒'}</button></div>${settings.enabled?'<button class="reminder-test" data-action="reminder-test">发送测试通知 '+icon('arrow')+'</button>':''}<p class="modal-footnote">iPhone / iPad：iOS 16.4+，使用 HTTPS 并从主屏幕打开。通知送达受设备联网和专注模式影响。</p>`;
}
