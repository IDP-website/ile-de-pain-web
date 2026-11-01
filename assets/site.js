/* île de païn · shared behaviour */
(function(){
const PHONE="+27443025705", PHONE_TXT="044 302 5705", EMAIL="admin@iledepain.co.za";
const MAPS="https://www.google.com/maps/dir/?api=1&destination=-34.0477133,23.047419";
const IG="https://www.instagram.com/iledepain/", FB="https://www.facebook.com/iledepain/";
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const OPEN={2:[8,15.5],3:[8,15.5],4:[8,15.5],5:[8,15.5],6:[8,15.5]};
const SERVICE=[[8,11.5,"Breakfast"],[11.5,12,"Coffee & Treats"],[12,15,"Lunch"],[15,15.5,"Afternoon Tea & Pastries"]];
const HM=h=>String(Math.floor(h)).padStart(2,"0")+":"+String(Math.round(h%1*60)).padStart(2,"0");
const page=document.body.dataset.page||"home";
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const ICON={
 phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
 pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>'};
window.IDP={PHONE,PHONE_TXT,EMAIL,MAPS,IG,FB,DAYS,OPEN,SERVICE,HM,ICON,reduce};

/* chrome: nav, drawer, footer, bar */
const links=[["/","Home","home"],["/#menu","Menu","menu"],["/gallery/","Gallery","gallery"],["/events/","Events","events"],["/#gifts","Gift Sets","gifts"],["/#visit","Visit","visit"]];
const nav=document.createElement("header");nav.className="nav";nav.id="nav";
nav.innerHTML=`<div class="wrap"><a class="logo" href="/" aria-label="île de païn home"><img src="/assets/img/logo-orange.png" alt="île de païn"></a>
<ul>${links.map(([h,l,k])=>`<li><a href="${h}"${k===page?' aria-current="page"':""}>${l}</a></li>`).join("")}</ul>
<a class="btn fill desk" href="tel:${PHONE}">${ICON.phone}Call us</a><button class="menu-btn" aria-label="Open menu" aria-expanded="false"><span></span></button></div>`;
document.body.prepend(nav);
const dr=document.createElement("div");dr.className="drawer";dr.setAttribute("aria-hidden","true");
dr.innerHTML=`<div class="top"><b>île de païn</b><button class="x" aria-label="Close menu">×</button></div>
<nav>${links.map(([h,l],i)=>`<a href="${h}"><span>0${i+1}</span>${l}</a>`).join("")}</nav>
<div class="foot"><a href="tel:${PHONE}">${PHONE_TXT}</a><a href="${IG}" target="_blank" rel="noopener">Instagram</a><span>Tue to Sat · 08:00 to 15:30 · No bookings</span></div>`;
document.body.append(dr);
const mb=nav.querySelector(".menu-btn");
const setDr=o=>{dr.classList.toggle("open",o);dr.setAttribute("aria-hidden",!o);mb.setAttribute("aria-expanded",o);document.body.style.overflow=o?"hidden":""};
mb.onclick=()=>setDr(true);dr.querySelector(".x").onclick=()=>setDr(false);dr.querySelectorAll("nav a").forEach(a=>a.onclick=()=>setDr(false));
addEventListener("keydown",e=>{if(e.key==="Escape")setDr(false)});

const ft=document.createElement("footer");
ft.innerHTML=`<div class="wrap"><div class="big">île de païn</div>
<div class="cols">
 <div><b>Find us</b>10 The Boatshed, Long Street<br>Thesen Island, Knysna<br><a href="${MAPS}" target="_blank" rel="noopener">Get directions →</a></div>
 <div><b>Open</b>Tuesday to Saturday<br>08:00 to 15:30<br>Closed Sunday & Monday<br>No bookings, first come first served</div>
 <div><b>Say hello</b><a href="tel:${PHONE}">${PHONE_TXT}</a><br><a href="mailto:${EMAIL}">${EMAIL}</a></div>
 <div><b>Follow</b><a href="${IG}" target="_blank" rel="noopener">Instagram</a><br><a href="${FB}" target="_blank" rel="noopener">Facebook</a></div>
</div>
<p class="credit">Authentic artisans · circa 2002 &nbsp;·&nbsp; Website by Jay Steenkamp · jaysteenkamp.com</p></div>`;
document.body.append(ft);
const bar=document.createElement("nav");bar.className="bar";bar.setAttribute("aria-label","Quick actions");
bar.innerHTML=`<a href="tel:${PHONE}">${ICON.phone}Call</a><a class="fill" href="${MAPS}" target="_blank" rel="noopener">${ICON.pin}Directions</a>`;
document.body.append(bar);

/* time in Knysna */
function sast(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Johannesburg",weekday:"long",hour:"numeric",minute:"numeric",hour12:false}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return{day:DAYS.indexOf(g("weekday")),h:(+g("hour")%24)+(+g("minute"))/60}}
IDP.sast=sast;
function nextOpen(day){for(let i=1;i<=7;i++){const d=(day+i)%7;if(OPEN[d])return i===1?"tomorrow":DAYS[d]}}
function status(){
  const {day,h}=sast(),o=OPEN[day];
  document.querySelectorAll("[data-status]").forEach(el=>{const tx=el.querySelector("span")||el;
    if(o&&h>=o[0]&&h<o[1]){const sv=SERVICE.find(x=>h>=x[0]&&h<x[1]);el.classList.remove("closed");tx.textContent=`Open now · ${sv[2]} until ${HM(sv[1])}`}
    else if(o&&h<o[0]){el.classList.add("closed");tx.textContent=`Opens today at ${HM(o[0])}`}
    else{el.classList.add("closed");tx.textContent=`Closed now · opens ${nextOpen(day)} at 08:00`}});
  const {day:dd,h:hh}=sast(),oo=OPEN[dd];
  document.querySelectorAll("[data-service]").forEach(el=>el.innerHTML=SERVICE.map(x=>`<div class="${oo&&hh>=x[0]&&hh<x[1]?"now":""}"><span>${HM(x[0])} to ${HM(x[1])}</span><b>${x[2]}</b></div>`).join(""));
  document.querySelectorAll("[data-hours]").forEach(el=>el.innerHTML=[1,2,3,4,5,6,0].map(d=>`<div class="${d===day?"today":""} ${OPEN[d]?"":"closed"}"><span>${DAYS[d]}${d===day?" · today":""}</span><span>${OPEN[d]?"08:00 to 15:30":"Closed"}</span></div>`).join(""));
}
status();setInterval(status,60000);

/* the sky follows the real time of day in Knysna */
const SKY=[ // hour, top colour, bottom, sun glow, label
 [0,"#E9E4EF","#FFFDF9","#F4D9E4","night"],[5,"#F6DCD4","#FFF8F1","#FFC9A8","dawn"],[7,"#FBE3CF","#FFFBF5","#FFD2A0","sunrise"],
 [9,"#DCEBF5","#FFFDF9","#FFE6BF","morning"],[12,"#CFE5F5","#FFFDF9","#FFF0CC","midday"],[15,"#F7E1C4","#FFFAF2","#FFC88A","golden hour"],
 [18,"#F3D2C6","#FFF6EE","#FFB48A","sunset"],[20,"#E5E1EE","#FFFDF9","#EAD9F0","evening"]];
function mix(a,b,k){const p=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const A=p(a),B=p(b);return"#"+A.map((v,i)=>Math.round(v+(B[i]-v)*k).toString(16).padStart(2,"0")).join("")}
function sky(){const {h}=sast();let i=SKY.length-1;for(let k=0;k<SKY.length;k++)if(h>=SKY[k][0])i=k;const a=SKY[i],b=SKY[(i+1)%SKY.length];const span=((b[0]||24)-a[0]),k=Math.min(1,(h-a[0])/span);
  const r=document.documentElement.style;r.setProperty("--sky-a",mix(a[1],b[1],k));r.setProperty("--sky-b",mix(a[2],b[2],k));r.setProperty("--sun",mix(a[3],b[3],k));
  document.querySelectorAll("[data-skylabel]").forEach(el=>el.textContent=`It's ${a[4]} in Knysna`);}
sky();setInterval(sky,5*60000);

/* nav + bar on scroll */
let lastY=0;
function onScroll(){const y=scrollY;nav.classList.toggle("solid",y>40);nav.classList.toggle("hide",y>lastY&&y>500&&!dr.classList.contains("open"));lastY=y;bar.classList.toggle("show",y>innerHeight*.5)}
addEventListener("scroll",onScroll,{passive:true});onScroll();

/* reveal + split headings */
document.querySelectorAll(".split").forEach(h=>{if(h.dataset.done)return;h.dataset.done=1;h.innerHTML=h.innerHTML.split(/<br\s*\/?>/i).map(l=>`<span class="ln"><span>${l}</span></span>`).join("")});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.12,rootMargin:"0px 0px -6% 0px"});
IDP.observe=root=>(root||document).querySelectorAll(".rv,.split").forEach(el=>io.observe(el));
IDP.observe();

/* lightbox */
let LB=null,list=[],idx=0;
IDP.lightbox=(items,i)=>{list=items;idx=i;
  if(!LB){LB=document.createElement("div");LB.className="lb";LB.setAttribute("role","dialog");LB.setAttribute("aria-modal","true");
   LB.innerHTML='<img alt=""><p class="cap"></p><button class="x" aria-label="Close">×</button><button class="p" aria-label="Previous">←</button><button class="n" aria-label="Next">→</button>';document.body.append(LB);
   LB.addEventListener("click",e=>{if(e.target===LB||e.target.classList.contains("x"))close();if(e.target.classList.contains("p"))go(-1);if(e.target.classList.contains("n"))go(1)});
   addEventListener("keydown",e=>{if(!LB.classList.contains("open"))return;if(e.key==="Escape")close();if(e.key==="ArrowLeft")go(-1);if(e.key==="ArrowRight")go(1)});
   let sx=0;LB.addEventListener("touchstart",e=>sx=e.touches[0].clientX,{passive:true});LB.addEventListener("touchend",e=>{const d=e.changedTouches[0].clientX-sx;if(Math.abs(d)>50)go(d<0?1:-1)});}
  show();LB.classList.add("open");document.body.style.overflow="hidden";LB.querySelector(".x").focus()};
function show(){const it=list[idx];const im=LB.querySelector("img");im.src=it.src;im.alt=it.alt;LB.querySelector(".cap").textContent=`${it.alt}  ·  ${idx+1} / ${list.length}`}
function go(d){idx=(idx+d+list.length)%list.length;show()}
function close(){LB.classList.remove("open");document.body.style.overflow=""}

/* page curtain: lift on arrival, drop on internal navigation */
if(!reduce){
  const cu=document.createElement("div");cu.className="curtain";cu.innerHTML="<b>île de païn</b>";document.body.append(cu);
  const lift=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>cu.classList.add("up")));
  if(document.readyState==="complete")lift();else{addEventListener("load",lift);setTimeout(lift,900)}
  addEventListener("pageshow",e=>{if(e.persisted){cu.classList.remove("cover");cu.classList.add("up")}});
  document.addEventListener("click",e=>{const a=e.target.closest("a[href]");if(!a||e.metaKey||e.ctrlKey||e.shiftKey||a.target==="_blank")return;
    const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
    if(u.pathname===location.pathname){return} // same page: let anchors scroll
    e.preventDefault();cu.classList.remove("up");cu.classList.add("below");void cu.offsetWidth;cu.classList.remove("below");cu.classList.add("cover");setTimeout(()=>location.href=a.href,520)});
}
/* custom cursor + magnetic buttons (mouse only) */
if(!reduce&&matchMedia("(hover:hover) and (pointer:fine)").matches){
  const c=document.createElement("div");c.className="cur";document.body.append(c);let x=-100,y=-100,cx=-100,cy=-100;
  addEventListener("mousemove",e=>{x=e.clientX;y=e.clientY},{passive:true});
  document.addEventListener("mouseleave",()=>c.classList.add("hide"));document.addEventListener("mouseenter",()=>c.classList.remove("hide"));
  (function f(){requestAnimationFrame(f);cx+=(x-cx)*.22;cy+=(y-cy)*.22;c.style.transform=`translate3d(${cx}px,${cy}px,0)`})();
  document.addEventListener("mouseover",e=>{const z=e.target.closest(".tile,.strip button,.slide,.medal,.reel");const l=e.target.closest("a,button,.tab,.chip");
    c.classList.toggle("big",!!z);c.textContent=z?(z.closest(".slide,.reel")?"":"View"):"";c.classList.toggle("link",!z&&!!l)});
  document.querySelectorAll(".btn").forEach(b=>{b.addEventListener("mousemove",e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.22}px,${(e.clientY-r.top-r.height/2)*.3}px)`});b.addEventListener("mouseleave",()=>b.style.transform="")});
}
})();
