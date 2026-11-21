import { json } from "../shared/http.js";

const APP_ID = "1f922d01-9839-40aa-a468-4aff02cf5b87";
const ONESIGNAL_URL = "https://api.onesignal.com/notifications";
const ARCHIVE_INDEX = "archive:index";
const MAX_ARCHIVE = 200;

export async function readIndex(env){try{return await env.NOTIFICATION_ARCHIVE.get(ARCHIVE_INDEX,'json')||[];}catch{return [];}}
export async function saveArchive(env,entry){
  const items=await readIndex(env);items.unshift(entry);
  const removed=items.splice(MAX_ARCHIVE);
  await env.NOTIFICATION_ARCHIVE.put(ARCHIVE_INDEX,JSON.stringify(items));
  // تنظيف مفاتيح السجلات القديمة
  for(const old of removed){if(old.key)await env.NOTIFICATION_ARCHIVE.delete('item:'+old.key);}
  await env.NOTIFICATION_ARCHIVE.put('item:'+entry.key,JSON.stringify(entry));
}
export function dateLabel(value){if(!value)return '';try{return new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return '';}}

// تكرار: يتحقق الـ Worker من رمز الإدارة (في المعالج) ثم يعيد بيانات الإشعار القابلة للتعديل فقط. لا يرسل شيئًا.
export async function getNotification(env,key){
  const item=await env.NOTIFICATION_ARCHIVE.get('item:'+key,'json');
  if(!item)return json({success:false,message:'الإشعار غير موجود في الأرشيف، ربما حُذف مسبقًا.'},404);
  return json({success:true,item:{key:item.key,title:item.title||'',message:item.message||'',url:item.url||'',imageURL:item.imageURL||''}});
}

// إلغاء إشعار مجدول لدى OneSignal: DELETE /notifications/{id}?app_id=...
// حذف سجل KV وحده لا يلغي الإرسال، لذلك الإلغاء يتم هنا صراحةً.
export async function cancelOneSignal(env,notificationId){
  if(!env.ONESIGNAL_REST_API_KEY)return {ok:false,message:'مفتاح OneSignal غير مضبوط، لا يمكن إلغاء الجدولة.'};
  if(!notificationId)return {ok:false,message:'لا يوجد معرّف OneSignal محفوظ لهذا الإشعار، لا يمكن إلغاء الجدولة.'};
  let response;
  try{
    response=await fetch(`${ONESIGNAL_URL}/${encodeURIComponent(notificationId)}?app_id=${encodeURIComponent(APP_ID)}`,{method:'DELETE',headers:{'Authorization':`Key ${env.ONESIGNAL_REST_API_KEY}`}});
  }catch(error){
    console.error('OneSignal cancel network error',error);
    return {ok:false,message:'تعذر الاتصال بـ OneSignal لإلغاء الجدولة.'};
  }
  let data={};try{data=await response.json();}catch{}
  if(response.ok&&data.success===true)return {ok:true,state:'cancelled'};
  if(response.status===404)return {ok:true,state:'missing'};
  console.error('OneSignal cancel failed',response.status);
  return {ok:false,status:response.status,message:`تعذر إلغاء الإشعار المجدول لدى OneSignal (رمز الخطأ: ${response.status}).`};
}

export async function deleteNotification(env,key){
  const item=await env.NOTIFICATION_ARCHIVE.get('item:'+key,'json');
  // قراءة الفهرس بدون ابتلاع الأخطاء حتى لا نكتب فهرسًا فارغًا عند فشل KV
  const index=(await env.NOTIFICATION_ARCHIVE.get(ARCHIVE_INDEX,'json'))||[];
  const writeIndex=async()=>{await env.NOTIFICATION_ARCHIVE.put(ARCHIVE_INDEX,JSON.stringify(index.filter(row=>row.key!==key)));};
  if(!item){
    if(index.some(row=>row.key===key))await writeIndex();
    return json({success:false,message:'الإشعار غير موجود في الأرشيف، ربما حُذف مسبقًا.'},404);
  }
  let message='تم حذف الإشعار من الأرشيف. الإشعارات التي وصلت للمستخدمين سابقًا لا تُسحب من أجهزتهم.';
  if(item.status==='scheduled'){
    const pending=Date.parse(item.sendAfter)>Date.now();
    const result=await cancelOneSignal(env,item.notificationId);
    if(!result.ok&&pending){
      // لم يُلغَ الإرسال المستقبلي: لا نحذف السجل حتى لا يبقى إشعار مجدول بلا أثر في الأرشيف
      return json({success:false,message:`${result.message} لم يُحذف الإشعار من الأرشيف حتى لا يبقى مجدولًا دون سجل. حاول مرة أخرى.`},502);
    }
    if(result.ok&&result.state==='cancelled')message='تم إلغاء الجدولة لدى OneSignal وحذف الإشعار من الأرشيف. لن يُرسل مستقبلًا.';
    else if(result.ok)message='لم يعد الإشعار موجودًا لدى OneSignal، وتم حذفه من الأرشيف.';
    else message='حان موعد هذا الإشعار وتعذر إلغاؤه لدى OneSignal لأنه أُرسل غالبًا، وتم حذفه من الأرشيف. الإشعارات التي وصلت للمستخدمين لا تُسحب من أجهزتهم.';
  }
  await writeIndex();
  await env.NOTIFICATION_ARCHIVE.delete('item:'+key);
  return json({success:true,message});
}
