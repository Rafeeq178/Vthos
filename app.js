'use strict';
/* Vethos — offline AI. One model (user picks from Hugging Face) + many personalities (system prompts). */
const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS={get(k,d){try{const v=localStorage.getItem('vethos_'+k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem('vethos_'+k,JSON.stringify(v))}catch(e){}}};

/* ---------- Personalities ---------- */
const BASE="You are {n}, a smart and accurate offline assistant inside the Vethos app. Rules: 1) Answer the question directly in your first sentence; never reply with only a question. 2) If the request is open or vague, make a sensible assumption, give a useful answer, then ask at most one short follow-up. 3) Reply in the user's language: English, Urdu script, or Roman Urdu (if the user writes Roman Urdu, you write Roman Urdu). 4) Be concise; use a short numbered list for steps. 5) If you are unsure, say so briefly; never invent facts, numbers, names or links. 6) For a simple greeting, greet back in one short sentence.";
const PERS=[
{id:'gen',n:'General Assistant',ic:'chat',d:'Everyday questions, ideas and planning',
 sys:"Be a practical everyday helper. For plans, ideas and decisions give a concrete answer straight away (a short schedule, steps or 3 options), then offer to adjust it.",
 ex:["Plan my Saturday", "Here is an easy plan:\n1. Morning: breakfast, a short walk, one chore.\n2. Midday: lunch, then a hobby or rest.\n3. Afternoon: errands or meet a friend.\n4. Evening: cook, relax, prepare for Sunday.\nTell me what you like to do and I will adjust it."],
 sug:['Help me plan my day','Explain inflation in simple words','Give me 5 ideas for a small online business']},
{id:'coder',n:'Coder',ic:'code',d:'Debugging, code and architecture',
 sys:"You are a senior developer. Give the fix or solution first in a fenced code block with a language tag, then explain in 2-3 short lines. For bugs name the root cause. If the code or error message is missing, ask for it in one line.",
 ex:["How do I reverse a string in JavaScript?", "Split it into characters, reverse, and join:\n```js\nconst reversed = str.split('').reverse().join('');\n```\n`split('')` makes an array, `reverse()` flips it, `join('')` builds the string again."],
 t:0.3,
 sug:['Write a JavaScript debounce function','Why does my fetch return undefined?','Explain async/await with an example']},
{id:'doctor',n:'Doctor',ic:'heart',d:'General health information',
 sys:"You give careful general health information, not a diagnosis. Answer with likely causes, what to do at home, and warning signs for seeing a doctor. If key details are missing, give general guidance first, then ask one question (age, duration, severity). Emergencies (chest pain, trouble breathing, severe bleeding, stroke signs, poisoning, suicidal thoughts): tell them to call emergency services now.",
 ex:["I have a sore throat", "Common causes: a cold or flu virus, dry air, allergies or shouting.\nAt home: warm fluids, honey in warm water, salt-water gargle, rest, plenty of water.\nSee a doctor if it lasts over a week, or you have high fever, trouble swallowing or breathing, or white patches in the throat.\nHow many days has it been?"],
 t:0.3,
 sug:['I have a headache since 2 days','How to improve my sleep?','What foods help lower blood pressure?']},
{id:'teacher',n:'Teacher',ic:'book',d:'Study help, notes and exam prep',
 sys:"You are a patient teacher. Explain in simple words with one everyday example, then 2-3 key points. End with one quick practice question.",
 ex:["Explain what a noun is", "A noun is a word that names a person, place, thing or idea. Example: in \"Ali eats an apple in Lahore\", Ali, apple and Lahore are nouns.\nKey points: nouns can be singular or plural; proper nouns start with a capital letter.\nQuick question: which word is the noun in \"The dog runs\"?"],
 sug:['Explain the water cycle in 5 steps','Make flashcards on photosynthesis','Quiz me on basic algebra']},
{id:'math',n:'Math Mentor',ic:'hash',d:'Step-by-step problem solving',
 sys:"You are a careful math tutor. Solve step by step, one step per line, name the rule used, check the result, and end with a line \"Answer: ...\". Use plain text (x^2, sqrt(x), a/b), not LaTeX.",
 ex:["Solve 2x + 5 = 17", "Step 1: Subtract 5 from both sides: 2x = 12.\nStep 2: Divide both sides by 2: x = 6.\nCheck: 2(6) + 5 = 17. Correct.\nAnswer: x = 6"],
 t:0.2,
 sug:['Solve 3x + 7 = 25','What is 15% of 2400?','Explain Pythagoras theorem']},
{id:'fin',n:'Finance Pro',ic:'dollar',d:'Money, budgets and business basics',
 sys:"You explain money, budgeting and small-business basics with simple numbers and a shown calculation. Use PKR unless told otherwise. Never promise returns and never guess live prices or rates. For tax or legal details, advise a qualified professional.",
 ex:["How much should I save from a 40,000 PKR salary?", "A good start is 20%: 40,000 x 0.20 = 8,000 PKR per month.\nIf that is hard, begin with 10% (4,000) and raise it every few months.\nBuild 3 months of expenses as an emergency fund first. Tell me your rent and bills and I will make a budget."],
 t:0.3,
 sug:['Make a monthly budget for 60,000 PKR','How does compound interest work?','How should I price my freelance work?']},
{id:'res',n:'Research Pal',ic:'flask',d:'Science and deep dives',
 sys:"You are a careful research assistant. Give a 2-line summary first, then key concepts, then limits or uncertainty. Separate facts from opinions. Never invent studies, numbers or sources; say when you are not sure.",
 ex:["Why is the sky blue?", "Summary: air scatters the sun's short blue light more than red, so the sky looks blue.\nKey idea: this is Rayleigh scattering; at sunset light travels farther, blue is scattered away and red remains.\nLimit: the exact shade depends on dust and humidity."],
 t:0.3,
 sug:['Explain how vaccines train immunity','Compare solar and wind energy','How do neural networks learn?']},
{id:'writer',n:'Writer',ic:'edit',d:'Writing, rewriting and translation',
 sys:"You are a professional writer in English, Urdu and Roman Urdu. Write or rewrite the text itself first, matching the requested tone and keeping the user's facts. Add one short line about what you changed only if useful.",
 ex:["Write a short thank-you message to a teacher", "Dear Sir/Madam,\nThank you for your guidance and patience. Your lessons helped me understand more and gave me confidence. I truly appreciate your effort.\nSincerely,\n[Your name]"],
 sug:['Write a polite follow-up email','Paraphrase this paragraph','Write a product description for a smartwatch']}];

/* ---------- State ---------- */
const CFG0={temp:.7,max:256,ctx:6,rep:1.1,nctx:1536,voice:'en-US',theme:'light',thr:'0',gpu:false,pre:true};
const S={view:'home',stack:[],q:'',keep:LS.get('keep',true),hist:LS.get('hist',[]),rated:LS.get('rated',false),
 models:LS.get('models',[]),active:LS.get('active',null),pers:LS.get('pers','gen'),ov:LS.get('ov',{}),cust:LS.get('cust',[]),
 cfg:Object.assign({},CFG0,LS.get('cfg',{})),conv:null,gen:null,pro:null,prog:{},ask:null,
 hf:{q:'',scope:'unsloth',list:[],loading:false,err:'',tok:0},sel:null};
LS.get('pend',[]).forEach(p=>{if(p&&p.id&&p.files)S.prog[p.id+'|'+p.dtype]={p:p.p,l:p.l,t:p.t,size:p.size,st:p.st||'Paused',id:p.id,dtype:p.dtype,files:p.files,x:0,paused:2}});
const save=()=>{LS.set('pend',Object.values(S.prog).map(P=>({id:P.id,dtype:P.dtype,files:P.files,p:P.p||0,l:P.l||0,t:P.t||0,size:P.size||0,st:P.paused===2&&/^Stopped/.test(P.st||'')?P.st:'Paused'})));LS.set('keep',S.keep);LS.set('hist',S.hist);LS.set('rated',S.rated);LS.set('models',S.models);LS.set('active',S.active);LS.set('pers',S.pers);LS.set('ov',S.ov);LS.set('cust',S.cust);LS.set('cfg',S.cfg)};
if(!LS.get('v2',0)){S.cfg.theme='light';S.cfg.max=Math.min(S.cfg.max,256);S.cfg.nctx=Math.min(S.cfg.nctx,1536);S.cfg.ctx=Math.min(S.cfg.ctx,6);S.cfg.thr=String(S.cfg.thr||'0');LS.set('v2',1);save()}
if(!LS.get('v3',0)){S.cfg.temp=Math.min(S.cfg.temp,.5);LS.set('v3',1);save()}
const mk=m=>m.id+'|'+m.dtype,nm=id=>id.split('/').pop();
const actM=()=>S.models.find(m=>mk(m)===S.active)||S.models[0]||null;
/* old ONNX models cannot run on llama.cpp: keep only GGUF entries */
S.models=S.models.filter(m=>m&&m.files);if(!S.models.some(m=>mk(m)===S.active))S.active=S.models[0]?mk(S.models[0]):null;
const allP=()=>[...PERS.map(p=>({...p,sys:S.ov[p.id]||p.sys})),...S.cust.map(c=>({...c,ic:'chat',sug:[],cust:1}))];
const getP=id=>allP().find(p=>p.id===id)||allP()[0];
const sysOf=(p,c)=>BASE.replace('{n}',p.n)+'\n\n'+p.sys+FB.text(p.id,c)+(c&&c.file?`\n\nThe user attached a file named "${c.file.name}". Use it to answer. File content:\n${c.file.text}`:'');
const fmtB=b=>b>=1e9?(b/1e9).toFixed(2)+' GB':Math.max(1,Math.round(b/1e6))+' MB';
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n||0);
const pm=id=>{const m=id.match(/(\d+(?:\.\d+)?)[bB](?![a-zA-Z])/);return m?m[1]+'B':''};
const ago=t=>{const m=Math.floor((Date.now()-t)/6e4);return m<1?'Just now':m<60?m+' min. ago':m<1440?Math.floor(m/60)+' h ago':Math.floor(m/1440)+' d ago'};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2000)};
const copy=async t=>{try{await navigator.clipboard.writeText(t)}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(_){}a.remove()}toast('Copied')};
const share=async t=>{if(navigator.share){try{await navigator.share({text:t});return}catch(e){if(e.name==='AbortError')return}}copy(t)};
function saveFile(name,text){try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Saving '+name)}catch(e){share(text)}}
const chatTxt=c=>`${c.title}\n${getP(c.pers).n} · ${new Date(c.t).toLocaleString()}\n\n`+c.msgs.map(m=>(m.r==='u'?'You':'AI')+':\n'+m.t).join('\n\n');
const applyTheme=()=>{const t=S.cfg.theme;document.documentElement.dataset.theme=t==='auto'?'':t;const d=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);const m=document.querySelector('meta[name=theme-color]');if(m)m.content=d?'#171311':'#FAF9F5'};
const clean=s=>s.replace(/<think>[\s\S]*?(<\/think>|$)/g,'').replace(/^\s+/,'');
function md(s){const bl=[];
 s=s.replace(/```([\w+-]*)[^\S\n]*\n?([\s\S]*?)(?:```|$)/g,(m,l,c)=>{bl.push([l,c]);return '\u0000'+(bl.length-1)+'\u0000'});
 s=esc(s).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/^#{1,4} (.+)$/gm,'<b class="h">$1</b>');
 return s.replace(/\n?\u0000(\d+)\u0000\n?/g,(m,i)=>{const[l,c]=bl[i];return `<div class="cb"><div class="cbh"><span>${esc(l||'code')}</span><button data-a="cpcode">Copy</button></div><pre dir="ltr"><code>${esc(c.replace(/\n$/,''))}</code></pre></div>`})}

/* ---------- UI helpers ---------- */
const ic=(n,c='')=>`<svg class="icon ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const chev=ic('chev','chev');
const PR={gen:'Ask anything and get a clear answer',coder:'Debug your code with the Developer Chatbot',doctor:'Get symptoms explained by your AI Doctor',teacher:'Prepare for exams with your AI Tutor',math:'Solve any problem step by step',fin:'Plan your budget and money goals',res:'Explore science with your research pal',writer:'Write and polish anything faster'};
const SUG=[['bartowski/SmolLM2-135M-Instruct-GGUF','SmolLM2 135M','Fastest · tiny · ~100 MB','p'],['bartowski/SmolLM2-360M-Instruct-GGUF','SmolLM2 360M','Fast · small · ~250 MB','v'],['unsloth/Qwen2.5-0.5B-Instruct-GGUF','Qwen2.5 0.5B','Balanced · multilingual · ~400 MB','t'],['unsloth/Llama-3.2-1B-Instruct-GGUF','Llama 3.2 1B','Smarter · slower · ~800 MB','b']];
const NAV=[['home','home','Home'],['models','lib','Library'],['ins','ins','Insights'],['set','set','Settings']];
const TABS=NAV.map(n=>n[0]);
const pnav=a=>`<nav class="pnav" aria-label="Main">${NAV.map(([v,i,t])=>`<button class="pn ${a===v?'on':''}" data-a="tab" data-v="${v}" aria-label="${t}">${ic(i)}<span>${t}</span></button>`).join('')}</nav>`;
const hdr=(t,back,right,sub)=>`<header class="topbar"><button class="hbtn" data-a="${back?'back':'drawer'}" aria-label="${back?'Back':'Menu'}">${ic(back?'back':'menu')}</button><h1 class="topbar-title">${t}${sub?`<small>${sub}</small>`:''}</h1>${right===undefined?'<span class="hsp"></span>':right}</header>`;
const R=(a,icon,label,extra='',cls='')=>`<button class="row row-btn ${cls}" data-a="${a}">${ic(icon,'lead')}<span class="row-label">${label}</span>${extra||chev}</button>`;
const sheet=(title,body)=>`<div class="sheet"><div class="sheet-h"><b id="sht">${esc(title)}</b><button class="icon-btn" data-a="close" aria-label="Close">${ic('close')}</button></div><div class="sheet-b">${body}</div></div>`;
const rng=(k,l,mn,mx,st)=>`<div class="row set-r"><div class="row-label">${l}<output id="o_${k}">${S.cfg[k]}</output></div><input type="range" class="rg" data-cfg="${k}" min="${mn}" max="${mx}" step="${st}" value="${S.cfg[k]}" aria-label="${l}"></div>`;
const sel=(k,l,opts)=>`<div class="row"><span class="row-label">${l}</span><select class="sel" data-cfg="${k}" aria-label="${l}">${opts.map(([v,t])=>`<option value="${v}" ${S.cfg[k]===v?'selected':''}>${t}</option>`).join('')}</select></div>`;
const pRow=p=>`<button class="row row-btn tall" data-a="pchat" data-p="${p.id}"><span class="ci">${ic(p.ic)}</span><span class="row-text"><b>${esc(p.n)}</b><small>${esc(p.d)}</small></span>${chev}</button>`;

const V={
home(){const m=actM(),ps=allP(),P0=Object.values(S.prog)[0];
 const dcard=P0?`<button class="dcard" data-a="tab" data-v="models"><span class="dic">${ic('dl')}</span><span class="row-text"><b>${P0.paused===2?'Download paused':'Your agent is suiting up…'}</b><small>${esc(nm(P0.id))} · ${P0.p}%</small><span class="pbar"><i style="width:${P0.p}%"></i></span></span></button>`
  :m?`<button class="dcard" data-a="startm"><span class="dic">${ic('chip')}</span><span class="row-text"><b>${esc(nm(m.id))}</b><small>Active model · ${esc(m.dtype)} · ${fmtB(m.size)}</small></span><span class="arr">${ic('arrow')}</span></button>`
  :`<div class="group promo" style="margin-top:14px"><h3 class="promo-title">Pick your AI model</h3><p class="promo-text">Download any GGUF model from Hugging Face once. After that it runs fully offline on your phone.</p><button class="btn-dark" data-a="hf">${ic('dl')}<span>Download model</span></button></div>`;
 const promos=ps.slice(0,8).map((p,i)=>`<button class="promo-c c${i%3+1}" data-a="pchat" data-p="${p.id}"><b>${esc(PR[p.id]||p.d)}</b><span class="go">${ic('arrow')}</span></button>`).join('');
 const ag=ps.slice(0,3).map((p,i)=>`<button class="agent a${i}" data-a="pchat" data-p="${p.id}"><span class="ai">${ic(p.ic)}</span><span class="row-text"><b>${esc(p.n)}</b><small>${esc(p.d)}</small></span><span class="arr">${ic('arrow')}</span></button>`).join('');
 const sg=SUG.map(([id,n,d,c])=>{const inst=S.models.some(x=>x.id===id);return `<div class="scard"><span class="si ${c}">${ic('chip')}</span><b>${n}</b><small>${d}</small><button class="gbtn" data-a="sugdl" data-id="${id}">${inst?ic('check')+'Installed':ic('dl')+'Get'}</button></div>`}).join('');
 return `<div class="scr">${hdr('Vethos')}<div class="body"><div class="hhero"><h2>How can I help?</h2><p>Private AI that stays on your phone</p></div>${dcard}
 <div class="sec"><h3>My Offline Chatbots</h3><button class="link" data-a="go" data-v="pers">View All</button></div>${ag}
 <div class="sec"><h3>Suggested for you</h3><button class="link" data-a="tab" data-v="models">View All</button></div><div class="hscroll">${sg}</div></div>
 <div class="startc"><input id="hin" placeholder="Start new chat…" maxlength="2000" aria-label="Start new chat" enterkeyhint="send"><button class="send" data-a="hsend" aria-label="Send">${ic('send')}</button></div>${pnav('home')}</div>`},
models(){const f=S.lf||'all';
 const sg=SUG.map(([id,n,d,c])=>{const inst=S.models.some(x=>x.id===id);return `<div class="mcard"><div class="mc-main"><span class="ci">${ic('chip')}</span><span class="mc-t"><b>${n}</b><small>${d}</small></span><button class="mbtn ${inst?'':'pri'}" data-a="sugdl" data-id="${id}">${inst?'Installed':'Get'}</button></div></div>`}).join('');
 return `<div class="scr">${hdr('Library')}<div class="body nav"><div class="chips">${[['all','All Models'],['dev','On device'],['sug','Suggested']].map(([k,t])=>`<button class="chip ${f===k?'on':''}" data-a="lf" data-f="${k}">${t}</button>`).join('')}</div>
 <div id="lib">${libCard()}</div><div class="btn-row" style="margin:0 0 6px"><button class="btn-dark" data-a="hf">${ic('dl')}<span>Hugging Face</span></button><button class="btn-light" data-a="lpick">${ic('plus')}<span>From phone</span></button></div>
 ${f!=='sug'?`<div class="sec"><h3>On this device</h3></div><div id="ml">${mlist()}</div>`:''}${f!=='dev'?`<div class="sec"><h3>Suggested for you</h3></div>${sg}`:''}
 <p class="hint">Tap a model to make it active. Load puts it in RAM, Unload frees the RAM. Only GGUF models work (Q4_K_M, Q4_0, Q8_0…). Smaller is faster on phones.<br>Downloader v${window.VDL?VDL.ver:'?'}</p></div>${pnav('models')}</div>`},
pers(){return `<div class="scr">${hdr('My Offline Chatbots',1,'<span></span>')}<div class="body"><button class="btn-dark wide" data-a="pedit" data-p="new">${ic('plus')}<span>New personality</span></button><p class="hint">A personality is a system prompt on top of your active model. Edit one to change how it behaves.</p><div class="group">${allP().map(p=>`<button class="row row-btn tall" data-a="pedit" data-p="${p.id}"><span class="ci">${ic(p.ic)}</span><span class="row-text"><b>${esc(p.n)}</b><small>${esc(p.d)}${S.ov[p.id]?' · edited':''}</small></span>${ic('edit','chev')}</button>`).join('')}</div></div></div>`},
ins(){const m=actM(),iso=!!self.crossOriginIsolated,hc=navigator.hardwareConcurrency||0,dm=navigator.deviceMemory,tps=AI.tps||0,pct=Math.min(100,Math.round(tps/30*100)),th=AI.thr||0;
 return `<div class="scr">${hdr('Insights')}<div class="body nav"><div class="eng"><span class="ci" style="border-radius:50%">${ic('chip')}</span><span class="row-text"><b>Engine</b><small>${AI.W?'Active & optimal':'Idle · loads on your first message'}</small></span>${AI.W?'<span class="live"><i></i>LIVE</span>':''}</div>
 <div class="stat stat-full" style="margin-bottom:12px"><span class="stat-label">Tokens / sec · last reply</span><output class="big" id="tps" style="margin-top:8px">${tps?tps.toFixed(1):'00'}</output><span class="pbar"><i style="width:${pct}%"></i></span></div>
 <div class="stat-grid"><div class="stat"><span class="stat-label">RAM (approx)</span><output class="stat-value">${dm?'≥ '+dm+' GB':'–'}</output></div><div class="stat"><span class="stat-label">CPU cores</span><output class="stat-value">${hc||'–'}</output></div>
 <div class="stat"><span class="stat-label">Threads</span><output class="stat-value">${th?th:'–'}</output></div><div class="stat"><span class="stat-label">Mode</span><output class="stat-value sm">${iso?'Multi-thread':'Single-thread'}</output></div>
 <div class="stat"><span class="stat-label">Load · 1st token</span><output class="stat-value sm">${AI.ttft?(AI.ttft/1000).toFixed(1)+' s · ':''}${AI.ms?(AI.ms/1000).toFixed(1)+' s':'–'}</output></div><div class="stat"><span class="stat-label">Saved in app</span><output class="stat-value" id="sto">…</output></div>
 <div class="stat stat-full"><span class="stat-label">Active model</span><output class="stat-value sm">${m?esc(nm(m.id))+' · '+m.dtype:'None'}</output></div></div>
 ${iso?'':'<p class="hint" style="padding-top:14px">Single-thread mode is slower. Open Settings → Speed and make sure “Multi-thread” is on, then restart the app once.</p>'}</div>${pnav('ins')}</div>`},
set(){const mt=LS.get('coi',true);return `<div class="scr">${hdr('Settings')}<div class="body nav"><div class="group"><div class="row tall"><span class="avatar">V</span><span class="row-text"><b style="font-size:17px">Vethos</b><small>Private · on-device AI</small></span><span class="badge badge-dark">Local</span></div></div>
  <h3 class="gh">Chat Preferences</h3><div class="group">${rng('temp','Creativity',0,1.5,.05)}${rng('max','Max reply length',64,1024,64)}${rng('ctx','Memory (messages)',2,16,1)}${rng('rep','Repetition penalty',1,1.5,.05)}</div>
 <div class="group"><button class="row row-btn" data-a="keep">${ic('chat','lead')}<span class="row-label">Keep chat history</span><span class="sw ${S.keep?'on':''}"></span></button>${R('hist','book','Chat history')}${R('go','chat','My Offline Chatbots').replace('data-a="go"','data-a="go" data-v="pers"')}</div>
 <h3 class="gh">Speed</h3><div class="group"><button class="row row-btn" data-a="coi">${ic('chip','lead')}<span class="row-text"><b>Multi-thread (faster)</b><small>Uses more CPU cores · restarts app</small></span><span class="sw ${mt?'on':''}"></span></button>${sel('thr','CPU threads',[['0','Auto'],['1','1'],['2','2'],['3','3'],['4','4'],['6','6'],['8','8']])}<button class="row row-btn" data-a="tgl" data-k="pre">${ic('chip','lead')}<span class="row-text"><b>Preload model</b><small>Loads at start so the first reply is fast</small></span><span class="sw ${S.cfg.pre?'on':''}"></span></button><button class="row row-btn" data-a="tgl" data-k="gpu">${ic('ins','lead')}<span class="row-text"><b>GPU (experimental)</b><small>Falls back to CPU if unsupported</small></span><span class="sw ${S.cfg.gpu?'on':''}"></span></button>${rng('nctx','Context size (more = more RAM)',512,4096,256)}</div>
 <h3 class="gh">General</h3><div class="group">${sel('theme','Theme',[['light','Light'],['dark','Dark'],['auto','System']])}${sel('voice','Voice language',[['en-US','English'],['ur-PK','Urdu'],['hi-IN','Hindi']])}${R('go','chip','Models').replace('data-a="go"','data-a="tab" data-v="models"')}</div>
 <div class="group">${R('install','plus','Install app')}${R('delall','trash','Delete all history','','danger')}</div><p class="hint">Chats and models are saved on this device only.</p></div>${pnav('set')}</div>`},
hist(){const q=S.q.trim().toLowerCase(),l=S.hist.filter(c=>!q||c.title.toLowerCase().includes(q));
 return `<div class="scr">${hdr('Chat History',1,`<button class="hbtn" data-a="delall" aria-label="Delete all">${ic('trash')}</button>`)}<div class="body"><label class="search">${ic('search')}<input id="hq" placeholder="Search conversations…" value="${esc(S.q)}" aria-label="Search chats"></label><div class="group" id="hl">${hlist(l)}</div></div></div>`},
chat(){const c=S.conv,p=getP(c.pers),m=actM();return `<div class="scr"><header class="topbar chat-top"><button class="hbtn" data-a="back" aria-label="Back">${ic('back')}</button><h1 class="topbar-title" data-a="psw">${esc(p.n)}<small>${m?esc(nm(m.id)):'No model'}</small></h1><button class="plain" data-a="hist" aria-label="History">${ic('hist')}</button><button class="plain" data-a="more" aria-label="More">${ic('more')}</button></header><div class="msgs" id="msgs"></div>
 <div class="composer"><div class="enc">${ic('lock')}<span>End-to-end encrypted local session</span></div><div id="fb"></div><div class="cbar"><label class="rbtn" aria-label="Attach file">${ic('clip')}<input type="file" id="fl" hidden accept=".txt,.md,.html,.css,.js,.ts,.json,.csv,.py,.php,.java,.xml,.log,.sql,text/*"></label><input class="composer-input" id="cin" placeholder="Ask me anything…" maxlength="4000" aria-label="Message" enterkeyhint="send"><button class="rbtn" data-a="mic" aria-label="Voice input">${ic('mic')}</button><button class="send" id="sbtn" data-a="send" aria-label="Send">${ic('send')}</button></div></div></div>`}};
const hlist=l=>l.length?[...l].sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||b.t-a.t).map(c=>`<div class="row tall"><button class="row-main" data-a="open" data-id="${c.id}"><span class="row-text"><b>${c.pin?'📌 ':''}${esc(c.title)}</b><small>${esc(getP(c.pers).n)} · ${ago(c.t)}</small></span></button><button class="icon-btn sm" data-a="hmenu" data-id="${c.id}" aria-label="Options">${ic('more')}</button></div>`).join(''):'<p class="empty">No chats yet. Start one from Home.</p>';
const mlist=()=>{const pr=Object.entries(S.prog).map(([k,P])=>`<div class="mcard"><div class="mc-main"><span class="ci">${ic('dl')}</span><span class="mc-t"><b>${esc(nm(P.id))}</b><small>${esc(P.dtype)} · ${esc(P.st||'Downloading')}${P.t?' · '+fmtB(P.l||0)+' / '+fmtB(P.t):''}</small></span><b style="color:var(--blue)">${P.p}%</b></div><span class="pbar"><i style="width:${P.p}%"></i></span><div class="mc-acts">${P.paused===2?`<button class="mbtn pri" data-a="resume" data-k="${esc(k)}">${ic('play')}Resume</button>`:P.paused?'':`<button class="mbtn" data-a="pause" data-k="${esc(k)}">${ic('pause')}Pause</button>`}<button class="mbtn" data-a="cancel" data-k="${esc(k)}">Cancel</button></div></div>`);
 const ins=S.models.map(m=>{const k=mk(m),on=m===actM(),ld=!!(AI.W&&AI.key===k),lg=AI.loadingKey===k;return `<div class="mcard ${on?'on':''}"><button class="mc-main" data-a="actm" data-k="${esc(k)}"><span class="ci">${ic(on?'check':'chip')}</span><span class="mc-t"><b>${esc(nm(m.id))}${on?'<span class="badge">Active</span>':''}${ld?'<span class="badge ok">Loaded</span>':''}</b><small>${esc(m.id.split('/')[0])} · ${esc(m.dtype)} · ${fmtB(m.size)}</small></span></button><div class="mc-acts"><button class="mbtn pri" data-a="mchat" data-k="${esc(k)}">Start Chat</button><button class="mbtn" data-a="${ld?'munload':'mload'}" data-k="${esc(k)}"${lg?' disabled':''}>${ld?'Unload':lg?'Loading…':'Load'}</button><span class="spacer"></span><button class="circ" data-a="delm" data-k="${esc(k)}" aria-label="Delete model">${ic('trash')}</button></div></div>`});
 const all=[...pr,...ins];return all.length?all.join(''):'<p class="empty">No model yet. Download one from Hugging Face or add one from your phone storage.</p>'};
function show(v,push=true){if(push&&S.view!==v)S.stack.push(S.view);S.view=v;const a=$('#app'),keep=$('.splash',a);a.innerHTML=V[v]();if(keep)a.appendChild(keep);if(v==='chat'){renderMsgs();fbar()}if(v==='home')typer();if(v==='ins')usage()}
const go=v=>{if(S.stack.length>20)S.stack.shift();S.q='';show(v)};
function overlay(h,cls=''){closeOv();const d=document.createElement('div');d.className='ov '+cls;d.id='ov';d.innerHTML=h;d.addEventListener('click',e=>{if(e.target===d)closeOv()});$('#app').appendChild(d)}
const closeOv=()=>{const o=$('#ov');if(o)o.remove();const r=$('#dr');if(r)r.remove()};
function ask(t,p,fn,ok='Delete'){S.ask=fn;overlay(`<div class="dlg"><h4>${esc(t)}</h4><p>${esc(p)}</p><div class="bt"><button data-a="close">Cancel</button><button class="p" data-a="askok">${ok}</button></div></div>`)}
const PH=['How to','Explain climate change','Help me save money','Start new chat...'];
let tt;function typer(){clearTimeout(tt);let i=0,j=0,del=false;const step=()=>{const e=$('#hin');if(!e)return;const w=PH[i];j+=del?-1:1;e.placeholder=w.slice(0,j)||' ';let d=del?30:70;if(!del&&j===w.length){del=true;d=1400}else if(del&&j===0){del=false;i=(i+1)%PH.length;d=300}tt=setTimeout(step,d)};step()}
function usage(){if(!(navigator.storage&&navigator.storage.estimate))return;navigator.storage.estimate().then(e=>{const el=$('#sto');if(el)el.textContent=fmtB(e.usage||0)}).catch(()=>{})}

/* ---------- Chat ---------- */
function startChat(pid,pre){const m=actM();if(!m){toast('Download a model first');A.hf();return false}S.pers=pid;save();S.conv={id:'c'+Date.now(),model:m.id,pers:pid,title:'New chat',t:Date.now(),msgs:[],file:null};go('chat');if(pre)setTimeout(()=>{const e=$('#cin');if(e){e.value=pre;e.focus()}},30);return true}
function renderMsgs(){const m=$('#msgs'),c=S.conv;if(!m||!c)return;const p=getP(c.pers);
 if(!c.msgs.length){m.innerHTML=`<div class="hero"><span class="hero-orb">${ic(p.ic)}</span><h2 class="hero-greeting">${esc(p.n)}</h2><p class="hero-sub">${esc(p.d)}</p></div>${p.sug.length?`<div class="sugg">${p.sug.map(t=>`<button class="sg" data-a="sg">${esc(t)}</button>`).join('')}</div>`:''}`;return}
 const last=c.msgs.length-1;
 m.innerHTML=c.msgs.map((x,i)=>x.r==='u'?`<div class="msg-u" dir="auto">${esc(x.t)}</div>`:`<div class="msg-b"><div class="bub"><div class="bot-text" dir="auto">${md(x.t)}</div></div><div class="bot-actions"><button class="act ${x.fb===1?'on':''}" data-a="like" data-v="1" data-i="${i}" title="Best answer" aria-label="Best answer">${ic('up')}</button><button class="act ${x.fb===-1?'on':''}" data-a="like" data-v="-1" data-i="${i}" title="Bad answer" aria-label="Bad answer">${ic('down')}</button><button class="act" data-a="cp" data-i="${i}" aria-label="Copy">${ic('copy')}</button><button class="act" data-a="sh" data-i="${i}" aria-label="Share">${ic('share')}</button>${i===last?`<button class="act" data-a="regen" aria-label="Regenerate">${ic('regen')}</button>`:''}</div></div>`).join('');m.scrollTop=m.scrollHeight}
const fbar=()=>{const e=$('#fb'),f=S.conv&&S.conv.file;if(e)e.innerHTML=f?`<div class="composer-banner fl">${ic('clip')}<span>${esc(f.name)}</span><button class="icon-btn sm" data-a="rmfile" aria-label="Remove file">${ic('close')}</button></div>`:''};
const setBtn=m=>{const b=$('#sbtn');if(b){b.innerHTML=ic(m==='stop'?'stop':'send');b.dataset.a=m}};
function send(text){const c=S.conv;text=(text||'').trim();if(!c||S.gen||(!text&&!c.file))return;
 if(!actM()){toast('Download a model first');A.hf();return}
 {const mm=actM(),kk=mk(mm),dm=navigator.deviceMemory||0;S.okm=S.okm||{};
  if(!(AI.W&&AI.key===kk)&&!S.okm[kk]&&(LS.get('bad',[]).includes(kk)||(dm&&mm.size>dm*3.5e8))){
   ask('This model may crash the app',LS.get('bad',[]).includes(kk)?'The app closed while loading this model last time. Your phone probably does not have enough free RAM for it. A smaller model (Q4) is safer, or lower the Context size in Settings.':'This model is large for your phone (about '+dm+' GB RAM). It may crash the app while loading. A smaller model is safer.',()=>{S.okm[kk]=1;send(text)},'Try anyway');return}}
 const t=text||'Summarize this file.';c.model=actM().id;if(!c.msgs.length)c.title=t.replace(/\n/g,' ').slice(0,60);c.msgs.push({r:'u',t});c.t=Date.now();renderMsgs();begin(c)}
function begin(c){const m=$('#msgs');m.insertAdjacentHTML('beforeend','<div class="ty" id="ty"><span class="od"><i></i><i></i><i></i><i></i></span><span class="tt">Thinking…</span></div>');m.scrollTop=m.scrollHeight;setBtn('stop');{const w=['Thinking','Reading your message','Writing the answer'];let k=0;const iv=setInterval(()=>{const t=$('#ty .tt');if(!t||!S.gen){clearInterval(iv);return}t.textContent=w[++k%w.length]+'…'},2400)}S.gen={sc:null,full:''};run(c,m)}
const errMsg=e=>e&&e.message==='NOMODEL'?'No model selected. Download one first.':e&&e.message==='MISSING'?'This model\'s files are missing on this device. Delete it from Models and download it again (it resumes where it stopped).':'The model could not run ('+String(e&&e.message||e).slice(0,160)+'). Try a smaller model (Q4) or lower the Context size in Settings. Internet is needed only for the first download of the AI engine and models.';
async function run(c,m){const g=S.gen;let full='',tok=0,t0=0,raf=0,lt=0;
 const view=()=>{raf=0;const l=$('#live');if(l){l.innerHTML=md(clean(full));m.scrollTop=m.scrollHeight}};
 try{const cold=!AI.W||AI.key!==mk(actM()||{id:'',dtype:''});
  if(cold){toast('Loading model...');const ty=$('#ty');if(ty){ty.insertAdjacentHTML('afterend','<p class="hint" id="lds"></p>');const t0l=Date.now();const tick=()=>{const e=$('#lds');if(e)e.textContent='Loading model · '+Math.floor((Date.now()-t0l)/1000)+' s · keep the app open'};tick();lt=setInterval(tick,1000)}}
  let W;try{W=await aiLoad()}finally{clearInterval(lt);$('#lds')?.remove()}
  if(S.gen!==g)return;
  $('#ty')?.remove();m.insertAdjacentHTML('beforeend','<div class="msg-b"><div class="bub"><div class="bot-text" id="live" dir="auto"></div></div></div>');
  const ab=new AbortController();g.ab=ab;
  const sysT=sysOf(getP(c.pers),c),pEx=getP(c.pers).ex,sysL=sysT.length+(pEx?pEx[0].length+pEx[1].length+16:0);let hist=c.msgs.slice(-S.cfg.ctx).map(x=>({role:x.r==='u'?'user':'assistant',content:x.t}));
  /* FIX: prompt context size se bada ho jaye to model fail hota tha. Purane messages gira do jab tak budget me aa jaye (~3 chars = 1 token) */
  const budget=Math.max(300,(S.cfg.nctx-S.cfg.max-64))*3;
  const sz=a=>a.reduce((n,x)=>n+x.content.length+8,0);
  while(hist.length>1&&sysL+sz(hist)>budget)hist.shift();
  if(hist.length&&sysL+sz(hist)>budget){const l=hist[hist.length-1];l.content=l.content.slice(-Math.max(200,budget-sysL-8))}
  const msgs=[{role:'system',content:sysT},...exMsgs(getP(c.pers)),...hist];
  if(AI.warmP){try{await AI.warmP}catch(e){}}
  AI.f1=0;t0=performance.now();
  const stream=await W.createChatCompletion({messages:msgs,max_tokens:S.cfg.max,temperature:Math.min(S.cfg.temp,getP(c.pers).t||2),top_p:.9,top_k:40,repeat_penalty:S.cfg.rep,cache_prompt:true,stream:true,abortSignal:ab.signal});
  for await(const ch of stream){const dl=ch&&ch.choices&&ch.choices[0]&&ch.choices[0].delta&&ch.choices[0].delta.content;if(dl){if(!AI.f1){AI.f1=1;AI.ttft=performance.now()-t0}full+=dl;g.full=full;tok++;if(!raf)raf=setTimeout(view,full.length>1500?260:full.length>600?150:90)}if(S.gen!==g)break}
  if(raf){clearTimeout(raf);raf=0}view();if(tok>1)AI.tps=(tok-1)/Math.max(.05,(performance.now()-t0-(AI.ttft||0))/1000)
 }catch(e){if(S.gen===g&&!full)full=errMsg(e)}
 if(S.gen===g)fin(clean(full).trim())}
/* feedback memory: liked answers become style examples, disliked ones are listed as answers to avoid (per personality) */
const exMsgs=p=>p.ex?[{role:'user',content:p.ex[0]},{role:'assistant',content:p.ex[1]}]:[];
const FB={all:()=>LS.get('fb',[]),
 mark(c,i,v){const m=c.msgs[i],pr=c.msgs[i-1],q=(pr&&pr.r==='u'?pr.t:'').slice(0,160),a=m.t.slice(0,240);
  const l=FB.all().filter(x=>!(x.q===q&&x.a===a));if(v)l.push({p:c.pers,q,a,v,t:Date.now()});LS.set('fb',l.slice(-40))},
 text(pid,c){const l=FB.all().filter(x=>x.p===pid);if(!l.length)return '';
  const lu=[...(c&&c.msgs||[])].reverse().find(x=>x.r==='u'),lq=((lu&&lu.t)||'').slice(0,160),same=x=>x.q&&x.q===lq;
  const g=l.filter(x=>x.v>0),b=l.filter(x=>x.v<0),f=x=>'Q: '+x.q+'\nA: '+x.a;
  const G=g.filter(same).slice(-1).concat(g.filter(x=>!same(x)).slice(-2)).slice(0,2),B=b.filter(same).slice(-1).concat(b.filter(x=>!same(x)).slice(-1)).slice(0,1);
  return (G.length?'\n\nAnswers the user marked as good (match their quality and style, never copy them):\n'+G.map(f).join('\n'):'')+(B.length?'\n\nAn answer the user marked as bad (avoid this kind of answer, be more accurate and helpful):\n'+B.map(f).join('\n'):'')}};
const persist=c=>{if(!S.keep)return;S.hist=S.hist.filter(h=>h.id!==c.id);S.hist.unshift(JSON.parse(JSON.stringify(c)));S.hist=S.hist.slice(0,100);save()};
function fin(full){const g=S.gen;if(!g)return;S.gen=null;const c=S.conv;if(c){if(full)c.msgs.push({r:'a',t:full});persist(c)}
 if(S.view==='chat'){renderMsgs();setBtn('send')}
 if(!S.rated&&c&&c.msgs.length>=2)setTimeout(rate,1500)}
function stop(){const g=S.gen;if(!g)return;if(g.ab){try{g.ab.abort()}catch(e){}}fin(clean(g.full||'').trim())}
function rate(){if(S.rated||S.view==='chat'&&S.gen)return;S.rated=true;save();overlay(`<div class="dlg"><h4>Enjoying the app?</h4><p>We'd love to hear from you! Please rate us.</p><div class="stars">${[1,2,3,4,5].map(i=>`<span data-a="star" data-n="${i}" style="cursor:pointer">★</span>`).join('')}</div><div class="bt"><button data-a="close">Later</button><button class="p" data-a="close" data-t="1">Rate Now</button></div></div>`)}

/* ---------- AI engine (llama.cpp via wllama, runs GGUF models) ---------- */
const AI={mod:null,wasm:null,W:null,key:null,load:null,lk:null,loadingKey:null,tps:0,ms:0};
const LIB_VER='3.8.1',LIB_BASE='https://cdn.jsdelivr.net/npm/@wllama/wllama@'+LIB_VER+'/';
const LIB_JS='esm/index.js',LIB_WASM='esm/wasm/wllama.wasm';
const blobURL=(data,type)=>URL.createObjectURL(new Blob([data],{type:type||'text/javascript'}));
async function libFile(name,optional){const c=await caches.open('vethos-lib'),u=LIB_BASE+name;let r=await c.match(u);
 if(!r){try{r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);await c.put(u,r.clone())}catch(e){if(optional)return null;throw e}}return r}
async function mkEngine(){if(AI.mod)return AI.mod;let mod=null;
 if(self.caches){try{mod=await import(blobURL(await(await libFile(LIB_JS)).text()))}catch(e){mod=null}}
 if(!mod)mod=await import(LIB_BASE+LIB_JS);
 let wasm=LIB_BASE+LIB_WASM;
 if(self.caches){try{const r=await libFile(LIB_WASM,1);if(r)wasm=blobURL(await r.blob(),'application/wasm')}catch(e){}}
 AI.wasm=wasm;AI.mod=mod;return mod}
async function aiUnload(){const w=AI.W;AI.W=null;AI.key=null;if(w){try{await w.exit()}catch(e){}}}
async function aiLoad(){const m=actM();if(!m)throw new Error('NOMODEL');const key=mk(m);
 if(AI.W&&AI.key===key)return AI.W;
 if(AI.load&&AI.lk===key)return AI.load;
 if(AI.load){try{await AI.load}catch(e){}if(AI.W&&AI.key===key)return AI.W}
 AI.lk=key;
 AI.load=(async()=>{let W=null;try{
   try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
   if(!(await VDL.readyG(m)))throw new Error('MISSING');
   await aiUnload();
   const t0=performance.now();LS.set('ldg',key);
   const mod=await mkEngine();
   W=new mod.Wllama({default:AI.wasm},mod.LoggerWithoutDebug?{logger:mod.LoggerWithoutDebug}:{});
   const iso=!!self.crossOriginIsolated,hc=navigator.hardwareConcurrency||4,tu=+S.cfg.thr||0,thr=iso?(tu||Math.max(2,Math.min(4,hc-1))):1;
   const mkW=()=>new mod.Wllama({default:AI.wasm},mod.LoggerWithoutDebug?{logger:mod.LoggerWithoutDebug}:{});
   const tries=[{n_ctx:S.cfg.nctx,n_batch:512,n_threads:thr,n_gpu_layers:S.cfg.gpu?99:0}];
   if(S.cfg.gpu)tries.push({n_ctx:S.cfg.nctx,n_batch:512,n_threads:thr,n_gpu_layers:0});
   tries.push({n_ctx:S.cfg.nctx,n_batch:256,n_threads:thr,n_gpu_layers:0});tries.push({n_ctx:S.cfg.nctx,n_gpu_layers:0});
   let lastErr=null,done=false;
   for(let i=0;i<tries.length&&!done;i++){
    try{if(i>0){try{await W.exit()}catch(_){}W=mkW()}await W.loadModel(await VDL.blobsG(m),tries[i]);done=true;AI.thr=tries[i].n_threads||1;
     if(S.cfg.gpu&&!tries[i].n_gpu_layers){S.cfg.gpu=false;save();toast('GPU not supported here. Using CPU')}}
    catch(e){lastErr=e}}
   if(!done)throw lastErr;
   LS.set('ldg',null);AI.W=W;AI.key=key;AI.ms=performance.now()-t0;return W
  }catch(e){LS.set('ldg',null);if(W){try{await W.exit()}catch(_){}}throw e}})().finally(()=>{AI.load=null});
 return AI.load}

/* ---------- Hugging Face browser + downloads ---------- */
const QH=l=>/^(Q4|IQ4)/i.test(l)?'Small · fast on phones':/^(Q[23]|IQ[123])/i.test(l)?'Tiny · lower quality':/^Q5/i.test(l)?'Balanced':/^(Q6|Q8)/i.test(l)?'High quality · larger':/^(F16|BF16|F32)/i.test(l)?'Largest · slow':'GGUF model';
const quant=n=>{const m=n.match(/(IQ\d_[A-Z0-9_]+|Q\d_[A-Z0-9_]+|Q\d|BF16|F16|F32)/i);return m?m[1].toUpperCase():n.replace(/\.gguf$/i,'')};
const recD=ks=>ks.find(k=>/^Q4_K_M$/i.test(k))||ks.find(k=>/^Q4_0$|^Q4_K_S$/i.test(k))||ks.find(k=>/^Q5_K_M$|^Q8_0$/i.test(k))||ks[0];
async function hfFetch(){const h=S.hf,t=++h.tok;h.loading=true;h.err='';hfRender();
 try{const u=new URL('https://huggingface.co/api/models');if(h.scope!=='all')u.searchParams.set('author',h.scope);u.searchParams.append('filter','gguf');u.searchParams.set('sort','downloads');u.searchParams.set('direction','-1');u.searchParams.set('limit','30');if(h.q.trim())u.searchParams.set('search',h.q.trim());
  const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(t!==h.tok)return;h.list=j.map(x=>({id:x.id||x.modelId,dl:x.downloads||0,lk:x.likes||0}))}
 catch(e){if(t===h.tok)h.err='Could not load the list. Check your internet.'}
 if(t===h.tok){h.loading=false;hfRender()}}
async function hfTree(id){const r=await fetch(`https://huggingface.co/api/models/${id}/tree/main`);if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json(),g={};
 for(const f of j){if(f.type!=='file'||!/\.gguf$/i.test(f.path)||/mmproj|imatrix/i.test(f.path))continue;const sz=(f.lfs&&f.lfs.size)||f.size||0,m=f.path.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/i),base=m?m[1]:f.path.replace(/\.gguf$/i,'');
  const e=g[base]||(g[base]={base,files:[],n:m?+m[3]:1,size:0});e.files.push({path:f.path,size:sz});e.size+=sz}
 const arr=Object.values(g).filter(e=>e.files.length===e.n&&e.size>0);arr.forEach(e=>e.files.sort((x,y)=>x.path.localeCompare(y.path)));
 const cnt={};arr.forEach(e=>{e.label=quant(e.base);cnt[e.label]=(cnt[e.label]||0)+1});arr.forEach(e=>{if(cnt[e.label]>1)e.label=e.base});
 return arr.sort((x,y)=>x.size-y.size)}
function hfRender(){const l=$('#hfl'),hh=$('#hfh');if(!l)return;const h=S.hf;hh.hidden=!!S.sel;$('#sht').textContent=S.sel?nm(S.sel.id):'Download model';
 if(S.sel){const s=S.sel;let b;
  if(s.err)b=`<p class="empty">${esc(s.err)}</p>`;
  else if(!s.files)b='<p class="empty">Loading files...</p>';
  else{const ds=s.files,rec=recD(ds.map(x=>x.label));
   b=`<p class="hint">${esc(s.id)}<br>Choose a version. Smaller means faster and less RAM.</p><div class="group">${ds.map(x=>{const d=x.label,sz=x.size;const inst=S.models.some(m=>m.id===s.id&&m.dtype===d);return `<button class="row row-btn tall" data-a="hfdl" data-id="${esc(s.id)}" data-d="${d}" data-s="${sz}"><span class="row-text"><b>${d}${d===rec?'<span class="badge">Recommended</span>':''}</b><small>${fmtB(sz)} · ${QH(d)}</small></span>${inst?'<span class="badge">Installed</span>':ic('dl')}</button>`}).join('')}</div>`}
  l.innerHTML=`<button class="chip" data-a="hfback">← Back to list</button><div style="height:12px"></div>`+b;return}
 const q=h.q.trim();
 l.innerHTML=(q.includes('/')?`<div class="group"><button class="row row-btn tall" data-a="hfpick" data-id="${esc(q)}"><span class="row-text"><b>Open “${esc(q)}”</b><small>Use this repo directly</small></span>${chev}</button></div>`:'')+
 (h.loading?'<p class="empty">Loading...</p>':h.err?`<p class="empty">${esc(h.err)}</p>`:h.list.length?`<div class="group">${h.list.map(x=>`<button class="row row-btn tall" data-a="hfpick" data-id="${esc(x.id)}"><span class="row-text"><b>${esc(nm(x.id))}${S.models.some(m=>m.id===x.id)?'<span class="badge">Installed</span>':''}</b><small>${esc(x.id.split('/')[0])} · ↓ ${fmtN(x.dl)} · ♥ ${fmtN(x.lk)}${pm(x.id)?' · '+pm(x.id):''}</small></span>${chev}</button>`).join('')}</div>`:'<p class="empty">No models found.</p>')}
async function purge(id,files){try{await VDL.purgeG(id,files)}catch(e){}}
let rt=0;const softRefresh=f=>{if(S.view!=='models')return;if(f){show('models',false);return}if(rt)return;rt=setTimeout(()=>{rt=0;const l=$('#ml');if(S.view==='models'&&l)l.innerHTML=mlist()},250)};
async function dlModel(id,dtype,size,files){const key=id+'|'+dtype,old=S.prog[key];if(old&&old.paused!==2)return;files=files||(old&&old.files);if(!files)return;
 if(!VDL.supported()){toast('This browser cannot store models. Open the app over https or localhost.');return}
 const ab=new AbortController(),sz=size||(old&&(old.size||old.t))||0;
 S.prog[key]={p:old?old.p:0,l:old?old.l:0,t:sz,size:sz,st:'Preparing...',id,dtype,files,x:0,paused:0,ab};save();closeOv();if(S.view!=='models')go('models');else show('models',false);
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 try{
  await VDL.downloadG(id,files,{signal:ab.signal,
   onProgress:(l,t)=>{const P=S.prog[key];if(!P)return;P.l=l;P.t=t||P.t;P.p=P.t?Math.min(99,Math.floor(l/P.t*100)):0;softRefresh()},
   onStatus:s=>{const P=S.prog[key];if(!P)return;P.st=s;softRefresh()}});
  if(ab.signal.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
  delete S.prog[key];if(dlModel.n)dlModel.n[key]=0;
  if(!S.models.some(m=>m.id===id&&m.dtype===dtype))S.models.push({id,dtype,size:sz,files,t:Date.now()});
  if(!S.active)S.active=key;
  save();toast(nm(id)+' is ready')}
 catch(e){const P=S.prog[key];
  if(e&&e.name==='AbortError'&&P&&!P.x){P.paused=2;P.ab=null;P.st='Paused';save();toast('Download paused')}
  else if(e&&e.name==='AbortError'){await purge(id,files);delete S.prog[key];save();toast('Download cancelled')}
  else if(P){P.paused=2;P.ab=null;P.st='Stopped: '+String(e&&e.message||e).slice(0,40);save();toast('Download stopped. Retrying automatically...');const n=(dlModel.n=dlModel.n||{});n[key]=(n[key]||0)+1;if(n[key]<=6&&!/not found|login/i.test(P.st))setTimeout(autoResume,20000)}}
 softRefresh(true)}

async function localSheet(fs){
 const g=fs.filter(f=>/\.gguf$/i.test(f.name)).sort((x,y)=>x.name.localeCompare(y.name,'en',{numeric:true}));
 if(!g.length){overlay(`<div class="dlg"><h4>Cannot add model</h4><p>Select a .gguf model file. For a split model select all its parts together.</p><div class="bt"><button class="p" data-a="close">OK</button></div></div>`);return}
 const name=g[0].name.replace(/-\d{5}-of-\d{5}/i,'').replace(/\.gguf$/i,'');
 S.lsc={files:g};const tot=g.reduce((x,f)=>x+f.size,0);
 overlay(sheet('Add model from phone',`<p class="hint">${g.length} file(s) · ${fmtB(tot)}<br>Give it a name:</p><label class="search"><input id="lname" maxlength="60" value="${esc(name||'local-model')}" aria-label="Model name"></label><button class="btn-dark wide" id="lgo" data-a="limp">${ic('plus')}<span>Add model</span></button><p class="hint" id="lst">Keep this screen open while files are copied.</p>`),'sh')}
document.addEventListener('change',e=>{if(e.target.id!=='lfi')return;const fs=[...e.target.files];e.target.value='';if(fs.length)localSheet(fs)});
const libCard=()=>{const L=S.lib||{st:'checking'};
 const t=L.st==='ready'?'Ready · works offline':L.st==='loading'?'Downloading '+(L.k+1)+'/'+L.n+'...':L.st==='error'?'Not downloaded: '+esc(L.msg||'error'):'Checking...';
 return `<div class="eng"><span class="ci" style="border-radius:50%">${ic(L.st==='ready'?'check':'chip')}</span><span class="row-text"><b>AI engine</b><small>${t}</small></span>${L.st==='ready'?'<span class="badge ok">Ready</span>':''}</div>${L.st==='error'?`<button class="btn-dark wide" data-a="libdl">${ic('dl')}<span>Download AI engine</span></button>`:''}`};
const libRender=()=>{const e=$('#lib');if(e)e.innerHTML=libCard()};
async function libPrefetch(){
 if(S.lib&&S.lib.st==='loading')return;
 if(!self.caches){S.lib={st:'ready'};libRender();return}
 let c,miss=[];
 try{c=await caches.open('vethos-lib');for(const n of [LIB_JS,LIB_WASM])if(!(await c.match(LIB_BASE+n)))miss.push(n)}catch(e){S.lib={st:'error',msg:'storage unavailable'};libRender();return}
 if(!miss.length){S.lib={st:'ready'};libRender();return}
 if(navigator.onLine===false){S.lib={st:'error',msg:'no internet'};libRender();return}
 S.lib={st:'loading',k:0,n:miss.length};libRender();
 try{
  for(const n of miss){
   let ok=false,err;
   for(let i=0;i<4&&!ok;i++){try{const r=await fetch(LIB_BASE+n);if(!r.ok)throw new Error('HTTP '+r.status);await c.put(LIB_BASE+n,r);ok=true}catch(e){err=e;await new Promise(r=>setTimeout(r,1500*(i+1)))}}
   if(!ok)throw err;
   S.lib.k++;libRender()}
  S.lib={st:'ready'};libRender();toast('AI engine ready for offline use')}
 catch(e){S.lib={st:'error',msg:e&&e.name==='TypeError'?'network dropped':String(e&&e.message||e).slice(0,40)};libRender()}}
const autoResume=()=>{if(navigator.onLine===false)return;Object.values(S.prog).forEach(P=>{if(P.paused===2&&!P.x&&/^Stopped/.test(P.st||'')&&!/not found|login/i.test(P.st))dlModel(P.id,P.dtype,P.size||P.t,P.files)})};
addEventListener('online',autoResume);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')autoResume()});

/* ---------- Actions ---------- */
const A={
go:e=>go(e.dataset.v),
back:()=>{if(S.gen&&S.view==='chat'){overlay(`<div class="dlg"><div class="wi">!</div><h4>Leave chat?</h4><p>A response is still generating. Leaving now will stop it.</p><div class="bt"><button data-a="close">Stay &amp; wait</button><button class="p" data-a="leave">End session</button></div></div>`);return}const v=S.stack.pop()||'home';S.q='';show(v,false)},
leave:()=>{closeOv();stop();const v=S.stack.pop()||'home';show(v,false)},
close:e=>{closeOv();if(e.dataset.t)toast('Thanks for your support!')},
star:e=>{$$('.stars span').forEach((s,i)=>s.classList.toggle('on',i<+e.dataset.n))},
askok:()=>{const f=S.ask;S.ask=null;closeOv();f&&f()},
install:()=>S.pro?(S.pro.prompt(),S.pro=null):toast('Use your browser menu → Add to Home screen'),
drawer:()=>{const r=S.hist.slice(0,5),n=[['home','home','Home'],['models','lib','Library'],['pers','chat','My Offline Chatbots'],['ins','ins','Insights'],['set','set','Settings']];const d=document.createElement('div');d.className='dr';d.id='dr';d.innerHTML=`<aside class="dw"><div class="dw-title">Vethos</div><nav>${n.map(([v,i,t])=>`<button class="nav-item ${S.view===v?'on':''}" data-a="drgo" data-v="${v}">${ic(i)}<span>${t}</span></button>`).join('')}</nav><div class="dw-rec"><h2 class="dw-sub">Recent chats</h2>${r.map(c=>`<button data-a="open" data-id="${c.id}">${esc(c.title)}</button>`).join('')||'<p class="hint" style="padding:8px 0">No recent chats.</p>'}</div><div class="dw-foot"><button class="link" data-a="drgo" data-v="hist">View all history</button><button class="btn-dark" data-a="newchat">${ic('plus')}<span>New chat</span></button></div></aside><i data-a="close"></i>`;$('#app').appendChild(d)},
drgo:e=>{closeOv();const v=e.dataset.v;if(TABS.includes(v)){S.stack=[];S.q='';show(v,false)}else go(v)},
tab:e=>{S.stack=[];S.q='';show(e.dataset.v,false)},
lf:e=>{S.lf=e.dataset.f;show('models',false)},
startm:()=>startChat(S.pers),
mchat:e=>{S.active=e.dataset.k;save();startChat(S.pers)},
sugdl:e=>{const id=e.dataset.id;if(S.models.some(m=>m.id===id)){toast('Already installed');return}A.hf();A.hfpick({dataset:{id}})},
more:()=>{const r=(a,i,t,cls='')=>`<button class="row row-btn ${cls}" data-a="${a}">${ic(i,'lead')}<span class="row-label">${t}</span></button>`;overlay(sheet('Options',`<div class="group">${r('newchat','plus','New chat')}${r('psw','chat','Change personality')}${r('cexp','share','Export chat as text')}${r('cclear','trash','Clear conversation','danger')}</div>`),'sh')},
cexp:()=>{const c=S.conv;closeOv();if(c&&c.msgs.length)saveFile('vethos-'+c.title.replace(/[^\w]+/g,'-').slice(0,30)+'.txt',chatTxt(c));else toast('Nothing to export yet')},
cclear:()=>{closeOv();if(S.gen){toast('Wait for the reply to finish');return}const c=S.conv;if(!c||!c.msgs.length)return;ask('Clear conversation?','All messages in this chat will be removed.',()=>{c.msgs=[];c.title='New chat';S.hist=S.hist.filter(h=>h.id!==c.id);save();renderMsgs()},'Clear')},
tgl:e=>{const k=e.dataset.k;S.cfg[k]=!S.cfg[k];save();const w=e.querySelector('.sw');if(w)w.classList.toggle('on',S.cfg[k]);if(k==='gpu'&&AI.W&&!S.gen)aiUnload();toast(k==='gpu'?(S.cfg.gpu?'GPU on (reloads model)':'GPU off'):'Saved')},
coi:async()=>{const on=LS.get('coi',true);LS.set('coi',!on);try{const c=await caches.open('vethos-flags');if(on)await c.put('nocoi',new Response('1'));else await c.delete('nocoi')}catch(_){}
 toast(on?'Multi-thread off. Restarting…':'Multi-thread on. Restarting…');setTimeout(()=>location.reload(),700)},
newchat:()=>{closeOv();startChat(S.pers)},
pchat:e=>startChat(e.dataset.p),
hsend:()=>{const v=$('#hin').value.trim();if(!startChat(S.pers))return;if(v)setTimeout(()=>send(v),60)},
/* personalities */
psw:()=>{const cur=S.view==='chat'&&S.conv?S.conv.pers:S.pers;overlay(sheet('Personality',`<div class="group">${allP().map(p=>`<button class="row row-btn tall" data-a="ppick" data-p="${p.id}"><span class="ci">${ic(p.ic)}</span><span class="row-text"><b>${esc(p.n)}</b><small>${esc(p.d)}</small></span>${p.id===cur?ic('check'):''}</button>`).join('')}</div>`),'sh')},
ppick:e=>{const id=e.dataset.p;if(S.view==='chat'&&S.conv){if(S.gen){toast('Wait for the reply to finish');return}S.conv.pers=id;S.pers=id;save();closeOv();const v=($('#cin')||{}).value||'';show('chat',false);const i=$('#cin');if(i)i.value=v;toast('Personality: '+getP(id).n)}
 else{S.pers=id;save();closeOv();const p=$('#hpill');if(p)p.textContent=getP(id).n}},
pedit:e=>{const id=e.dataset.p,nw=id==='new',p=nw?{id,n:'',d:'',sys:'',cust:1}:getP(id);
 overlay(sheet(nw?'New personality':p.n,`<div class="form">${p.cust?`<label class="lbl" for="pn">Name</label><input class="inp" id="pn" value="${esc(p.n)}" maxlength="30" placeholder="e.g. Urdu Poet"><label class="lbl" for="pd">Short description</label><input class="inp" id="pd" value="${esc(p.d)}" maxlength="60" placeholder="What is it good at?">`:''}<label class="lbl" for="ps">System prompt (role, tone, rules, answer format)</label><textarea class="inp" id="ps" dir="auto" placeholder="ROLE: ...">${esc(p.sys)}</textarea><div class="btn-row"><button class="btn-dark" data-a="psave" data-p="${id}">Save</button></div>${!p.cust&&S.ov[id]?`<div class="btn-row"><button class="btn-light" data-a="preset" data-p="${id}">Reset to default</button></div>`:''}${p.cust&&!nw?`<div class="btn-row"><button class="btn-light dg" data-a="pdel" data-p="${id}">Delete personality</button></div>`:''}</div>`),'sh')},
psave:e=>{const id=e.dataset.p,sys=$('#ps').value.trim();if(sys.length<10){toast('Write a longer prompt');return}
 if(id==='new'||S.cust.some(c=>c.id===id)){const n=$('#pn').value.trim(),d=$('#pd').value.trim()||'Custom personality';if(!n){toast('Enter a name');return}
  if(id==='new')S.cust.push({id:'u'+Date.now(),n,d,sys});else Object.assign(S.cust.find(c=>c.id===id),{n,d,sys})}
 else{const def=PERS.find(p=>p.id===id).sys;if(sys===def)delete S.ov[id];else S.ov[id]=sys}
 save();closeOv();toast('Saved');show(S.view,false)},
preset:e=>{delete S.ov[e.dataset.p];save();closeOv();toast('Reset');show(S.view,false)},
pdel:e=>{const id=e.dataset.p;ask('Delete personality?','This custom personality will be removed.',()=>{S.cust=S.cust.filter(c=>c.id!==id);if(S.pers===id)S.pers='gen';save();show(S.view,false)})},
/* models */
hf:()=>{S.sel=null;const h=S.hf;overlay(sheet('Download model',`<div id="hfh"><label class="search">${ic('search')}<input id="hq2" placeholder="Search: qwen, llama, gemma, phi..." value="${esc(h.q)}" aria-label="Search models"></label><div class="chips"><button class="chip ${h.scope==='unsloth'?'on':''}" data-a="hfscope" data-s="unsloth">unsloth</button><button class="chip ${h.scope==='bartowski'?'on':''}" data-a="hfscope" data-s="bartowski">bartowski</button><button class="chip ${h.scope==='all'?'on':''}" data-a="hfscope" data-s="all">All authors</button></div></div><div id="hfl"></div>`),'sh');
 hfRender();if(!h.list.length)hfFetch()},
hfscope:e=>{S.hf.scope=e.dataset.s;$$('.chips .chip').forEach(c=>c.classList.toggle('on',c.dataset.s===S.hf.scope));hfFetch()},
hfpick:e=>{const id=e.dataset.id;S.sel={id,files:null,err:''};hfRender();
 hfTree(id).then(f=>{if(!S.sel||S.sel.id!==id)return;if(!f.length)S.sel.err='No GGUF files found in this repo.';else S.sel.files=f;hfRender()}).catch(()=>{if(S.sel&&S.sel.id===id){S.sel.err='Could not load files. Check internet or the model id.';hfRender()}})},
hfback:()=>{S.sel=null;hfRender()},
hfdl:async e=>{const{id,d}=e.dataset,sz=+e.dataset.s,ent=S.sel&&S.sel.files&&S.sel.files.find(x=>x.label===d);if(!ent)return;if(ent.files.length===1&&ent.size>2147000000){toast('Over 2 GB in a single file: it cannot load in this app. Pick a smaller or split one.');return}
 if(S.prog[id+'|'+d]){const P=S.prog[id+'|'+d];if(P.paused===2)dlModel(id,d,sz,ent.files);else toast('Already downloading');return}if(S.models.some(m=>m.id===id&&m.dtype===d)){toast('Already installed');return}
 let free=0;try{const es=await navigator.storage.estimate();free=es.quota-es.usage}catch(_){}
 const low=free&&sz*1.1>free,dm=navigator.deviceMemory||0,ram=dm&&sz>dm*1e9*.3,start=()=>dlModel(id,d,sz,ent.files);
 if(sz>6e8||low||ram)ask('Download '+fmtB(sz)+'?',(low?'Free storage looks low. ':'')+(ram?'This model may be too big for this device\'s RAM (about '+dm+' GB) and can crash when it loads. A smaller one (q4) is safer. ':'')+'Use Wi-Fi. The download can be resumed if it stops.',start,'Download');else start()},
lpick:()=>{let i=$('#lfi');if(!i){i=document.createElement('input');i.type='file';i.multiple=true;i.id='lfi';i.hidden=true;document.body.appendChild(i)}i.value='';i.click()},
limp:async()=>{if(S.lbusy)return;const sc=S.lsc,inp=$('#lname');if(!sc||!inp)return;
 const slug=inp.value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
 if(!slug){toast('Enter a model name');return}
 const id='local/'+slug,list=sc.files.map(f=>({path:f.name,size:f.size,file:f})),total=list.reduce((x,i)=>x+i.size,0);
 let free=0;try{const es=await navigator.storage.estimate();free=es.quota-es.usage}catch(_){}
 if(free&&total*1.05>free){toast('Not enough free storage ('+fmtB(free)+' free)');return}
 S.lbusy=1;const b=$('#lgo');if(b){b.disabled=true;b.style.opacity='.6'}
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 const say=s=>{const e=$('#lst');if(e)e.textContent=s};let cur='';
 try{
  await VDL.importG(id,list,{onStatus:s=>{cur=s;say(s)},onProgress:(l,t)=>say(cur+' · '+Math.floor(l/t*100)+'%')});
  const dtype=quant(list[0].path),files=list.map(x=>({path:x.path,size:x.size}));
  if(AI.key===id+'|'+dtype)await aiUnload();
  S.models=S.models.filter(m=>!(m.id===id&&m.dtype===dtype));S.models.push({id,dtype,size:total,files,t:Date.now()});
  if(!S.active)S.active=id+'|'+dtype;
  save();closeOv();toast(nm(id)+' added');if(S.view==='models')show('models',false)}
 catch(e){await purge(id,list.map(x=>({path:x.path})));
  say('Failed: '+(e&&e.name==='QuotaExceededError'?'not enough storage':String(e&&e.message||e).slice(0,80)));
  if(b){b.disabled=false;b.style.opacity=''}}
 finally{S.lbusy=0}},
mload:async e=>{const k=e.dataset.k,m=S.models.find(x=>mk(x)===k);if(!m||AI.loadingKey||S.gen)return;
 S.active=k;save();AI.loadingKey=k;show('models',false);toast('Loading '+nm(m.id)+'...');
 try{await aiLoad();toast(nm(m.id)+' loaded')}
 catch(err){overlay(`<div class="dlg"><h4>Could not load model</h4><p>${esc(errMsg(err))}</p><div class="bt"><button class="p" data-a="close">OK</button></div></div>`)}
 AI.loadingKey=null;if(S.view==='models')show('models',false)},
munload:async()=>{if(S.gen){toast('Wait for the reply to finish');return}await aiUnload();toast('Model unloaded, RAM freed');if(S.view==='models')show('models',false)},
libdl:()=>{S.lib=null;libPrefetch()},
actm:e=>{S.active=e.dataset.k;save();toast('Active model changed');show('models',false)},
pause:e=>{const P=S.prog[e.dataset.k];if(P&&!P.paused&&P.ab){P.paused=1;P.st='Pausing...';P.ab.abort();softRefresh(true)}},
resume:e=>{const P=S.prog[e.dataset.k];if(P&&P.paused===2)dlModel(P.id,P.dtype,P.size||P.t,P.files)},
cancel:e=>{const k=e.dataset.k,P=S.prog[k];if(!P)return;P.x=1;if(P.paused===2||!P.ab){purge(P.id,P.files).then(()=>{delete S.prog[k];save();toast('Download cancelled');softRefresh(true)})}else{P.st='Cancelling...';try{P.ab.abort()}catch(_){}softRefresh(true)}},
delm:e=>{const k=e.dataset.k,m=S.models.find(x=>mk(x)===k);if(!m)return;
 ask('Delete model?',nm(m.id)+' ('+m.dtype+') will be removed from this device. You can download it again later.',async()=>{
  if(AI.key===k)await aiUnload();
  await purge(m.id,m.files);S.models=S.models.filter(x=>x!==m);if(S.active===k)S.active=S.models[0]?mk(S.models[0]):null;save();toast('Model deleted');show('models',false)})},
/* history */
hist:()=>go('hist'),
open:e=>{const c=S.hist.find(h=>h.id===e.dataset.id);if(!c)return;closeOv();S.conv=JSON.parse(JSON.stringify(c));S.pers=c.pers;go('chat')},
hmenu:e=>{const id=e.dataset.id,c=S.hist.find(h=>h.id===id);if(!c)return;
 const r=(a,i,t,cls='')=>`<button class="row row-btn ${cls}" data-a="${a}" data-id="${id}">${ic(i,'lead')}<span class="row-label">${t}</span></button>`;
 overlay(sheet(c.title,`<div class="group">${r('hren','edit','Rename')}${r('hpin','pin',c.pin?'Unpin':'Pin to top')}${r('hexp','share','Export as text file')}${r('hdel','trash','Delete','danger')}</div>`),'sh')},
hren:e=>{const c=S.hist.find(h=>h.id===e.dataset.id);if(!c)return;overlay(`<div class="dlg"><h4>Rename chat</h4><input class="inp" id="rn" value="${esc(c.title)}" maxlength="60" aria-label="Chat name"><div class="bt"><button data-a="close">Cancel</button><button class="p" data-a="hrenok" data-id="${c.id}">Save</button></div></div>`)},
hrenok:e=>{const c=S.hist.find(h=>h.id===e.dataset.id),v=$('#rn').value.trim();if(c&&v){c.title=v.slice(0,60);save()}closeOv();show('hist',false)},
hpin:e=>{const c=S.hist.find(h=>h.id===e.dataset.id);if(c){c.pin=!c.pin;save()}closeOv();show('hist',false)},
hexp:e=>{const c=S.hist.find(h=>h.id===e.dataset.id);closeOv();if(c)saveFile('vethos-'+c.title.replace(/[^\w]+/g,'-').slice(0,30)+'.txt',chatTxt(c))},
hdel:e=>{const id=e.dataset.id;ask('Delete chat?','This conversation will be removed.',()=>{S.hist=S.hist.filter(h=>h.id!==id);save();show('hist',false)})},
keep:()=>{S.keep=!S.keep;save();$('.sw').classList.toggle('on',S.keep)},
delall:()=>ask('Delete all history?','This permanently removes every saved conversation.',()=>{S.hist=[];save();toast('History deleted');if(S.view==='hist')show('hist',false)}),
/* chat */
sg:e=>send(e.textContent),
send:()=>{if(S.gen)return;const i=$('#cin');const v=i.value;i.value='';send(v)},
stop:()=>stop(),
like:e=>{const c=S.conv,i=+e.dataset.i,m=c&&c.msgs[i];if(!m)return;const v=+e.dataset.v;m.fb=m.fb===v?0:v;FB.mark(c,i,m.fb);persist(c);e.parentNode.querySelectorAll('[data-a=like]').forEach(b=>b.classList.toggle('on',m.fb===+b.dataset.v));toast(m.fb===1?'Marked as best. I will answer like this':m.fb===-1?'Marked as bad. I will avoid this':'Feedback removed')},
cp:e=>copy(S.conv.msgs[+e.dataset.i].t),sh:e=>share(S.conv.msgs[+e.dataset.i].t),
cpcode:e=>copy(e.closest('.cb').querySelector('code').textContent),
regen:()=>{const c=S.conv;if(!c||S.gen)return;const l=c.msgs[c.msgs.length-1];if(!l||l.r!=='a')return;c.msgs.pop();renderMsgs();begin(c)},
rmfile:()=>{if(S.conv){S.conv.file=null;fbar()}},
mic:()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast('Voice input is not supported here');const r=new SR();r.lang=S.cfg.voice;r.interimResults=false;overlay(`<div class="dlg"><h4>Speak now...</h4><p>${esc(S.cfg.voice)}</p></div>`);r.onresult=ev=>{const i=$('#cin');if(i)i.value=((i.value?i.value+' ':'')+ev.results[0][0].transcript)};r.onend=closeOv;r.onerror=()=>{closeOv();toast('Could not hear you. Check microphone permission.')};try{r.start()}catch(e){closeOv()}}};

document.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(!t)return;const f=A[t.dataset.a];if(f){e.stopPropagation();f(t)}});
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='cin')A.send();if(e.target.id==='hin')A.hsend()});
let hqt;
document.addEventListener('input',e=>{const t=e.target;
 if(t.id==='hq'){S.q=t.value;const q=S.q.trim().toLowerCase();$('#hl').innerHTML=hlist(S.hist.filter(c=>c.title.toLowerCase().includes(q)))}
 if(t.id==='hq2'){S.hf.q=t.value;clearTimeout(hqt);hqt=setTimeout(hfFetch,450)}
 if(t.dataset&&t.dataset.cfg){const k=t.dataset.cfg;S.cfg[k]=t.type==='range'?+t.value:t.value;const o=$('#o_'+k);if(o)o.textContent=S.cfg[k];save();
  if(k==='theme')applyTheme();
  if(k==='nctx'&&AI.W&&!S.gen)aiUnload();}});
document.addEventListener('change',e=>{if(e.target.id!=='fl')return;const f=e.target.files[0];e.target.value='';if(!f||!S.conv)return;if(f.size>5e5){toast('File too large (max 500 KB)');return}const r=new FileReader();r.onload=()=>{S.conv.file={name:f.name,text:String(r.result).slice(0,4000)};fbar();toast(String(r.result).length>4000?'Attached (first 4000 characters used)':'File attached')};r.onerror=()=>toast('Could not read file');r.readAsText(f)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();S.pro=e});
if(window.matchMedia)matchMedia('(prefers-color-scheme:dark)').addEventListener('change',applyTheme);
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').then(()=>{if(self.crossOriginIsolated||!LS.get('coi',true)||sessionStorage.getItem('coi_r'))return;sessionStorage.setItem('coi_r','1');if(navigator.serviceWorker.controller)location.reload();else navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true})}).catch(()=>{});

applyTheme();
try{navigator.gpu?navigator.gpu.requestAdapter().then(x=>{S.gpu=!!x},()=>{S.gpu=false}):S.gpu=false}catch(e){S.gpu=false}
{const lk=LS.get('ldg',null);if(lk){LS.set('ldg',null);const b=LS.get('bad',[]);if(!b.includes(lk)){b.push(lk);LS.set('bad',b)}
 setTimeout(()=>overlay(`<div class="dlg"><h4>App closed while loading</h4><p>${esc(nm(lk.split('|')[0]))} (${esc(lk.split('|')[1]||'')}) stopped the app last time, most likely because the phone ran out of RAM. Try a smaller model (for example SmolLM2-135M or 360M, q4).</p><div class="bt"><button class="p" data-a="close">OK</button></div></div>`),2500)}}
if(self.caches&&!LS.get('gg1',0)){caches.delete('transformers-cache').catch(()=>{});caches.delete('vethos-lib').catch(()=>{});LS.set('gg1',1)}
setTimeout(libPrefetch,1200);addEventListener('online',()=>{if(!S.lib||S.lib.st!=='ready')libPrefetch()});
$('#app').insertAdjacentHTML('beforeend',`<div class="splash"><div class="splash-logo"><svg aria-hidden="true"><use href="#i-mark"/></svg></div><div class="splash-name">Vethos</div><p class="splash-head">Your private AI,<br><b>fully offline</b></p><div class="splash-feats"><span class="sf a"><i>${ic('wifioff')}</i>Offline</span><span class="sf b"><i>${ic('phone')}</i>On-device</span><span class="sf c"><i>${ic('lock')}</i>Private</span></div><div class="splash-bar"><i></i></div><p class="splash-cap">Starting your AI…</p></div>`);
show('home',false);setTimeout(()=>{const s=$('.splash');if(!s)return;s.style.opacity=0;setTimeout(()=>s.remove(),400)},1500);

/* speed: preload model at start + pre-compute the system prompt (KV cache) so the first reply starts fast */
setTimeout(()=>{try{const m=actM(),dm=navigator.deviceMemory||4;
 if(S.cfg.pre&&m&&!S.gen&&!Object.keys(S.prog).length&&!LS.get('bad',[]).includes(mk(m))&&m.size<dm*3e8)
  VDL.readyG(m).then(ok=>{if(!ok||S.gen)return;return aiLoad().then(W=>{AI.warmP=W.createChatCompletion({messages:[{role:'system',content:sysOf(getP(S.pers),null)},...exMsgs(getP(S.pers)),{role:'user',content:'Hi'}],max_tokens:1,cache_prompt:true,stream:false}).catch(()=>{}).finally(()=>{AI.warmP=null})})}).catch(()=>{})}catch(e){}},2500);
