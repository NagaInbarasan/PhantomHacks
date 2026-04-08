'use strict';
/* =====================================================================
   STATE ADDITIONS (must be at top before any function runs)
   ===================================================================== */
let currentSort='latest';
let currentPage=1;
const PAGE_SIZE=6;
let locFilter=null;
let pbFilter='all';

/* =====================================================================
   SUPABASE
   ===================================================================== */
const SUPA_URL='https://frffynlzejbtnapooqvu.supabase.co';
const SUPA_KEY='sb_publishable_QW3l1XzcOGcvKIKeGVUv9w_jfe0IUtS';
const supa=window.supabase.createClient(SUPA_URL,SUPA_KEY,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
    storageKey:'phantom_hacks_auth',
  }
});

/* =====================================================================
   DATA — loaded from Supabase, fallback to empty array while loading
   ===================================================================== */
let DB=[];

async function loadHackathons(){
  try{
    const{data,error}=await supa.from('hackathons').select('*').order('id');
    if(error) throw error;
    if(!data||!data.length) throw new Error('No hackathons returned');
    DB=data;
    renderFeatured();
    renderEvents(true);
    renderPrizeBoard();
    buildTicker();
    initBrowseBy();
    document.getElementById('totalCount').textContent=DB.length.toLocaleString('en-IN')+'+';
    const open=DB.filter(h=>h.status==='open').length;
    const online=DB.filter(h=>h.mode==='online').length;
    const free=DB.filter(h=>h.cost==='free').length;
    counter(document.getElementById('statOpen'),0,open);
    counter(document.getElementById('statOnline'),0,online);
    counter(document.getElementById('statFree'),0,free);
    counter(document.getElementById('sOpen'),0,open);
    toast('👻',`${DB.length} hackathons loaded!`);
  }catch(err){
    console.error('Supabase load error:',err);
    document.getElementById('eventsList').innerHTML=`
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        <div style="font-size:44px;margin-bottom:14px">⚠️</div>
        <div style="font-size:15px;color:var(--text);font-family:'Syne',sans-serif;font-weight:800;margin-bottom:8px">Failed to load hackathons</div>
        <div style="margin-bottom:16px">Check your connection and try again</div>
        <button onclick="loadHackathons()" style="background:var(--pg);border:1px solid var(--p);color:var(--pl);padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">⟳ Retry</button>
      </div>`;
    document.getElementById('resultCount').textContent='Failed to load';
  }
}

/* =====================================================================
   DATA — legacy fallback array removed, loaded from Supabase above
   ===================================================================== */

const FEED_POOL=[
  {d:"g",msg:"<strong>Smart India Hackathon</strong> — 1,240 teams registered"},
  {d:"c",msg:"<strong>DevPost AI Hack</strong> — deadline extended by 3 days"},
  {d:"y",msg:"<strong>ETHIndia 2026</strong> — prize pool increased to $65K"},
  {d:"g",msg:"<strong>MLH Hack Day</strong> — new city added: Hyderabad"},
  {d:"r",msg:"<strong>NIT Trichy Hackathon</strong> — registration now closed"},
  {d:"g",msg:"<strong>Solana Grizzlython</strong> — 800 participants online"},
  {d:"y",msg:"<strong>HealthTech Hack</strong> — mentor sign-ups now open"},
  {d:"c",msg:"<strong>Buildspace S5</strong> — 3,200 builders enrolled globally"},
  {d:"g",msg:"<strong>HackerEarth DL Challenge</strong> — new dataset released"},
  {d:"r",msg:"<strong>VIT HackBit 3.0</strong> — only 48 slots remaining!"},
];

const LOAD_MSGS=[
  "// 🔍 Scanning Unstop for new hackathons...",
  "// 📡 Fetching Devpost submissions...",
  "// 🔄 Syncing Devfolio event feed...",
  "// ⚡ Pulling HackerEarth challenges...",
  "// 🏆 Checking MLH event board...",
  "// 🗺️ Aggregating regional college events...",
  "// 🧹 Deduplicating & normalizing data...",
  "// ✅ Sorting by deadline & relevance...",
];

/* =====================================================================
   STATE
   ===================================================================== */
const flt={level:null,team:null,cost:null,mode:null,date:null,status:null};
let activeSrc='all', searchQ='', timeLeft=120;
let pMode='low', afId, particles=[];
const canvas=document.getElementById('particleCanvas');
const ctx=canvas.getContext('2d');

/* =====================================================================
   TICKER
   ===================================================================== */
function buildTicker(){
  const all=[...DB,...DB,...DB];
  document.getElementById('tickerTrack').innerHTML=all.map(h=>
    `<div class="ticker-item"><strong>${h.emoji} ${h.title}</strong><span class="ti-prize">🏆 ${h.prize}</span><span class="ti-src">[${h.source}]</span></div>`
  ).join('');
}

/* =====================================================================
   FEATURED
   ===================================================================== */
function renderFeatured(){
  document.getElementById('featuredScroll').innerHTML=DB.filter(h=>h.featured).map(h=>`
    <a class="featured-card" href="hackathon.html?id=${h.id}" style="text-decoration:none;color:inherit">
      <div class="fimg">${h.emoji}</div>
      <div class="featured-card-body">
        <div class="src-badge src-${h.source}">${h.source.toUpperCase()}</div>
        <div class="featured-card-title">${h.title}</div>
        <div class="featured-card-meta">
          <div class="prize-chip">🏆 ${h.prize}</div>
          <div>📅 ${h.date}</div><div>📍 ${h.location}</div>
        </div>
      </div>
    </a>`).join('');
}

/* =====================================================================
   EVENTS
   ===================================================================== */
const SC={open:'reg-open',closed:'reg-closed',ongoing:'reg-ongoing',upcoming:'reg-upcoming'};
const SL={open:'● REG OPEN',closed:'✕ CLOSED',ongoing:'▶ ONGOING',upcoming:'⏳ UPCOMING'};
const BC={hackathon:'bt-hackathon',datathon:'bt-datathon',sprint:'bt-sprint',competition:'bt-competition',workshop:'bt-workshop',conference:'bt-conference'};
const LM={beginner:'🌱 Beginner',intermediate:'⚡ Intermediate',advanced:'🔥 Advanced'};
const TM={solo:'Solo',small:'2–4 members',large:'5+ members'};
const MM={online:'🌐 Online',offline:'🏟️ Offline',hybrid:'🤝 Hybrid'};

function renderEvents(animate=false){
  const allData=getFilteredData();
  const total=allData.length;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(currentPage>totalPages)currentPage=totalPages;
  const data=allData.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
  document.getElementById('resultCount').textContent=`Showing ${total} events`;
  renderPageNumbers(total);
  const el=document.getElementById('eventsList');
  if(!total){
    el.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:44px;margin-bottom:14px">👻</div><div style="font-size:16px;color:var(--text);font-family:'Syne',sans-serif;font-weight:800;margin-bottom:8px">No hackathons found</div><div>Try <button onclick="clearAll()" style="background:none;border:none;color:var(--pl);cursor:pointer;font-size:13px;font-weight:600">clearing all filters</button></div></div>`;
    return;
  }
  el.innerHTML=data.map((h,i)=>`
    <a class="event-card${animate?' new-card':''}" style="${animate?`animation-delay:${i*.055}s`:''};text-decoration:none;color:inherit" href="hackathon.html?id=${h.id}">
      <div class="ec-img"><div class="fimg2">${h.emoji}</div></div>
      <div class="ec-body">
        <div class="ec-top">
          <div class="ec-badges">
            <span class="etype ${BC[h.type]||'bt-hackathon'}">${h.type.toUpperCase()}</span>
            <span class="src-badge src-${h.source}">${h.source.toUpperCase()}</span>
          </div>
          <span class="reg ${SC[h.status]}">${SL[h.status]}</span>
        </div>
        <div class="ec-title">${h.title}</div>
        <div class="ec-org">🏛️ <strong>${h.org}</strong></div>
        <div class="ec-meta">
          <div class="mchip prize">🏆 ${h.prize}</div>
          <div class="mchip ${h.cost}">${h.cost==='free'?'💸 Free Entry':'💳 Paid'}</div>
          <div class="mchip beginner">${LM[h.level]}</div>
          <div class="mchip team">👥 ${TM[h.team]}</div>
          <div class="mchip">${MM[h.mode]}</div>
        </div>
        <div class="ec-footer">
          <div class="ec-fi">📍 <span class="city-link">${h.location}</span></div>
          <div class="ec-fi">📅 <span class="val">${h.date}</span></div>
          <div class="ec-fi">⏰ Deadline: <span class="val">${h.deadline}</span></div>
          <span style="margin-left:auto;font-size:11.5px;color:var(--pl);font-weight:700">View Details →</span>
        </div>
      </div>
    </a>`).join('');
}

/* =====================================================================
   FILTER CHIPS
   ===================================================================== */
document.querySelectorAll('.chip[data-f]').forEach(c=>{
  c.addEventListener('click',()=>{
    const f=c.dataset.f,v=c.dataset.v;
    if(f==='loc'){
      if(locFilter===v){locFilter=null;c.classList.remove('active');}
      else{document.querySelectorAll('.chip[data-f="loc"]').forEach(x=>x.classList.remove('active'));locFilter=v;c.classList.add('active');}
    } else {
      if(flt[f]===v){flt[f]=null;c.classList.remove('active');}
      else{document.querySelectorAll(`.chip[data-f="${f}"]`).forEach(x=>x.classList.remove('active'));flt[f]=v;c.classList.add('active');}
    }
    currentPage=1;
    renderEvents(true);
  });
});

function clearAll(){
  Object.keys(flt).forEach(k=>flt[k]=null);
  locFilter=null;currentPage=1;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  searchQ='';document.getElementById('searchInput').value='';
  activeSrc='all';
  document.querySelectorAll('.source-pill').forEach(p=>p.classList.remove('active'));
  document.querySelector('.source-pill[data-source="all"]').classList.add('active');
  document.querySelectorAll('.browse-chip').forEach(c=>c.classList.remove('active'));
  renderEvents(true);
}

/* SOURCE PILLS */
document.querySelectorAll('#sourcePills .source-pill').forEach(p=>{
  p.addEventListener('click',()=>{
    document.querySelectorAll('.source-pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');activeSrc=p.dataset.source;renderEvents(true);
  });
});

/* SEARCH — live debounced */
let sTimer;
document.getElementById('searchInput').addEventListener('input',e=>{
  clearTimeout(sTimer);
  sTimer=setTimeout(()=>{searchQ=e.target.value.trim();renderEvents(true);},220);
});
function runSearch(){searchQ=document.getElementById('searchInput').value.trim();renderEvents(true);}

/* =====================================================================
   LIVE FEED
   ===================================================================== */
function renderFeed(){
  document.getElementById('liveFeed').innerHTML=FEED_POOL.slice(0,6).map(f=>`
    <div class="feed-item">
      <div class="fdot ${f.d}"></div>
      <div class="ftext">${f.msg}</div>
      <div class="ftime">${f.t||'just now'}</div>
    </div>`).join('');
}

function rotateFeed(){
  const evts=['new team registered!','registration spike 🔥','prize pool updated 💰','deadline approaching ⏰','slots filling fast!','new sponsor added ✨'];
  FEED_POOL.unshift({
    d:['g','c','y','r'][Math.floor(Math.random()*4)],
    msg:`<strong>${DB[Math.floor(Math.random()*DB.length)].title}</strong> — ${evts[Math.floor(Math.random()*evts.length)]}`,
    t:'just now'
  });
  FEED_POOL.length=10;
  FEED_POOL.slice(1).forEach((f,i)=>{f.t=`${(i+1)*3} min ago`;});
  renderFeed();
  // flash in refresh bar
  const slot=document.getElementById('flashSlot');
  slot.innerHTML=`<div class="live-flash"><span class="live-dot"></span>${FEED_POOL[0].msg}</div>`;
  setTimeout(()=>slot.innerHTML='',4000);
}

/* =====================================================================
   ANIMATED COUNTER
   ===================================================================== */
function counter(el,from,to,dur=1100){
  const t0=performance.now();
  (function step(now){
    const p=Math.min((now-t0)/dur,1),e=1-Math.pow(1-p,3);
    el.textContent=Math.round(from+(to-from)*e).toLocaleString('en-IN');
    if(p<1)requestAnimationFrame(step);
  })(t0);
}

/* =====================================================================
   LIVE CLOCK
   ===================================================================== */
function tick(){document.getElementById('topClock').textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' IST';}
setInterval(tick,1000);tick();

/* =====================================================================
   AUTO-REFRESH EVERY 2 MINUTES
   ===================================================================== */
function triggerRefresh(){
  const ov=document.getElementById('loadingOverlay');
  const lt=document.getElementById('loadText');
  const pb=document.getElementById('loadPbar');
  ov.classList.add('visible');
  pb.style.animation='none';pb.offsetHeight;pb.style.animation='';
  let i=0;
  const iv=setInterval(()=>{lt.textContent=LOAD_MSGS[i++%LOAD_MSGS.length];},300);
  setTimeout(()=>{
    clearInterval(iv);ov.classList.remove('visible');
    timeLeft=120;
    const n=840+Math.floor(Math.random()*18);
    counter(document.getElementById('statOpen'),parseInt(document.getElementById('statOpen').textContent.replace(/,/g,'')||0),n);
    counter(document.getElementById('sOpen'),parseInt(document.getElementById('sOpen').textContent.replace(/,/g,'')||0),n);
    document.getElementById('lastUpd').textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    rotateFeed();
    toast('⚡',`Live data synced — ${n.toLocaleString('en-IN')} open hackathons!`);
  },2200+Math.random()*500);
}

setInterval(()=>{
  timeLeft=Math.max(0,timeLeft-1);
  if(timeLeft===0){triggerRefresh();return;}
  const m=Math.floor(timeLeft/60),s=timeLeft%60;
  document.getElementById('cdown').textContent=`${m}:${s.toString().padStart(2,'0')}`;
  document.getElementById('pbar').style.width=(timeLeft/120*100)+'%';
},1000);

setInterval(rotateFeed,11000);

/* =====================================================================
   TOAST
   ===================================================================== */
function toast(icon,msg){
  document.getElementById('toastIcon').textContent=icon;
  document.getElementById('toastMsg').textContent=msg;
  const t=document.getElementById('toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4500);
}

/* =====================================================================
   SPA NAVIGATION
   ===================================================================== */
function navTo(page){
  const pages={
    main:'mainPage', about:'aboutPage',
    post:'postPage', profile:'profilePage', project:'projectPage'
  };
  Object.entries(pages).forEach(([key,id])=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle('active', key===page);
  });
  window.scrollTo({top:0,behavior:'smooth'});
  closeDetailPanel();
  if(page==='profile') loadProfilePage();
}

/* =====================================================================
   HACKATHON DETAIL PANEL
   ===================================================================== */
let currentHack=null;
const HACK_DESCS={
  19:"Smart India Hackathon is a nationwide initiative that provides students a platform to solve some pressing problems we face in our daily lives, and thus inculcate a culture of product innovation and a mindset of problem solving. Teams will build solutions aligned with government priority areas including agriculture, education, health, and smart cities.",
  20:"Google DeepMind and Devpost have joined hands for one of the largest global AI hackathons of 2026. Build LLM-powered applications, fine-tune models, or create novel AI tools. Open to all skill levels — beginners to veterans. Top projects get direct visibility to DeepMind engineers.",
  21:"ETHIndia is India's flagship Ethereum hackathon, organised by Devfolio in collaboration with the Ethereum Foundation. Hackers build decentralised apps, DeFi protocols, NFT platforms, and Web3 tooling. Past winners have gone on to raise millions in seed funding.",
  22:"An ongoing deep learning challenge on HackerEarth where participants tackle computer vision, NLP, and reinforcement learning problems on curated datasets. Compete on the public leaderboard and earn certifications along with cash prizes.",
  23:"MLH Local Hack Day is a 12-hour global hackathon with synchronised events across multiple cities. Perfect for beginners and those new to hackathons. Build anything you want with a small team, earn MLH swag, and get hands-on experience.",
  24:"A focused FinTech hackathon targeting innovations in UPI payments, digital banking, credit scoring, and open finance APIs. Strong corporate mentorship and potential for fast-tracking your idea to a real banking pilot.",
  25:"IIT Bombay's annual Techfest hackathon is one of Asia's largest technical festivals. Teams compete on cutting-edge problem statements across AI, robotics, sustainability, and smart infrastructure. IIT Bombay alumni mentors are on hand throughout the event.",
  26:"Organised by NASSCOM Foundation, Climate Hack India challenges participants to build tech solutions for climate change, carbon tracking, sustainable supply chains, and clean energy. Strong NGO and government partnerships for real-world impact.",
  27:"Quark is BITS Pilani's annual technical festival hackathon. Teams of up to 5 compete over 36 hours on open-ended and sponsored problem statements. One of the most prestigious college hackathons in India with a thriving alumni network.",
  28:"A month-long open source sprint where developers contribute to FOSSASIA projects and GitHub-hosted repositories. Earn certifications, swag, and recognition in the global open source community. No experience required — all skill levels welcome.",
  29:"A national-level Capture the Flag (CTF) cybersecurity competition by EC-Council India. Participants solve challenges across web exploitation, reverse engineering, cryptography, forensics, and OSINT. Top performers get EC-Council certifications.",
  30:"NIT Trichy's annual Pragyan hackathon features intense 24-hour problem-solving across computer science, electronics, and interdisciplinary domains. Note: registrations for this edition are now closed.",
  31:"A hybrid hackathon co-organised by Practo and Microsoft, focusing on digital health, telemedicine, AI diagnostics, and mental health platforms. Access to Microsoft Azure credits and Practo APIs for all participants.",
  32:"Buildspace S5 is a 6-week global cohort where founders and builders work on their startup ideas in public. Weekly drops, peer accountability, and a final demo day with investor attention. Remote-first and completely free.",
  33:"VIT Vellore HackBit 3.0 is VIT's flagship 24-hour hackathon. Open to all college students across India. Solve real-world problems with tech across domains including FinTech, HealthTech, and EdTech. Food and accommodation included for outstation participants.",
  34:"ICAR's AgriTech Hackathon invites solutions for crop monitoring, precision farming, supply chain transparency, and rural fintech. Work alongside agricultural scientists and domain experts. Government procurement pathways available for winning solutions.",
  35:"Solana Grizzlython is one of the world's richest Web3 hackathons with $200,000 in prizes. Build dApps, DeFi protocols, NFT marketplaces, and developer tools on the Solana blockchain. Fully online and open to global participants.",
  36:"Anna University's annual HackThon is a 36-hour intra and inter-college hackathon held at the main Chennai campus. Focus areas include smart city solutions, AI/ML applications, and civic tech. Open to all B.E./B.Tech students.",
};

function openDetail(id){
  const h=DB.find(x=>x.id===id);
  if(!h)return;
  currentHack=h;
  const SC2={open:'reg-open',closed:'reg-closed',ongoing:'reg-ongoing',upcoming:'reg-upcoming'};
  const SL2={open:'● REG OPEN',closed:'✕ CLOSED',ongoing:'▶ ONGOING',upcoming:'⏳ UPCOMING'};
  document.getElementById('dpEmoji').textContent=h.emoji;
  document.getElementById('dpTitle').textContent=h.title;
  document.getElementById('dpOrg').innerHTML=`🏛️ <strong>${h.org}</strong>`;
  document.getElementById('dpPrize').innerHTML=`🏆 ${h.prize}`;
  document.getElementById('dpBadges').innerHTML=`
    <span class="etype ${BC[h.type]||'bt-hackathon'}">${h.type.toUpperCase()}</span>
    <span class="src-badge src-${h.source}">${h.source.toUpperCase()}</span>
    <span class="reg ${SC2[h.status]}">${SL2[h.status]}</span>`;
  // deadline urgency
  const dlBar=document.getElementById('dpDeadlineBar');
  const isClosed=h.status==='closed';
  const isOngoing=h.deadline==='Ongoing';
  const cls=isClosed?'':'safe';
  dlBar.innerHTML=`<div class="deadline-bar ${isOngoing?'safe':isClosed?'':'warn'}">
    <span style="font-size:16px">${isOngoing?'🔄':isClosed?'🔒':'⏰'}</span>
    <span>${isOngoing?'Rolling deadline — enter anytime':isClosed?`Registration closed · Deadline was ${h.deadline}`:`Registration deadline: <strong>${h.deadline}</strong>`}</span>
  </div>`;
  document.getElementById('dpInfoGrid').innerHTML=`
    <div class="dp-info-item"><div class="dp-info-label">📅 Event Date</div><div class="dp-info-val">${h.date}</div></div>
    <div class="dp-info-item"><div class="dp-info-label">📍 Location</div><div class="dp-info-val">${h.location}</div></div>
    <div class="dp-info-item"><div class="dp-info-label">🌐 Mode</div><div class="dp-info-val">${MM[h.mode]}</div></div>
    <div class="dp-info-item"><div class="dp-info-label">👥 Team Size</div><div class="dp-info-val">${TM[h.team]}</div></div>
    <div class="dp-info-item"><div class="dp-info-label">🎯 Level</div><div class="dp-info-val">${LM[h.level]}</div></div>
    <div class="dp-info-item"><div class="dp-info-label">💰 Cost</div><div class="dp-info-val">${h.cost==='free'?'💸 Free Entry':'💳 Paid'}</div></div>`;
  document.getElementById('dpDesc').textContent=HACK_DESCS[h.id]||h.description||`${h.title} is a ${h.type} organised by ${h.org}. Visit the official page for full details, problem statements, and registration instructions.`;
  document.getElementById('dpTags').innerHTML=h.tags.map(t=>`<span class="dp-tag">${t}</span>`).join('');
  const regBtn=document.getElementById('dpRegBtn');
  regBtn.textContent=isClosed?'🔒 Registration Closed':'🚀 Register Now';
  regBtn.disabled=isClosed;
  regBtn.style.opacity=isClosed?'0.5':'1';
  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeDetail(e){
  if(e&&e.target!==document.getElementById('detailOverlay'))return;
  closeDetailPanel();
}
function closeDetailPanel(){
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  document.body.style.overflow='';
}
function openReg(){
  if(!currentHack)return;
  if(currentHack.status==='closed'){toast('🔒','Registration is closed for this hackathon');return;}
  // if hackathon has a real registration URL, open it
  if(currentHack.url){
    window.open(currentHack.url,'_blank','noopener,noreferrer');
    toast('🚀',`Opening registration for ${currentHack.title}`);
  } else {
    // hackathon was posted on Phantom Hacks — show registration form
    openRegForm();
  }
}
async function saveHack(){
  if(!currentHack)return;
  const{data:{user}}=await supa.auth.getUser();
  if(!user){openAuth('signin');toast('🔖','Sign in to save hackathons');return;}
  // check if already saved
  const{data:existing}=await supa.from('saved_hackathons')
    .select('id').eq('user_id',user.id).eq('hackathon_id',currentHack.id).single();
  if(existing){
    await supa.from('saved_hackathons').delete().eq('id',existing.id);
    toast('🗑️',`Removed from saves`);
    document.getElementById('dpRegBtn').nextElementSibling.textContent='🔖 Save';
  } else {
    await supa.from('saved_hackathons').insert({user_id:user.id,hackathon_id:currentHack.id});
    toast('🔖',`${currentHack.title} saved!`);
    document.getElementById('dpRegBtn').nextElementSibling.textContent='✅ Saved';
  }
}
function shareHack(){
  if(currentHack){
    if(navigator.share){navigator.share({title:currentHack.title,text:`Check out ${currentHack.title} — ${currentHack.prize}!`,url:window.location.href});}
    else{toast('📋','Link copied to clipboard!');}
  }
}

/* =====================================================================
   SUBMIT HACKATHON FORM
   ===================================================================== */
async function postHackathon(){
  window.location.href='post.html';
}

/* =====================================================================
   SORT
   ===================================================================== */
function parsePrize(str){
  if(!str)return 0;
  const s=str.replace(/,/g,'');
  const cr=s.match(/₹([\d.]+)\s*Cr/i);if(cr)return parseFloat(cr[1])*10000000;
  const lac=s.match(/₹([\d.]+)\s*L/i);if(lac)return parseFloat(lac[1])*100000;
  const inr=s.match(/₹([\d,]+)/);if(inr)return parseInt(inr[1].replace(/,/g,''));
  const usd=s.match(/\$([\d,]+)/);if(usd)return parseInt(usd[1].replace(/,/g,''))*84;
  return 0;
}

function toggleSort(e){
  e.stopPropagation();
  document.getElementById('sortWrap').classList.toggle('open');
}
document.addEventListener('click',e=>{
  const sw=document.getElementById('sortWrap');
  if(sw&&!sw.contains(e.target))sw.classList.remove('open');
});

function applySort(sort,label,el){
  currentSort=sort;
  currentPage=1;
  document.getElementById('sortLabel').textContent='Sort: '+label+' ↓';
  document.querySelectorAll('.sort-option').forEach(o=>o.classList.remove('active'));
  if(el)el.classList.add('active');
  document.getElementById('sortWrap').classList.remove('open');
  renderEvents(true);
  navTo('main');
}

function sortData(data){
  const d=[...data];
  if(currentSort==='latest') return d;
  if(currentSort==='name') return d.sort((a,b)=>a.title.localeCompare(b.title));
  if(currentSort==='prize-high') return d.sort((a,b)=>parsePrize(b.prize)-parsePrize(a.prize));
  if(currentSort==='prize-low') return d.sort((a,b)=>parsePrize(a.prize)-parsePrize(b.prize));
  if(currentSort==='deadline'){
    const order={open:1,ongoing:2,upcoming:3,closed:4};
    return d.sort((a,b)=>(order[a.status]||9)-(order[b.status]||9));
  }
  return d;
}

/* =====================================================================
   PAGINATION
   ===================================================================== */
function renderPageNumbers(total){
  const totalPages=Math.ceil(total/PAGE_SIZE);
  const wrap=document.getElementById('pageNumbers');
  wrap.innerHTML='';
  for(let i=1;i<=totalPages;i++){
    const btn=document.createElement('div');
    btn.className='page-btn'+(i===currentPage?' active':'');
    btn.textContent=i;
    btn.onclick=(()=>{const p=i;return()=>{currentPage=p;renderEvents(false);}})();
    wrap.appendChild(btn);
  }
  document.getElementById('prevBtn').style.opacity=currentPage===1?'0.4':'1';
  document.getElementById('nextBtn').style.opacity=currentPage===totalPages||totalPages===0?'0.4':'1';
}

function changePage(dir){
  const allData=getFilteredData();
  const totalPages=Math.ceil(allData.length/PAGE_SIZE);
  currentPage=Math.max(1,Math.min(totalPages,currentPage+dir));
  renderEvents(false);
}

/* =====================================================================
   LOCATION FILTER
   ===================================================================== */
document.querySelectorAll('.chip[data-f="loc"]').forEach(c=>{
  c.addEventListener('click',()=>{
    const v=c.dataset.v;
    if(locFilter===v){locFilter=null;c.classList.remove('active');}
    else{
      document.querySelectorAll('.chip[data-f="loc"]').forEach(x=>x.classList.remove('active'));
      locFilter=v;c.classList.add('active');
    }
    currentPage=1;renderEvents(true);
  });
});

/* =====================================================================
   UPDATED getFilteredData + renderEvents with sort, pagination, loc
   ===================================================================== */
function getFilteredData(){
  let data=[...DB];
  if(activeSrc!=='all') data=data.filter(h=>h.source===activeSrc);
  if(searchQ){const q=searchQ.toLowerCase();data=data.filter(h=>h.title.toLowerCase().includes(q)||h.org.toLowerCase().includes(q)||h.location.toLowerCase().includes(q)||h.tags.some(t=>t.toLowerCase().includes(q)));}
  Object.entries(flt).forEach(([k,v])=>{if(v)data=data.filter(h=>h[k]===v);});
  if(locFilter) data=data.filter(h=>h.location.toLowerCase().includes(locFilter.toLowerCase()));
  return sortData(data);
}

/* =====================================================================
   PRIZE BOARD
   ===================================================================== */
function filterPrizeBoard(f,el){
  pbFilter=f;
  document.querySelectorAll('.pb-filter-btn').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  renderPrizeBoard();
}

function renderPrizeBoard(){
  let data=[...DB];
  if(pbFilter==='inr') data=data.filter(h=>h.prize.includes('₹'));
  if(pbFilter==='usd') data=data.filter(h=>h.prize.includes('$'));
  data.sort((a,b)=>parsePrize(b.prize)-parsePrize(a.prize));
  const SC2={open:'reg-open',closed:'reg-closed',ongoing:'reg-ongoing',upcoming:'reg-upcoming'};
  const SL2={open:'● OPEN',closed:'✕ CLOSED',ongoing:'▶ ONGOING',upcoming:'⏳ UPCOMING'};
  const rankClass=(i)=>i===0?'gold':i===1?'silver':i===2?'bronze':'normal';
  const rankIcon=(i)=>i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
  document.getElementById('pbBody').innerHTML=data.map((h,i)=>`
    <tr onclick="window.location.href='hackathon.html?id=${h.id}'" style="cursor:pointer">
      <td><div class="pb-rank ${rankClass(i)}">${rankIcon(i)}</div></td>
      <td><div class="pb-name">${h.emoji} ${h.title}</div><div class="pb-org">${h.org}</div></td>
      <td><div class="pb-prize">${h.prize}</div></td>
      <td><div class="pb-mode">${MM[h.mode]}</div></td>
      <td><div class="pb-deadline">${h.deadline}</div></td>
      <td><span class="pb-status ${SC2[h.status]}">${SL2[h.status]}</span></td>
    </tr>`).join('');
}

function scrollToPrizeBoard(){
  navTo('main');
  setTimeout(()=>document.getElementById('prizeBoardSection').scrollIntoView({behavior:'smooth',block:'start'}),100);
}

/* =====================================================================
   CALENDAR POPUP
   ===================================================================== */
let calYear=2026, calMonth=3; // April 2026 (0-indexed)

const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];

function openCalendar(){
  const now=new Date();
  calYear=now.getFullYear();calMonth=now.getMonth();
  renderCalendar();
  document.getElementById('calOverlay').classList.add('open');
  document.getElementById('calPopup').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeCalendar(e){
  if(e&&e.target!==document.getElementById('calOverlay'))return;
  closeCalendarDirect();
}
function closeCalendarDirect(){
  document.getElementById('calOverlay').classList.remove('open');
  document.getElementById('calPopup').classList.remove('open');
  document.body.style.overflow='';
}
function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}

function parseHackDate(dateStr){
  // Try to extract start date from strings like "Apr 10–12, 2026" or "Apr 1–14, 2026"
  const m=dateStr.match(/([A-Za-z]+)\s+(\d+)/);
  if(!m)return null;
  const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const mo=months[m[1].slice(0,3)];
  if(mo===undefined)return null;
  const yr=dateStr.match(/(\d{4})/);
  return new Date(yr?parseInt(yr[1]):2026, mo, parseInt(m[2]));
}

function renderCalendar(){
  document.getElementById('calMonthLabel').textContent=MONTH_NAMES[calMonth]+' '+calYear;
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  // Map hackathons to their start date day in this month
  const hackMap={};
  DB.forEach(h=>{
    const d=parseHackDate(h.date);
    if(d&&d.getFullYear()===calYear&&d.getMonth()===calMonth){
      const day=d.getDate();
      if(!hackMap[day])hackMap[day]=[];
      hackMap[day].push(h);
    }
  });
  let html='';
  // Leading empty cells
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day other-month"><div class="cal-day-num">&nbsp;</div></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const isToday=today.getDate()===d&&today.getMonth()===calMonth&&today.getFullYear()===calYear;
    const hacks=hackMap[d]||[];
    const hasEv=hacks.length>0;
    html+=`<div class="cal-day${isToday?' today':''}${hasEv?' has-event':''}">
      <div class="cal-day-num">${d}</div>
      ${hacks.slice(0,2).map(h=>`<span class="cal-event-chip cal-chip-${h.status}" onclick="openDetailFromCal(${h.id})">${h.emoji} ${h.title.split(' ')[0]}</span>`).join('')}
      ${hacks.length>2?`<span class="cal-event-chip cal-chip-open">+${hacks.length-2} more</span>`:''}
    </div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}

function openDetailFromCal(id){
  closeCalendarDirect();
  setTimeout(()=>openDetail(id),300);
}

/* =====================================================================
   SIDEBAR BROWSE BY
   ===================================================================== */
function toggleBrowse(id){
  const item=document.getElementById(id);
  const wasOpen=item.classList.contains('open');
  document.querySelectorAll('.browse-item').forEach(i=>i.classList.remove('open'));
  if(!wasOpen)item.classList.add('open');
}

function initBrowseBy(){
  // Cities
  const cities=[...new Set(DB.map(h=>h.location).filter(l=>l!=='Online'&&!l.includes('/'))
    .flatMap(l=>l.split(',').map(x=>x.trim())))].filter(Boolean);
  document.getElementById('bCityPanel').innerHTML=cities.map(c=>
    `<div class="browse-chip" onclick="browseFilter('loc','${c}',this)">${c}</div>`).join('');
  // States
  const states=['Tamil Nadu','Maharashtra','Karnataka','Delhi','Goa','Rajasthan'];
  document.getElementById('bStatePanel').innerHTML=states.map(s=>
    `<div class="browse-chip" onclick="browseSearch('${s}')">${s}</div>`).join('');
  // College Fests
  const colleges=DB.filter(h=>h.source==='local').map(h=>h.org);
  document.getElementById('bCollegePanel').innerHTML=colleges.map(c=>
    `<div class="browse-chip" onclick="browseSearch('${c.split(' ').slice(0,2).join(' ')}')">${c.split(' ').slice(0,3).join(' ')}</div>`).join('');
  // Prize ranges
  const prizes=['Free Entry','₹1L+','₹5L+','$10K+'];
  const prizeActions=[`browseFilter('cost','free',this)`,`browsePrize(100000)`,`browsePrize(500000)`,`browsePrize(840000)`];
  document.getElementById('bPrizePanel').innerHTML=prizes.map((p,i)=>
    `<div class="browse-chip" onclick="${prizeActions[i]}">${p}</div>`).join('');
  // Tech Stack
  const stacks=['AI/ML','Web3','Blockchain','FinTech','HealthTech','IoT','Cybersecurity','Open Source'];
  document.getElementById('bStackPanel').innerHTML=stacks.map(s=>
    `<div class="browse-chip" onclick="browseSearch('${s}')">${s}</div>`).join('');
  // Category
  const cats=['Hackathon','Datathon','Sprint','Competition','Workshop','Conference'];
  document.getElementById('bCatPanel').innerHTML=cats.map(c=>
    `<div class="browse-chip" onclick="browseFilter('type','${c.toLowerCase()}',this)">${c}</div>`).join('');
}

function browseFilter(key,val,el){
  if(key==='loc'){
    locFilter=val;
    document.querySelectorAll('.chip[data-f="loc"]').forEach(x=>x.classList.remove('active'));
    const match=document.querySelector(`.chip[data-f="loc"][data-v="${val}"]`);
    if(match)match.classList.add('active');
  } else {
    flt[key]=val;
    document.querySelectorAll(`.chip[data-f="${key}"]`).forEach(x=>x.classList.remove('active'));
    const match=document.querySelector(`.chip[data-f="${key}"][data-v="${val}"]`);
    if(match)match.classList.add('active');
  }
  currentPage=1;
  renderEvents(true);
  navTo('main');
  toast('🔍',`Filtering by: ${val}`);
  document.querySelectorAll('.browse-chip').forEach(c=>c.classList.remove('active'));
  if(el)el.classList.add('active');
}

function browseSearch(q){
  searchQ=q;
  document.getElementById('searchInput').value=q;
  currentPage=1;
  renderEvents(true);
  navTo('main');
  toast('🔍',`Searching: ${q}`);
}

function browsePrize(minVal){
  // filter cards where parsed prize >= minVal
  searchQ='';
  currentPage=1;
  // Use a custom temp filter via sort
  applySort('prize-high','Prize: Highest',document.querySelector('.sort-option[data-sort="prize-high"]'));
  navTo('main');
  toast('🏆',`Showing highest prize hackathons`);
}

/* =====================================================================
   NAV FILTER HELPER
   ===================================================================== */
function applyNavFilter(key,val){
  clearAll();
  if(key==='type'){
    // type isn't in flt, use search
    searchQ=val;
    document.getElementById('searchInput').value=val;
  } else if(key&&val){
    flt[key]=val;
    const match=document.querySelector(`.chip[data-f="${key}"][data-v="${val}"]`);
    if(match)match.classList.add('active');
  }
  currentPage=1;
  renderEvents(true);
  navTo('main');
  scrollToCards();
}

function applySourceFilter(src){
  activeSrc=src;
  document.querySelectorAll('.source-pill').forEach(p=>p.classList.remove('active'));
  const pill=document.querySelector(`.source-pill[data-source="${src}"]`);
  if(pill)pill.classList.add('active');
  currentPage=1;
  renderEvents(true);
  navTo('main');
  scrollToCards();
  toast('📡',`Filtering by source: ${src}`);
}

function scrollToCards(){
  navTo('main');
  setTimeout(()=>{
    const el=document.getElementById('eventsList');
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  },100);
}

function scrollToFeatured(){
  navTo('main');
  setTimeout(()=>{
    const el=document.getElementById('featuredScroll');
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  },100);
}

function tagSearch(q){
  searchQ=q;
  document.getElementById('searchInput').value=q;
  currentPage=1;
  renderEvents(true);
  navTo('main');
  scrollToCards();
}

/* =====================================================================
   THEME PANEL
   ===================================================================== */
function toggleThemePanel(e){
  e.stopPropagation();
  document.getElementById('themePanel').classList.toggle('open');
}
document.addEventListener('click',e=>{
  const p=document.getElementById('themePanel');
  if(!p.contains(e.target)&&e.target.id!=='themePaletteBtn')p.classList.remove('open');
});

function setMode(mode){
  document.documentElement.setAttribute('data-theme',mode);
  document.getElementById('modeDark').classList.toggle('active',mode==='dark');
  document.getElementById('modeLight').classList.toggle('active',mode==='light');
  initParticles();
  toast(mode==='dark'?'🌑':'☀️',`Switched to ${mode} mode`);
}

function setColor(color){
  document.documentElement.setAttribute('data-color',color);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.c===color));
  initParticles();
  toast('🎨',`Theme color → ${color}`);
}

function setFontSize(v){
  document.documentElement.style.setProperty('--fs',v+'px');
  document.getElementById('fsLabel').textContent=v+'px';
  const pct=((v-12)/(18-12))*100;
  document.getElementById('fsSlider').style.setProperty('--fill',pct+'%');
}

function setParticles(mode,el){
  pMode=mode;
  document.querySelectorAll('.tp-mini').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  if(mode==='off'){if(afId)cancelAnimationFrame(afId);afId=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  else initParticles();
}

/* =====================================================================
   PARTICLE SYSTEM
   ===================================================================== */
function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
window.addEventListener('resize',()=>{resizeCanvas();if(pMode!=='off')initParticles();});
resizeCanvas();

function getRGB(){
  const m={purple:'157,78,221',blue:'37,99,235',cyan:'8,145,178',green:'22,163,74',rose:'225,29,72',orange:'234,88,12',amber:'217,119,6',indigo:'79,70,229'};
  return m[document.documentElement.getAttribute('data-color')]||'157,78,221';
}

function initParticles(){
  if(pMode==='off')return;
  cancelAnimationFrame(afId);
  const n=pMode==='high'?85:32,rgb=getRGB();
  particles=Array.from({length:n},()=>({
    x:Math.random()*canvas.width,y:Math.random()*canvas.height,
    r:Math.random()*1.8+.3,vx:(Math.random()-.5)*.38,vy:(Math.random()-.5)*.38,
    a:Math.random()*.5+.1,rgb,pulse:Math.random()*Math.PI*2
  }));
  animP();
}

function animP(){
  if(pMode==='off')return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const rgb=getRGB();
  const maxD=pMode==='high'?130:95;
  particles.forEach(p=>{
    p.rgb=rgb;p.pulse+=.013;p.x+=p.vx;p.y+=p.vy;
    if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;
    if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;
    const a=p.a*(.65+.35*Math.sin(p.pulse));
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=`rgba(${rgb},${a})`;ctx.fill();
  });
  for(let i=0;i<particles.length;i++){
    for(let j=i+1;j<particles.length;j++){
      const dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<maxD){
        ctx.beginPath();ctx.moveTo(particles[i].x,particles[i].y);ctx.lineTo(particles[j].x,particles[j].y);
        ctx.strokeStyle=`rgba(${rgb},${.13*(1-d/maxD)})`;ctx.lineWidth=.5;ctx.stroke();
      }
    }
  }
  afId=requestAnimationFrame(animP);
}

/* =====================================================================
   INIT
   ===================================================================== */
(function init(){
  buildTicker();
  renderFeed();
  initParticles();
  initBrowseBy();
  // show skeleton loading state
  document.getElementById('eventsList').innerHTML=`
    <div style="text-align:center;padding:60px 20px;color:var(--muted)">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--pl)">// Loading hackathons from Supabase...</div>
    </div>`;
  document.getElementById('resultCount').textContent='Loading...';
  // load real data from Supabase
  loadHackathons();
  setTimeout(rotateFeed,8000);
  setTimeout(()=>toast('👻','Phantom Hacks loaded — connecting to database...'),600);
  document.querySelector('.logo').addEventListener('click',e=>{e.preventDefault();navTo('main');});
})();

/* =====================================================================
   MOBILE DRAWER
   ===================================================================== */
function toggleDrawer(){
  const open=document.getElementById('mobileDrawer').classList.contains('open');
  open?closeDrawer():openDrawer();
}
function openDrawer(){
  document.getElementById('mobileDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('hamburger').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDrawer(){
  document.getElementById('mobileDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.body.style.overflow='';
}
function drawerNav(key,val){
  closeDrawer();
  applyNavFilter(key,val);
}
function drawerNavTo(page){
  closeDrawer();
  navTo(page);
}
function openCalendarDrawer(){
  closeDrawer();
  setTimeout(()=>openCalendar(),200);
}
function drawerScrollPrize(){
  closeDrawer();
  setTimeout(()=>scrollToPrizeBoard(),200);
}
function updateDrawerMode(mode){
  document.getElementById('drawerDark').classList.toggle('active',mode==='dark');
  document.getElementById('drawerLight').classList.toggle('active',mode==='light');
}
// keep drawer mode btn in sync with theme panel
const _origSetMode=setMode;
// patch already-defined setMode to also sync drawer
window.setMode=function(mode){
  _origSetMode(mode);
  updateDrawerMode(mode);
};

/* =====================================================================
   AUTH
   ===================================================================== */
function openAuth(tab='signin'){
  switchAuthTab(tab);
  document.getElementById('authOverlay').classList.add('open');
  document.getElementById('authModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeAuth(){
  document.getElementById('authOverlay').classList.remove('open');
  document.getElementById('authModal').classList.remove('open');
  document.body.style.overflow='';
  // reset form state
  setTimeout(()=>{
    switchAuthTab('signin');
    ['signinEmail','signinPassword','signupName','signupEmail','signupPassword','forgotEmail']
      .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const signinBtn=document.getElementById('signinBtn');
    if(signinBtn){signinBtn.textContent='Sign In';signinBtn.disabled=false;}
    const signupBtn=document.getElementById('signupBtn');
    if(signupBtn){signupBtn.textContent='Create Account';signupBtn.disabled=false;}
  },300);
}
function closeAuthOutside(e){
  if(e.target===document.getElementById('authOverlay'))closeAuth();
}
function switchAuthTab(tab){
  const forms={signin:'formSignin',signup:'formSignup',forgot:'formForgot'};
  const tabs={signin:'tabSignin',signup:'tabSignup'};
  // show/hide forms
  Object.entries(forms).forEach(([key,id])=>{
    const el=document.getElementById(id);
    if(el) el.style.display=key===tab?'block':'none';
  });
  // update tab active state (only signin/signup have tab buttons)
  Object.entries(tabs).forEach(([key,id])=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle('active',key===tab);
  });
  // clear errors when switching
  ['signinError','signupError','forgotError'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.textContent='';el.classList.remove('show');}
  });
}

function setAuthError(id,msg){
  const el=document.getElementById(id);
  el.textContent=msg;el.classList.toggle('show',!!msg);
}
function setAuthSuccess(id,msg){
  const el=document.getElementById(id);
  el.textContent=msg;el.classList.toggle('show',!!msg);
}

async function signIn(){
  const email=document.getElementById('signinEmail').value.trim();
  const password=document.getElementById('signinPassword').value;
  setAuthError('signinError','');
  if(!email||!password){setAuthError('signinError','Please fill in all fields');return;}
  const btn=document.getElementById('signinBtn');
  btn.textContent='Signing in...';btn.disabled=true;
  const{data,error}=await supa.auth.signInWithPassword({email,password});
  if(error){
    // Detect Google-only accounts and give a helpful message
    if(error.message.toLowerCase().includes('invalid login credentials')){
      setAuthError('signinError','Incorrect email or password. If you signed up with Google, use the Google button below.');
    } else {
      setAuthError('signinError',error.message);
    }
    btn.textContent='Sign In';btn.disabled=false;
  } else {
    closeAuth();
    navTo('main');
    const name=data.user.user_metadata?.full_name||data.user.email.split('@')[0];
    toast('👋',`Welcome back, ${name.split(' ')[0]}!`);
  }
}

async function signUp(){
  const name=document.getElementById('signupName').value.trim();
  const email=document.getElementById('signupEmail').value.trim();
  const password=document.getElementById('signupPassword').value;
  setAuthError('signupError','');setAuthSuccess('signupSuccess','');
  if(!name||!email||!password){setAuthError('signupError','Please fill in all fields');return;}
  if(password.length<6){setAuthError('signupError','Password must be at least 6 characters');return;}
  const btn=document.getElementById('signupBtn');
  btn.textContent='Creating account...';btn.disabled=true;
  const{data,error}=await supa.auth.signUp({email,password,options:{data:{full_name:name}}});
  btn.textContent='Create Account';btn.disabled=false;
  if(error){
    setAuthError('signupError',error.message);
  } else if(data?.user?.identities?.length===0){
    // Email already registered
    setAuthError('signupError','An account with this email already exists. Try signing in instead.');
  } else {
    setAuthSuccess('signupSuccess','✅ Account created! Check your email to confirm before signing in.');
    // auto-switch to sign in tab after 3 seconds
    setTimeout(()=>{
      switchAuthTab('signin');
      document.getElementById('signinEmail').value=email;
    },3000);
  }
}

async function signInOAuth(provider){
  // Always redirect back to root — works for both localhost and Vercel
  const redirectTo=window.location.origin+'/';
  const{error}=await supa.auth.signInWithOAuth({
    provider,
    options:{redirectTo}
  });
  if(error)toast('❌',error.message);
}

async function sendReset(){
  const email=document.getElementById('forgotEmail').value.trim();
  setAuthError('forgotError','');setAuthSuccess('forgotSuccess','');
  if(!email){setAuthError('forgotError','Please enter your email');return;}
  const btn=document.getElementById('forgotBtn');
  btn.textContent='Sending...';btn.disabled=true;
  const{error}=await supa.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
  if(error){setAuthError('forgotError',error.message);btn.textContent='Send Reset Link';btn.disabled=false;}
  else{setAuthSuccess('forgotSuccess','✅ Reset link sent — check your email');}
}

async function signOut(){
  await supa.auth.signOut();
  updateNavAuth(null);
  navTo('main');
  toast('👋','Signed out successfully');
}

function updateNavAuth(user){
  const loginBtn=document.getElementById('loginBtn');
  const userWrap=document.getElementById('userNavWrap');
  if(user){
    loginBtn.style.display='none';
    userWrap.style.display='flex';
    const name=user.user_metadata?.full_name||user.email.split('@')[0];
    const initials=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('userAvatar').textContent=initials;
    document.getElementById('userNameNav').textContent=name.split(' ')[0];
  } else {
    loginBtn.style.display='flex';
    userWrap.style.display='none';
  }
}

/* =====================================================================
   PROFILE PAGE — redirects to profile.html standalone page
   ===================================================================== */

/* =====================================================================
   AUTH STATE LISTENER — runs on load and on auth change
   ===================================================================== */
supa.auth.onAuthStateChange((event,session)=>{
  updateNavAuth(session?.user||null);
  if(event==='SIGNED_IN'){
    closeAuth();
    closeDetailPanel();
    // clean up hash from OAuth redirect
    if(window.location.hash&&window.location.hash.includes('access_token')){
      history.replaceState(null,'',window.location.pathname);
    }
    const returnTo=sessionStorage.getItem('returnTo');
    if(returnTo){
      sessionStorage.removeItem('returnTo');
      window.location.href=returnTo;
      return;
    }
    navTo('main');
    window.scrollTo({top:0,behavior:'instant'});
    const name=session.user.user_metadata?.full_name||session.user.email.split('@')[0];
    toast('✅',`Welcome, ${name.split(' ')[0]}! 👋`);
  }
  if(event==='SIGNED_OUT'){
    navTo('main');
    toast('👋','Signed out successfully');
  }
  if(event==='TOKEN_REFRESHED'){
    updateNavAuth(session?.user||null);
  }
});

// init: check auth state on page load (handles OAuth redirect coming back)
(async()=>{
  // If coming back from OAuth (URL has #access_token), Supabase handles it
  // via detectSessionInUrl:true — onAuthStateChange fires SIGNED_IN automatically
  // We just need to clean up the URL
  if(window.location.hash&&window.location.hash.includes('access_token')){
    history.replaceState(null,'',window.location.pathname);
    // Don't call navTo here — onAuthStateChange will handle it
    return;
  }
  const{data:{user}}=await supa.auth.getUser();
  updateNavAuth(user);
  document.getElementById('loginBtn').style.display=user?'none':'flex';
  // handle returnTo after login (from post.html etc)
  const returnTo=sessionStorage.getItem('returnTo');
  if(returnTo&&user){
    sessionStorage.removeItem('returnTo');
    window.location.href=returnTo;
  }
})();

/* =====================================================================
   PROFILE — TABS + SAVE + SKILLS
   ===================================================================== */
let profileSkills=[];

function switchProfileTab(tab,el){
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.profile-section').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('active');
  if(tab==='registrations') loadRegistrations();
}

async function loadProfilePage(){
  const{data:{user}}=await supa.auth.getUser();
  if(!user){navTo('main');openAuth('signin');return;}

  const name=user.user_metadata?.full_name||user.email.split('@')[0];
  const initials=name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('profileAvatarBig').textContent=initials;
  document.getElementById('profileName').textContent=name;
  document.getElementById('profileEmail').textContent=user.email;
  const joined=new Date(user.created_at).toLocaleDateString('en-IN',{year:'numeric',month:'long'});
  document.getElementById('profileJoined').textContent='Member since '+joined;

  // load profile data
  const{data:prof}=await supa.from('profiles').select('*').eq('id',user.id).single();
  if(prof){
    document.getElementById('pFullName').value=prof.full_name||'';
    document.getElementById('pUsername').value=prof.username||'';
    document.getElementById('pAge').value=prof.age||'';
    document.getElementById('pRole').value=prof.role||'';
    document.getElementById('pCollege').value=prof.college||'';
    document.getElementById('pBio').value=prof.bio||'';
    document.getElementById('pGithub').value=prof.github_url||'';
    document.getElementById('pLinkedin').value=prof.linkedin_url||'';
    if(prof.username) document.getElementById('profileUsername').textContent='@'+prof.username;
    if(prof.bio) document.getElementById('profileBio').textContent=prof.bio;
    profileSkills=prof.skills||[];
    renderSkills();
  }

  // stats
  const{data:saves}=await supa.from('saved_hackathons').select('hackathon_id,hackathons(*)').eq('user_id',user.id).order('created_at',{ascending:false});
  const{count:postCount}=await supa.from('hackathons').select('*',{count:'exact',head:true}).eq('source','phantom');
  const{count:regCount}=await supa.from('registrations').select('*',{count:'exact',head:true}).eq('user_id',user.id);
  document.getElementById('profileSaveCount').textContent=saves?.length||0;
  document.getElementById('profilePostCount').textContent=postCount||0;
  document.getElementById('profileRegCount').textContent=regCount||0;

  // render saved cards
  const grid=document.getElementById('savesGrid');
  if(!saves||!saves.length){
    grid.innerHTML=`<div class="empty-saves"><div class="empty-saves-icon">🔖</div><h3>No saves yet</h3><p>Click Save on any hackathon to bookmark it here</p></div>`;
  } else {
    const SC2={open:'reg-open',closed:'reg-closed',ongoing:'reg-ongoing',upcoming:'reg-upcoming'};
    const SL2={open:'● OPEN',closed:'✕ CLOSED',ongoing:'▶ ONGOING',upcoming:'⏳ UPCOMING'};
    grid.innerHTML=saves.map(s=>{
      const h=s.hackathons;if(!h)return'';
      return`<a class="event-card" href="hackathon.html?id=${h.id}" style="cursor:pointer;text-decoration:none;color:inherit">
        <div class="ec-img"><div class="fimg2">${h.emoji}</div></div>
        <div class="ec-body">
          <div class="ec-top"><div class="ec-badges"><span class="src-badge src-${h.source}">${h.source.toUpperCase()}</span></div><span class="reg ${SC2[h.status]}">${SL2[h.status]}</span></div>
          <div class="ec-title">${h.title}</div>
          <div class="ec-org">🏛️ <strong>${h.org}</strong></div>
          <div class="ec-footer"><div class="ec-fi">🏆 <span class="val">${h.prize}</span></div><div class="ec-fi">⏰ <span class="val">${h.deadline}</span></div></div>
        </div>
      </a>`;
    }).join('');
  }

  // populate project hackathon dropdown
  const sel=document.getElementById('projectHackSelect');
  if(sel&&DB.length){
    sel.innerHTML='<option value="">-- Choose a hackathon --</option>'+
      DB.map(h=>`<option value="${h.id}">${h.emoji} ${h.title}</option>`).join('');
  }
}

async function loadRegistrations(){
  const{data:{user}}=await supa.auth.getUser();
  if(!user)return;
  const{data}=await supa.from('registrations').select('*,hackathons(title,emoji,status,deadline)').eq('user_id',user.id).order('created_at',{ascending:false});
  const grid=document.getElementById('registrationsGrid');
  if(!data||!data.length){
    grid.innerHTML=`<div class="empty-saves"><div class="empty-saves-icon">📋</div><h3>No registrations yet</h3><p>Register for a hackathon to see it here</p></div>`;
    return;
  }
  grid.innerHTML=data.map(r=>{
    const h=r.hackathons;
    return`<div class="event-card" style="cursor:default">
      <div class="ec-img"><div class="fimg2">${h?.emoji||'👻'}</div></div>
      <div class="ec-body">
        <div class="ec-title">${h?.title||'Hackathon'}</div>
        <div class="ec-org">👤 <strong>${r.full_name}</strong> · ${r.college||'—'}</div>
        <div class="ec-footer">
          <div class="ec-fi">👥 Team: <span class="val">${r.team_name||'Solo'}</span></div>
          <div class="ec-fi">📅 <span class="val">${new Date(r.created_at).toLocaleDateString('en-IN')}</span></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderSkills(){
  const wrap=document.getElementById('skillsWrap');
  if(!wrap)return;
  wrap.innerHTML=profileSkills.map((s,i)=>
    `<div class="skill-chip">${s}<span onclick="removeSkill(${i})">×</span></div>`).join('');
}
function addSkill(){
  const inp=document.getElementById('skillInput');
  const val=inp.value.trim();
  if(!val||profileSkills.includes(val))return;
  profileSkills.push(val);
  renderSkills();
  inp.value='';
}
function removeSkill(i){profileSkills.splice(i,1);renderSkills();}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.activeElement?.id==='skillInput')addSkill();});

async function saveProfile(){
  const{data:{user}}=await supa.auth.getUser();
  if(!user)return;
  const btn=document.querySelector('.edit-save-btn');
  btn.textContent='Saving...';btn.disabled=true;
  const payload={
    id:user.id,
    full_name:document.getElementById('pFullName').value.trim(),
    username:document.getElementById('pUsername').value.trim().replace('@','').toLowerCase(),
    age:parseInt(document.getElementById('pAge').value)||null,
    role:document.getElementById('pRole').value,
    college:document.getElementById('pCollege').value.trim(),
    bio:document.getElementById('pBio').value.trim(),
    github_url:document.getElementById('pGithub').value.trim(),
    linkedin_url:document.getElementById('pLinkedin').value.trim(),
    skills:profileSkills,
    updated_at:new Date().toISOString(),
  };
  const{error}=await supa.from('profiles').upsert(payload);
  btn.textContent='💾 Save Profile';btn.disabled=false;
  if(error){toast('❌','Failed to save: '+error.message);}
  else{
    toast('✅','Profile saved!');
    if(payload.username) document.getElementById('profileUsername').textContent='@'+payload.username;
    if(payload.full_name) document.getElementById('profileName').textContent=payload.full_name;
    if(payload.bio) document.getElementById('profileBio').textContent=payload.bio;
  }
}

/* =====================================================================
   REGISTRATION MODAL
   ===================================================================== */
async function openRegForm(){
  if(!currentHack)return;
  // pre-fill if logged in
  const{data:{user}}=await supa.auth.getUser();
  if(user){
    document.getElementById('regEmail').value=user.email;
    const{data:prof}=await supa.from('profiles').select('full_name,college').eq('id',user.id).single();
    if(prof){
      document.getElementById('regName').value=prof.full_name||user.user_metadata?.full_name||'';
      document.getElementById('regCollege').value=prof.college||'';
    }
  }
  document.getElementById('regModalTitle').textContent=`Register: ${currentHack.title}`;
  document.getElementById('regModalSub').textContent=`${currentHack.emoji} ${currentHack.org} · ${currentHack.date}`;
  document.getElementById('regFormWrap').style.display='block';
  document.getElementById('regSuccess').style.display='none';
  document.getElementById('regError').classList.remove('show');
  document.getElementById('regOverlay').classList.add('open');
  document.getElementById('regModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeRegForm(){
  document.getElementById('regOverlay').classList.remove('open');
  document.getElementById('regModal').classList.remove('open');
  document.body.style.overflow='';
}
function closeRegOutside(e){if(e.target===document.getElementById('regOverlay'))closeRegForm();}

async function submitRegistration(){
  const name=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  if(!name||!email){
    const er=document.getElementById('regError');
    er.textContent='Name and Email are required';er.classList.add('show');return;
  }
  const btn=document.getElementById('regSubmitBtn');
  btn.textContent='Registering...';btn.disabled=true;
  const{data:{user}}=await supa.auth.getUser();
  const{error}=await supa.from('registrations').insert({
    hackathon_id:currentHack.id,
    user_id:user?.id||null,
    full_name:name,
    email,
    college:document.getElementById('regCollege').value.trim(),
    team_name:document.getElementById('regTeam').value.trim(),
    role:document.getElementById('regRole').value,
  });
  btn.textContent='🚀 Register Now';btn.disabled=false;
  if(error&&error.code==='23505'){
    const er=document.getElementById('regError');
    er.textContent='You are already registered for this hackathon!';er.classList.add('show');
  } else if(error){
    const er=document.getElementById('regError');
    er.textContent=error.message;er.classList.add('show');
  } else {
    document.getElementById('regFormWrap').style.display='none';
    document.getElementById('regSuccess').style.display='block';
    document.getElementById('regSuccessMsg').textContent=`You're registered for ${currentHack.title}. Good luck! 🎉`;
    toast('🎉','Registration saved!');
  }
}

/* =====================================================================
   PROJECT SUBMISSION
   ===================================================================== */
async function submitProject(){
  const hackId=document.getElementById('projectHackSelect').value;
  const name=document.getElementById('pjName').value.trim();
  const desc=document.getElementById('pjDesc').value.trim();
  const repo=document.getElementById('pjRepo').value.trim();
  const er=document.getElementById('projectError');
  er.classList.remove('show');
  if(!hackId||!name||!desc||!repo){er.textContent='Hackathon, project name, description and repo URL are required';er.classList.add('show');return;}
  const{data:{user}}=await supa.auth.getUser();
  if(!user){openAuth('signin');toast('⚠️','Sign in to submit a project');return;}
  const btn=document.querySelector('#projectForm .edit-save-btn');
  btn.textContent='Submitting...';btn.disabled=true;
  const{error}=await supa.from('project_submissions').insert({
    hackathon_id:parseInt(hackId),
    user_id:user.id,
    project_name:name,
    team_name:document.getElementById('pjTeam').value.trim(),
    description:desc,
    repo_url:repo,
    demo_url:document.getElementById('pjDemo').value.trim(),
    video_url:document.getElementById('pjVideo').value.trim(),
    tech_stack:document.getElementById('pjStack').value.trim(),
  });
  btn.textContent='🚀 Submit Project';btn.disabled=false;
  if(error){er.textContent=error.message;er.classList.add('show');}
  else{document.getElementById('projectForm').style.display='none';document.getElementById('projectSuccess').style.display='block';}
}
