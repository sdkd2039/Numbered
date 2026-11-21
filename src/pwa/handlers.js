// معالجات ملفات PWA: manifest وService Worker وأيقونة التطبيق.

export function manifestResponse(assetVersion){
  return new Response(JSON.stringify({
    id:"/",
    name:"لوحة معدودات",
    short_name:"معدودات",
    description:"إدارة إشعارات معدودات",
    lang:"ar",
    dir:"rtl",
    start_url:"/",
    scope:"/",
    display:"standalone",
    background_color:"#090b14",
    theme_color:"#0b0d18",
    icons:[
      {src:`/icon-192.png?v=${assetVersion}`,sizes:"192x192",type:"image/png",purpose:"any"},
      {src:`/icon-512.png?v=${assetVersion}`,sizes:"512x512",type:"image/png",purpose:"any"}
    ]
  }),{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"no-store"}});
}

export function swResponse(assetVersion){
  const js=`const CACHE='numbered-pwa-v${assetVersion}';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  if(!['/','/files','/manifest.webmanifest'].includes(u.pathname))return;
  e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));}
    return res;
  }).catch(async()=>(await caches.match(r))||new Response('أنت غير متصل بالإنترنت',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
}

export async function iconResponse(logoUrl){
  const r=await fetch(logoUrl,{cf:{cacheTtl:0,cacheEverything:false}});
  if(!r.ok)return new Response("Logo unavailable",{status:502});
  return new Response(r.body,{headers:{"Content-Type":r.headers.get("Content-Type")||"image/png","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
