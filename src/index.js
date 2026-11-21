// ==========================================
// لوحة معدودات + الأرشيف + مركز الملفات + PWA
// Cloudflare Workers + OneSignal + KV (NOTIFICATION_ARCHIVE) + X02 (X02_API_KEY)
// ==========================================

import { json, validURL, htmlResponse } from "./shared/http.js";
import { manifestResponse, swResponse, iconResponse } from "./pwa/handlers.js";
import { APP_ID, ONESIGNAL_URL, readIndex, saveArchive, dateLabel, getNotification, deleteNotification } from "./notifications/archive.js";
import { FILE_TTLS, fileIndex, fileTypeAllowed, serveFile, listFiles, deleteStoredFile, cleanupExpired } from "./files/service.js";
import { handleSheets } from "./sheets/api.js";
import { renderSheetsPage } from "./sheets/page.js";

const LOGO_URL = "https://file.garden/aoLQp-Z9knG33grX/%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA%20%D8%A7%D9%84%D8%B5%D9%88%D8%B1/Painting-numbered.png";
const BADGE_URL = "https://file.garden/aoLQp-Z9knG33grX/%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA%20%D8%A7%D9%84%D8%B5%D9%88%D8%B1/numbered72.png";
const FONT_URL = "https://file.garden/aoLQp-Z9knG33grX/%D8%B4%D8%B9%D8%A7%D8%B1%D8%A7%D8%AA%20%D8%A7%D9%84%D8%B5%D9%88%D8%B1/TheYearofHandicrafts-Bold.otf";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // حد محافظ لتوافق الرفع عبر Worker
// عند تغيير الشعار مستقبلًا ارفع هذا الرقم لكسر التخزين المؤقت للأيقونات والـ Service Worker
const ASSET_VERSION = "5";
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ICON_PATHS = {
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  title:'<path d="M4 6h16M4 12h12M4 18h9"/>',
  message:'<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
  install:'<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
  dots:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  video:'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4"/>',
  check:'<path d="m5 12 5 5L20 7"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>'
};
function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}
const ICON_SVGS = Object.fromEntries(Object.keys(ICON_PATHS).map(k => [k, icon(k)]));





);`;
  return new Response(js,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-cache, no-store, must-revalidate","Service-Worker-Allowed":"/"}});
}


function renderPage(pageMode="home"){const filesOnly=pageMode==="files";return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b0d18"><meta name="description" content="لوحة إشعارات معدودات"><link rel="manifest" href="/manifest.webmanifest?v=${ASSET_VERSION}"><link rel="icon" href="/icon-192.png?v=${ASSET_VERSION}"><link rel="apple-touch-icon" href="/icon-192.png?v=${ASSET_VERSION}"><title>${filesOnly?"مركز الملفات | لوحة معدودات":"لوحة معدودات"}</title>
<style>
@font-face{font-family:N;src:url("${FONT_URL}") format("opentype");font-display:swap}
:root{color-scheme:dark;--bg:#090b14;--card:#141725;--card2:#0d1120;--line:#292e43;--line2:#30364d;--tx:#f4f4fb;--mut:#9298ae;--soft:#b6bacb;--pri:#796dff;--pri2:#5145c8;--pri-soft:#b5afff;--chip:#252044;--chip-line:#514b91;--ok-bg:#123528;--ok:#8ff0bd;--err-bg:#3a2028;--err:#ffb5c2;--warn-bg:#3a3017;--warn:#ffd98a}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--tx);font-family:N,Arial,sans-serif;background:radial-gradient(ellipse at top,#222044 0%,transparent 55%),var(--bg);background-attachment:fixed;padding:18px 14px calc(104px + env(safe-area-inset-bottom))}
body.files-only{padding-bottom:30px}body.lock{overflow:hidden}
button,input,textarea,select{font-family:inherit}:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.wrap{max-width:1040px;margin:0 auto}
.ico{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.ico-wrap{display:inline-flex}
.head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;margin-bottom:16px}
.logo{width:92px;height:92px;object-fit:contain;filter:drop-shadow(0 0 20px #7165ff66)}
h1{font-size:23px;margin:2px 0 0}.sub,.hint{color:var(--mut);font-size:12px;line-height:1.8}
.head .install{margin-top:6px}
@media(min-width:760px){.head{flex-direction:row;text-align:start;gap:16px}.head-text{flex:1}.logo{width:84px;height:84px}.head .install{margin:0}}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:0 18px 55px #0006}
.sec-head{display:flex;align-items:center;gap:10px;color:var(--pri-soft);font-size:17px;margin:0 0 4px}.sec-head .grow{flex:1}.sec-head .ico{color:var(--pri-soft)}
.count{background:var(--chip);border:1px solid var(--chip-line);color:#d4d0ff;border-radius:999px;font-size:11px;padding:2px 9px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;padding:13px 16px;background:linear-gradient(135deg,#796dff,#5145c8);color:#fff;font-size:15px;cursor:pointer;text-decoration:none;transition:transform .12s,opacity .2s,filter .2s;box-shadow:0 8px 24px #5145c855}
.btn:hover{filter:brightness(1.08)}.btn:active{transform:scale(.98)}.btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
.btn.secondary{background:var(--chip);border:1px solid var(--chip-line);color:#d4d0ff;box-shadow:none}
.btn.danger{background:linear-gradient(135deg,#ff6b86,#c93352);box-shadow:0 8px 24px #c9335255}
.btn.small{padding:8px 12px;font-size:12px;border-radius:10px}.btn.small .ico{width:16px;height:16px}.btn.full{width:100%}
.icon-btn{width:36px;height:36px;padding:0;border:1px solid #343951;border-radius:10px;background:var(--card);color:#c8c6e9;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:.15s}
.icon-btn:hover,.icon-btn[aria-expanded=true]{background:#29234d;border-color:var(--pri)}
.inp,input[type=text],input[type=url],input[type=password],input[type=search],input[type=date],input[type=time],textarea{width:100%;padding:13px;border:1px solid var(--line2);border-radius:12px;background:var(--card2);color:#fff;outline:none;font-size:14px;color-scheme:dark;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus{border-color:#8175ff;box-shadow:0 0 0 3px #8175ff25}
textarea{min-height:110px;resize:vertical;line-height:1.8}
.access{margin-top:4px;padding:14px 16px;display:grid;gap:10px}
.access-row{display:grid;gap:8px}
@media(min-width:760px){.access-row{grid-template-columns:150px 1fr;align-items:center}}
.lab{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:14px;color:#dedff0}.lab .l{display:flex;align-items:center;gap:8px}.lab .ico{color:#aaa3ff}.access .lab{margin:0}
.counter{font-size:11px;color:var(--mut)}.counter.warn{color:var(--warn)}
.input-wrap{position:relative}.input-wrap input{padding-inline-end:48px}.input-wrap .icon-btn{position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;background:none}
.check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);cursor:pointer}.check input{width:16px;height:16px;accent-color:#796dff}
.tabs{display:flex;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:5px;margin:16px 0}
.tab{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 8px;border:0;border-radius:12px;background:none;color:#c8c6e9;font-size:13px;cursor:pointer;transition:.18s}
.tab:hover{background:#1b1f33}.tab.active{background:#29234d;color:#fff;box-shadow:inset 0 0 0 1px #8175ff}
@media(max-width:759px){.tabs{position:fixed;inset-inline:10px;bottom:calc(10px + env(safe-area-inset-bottom));margin:0;z-index:30;background:#141725ee;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 40px #000b}.tab{flex-direction:column;gap:3px;font-size:11px;padding:8px 4px}}
.view{display:none}.view.active{display:block;animation:fade .22s}
.files-only #compose,.files-only #archive{display:none!important}
.compose-grid{display:grid;gap:16px}
@media(min-width:900px){.compose-grid{grid-template-columns:minmax(0,1fr) 340px;grid-template-areas:"fields preview" "submit preview";align-items:start}.fields{grid-area:fields}.preview-col{grid-area:preview;position:sticky;top:16px}.submit-row{grid-area:submit}}
.field{margin-top:16px}.divider{height:1px;background:var(--line);margin:22px 0 18px}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.mode{position:relative;display:block;cursor:pointer}.mode input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.mode-body{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 10px;border:1px solid var(--line2);border-radius:14px;background:var(--card2);color:#bbb;font-size:14px;transition:.18s}
.mode input:checked+.mode-body{border-color:var(--pri);background:#29234d;color:#fff;box-shadow:0 0 0 3px #796dff22}.mode input:focus-visible+.mode-body{outline:2px solid var(--pri);outline-offset:2px}
.sched{display:none;margin-top:12px;background:var(--card2);border:1px solid var(--line2);border-radius:14px;padding:14px}.sched.active{display:block;animation:fade .2s}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.picker{display:flex;gap:8px;align-items:stretch}.picker input{flex:1;min-width:0;cursor:pointer}
.pick-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border:1px solid var(--chip-line);border-radius:12px;background:var(--chip);color:#d4d0ff;font-size:12px;cursor:pointer}.pick-btn:active{background:#322b63}.pick-btn .ico{width:16px;height:16px}
.sched .lab{margin-bottom:8px}.tz{margin-top:12px;color:var(--mut);font-size:12px;text-align:center;direction:ltr}
@media(max-width:520px){.grid2{grid-template-columns:1fr}}
.phone{background:linear-gradient(160deg,#1b1740,#0d1120);border-radius:16px;padding:14px;border:1px solid #23284a}
.notif{background:#1b1f33;border:1px solid #2f3550;border-radius:18px;padding:12px 14px;box-shadow:0 8px 30px #0005}
.notif-top{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--mut);margin-bottom:8px}.notif-ico{width:18px;height:18px;border-radius:5px;object-fit:contain;background:var(--card2)}
.notif-title{font-size:14px;font-weight:bold;color:#fff;overflow-wrap:anywhere;line-height:1.6}.notif-body{font-size:12.5px;color:#cfd2e4;line-height:1.7;margin-top:3px;overflow-wrap:anywhere;white-space:pre-wrap}
.notif-img{width:100%;max-height:190px;object-fit:cover;border-radius:12px;margin-top:10px;display:block}
.preview-card{padding:16px}
.status{display:none;padding:12px;border-radius:10px;margin-top:14px;font-size:12px;line-height:1.8}.status.ok{display:block;background:var(--ok-bg);color:var(--ok)}.status.err{display:block;background:var(--err-bg);color:var(--err)}
.submit-row .btn{width:100%;padding:15px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 2px;align-items:center}
.search{position:relative;flex:1 1 220px}.search .ico{position:absolute;inset-inline-start:13px;top:50%;transform:translateY(-50%);color:var(--mut);pointer-events:none}.search input{padding-inline-start:42px}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:8px 13px;border:1px solid var(--line2);border-radius:999px;background:var(--card2);color:#c8c6e9;font-size:12px;cursor:pointer;transition:.15s}.chip.active,.chip:has(input:checked){background:#29234d;border-color:var(--pri);color:#fff}
.chip input{position:absolute;opacity:0;pointer-events:none}.chip{position:relative}.chip:has(input:focus-visible){outline:2px solid var(--pri);outline-offset:2px}
.list{display:grid;gap:10px;margin-top:14px}
@media(min-width:900px){.list.files{grid-template-columns:1fr 1fr}}
.item{position:relative;background:var(--card2);border:1px solid var(--line);border-radius:16px;padding:14px 16px;transition:opacity .2s,border-color .2s}
.item::before{content:"";position:absolute;inset-block:14px;inset-inline-start:0;width:3px;border-radius:3px;background:var(--pri)}.item.scheduled::before{background:#ffd98a}.item.sent::before{background:#8ff0bd}
.item.busy{opacity:.5;pointer-events:none}.item:hover{border-color:#3b4163}
.item-head{display:flex;align-items:flex-start;gap:10px}.item-title{flex:1;min-width:0;font-size:15px;color:#fff;font-weight:bold;overflow-wrap:anywhere;line-height:1.6;padding-top:5px}
.badge-s{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;margin-bottom:4px}.badge-s .ico{width:13px;height:13px}.badge-s.sent{background:var(--ok-bg);color:var(--ok)}.badge-s.scheduled{background:var(--warn-bg);color:var(--warn)}.badge-s.soon{background:var(--warn-bg);color:var(--warn)}.badge-s.plain{background:var(--chip);color:#d4d0ff}
.item-text{font-size:12.5px;color:var(--soft);line-height:1.9;margin:6px 0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;white-space:pre-wrap}.item-text.open{display:block;-webkit-line-clamp:unset}
.meta{font-size:11px;color:var(--mut);line-height:1.9;display:flex;flex-wrap:wrap;gap:4px 12px}.meta span{display:inline-flex;align-items:center;gap:4px}.meta .ico{width:13px;height:13px}
.menu-wrap{position:relative;flex:none}.menu{display:none;position:absolute;top:40px;inset-inline-end:0;min-width:176px;z-index:20;background:var(--card);border:1px solid var(--chip-line);border-radius:12px;padding:6px;box-shadow:0 14px 40px #000a;scroll-margin-bottom:96px}.menu.open{display:block;animation:fade .12s}
.menu button{width:100%;display:flex;align-items:center;gap:9px;padding:11px 12px;border:0;border-radius:8px;background:none;color:#e6e4ff;font-size:13px;cursor:pointer;text-align:start}.menu button:hover,.menu button:focus-visible{background:#29234d;outline:none}.menu button.danger{color:#ff9aab}.menu .ico{width:16px;height:16px}
.empty{color:var(--mut);text-align:center;padding:30px 16px;font-size:13px;line-height:1.9}.empty .ico{width:38px;height:38px;color:#514b91;display:block;margin:0 auto 10px}.empty .btn{margin-top:12px}
.skel{height:96px;border-radius:16px;background:linear-gradient(90deg,#0d1120 25%,#171b2e 50%,#0d1120 75%);background-size:200% 100%;animation:sh 1.2s linear infinite}
.drop{margin-top:16px;border:2px dashed #3a3f5e;border-radius:18px;padding:26px 16px;text-align:center;color:var(--soft);cursor:pointer;transition:.18s;background:var(--card2);font-size:13px;line-height:1.9}.drop:hover,.drop.over{border-color:var(--pri);background:#171435}.drop .ico{width:34px;height:34px;color:var(--pri-soft);display:block;margin:0 auto 6px}.drop small{color:var(--mut);display:block}
.pfile{display:flex;gap:12px;align-items:center;margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card2)}.pfile .info{flex:1;min-width:0}.pfile .nm{font-size:13px;color:#fff;overflow-wrap:anywhere}
.pthumb,.fthumb{width:64px;height:64px;border-radius:12px;object-fit:cover;background:#171b2e;flex:none;display:flex;align-items:center;justify-content:center;color:var(--pri-soft);overflow:hidden}.pthumb video{width:100%;height:100%;object-fit:cover}.fthumb{width:72px;height:72px}
.expiry{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.progress{height:8px;border-radius:99px;background:var(--card2);overflow:hidden;margin-top:14px;border:1px solid var(--line)}.progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#796dff,#8ff0bd);transition:width .15s}
.linkbox{display:flex;gap:8px;margin-top:14px}.linkbox input{direction:ltr;text-align:left;font-size:12px}
.fitem{display:flex;gap:12px}.fbody{flex:1;min-width:0}.fname{font-size:14px;color:#fff;overflow-wrap:anywhere;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.modal{position:fixed;inset:0;z-index:60;background:#05060cc7;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px}
.modal-box{width:100%;max-width:440px;max-height:86vh;overflow:auto;background:var(--card);border:1px solid #3a3f5e;border-radius:20px;padding:20px;box-shadow:0 30px 80px #000c;animation:pop .18s}
.modal-title{font-size:17px;color:#fff;margin:0 0 8px}.modal-text{color:var(--soft);font-size:13px;line-height:1.9;overflow-wrap:anywhere}.modal-actions{display:flex;gap:10px;margin-top:18px}.modal-actions .btn{flex:1}
.pick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.pick-grid button{padding:0;border:2px solid transparent;border-radius:12px;overflow:hidden;background:var(--card2);cursor:pointer;aspect-ratio:1}.pick-grid button:hover,.pick-grid button:focus-visible{border-color:var(--pri)}.pick-grid img{width:100%;height:100%;object-fit:cover;display:block}
@media(max-width:560px){.modal{align-items:flex-end;padding:0}.modal-box{max-width:none;border-radius:22px 22px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom));animation:up .22s}}
.toasts{position:fixed;top:12px;inset-inline:12px;z-index:80;display:grid;gap:8px;justify-items:center;pointer-events:none}
.toast{pointer-events:auto;max-width:520px;width:fit-content;padding:12px 16px;border-radius:12px;font-size:13px;line-height:1.7;box-shadow:0 12px 40px #000a;animation:slide .22s;border:1px solid transparent}.toast.ok{background:var(--ok-bg);color:var(--ok);border-color:#1d5a42}.toast.err{background:var(--err-bg);color:var(--err);border-color:#6a3040}.toast.out{opacity:0;transform:translateY(-8px);transition:.3s}
.install{display:none}.install.show{display:inline-flex}
.foot{text-align:center;color:#666d83;font-size:11px;margin:26px 0 6px}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}@keyframes up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}@keyframes slide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}@keyframes sh{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media(max-width:430px){.card{padding:16px}}
</style></head><body class="${filesOnly?"files-only":""}"><div class="wrap">
<header class="head"><img class="logo" src="${LOGO_URL}" alt="شعار معدودات"><div class="head-text"><h1>${filesOnly?"مركز ملفات معدودات":"لوحة معدودات"}</h1><div class="sub">${filesOnly?"رفع الصور والفيديو وملفات PDF وإدارة روابطها":"إدارة وإرسال وجدولة الإشعارات"}</div></div><button id="install" class="btn secondary install small" type="button">${icon('install')} تثبيت التطبيق</button></header>
<section class="card access">
<div class="access-row"><label class="lab" for="token"><span class="l">${icon('lock')} رمز الإدارة</span></label><div class="input-wrap"><input id="token" name="token" form="form" type="password" autocomplete="current-password" placeholder="أدخل رمز الإدارة" required><button id="toggleToken" class="icon-btn" type="button" aria-label="إظهار الرمز">${icon('eye')}</button></div></div>
<label class="check"><input id="rememberToken" type="checkbox"> تذكّر الرمز في هذه الجلسة فقط</label>
</section>
${filesOnly?`<div style="margin-top:14px"><a class="btn secondary small" href="/">العودة إلى لوحة معدودات</a></div>`:`<nav class="tabs" role="tablist" aria-label="أقسام اللوحة"><button class="tab active" data-tab="compose" role="tab" aria-selected="true" type="button">${icon('send')} إنشاء إشعار</button><button class="tab" data-tab="archive" role="tab" aria-selected="false" type="button">${icon('archive')} الأرشيف</button><button class="tab" data-tab="files" role="tab" aria-selected="false" type="button">${icon('image')} مركز الملفات</button><a class="tab" href="/sheets" style="text-decoration:none">الجداول</a></nav>`}
<main>
<section id="compose" class="view active" role="tabpanel">
<form id="form" class="compose-grid" novalidate>
<div class="card fields">
<div class="sec-head">${icon('send')} إنشاء إشعار جديد</div><div class="hint">أدخل تفاصيل الإشعار، ويمكنك إعادة استخدام إشعار سابق من الأرشيف.</div>
<div class="field"><div class="lab"><label class="l" for="title">${icon('title')} عنوان الإشعار</label><span class="counter" id="cTitle">0/100</span></div><input id="title" name="title" type="text" maxlength="100" placeholder="عنوان الإشعار" required></div>
<div class="field"><div class="lab"><label class="l" for="message">${icon('message')} نص الإشعار</label><span class="counter" id="cMsg">0/500</span></div><textarea id="message" name="message" maxlength="500" placeholder="اكتب نص الإشعار" required></textarea></div>
<div class="field"><div class="lab"><label class="l" for="url">${icon('link')} رابط الوجهة</label></div><input id="url" name="url" type="url" placeholder="https://numbered.casacam.net/"></div>
<div class="field"><div class="lab"><label class="l" for="image_url">${icon('image')} رابط صورة الإشعار</label><button id="pickFromFiles" class="btn secondary small" type="button">${icon('image')} من ملفاتي</button></div><input id="image_url" name="image_url" type="url" placeholder="https://example.com/image.png"><div id="imgErr" class="hint" style="color:var(--err)" hidden>تعذر تحميل الصورة، تحقق من الرابط.</div></div>
<div class="divider"></div><div class="sec-head">${icon('calendar')} موعد الإرسال</div>
<div class="modes" role="radiogroup" aria-label="موعد الإرسال"><label class="mode"><input type="radio" name="schedule_mode" value="now" checked><span class="mode-body">${icon('send')} إرسال فوري</span></label><label class="mode"><input type="radio" name="schedule_mode" value="later"><span class="mode-body">${icon('clock')} جدولة لاحقًا</span></label></div>
<div id="schedule" class="sched"><div class="grid2">
<div><div class="lab"><label class="l" for="date">${icon('calendar')} التاريخ</label></div><div class="picker"><input id="date" type="date" inputmode="none" autocomplete="off"><button id="pickDate" class="pick-btn" type="button">${icon('calendar')} فتح التقويم</button></div></div>
<div><div class="lab"><label class="l" for="time">${icon('clock')} الوقت</label></div><div class="picker"><input id="time" type="time" inputmode="none" autocomplete="off"><button id="pickTime" class="pick-btn" type="button">${icon('clock')} فتح الساعة</button></div></div>
</div><div class="tz">Riyadh - SA</div></div>
</div>
<aside class="preview-col"><div class="card preview-card"><div class="hint" style="margin-bottom:8px">معاينة الإشعار</div><div class="phone"><div class="notif"><div class="notif-top"><img class="notif-ico" src="${BADGE_URL}" alt=""><span>معدودات</span><span>•</span><span id="pTime">الآن</span></div><div class="notif-title" id="pt">عنوان الإشعار</div><div class="notif-body" id="pm">نص الإشعار</div><img id="pi" class="notif-img" alt="معاينة الصورة" hidden></div></div></div></aside>
<div class="submit-row"><button id="submit" class="btn" type="submit">${icon('send')} <span id="submitLabel">إرسال الإشعار</span></button><div id="status" class="status" role="status"></div></div>
</form></section>
<section id="archive" class="view card" role="tabpanel"><div class="sec-head">${icon('archive')} <span class="grow">أرشيف الإشعارات</span><span id="archCount" class="count" hidden></span><button id="refresh" class="btn secondary small" type="button">${icon('refresh')} تحديث</button></div><div class="hint">الإشعارات التي أُنشئت من هذه اللوحة، سواء أُرسلت أو جُدولت.</div>
<div class="toolbar"><div class="search">${icon('search')}<input id="archSearch" type="search" placeholder="ابحث في الإشعارات" aria-label="بحث في الأرشيف"></div><div class="chips" id="archFilter"><button type="button" class="chip active" data-f="all">الكل</button><button type="button" class="chip" data-f="scheduled">مجدول</button><button type="button" class="chip" data-f="sent">تم الإرسال</button></div></div>
<div id="archiveList" class="list"></div></section>
<section id="files" class="view" role="tabpanel"><div class="card"><div class="sec-head">${icon('image')} مركز ملفات معدودات</div><div class="hint">ارفع الصور والفيديو وملفات PDF، وأنشئ رابطًا مباشرًا بمدة صلاحية تختارها.</div>
<div id="dropzone" class="drop" tabindex="0" role="button" aria-label="اختيار ملف للرفع">${icon('upload')}اسحب الملف هنا أو اضغط للاختيار<small>صور، MP4/WebM، PDF — حتى 25 ميجابايت</small></div>
<input id="filePick" type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,application/pdf">
<div id="filePreview" class="pfile" hidden><div id="filePreviewThumb" class="pthumb"></div><div class="info"><div id="filePreviewName" class="nm"></div><div id="filePreviewMeta" class="meta"></div></div><button id="fileClear" class="icon-btn" type="button" aria-label="إزالة الملف">${icon('x')}</button></div>
<div class="field"><div class="lab"><span class="l">مدة صلاحية الرابط</span></div><div class="expiry" role="radiogroup" aria-label="مدة صلاحية الرابط"><label class="chip"><input type="radio" name="expiry" value="1d">يوم واحد</label><label class="chip"><input type="radio" name="expiry" value="7d" checked>7 أيام</label><label class="chip"><input type="radio" name="expiry" value="30d">30 يومًا</label><label class="chip"><input type="radio" name="expiry" value="90d">90 يومًا</label><label class="chip"><input type="radio" name="expiry" value="forever">دائم حتى الحذف اليدوي</label></div></div>
<div id="progressWrap" class="progress" hidden><i id="progressBar"></i></div>
<button id="uploadFile" class="btn full" type="button" style="margin-top:16px">${icon('upload')} رفع الملف وإنشاء الرابط</button><div id="fileStatus" class="status" role="status"></div>
<div id="uploadResult" class="linkbox" hidden><input id="uploadUrl" type="text" readonly aria-label="رابط الملف"><button id="copyUploaded" class="btn secondary small" type="button">${icon('copy')} نسخ</button></div></div>
<div class="card" style="margin-top:16px"><div class="sec-head"><span class="grow">ملفاتي المرفوعة</span><button id="refreshFiles" class="btn secondary small" type="button">${icon('refresh')} تحديث</button></div><div id="filesList" class="list files"></div></div></section>
</main>
<footer class="foot">معدودات | جميع الحقوق محفوظة</footer></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="modal" class="modal" hidden><div id="modalBox" class="modal-box" role="dialog" aria-modal="true"></div></div>
<script>
const $=id=>document.getElementById(id);
const FILES_ONLY=${filesOnly?"true":"false"};
const ICONS=${JSON.stringify(ICON_SVGS)};
const MAX_BYTES=${MAX_FILE_BYTES};
const ALLOWED=${JSON.stringify([...ALLOWED_FILES])};
const fmt=new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'});
const busy=new Set();const state={archive:[],filter:'all',q:''};
let deferredPrompt=null,previewURL=null,pendingTimer=null;

function h(tag,props,kids){const e=document.createElement(tag);if(props)Object.keys(props).forEach(k=>{const v=props[k];if(v===false||v==null)return;if(k==='class')e.className=v;else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v);});(kids||[]).forEach(c=>{if(c==null||c===false)return;e.append(c.nodeType?c:document.createTextNode(String(c)));});return e;}
function ico(n){const s=document.createElement('span');s.className='ico-wrap';s.innerHTML=ICONS[n]||'';return s;}
function toast(msg,kind){const t=h('div',{class:'toast '+(kind||'ok'),role:kind==='err'?'alert':'status'},[msg]);$('toasts').append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),320);},kind==='err'?6500:3500);}
function token(){return $('token').value.trim();}
function needToken(){if(token())return true;toast('أدخل رمز الإدارة أولًا.','err');$('token').focus();return false;}
async function post(fields){const fd=new FormData();Object.keys(fields).forEach(k=>fd.append(k,fields[k]));const r=await fetch('/',{method:'POST',body:fd});let d={};try{d=await r.json();}catch(e){}return {r:r,d:d};}
async function copyText(s){try{await navigator.clipboard.writeText(s);return true;}catch(e){try{const ta=h('textarea',{readonly:true,style:'position:fixed;opacity:0;top:0'});ta.value=s;document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}catch(e2){return false;}}}

let modalTimer=null;
function openModal(build){return new Promise(resolve=>{const ov=$('modal'),box=$('modalBox'),prev=document.activeElement;clearTimeout(modalTimer);box.style.visibility='';box.replaceChildren();
function close(v){box.style.visibility='hidden';document.body.classList.remove('lock');document.removeEventListener('keydown',onKey);ov.onclick=null;modalTimer=setTimeout(()=>{ov.hidden=true;},250);if(prev&&prev.focus)prev.focus();resolve(v);}
function onKey(e){if(e.key==='Escape'){e.preventDefault();close(null);return;}if(e.key==='Tab'){const f=box.querySelectorAll('button,[href],input,select,textarea');if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}}
document.addEventListener('keydown',onKey);ov.onclick=e=>{if(e.target===ov)close(null);};build(box,close);ov.hidden=false;document.body.classList.add('lock');const f=box.querySelector('[data-autofocus]')||box.querySelector('button');if(f)f.focus();});}
function confirmDialog(title,text,label,danger){return openModal((box,close)=>{box.append(h('h3',{class:'modal-title'},[title]),h('div',{class:'modal-text'},[text]),h('div',{class:'modal-actions'},[h('button',{type:'button',class:'btn secondary','data-autofocus':true,onclick:()=>close(false)},['إلغاء']),h('button',{type:'button',class:'btn'+(danger?' danger':''),onclick:()=>close(true)},[label])]));}).then(v=>v===true);}

function activeTab(){const a=document.querySelector('.view.active');return a?a.id:'';}
function showTab(name){['compose','archive','files'].forEach(t=>{const on=t===name;$(t).classList.toggle('active',on);const b=document.querySelector('[data-tab='+t+']');if(b){b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');}});closeMenus();if(name==='archive')loadArchive();if(name==='files')loadFiles();window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));

function persistToken(){try{if($('rememberToken').checked)sessionStorage.setItem('np_token',$('token').value);else sessionStorage.removeItem('np_token');}catch(e){}}
$('rememberToken').addEventListener('change',persistToken);$('token').addEventListener('input',persistToken);
$('token').addEventListener('change',()=>{const t=activeTab();if(t==='archive')loadArchive();if(t==='files')loadFiles();});
$('token').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const t=activeTab();if(t==='archive')loadArchive();if(t==='files')loadFiles();}});
$('toggleToken').addEventListener('click',()=>{const show=$('token').type==='password';$('token').type=show?'text':'password';$('toggleToken').innerHTML=ICONS[show?'eyeoff':'eye'];$('toggleToken').setAttribute('aria-label',show?'إخفاء الرمز':'إظهار الرمز');});

function currentMode(){return document.querySelector('[name=schedule_mode]:checked').value;}
function setMode(v){document.querySelector('[name=schedule_mode][value='+v+']').checked=true;mode();}
function selectedISO(){if(!$('date').value||!$('time').value)return null;const d=new Date($('date').value+'T'+$('time').value+':00+03:00');return Number.isNaN(d.getTime())?null:d.toISOString();}
function mode(){const later=currentMode()==='later';$('schedule').classList.toggle('active',later);$('submitLabel').textContent=later?'تأكيد جدولة الإشعار':'إرسال الإشعار';updateTime();}
function updateTime(){const iso=currentMode()==='later'?selectedISO():null;$('pTime').textContent=iso?fmt.format(new Date(iso)):'الآن';}
document.querySelectorAll('[name=schedule_mode]').forEach(x=>x.addEventListener('change',mode));
function openPicker(el){el.focus({preventScroll:true});try{if(typeof el.showPicker==='function'){el.showPicker();return;}}catch(err){}try{el.click();}catch(err){}}
$('pickDate').addEventListener('click',()=>openPicker($('date')));$('pickTime').addEventListener('click',()=>openPicker($('time')));
['date','time'].forEach(id=>{const el=$(id);el.addEventListener('keydown',e=>{if(e.key==='Tab')return;e.preventDefault();});el.addEventListener('paste',e=>e.preventDefault());el.addEventListener('drop',e=>e.preventDefault());el.addEventListener('change',updateTime);el.addEventListener('input',updateTime);});

function updatePreview(){const t=$('title').value,m=$('message').value;$('pt').textContent=t||'عنوان الإشعار';$('pm').textContent=m||'نص الإشعار';$('cTitle').textContent=t.length+'/100';$('cMsg').textContent=m.length+'/500';$('cTitle').classList.toggle('warn',t.length>=90);$('cMsg').classList.toggle('warn',m.length>=450);}
$('title').addEventListener('input',updatePreview);$('message').addEventListener('input',updatePreview);
function updateImage(){const v=$('image_url').value.trim(),pi=$('pi');pi.hidden=true;$('imgErr').hidden=true;if(!v)return;pi.onload=()=>{pi.hidden=false;$('imgErr').hidden=true;};pi.onerror=()=>{pi.hidden=true;$('imgErr').hidden=false;};pi.src=v;}
$('image_url').addEventListener('input',()=>{clearTimeout(pendingTimer);pendingTimer=setTimeout(updateImage,400);});$('image_url').addEventListener('change',updateImage);

function formStatus(msg,ok){$('status').textContent=msg;$('status').className='status '+(ok?'ok':'err');}
$('form').addEventListener('submit',async e=>{e.preventDefault();if($('submit').disabled)return;if(!$('form').reportValidity())return;const later=currentMode()==='later';const fd=new FormData($('form'));fd.set('action','send');fd.set('token',token());if(later){if(!$('date').value||!$('time').value){formStatus('اختر التاريخ والوقت من التقويم والساعة.',false);return;}const iso=selectedISO();if(!iso||Date.parse(iso)<=Date.now()+60000){formStatus('اختر موعدًا بعد دقيقة على الأقل.',false);return;}fd.set('send_after',iso);}$('submit').disabled=true;try{const r=await fetch('/',{method:'POST',body:fd});const d=await r.json();if(!r.ok||!d.success){formStatus(d.message||'تعذر الإرسال.',false);return;}formStatus(d.message+' تم حفظه في الأرشيف.',true);toast(d.message,'ok');}catch(err){formStatus('تعذر الاتصال بالخادم.',false);}finally{$('submit').disabled=false;mode();}});

async function fetchFiles(t){let r,d={};try{r=await fetch('/?action=files',{headers:{'X-Admin-Token':t},cache:'no-store'});d=await r.json();}catch(e){throw new Error('تعذر الاتصال بالخادم.');}if(!r.ok||!d.success)throw new Error(d.message||'تعذر تحميل الملفات');return d.items;}
$('pickFromFiles').addEventListener('click',async()=>{if(!needToken())return;let items;try{items=await fetchFiles(token());}catch(e){toast(e.message,'err');return;}const imgs=items.filter(x=>x.type.indexOf('image/')===0);if(!imgs.length){toast('لا توجد صور مرفوعة في مركز الملفات.','err');return;}const url=await openModal((box,close)=>{box.append(h('h3',{class:'modal-title'},['اختر صورة من ملفاتي']),h('div',{class:'pick-grid'},imgs.map(x=>h('button',{type:'button',title:x.name,onclick:()=>close(x.url)},[h('img',{src:x.url,alt:x.name,loading:'lazy'})]))),h('div',{class:'modal-actions'},[h('button',{type:'button',class:'btn secondary','data-autofocus':true,onclick:()=>close(null)},['إلغاء'])]));});if(url){$('image_url').value=url;updateImage();toast('تم اختيار الصورة.','ok');}});

function itemState(it){return it.status==='scheduled'&&Date.parse(it.sendAfter)>Date.now()?'scheduled':'sent';}
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>{m.classList.remove('open');const b=m.previousElementSibling;if(b)b.setAttribute('aria-expanded','false');});}
function toggleMenu(btn){const menu=btn.nextElementSibling;const was=menu.classList.contains('open');closeMenus();if(!was){menu.classList.add('open');btn.setAttribute('aria-expanded','true');menu.scrollIntoView({block:'nearest',behavior:'smooth'});const f=menu.querySelector('button');if(f)f.focus({preventScroll:true});}}
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))closeMenus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
function emptyBox(iname,text,btn){return h('div',{class:'empty'},[ico(iname),text,btn]);}
function skels(){return [h('div',{class:'skel'}),h('div',{class:'skel'}),h('div',{class:'skel'})];}
function cardEl(key){return Array.prototype.find.call(document.querySelectorAll('.item'),x=>x.dataset.key===key);}
function archiveCard(it){const st=itemState(it);
const menuBtn=h('button',{type:'button',class:'icon-btn','aria-label':'خيارات الإشعار','aria-haspopup':'menu','aria-expanded':'false',onclick:e=>toggleMenu(e.currentTarget)},[ico('dots')]);
const menu=h('div',{class:'menu',role:'menu'},[h('button',{type:'button',role:'menuitem',onclick:()=>{closeMenus();repeatItem(it.key);}},[ico('repeat'),'تكرار الإشعار']),h('button',{type:'button',role:'menuitem',class:'danger',onclick:()=>{closeMenus();deleteItem(it.key);}},[ico('trash'),'حذف الإشعار'])]);
let host='';try{if(it.url)host=new URL(it.url).hostname;}catch(e){}
return h('article',{class:'item '+st,'data-key':it.key},[
h('div',{class:'item-head'},[h('div',{class:'item-title'},[h('div',null,[h('span',{class:'badge-s '+st},[ico(st==='scheduled'?'clock':'check'),st==='scheduled'?'مجدول':'تم الإرسال'])]),it.title||'']),h('div',{class:'menu-wrap'},[menuBtn,menu])]),
h('div',{class:'item-text',title:'اضغط للتوسيع',onclick:e=>e.currentTarget.classList.toggle('open')},[it.message||'']),
h('div',{class:'meta'},[h('span',null,[ico('calendar'),it.createdLabel||'']),it.sendAfterLabel?h('span',null,[ico('clock'),'الموعد: '+it.sendAfterLabel]):null,host?h('span',null,[ico('link'),host]):null,it.imageURL?h('span',null,[ico('image'),'صورة']):null])]);}
function renderArchive(){const list=$('archiveList');list.replaceChildren();const q=state.q.trim().toLowerCase();const rows=state.archive.filter(it=>(state.filter==='all'||itemState(it)===state.filter)&&(!q||((it.title||'')+' '+(it.message||'')).toLowerCase().indexOf(q)>=0));$('archCount').hidden=!state.archive.length;$('archCount').textContent=String(state.archive.length);if(!state.archive.length){list.append(emptyBox('bell','لا توجد إشعارات محفوظة حتى الآن.'));return;}if(!rows.length){list.append(emptyBox('search','لا توجد نتائج مطابقة.'));return;}rows.forEach(it=>list.append(archiveCard(it)));}
function dropFromList(key){state.archive=state.archive.filter(x=>x.key!==key);renderArchive();}
async function loadArchive(){const list=$('archiveList');if(!token()){state.archive=[];$('archCount').hidden=true;list.replaceChildren(emptyBox('lock','أدخل رمز الإدارة في الأعلى ثم اضغط تحديث.'));return;}list.replaceChildren(...skels());try{const r=await fetch('/?action=archive',{headers:{'X-Admin-Token':token()},cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر تحميل الأرشيف');state.archive=d.items;renderArchive();}catch(err){state.archive=[];$('archCount').hidden=true;list.replaceChildren(emptyBox('x',err.message||'تعذر الاتصال بالخادم.',h('button',{type:'button',class:'btn secondary small',onclick:loadArchive},[ico('refresh'),'إعادة المحاولة'])));}}
$('refresh').addEventListener('click',loadArchive);
$('archSearch').addEventListener('input',()=>{state.q=$('archSearch').value;renderArchive();});
$('archFilter').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;state.filter=b.dataset.f;document.querySelectorAll('#archFilter .chip').forEach(c=>c.classList.toggle('active',c===b));renderArchive();});

async function deleteItem(key){if(busy.has(key))return;const it=state.archive.find(x=>x.key===key);if(!it)return;if(!needToken())return;busy.add(key);const el=cardEl(key);try{const sched=itemState(it)==='scheduled';const ok=await confirmDialog('حذف الإشعار؟','«'+(it.title||'')+'» — '+(sched?'سيتم إلغاء إرسال هذا الإشعار المجدول لدى OneSignal وحذفه من الأرشيف نهائيًا.':'سيتم حذف هذا الإشعار من الأرشيف نهائيًا. الإشعارات التي وصلت للمستخدمين سابقًا لا تُسحب من أجهزتهم.'),sched?'إلغاء الإرسال والحذف':'حذف نهائيًا',true);if(!ok)return;if(el)el.classList.add('busy');const res=await post({action:'delete',token:token(),key:key});if(res.d&&res.d.success){dropFromList(key);toast(res.d.message,'ok');return;}if(res.r.status===404)dropFromList(key);else if(el)el.classList.remove('busy');toast((res.d&&res.d.message)||'تعذر حذف الإشعار.','err');}catch(err){if(el)el.classList.remove('busy');toast('تعذر الاتصال بالخادم، لم يتم حذف الإشعار.','err');}finally{busy.delete(key);}}
async function repeatItem(key){const lock='r:'+key;if(busy.has(lock))return;if(!needToken())return;busy.add(lock);try{const res=await post({action:'get',token:token(),key:key});if(!res.d||!res.d.success){if(res.r.status===404)dropFromList(key);toast((res.d&&res.d.message)||'تعذر تحميل بيانات الإشعار.','err');return;}const it=res.d.item;$('title').value=it.title||'';$('message').value=it.message||'';$('url').value=it.url||'';$('image_url').value=it.imageURL||'';$('date').value='';$('time').value='';updatePreview();updateImage();setMode('now');showTab('compose');formStatus('تم نسخ بيانات الإشعار إلى النموذج. عدّلها إن أردت، ثم اختر الإرسال الفوري أو الجدولة. سيُنشأ إشعار جديد.',true);toast('تم نسخ بيانات الإشعار إلى النموذج.','ok');}catch(err){toast('تعذر الاتصال بالخادم.','err');}finally{busy.delete(lock);}}

function fileStatus(msg,ok){$('fileStatus').textContent=msg;$('fileStatus').className='status '+(ok?'ok':'err');}
function fileKind(t){return t.indexOf('image/')===0?'image':(t.indexOf('video/')===0?'video':'pdf');}
function sizeLabel(b){return b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(2)+' MB';}
function previewFile(){const f=$('filePick').files[0];const box=$('filePreview'),th=$('filePreviewThumb');th.replaceChildren();if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}$('uploadResult').hidden=true;$('fileStatus').className='status';if(!f){box.hidden=true;return;}if(ALLOWED.indexOf(f.type)<0){toast('نوع الملف غير مدعوم. ارفع صورة أو MP4/WebM أو PDF.','err');$('filePick').value='';box.hidden=true;return;}if(f.size>MAX_BYTES){toast('الحد الأقصى لحجم الملف 25 ميجابايت.','err');$('filePick').value='';box.hidden=true;return;}box.hidden=false;$('filePreviewName').textContent=f.name;$('filePreviewMeta').textContent=f.type+' · '+sizeLabel(f.size);const k=fileKind(f.type);if(k==='image'){previewURL=URL.createObjectURL(f);th.append(h('img',{src:previewURL,alt:'',style:'width:100%;height:100%;object-fit:cover'}));}else if(k==='video'){previewURL=URL.createObjectURL(f);th.append(h('video',{src:previewURL,muted:true,preload:'metadata'}));}else th.append(ico('file'));}
$('filePick').addEventListener('change',previewFile);
$('fileClear').addEventListener('click',()=>{$('filePick').value='';previewFile();});
const dz=$('dropzone');dz.addEventListener('click',()=>$('filePick').click());dz.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('filePick').click();}});
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over');}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over');}));
dz.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files;if(f&&f.length){$('filePick').files=f;previewFile();}});
function xhrUpload(fd,onProgress){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','/');x.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};x.onload=()=>{let d={};try{d=JSON.parse(x.responseText);}catch(e){}resolve({status:x.status,d:d});};x.onerror=()=>reject(new Error('net'));x.send(fd);});}
async function uploadFile(){if($('uploadFile').disabled)return;const f=$('filePick').files[0];if(!needToken())return;if(!f){fileStatus('اختر ملفًا أولًا.',false);return;}const fd=new FormData();fd.set('action','file-upload');fd.set('token',token());fd.set('file',f);fd.set('expiry',document.querySelector('[name=expiry]:checked').value);$('uploadFile').disabled=true;$('progressWrap').hidden=false;$('progressBar').style.width='0%';fileStatus('جارٍ رفع الملف إلى X02...',true);try{const res=await xhrUpload(fd,p=>{$('progressBar').style.width=Math.round(p*100)+'%';});if(res.status<200||res.status>=300||!res.d.success)throw new Error(res.d.message||'تعذر رفع الملف');$('progressBar').style.width='100%';fileStatus('تم الرفع بنجاح.',true);$('uploadUrl').value=res.d.url;$('uploadResult').hidden=false;toast('تم رفع الملف وإنشاء الرابط.','ok');$('filePick').value='';$('filePreview').hidden=true;await loadFiles();}catch(err){fileStatus(err.message==='net'?'تعذر الاتصال بالخادم.':err.message,false);}finally{$('uploadFile').disabled=false;setTimeout(()=>{$('progressWrap').hidden=true;},900);}}
$('uploadFile').addEventListener('click',uploadFile);
$('copyUploaded').addEventListener('click',async()=>{const ok=await copyText($('uploadUrl').value);toast(ok?'تم نسخ الرابط.':'تعذر النسخ تلقائيًا، انسخ الرابط يدويًا.',ok?'ok':'err');});
function fileCard(x){const k=fileKind(x.type);const thumb=k==='image'?h('img',{class:'fthumb',src:x.url,alt:'',loading:'lazy',onerror:e=>{e.currentTarget.replaceWith(h('div',{class:'fthumb'},[ico('image')]));}}):h('div',{class:'fthumb'},[ico(k==='video'?'video':'file')]);const soon=x.expiresAt&&Date.parse(x.expiresAt)-Date.now()<86400000;
return h('article',{class:'item','data-key':x.id},[h('div',{class:'fitem'},[thumb,h('div',{class:'fbody'},[h('div',{class:'fname'},[x.name]),h('div',{class:'meta'},[h('span',null,[k==='image'?'صورة':(k==='video'?'فيديو':'PDF')]),h('span',null,[x.sizeLabel]),h('span',{class:'badge-s '+(soon?'soon':'plain')},[ico('clock'),x.expiryLabel])]),h('div',{class:'actions'},[h('button',{type:'button',class:'btn secondary small',onclick:async()=>{const ok=await copyText(x.url);toast(ok?'تم نسخ الرابط.':'تعذر النسخ تلقائيًا.',ok?'ok':'err');}},[ico('copy'),'نسخ الرابط']),h('a',{class:'btn secondary small',href:x.url,target:'_blank',rel:'noopener'},[ico('external'),'فتح']),h('button',{type:'button',class:'btn secondary small',onclick:()=>deleteFile(x)},[ico('trash'),'حذف'])])])])]);}
async function loadFiles(){const list=$('filesList');if(!token()){list.replaceChildren(emptyBox('lock','أدخل رمز الإدارة في الأعلى ثم اضغط تحديث.'));return;}list.replaceChildren(...skels().slice(0,2));try{const items=await fetchFiles(token());if(!items.length){list.replaceChildren(emptyBox('image','لا توجد ملفات مرفوعة بعد.'));return;}list.replaceChildren(...items.map(fileCard));}catch(err){list.replaceChildren(emptyBox('x',err.message,h('button',{type:'button',class:'btn secondary small',onclick:loadFiles},[ico('refresh'),'إعادة المحاولة'])));}}
$('refreshFiles').addEventListener('click',loadFiles);
async function deleteFile(x){const lock='f:'+x.id;if(busy.has(lock))return;if(!needToken())return;busy.add(lock);const el=cardEl(x.id);try{const ok=await confirmDialog('حذف الملف؟','«'+x.name+'» — سيتم حذف الملف وروابطه نهائيًا.','حذف نهائيًا',true);if(!ok)return;if(el)el.classList.add('busy');const res=await post({action:'file-delete',token:token(),id:x.id});if(res.d&&res.d.success){toast('تم حذف الملف.','ok');await loadFiles();return;}if(el)el.classList.remove('busy');toast((res.d&&res.d.message)||'تعذر الحذف.','err');if(res.r.status===404)loadFiles();}catch(err){if(el)el.classList.remove('busy');toast('تعذر الاتصال بالخادم، لم يتم حذف الملف.','err');}finally{busy.delete(lock);}}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('install').classList.add('show');});
$('install').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('install').classList.remove('show');});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=${ASSET_VERSION}').then(r=>r.update()).catch(console.error));
try{const saved=sessionStorage.getItem('np_token');if(saved){$('token').value=saved;$('rememberToken').checked=true;}}catch(e){}
updatePreview();mode();
if(FILES_ONLY){$('files').classList.add('active');loadFiles();}
</script></body></html>`;}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith("/api/sheets/"))return handleSheets(request,env);
  if(request.method==='GET'){
   if(url.pathname.startsWith('/f/'))return serveFile(url.pathname.slice(3),env);
   if(url.pathname==='/'&&url.searchParams.get('action')==='files'){const token=request.headers.get('X-Admin-Token')||'';if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return json({success:false,message:'رمز الإدارة غير صحيح.'},401);if(!env.NOTIFICATION_ARCHIVE||!env.X02_API_KEY)return json({success:false,message:'أضف X02_API_KEY واربط KV باسم NOTIFICATION_ARCHIVE.'},500);return json({success:true,items:await listFiles(env,url.origin)});}
   if(url.pathname==='/manifest.webmanifest')return manifestResponse(ASSET_VERSION);
   if(url.pathname==='/sw.js')return swResponse(ASSET_VERSION);
   if(url.pathname==='/icon-192.png'||url.pathname==='/icon-512.png')return iconResponse(LOGO_URL);
   if(url.pathname==='/'&&url.searchParams.get('action')==='archive'){
    const token=request.headers.get('X-Admin-Token')||'';
    if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return json({success:false,message:'رمز الإدارة غير صحيح.'},401);
    if(!env.NOTIFICATION_ARCHIVE)return json({success:false,message:'لم يتم ربط KV باسم NOTIFICATION_ARCHIVE.'},500);
    const index=await readIndex(env);const items=[];
    for(const row of index){const item=await env.NOTIFICATION_ARCHIVE.get('item:'+row.key,'json');if(item)items.push({...item,createdLabel:dateLabel(item.createdAt),sendAfterLabel:dateLabel(item.sendAfter)});}
    return json({success:true,items});
   }
   if(url.pathname==='/sheets'||url.pathname==='/sheets/')return htmlResponse(renderSheetsPage());
   if(url.pathname==='/files'||url.pathname==='/files/')return htmlResponse(renderPage('files'));
   if(url.pathname==='/')return htmlResponse(renderPage());
   return new Response('Not Found',{status:404});
  }
  if(request.method!=='POST')return json({success:false,message:'طريقة الطلب غير مدعومة.'},405);
  try{
   const form=await request.formData();
   const token=String(form.get('token')||'');
   if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return json({success:false,message:'رمز الإدارة غير صحيح.'},401);
   if(!env.NOTIFICATION_ARCHIVE)return json({success:false,message:'يجب إنشاء KV وربطه باسم NOTIFICATION_ARCHIVE قبل الإرسال.'},500);
   const action=String(form.get('action')||'send');
   if(action==='file-upload'){
    if(!env.X02_API_KEY)return json({success:false,message:'مفتاح X02 غير مضبوط في متغيرات Worker السرية.'},500);
    const file=form.get('file'),expiry=String(form.get('expiry')||'7d');
    if(!(file instanceof File)||!file.size)return json({success:false,message:'اختر ملفًا صالحًا.'},400);
    if(!Object.hasOwn(FILE_TTLS,expiry))return json({success:false,message:'مدة الصلاحية غير صالحة.'},400);
    if(!fileTypeAllowed(file.type))return json({success:false,message:'نوع الملف غير مدعوم. ارفع صورة أو MP4/WebM أو PDF.'},415);
    if(file.size>MAX_FILE_BYTES)return json({success:false,message:'الحد الأقصى لحجم الملف في لوحة معدودات 25 ميجابايت.'},413);
    const createdAt=new Date().toISOString(),expiresAt=FILE_TTLS[expiry]?new Date(Date.now()+FILE_TTLS[expiry]).toISOString():null;
    const uploadForm=new FormData();uploadForm.set('file',file,file.name);
    const upstream=await fetch('https://up.x02.me/api/upload?format=json',{method:'POST',headers:{'x-api-key':env.X02_API_KEY},body:uploadForm});
    let uploaded={};try{uploaded=await upstream.json();}catch{}
    if(!upstream.ok||!uploaded.success||!uploaded.data?.url||!uploaded.data?.filename){console.error('X02 upload failed',upstream.status,uploaded?.error||'invalid response');return json({success:false,message:upstream.status===413?'الملف أكبر من الحد المسموح في X02.':upstream.status===403?'رفض X02 الرفع؛ تحقق من المفتاح أو المساحة المجانية.':upstream.status===429?'وصلت إلى حد الرفع اليومي في X02.':'تعذر رفع الملف إلى X02. رمز الخطأ: '+upstream.status},502);}
    // تنظيف اسم الملف: استبدال الشرطة المائلة والخلفية وأحرف السطر الجديد والفارغ فقط (كان التعبير السابق يستبدل الحرفين n و 0 أيضًا)
    const id=crypto.randomUUID(),name=file.name.replace(/[\\\/\r\n\0]/g,'_').slice(0,180)||'file';
    const meta={id,filename:uploaded.data.filename,url:uploaded.data.url,name,type:file.type,size:file.size,createdAt,expiresAt};
    await env.NOTIFICATION_ARCHIVE.put('file:'+id,JSON.stringify(meta));
    const ids=await fileIndex(env);ids.unshift(id);await env.NOTIFICATION_ARCHIVE.put(FILE_INDEX,JSON.stringify(ids));
    return json({success:true,id,url:url.origin+'/f/'+id,expiresAt,message:'تم رفع الملف إلى X02 وإنشاء رابط معدودات.'});
   }
   if(action==='file-delete'){
    const id=String(form.get('id')||'');if(!/^[a-f0-9-]{36}$/i.test(id))return json({success:false,message:'معرّف الملف غير صالح.'},400);
    const deleted=await deleteStoredFile(id,env);return json({success:deleted,message:deleted?'تم حذف الملف من X02.':'تعذر حذف الملف؛ تحقق من مفتاح X02 أو أن الملف ما زال موجودًا.'},deleted?200:502);
   }
   if(action==='get'||action==='delete'){
    const key=String(form.get('key')||'');
    if(!KEY_RE.test(key))return json({success:false,message:'معرّف الإشعار غير صالح.'},400);
    return action==='get'?await getNotification(env,key):await deleteNotification(env,key);
   }
   if(action!=='send')return json({success:false,message:'الإجراء غير معروف.'},400);
   const title=String(form.get('title')||'').trim();
   const message=String(form.get('message')||'').trim();
   const urlValue=String(form.get('url')||'').trim();
   const imageURL=String(form.get('image_url')||'').trim();
   const mode=String(form.get('schedule_mode')||'now');
   const sendAfter=String(form.get('send_after')||'').trim();
   if(!title||!message)return json({success:false,message:'يرجى إدخال العنوان والنص.'},400);
   if(title.length>100||message.length>500)return json({success:false,message:'تجاوز العنوان أو النص الحد المسموح.'},400);
   if(urlValue&&(urlValue.length>2048||!validURL(urlValue)))return json({success:false,message:'رابط الوجهة غير صالح.'},400);
   if(imageURL&&(imageURL.length>2048||!validURL(imageURL)))return json({success:false,message:'رابط الصورة غير صالح.'},400);
   if(!['now','later'].includes(mode))return json({success:false,message:'نوع الإرسال غير صحيح.'},400);
   if(mode==='later'&&(!Number.isFinite(Date.parse(sendAfter))||Date.parse(sendAfter)<=Date.now()+60000))return json({success:false,message:'موعد الجدولة يجب أن يكون بعد دقيقة على الأقل.'},400);
   if(!env.ONESIGNAL_REST_API_KEY)return json({success:false,message:'مفتاح OneSignal غير مضبوط.'},500);
   const payload={app_id:APP_ID,included_segments:['Total Subscriptions'],headings:{ar:title,en:title},contents:{ar:message,en:message},chrome_web_badge:BADGE_URL};
   if(urlValue)payload.url=urlValue;if(imageURL)payload.chrome_web_image=imageURL;if(mode==='later')payload.send_after=new Date(sendAfter).toISOString();
   const response=await fetch(ONESIGNAL_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Key ${env.ONESIGNAL_REST_API_KEY}`},body:JSON.stringify(payload)});
   let data={};try{data=await response.json();}catch{}
   if(!response.ok){console.error('OneSignal error',response.status);return json({success:false,message:`تعذر تنفيذ الطلب لدى OneSignal. رمز الخطأ: ${response.status}.`},502);}
   if(!data.id)return json({success:false,message:'لم يؤكد OneSignal إنشاء الإشعار.'},502);
   const entry={key:crypto.randomUUID(),notificationId:data.id,title,message,url:urlValue,imageURL,status:mode==='later'?'scheduled':'sent',statusLabel:mode==='later'?'مجدول':'تم الإرسال',createdAt:new Date().toISOString(),sendAfter:mode==='later'?new Date(sendAfter).toISOString():null};
   await saveArchive(env,entry);
   return json({success:true,notification_id:data.id,message:mode==='later'?'تمت جدولة الإشعار وحفظه في الأرشيف.':'تم إرسال الإشعار وحفظه في الأرشيف.'});
  }catch(error){console.error('Worker error',error);return json({success:false,message:'حدث خطأ أثناء معالجة الطلب.'},500);}
 },
 async scheduled(event,env,ctx){await cleanupExpired(env);}
};