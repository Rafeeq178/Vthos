/* Vethos service worker: offline app shell + cross-origin isolation headers (COOP/COEP).
   Isolation turns on SharedArrayBuffer, which lets llama.cpp (wllama) use several CPU threads = much faster replies.
   Turn it off any time from Settings -> Speed -> Multi-thread. Model files are stored separately by downloader.js */
const C='vethos-shell-v13',F=['./','index.html','style.css','downloader.js','app.js','manifest.json','icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{
 const c=await caches.open(C);
 /* ek file na mile to poora install fail na ho: har file alag alag cache hoti hai */
 await Promise.all(F.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})));
 await self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('vethos-shell')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
const withCOI=res=>{if(!res||res.status===0||res.type==='opaque'||res.type==='opaqueredirect')return res;
 const h=new Headers(res.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','credentialless');h.set('Cross-Origin-Resource-Policy','cross-origin');
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})};
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 /* cache-first (instant start, works offline) + background update for next launch */
 e.respondWith((async()=>{
  const nav=r.mode==='navigate',off=nav?!!(await caches.match('nocoi',{cacheName:'vethos-flags'})):false;
  const out=x=>(nav&&!off)?withCOI(x):x;
  const h=await caches.match(r,{ignoreSearch:nav});
  const net=fetch(r).then(res=>{if(res.ok){const k=res.clone();caches.open(C).then(c=>c.put(r,k))}return res});
  if(h){net.catch(()=>{});return out(h)}
  try{return out(await net)}catch(_){return new Response('Offline',{status:503})}})())});
