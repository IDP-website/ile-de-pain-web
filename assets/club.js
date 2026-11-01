/* The Island Club · shared app code (member app, staff scanner, admin) */
(function(){
const cfg = window.CLUB_CONFIG || {};
const DEMO = !cfg.url || !cfg.anon;
const sb = DEMO ? null : window.supabase.createClient(cfg.url, cfg.anon, {auth:{persistSession:true, autoRefreshToken:true}});

const ITEMS = {
  loaf:       {label:"Classic loaf",          icon:"🥖", note:"Any IDP Classic"},
  cappuccino: {label:"Cappuccino",            icon:"☕", note:"Or any standard coffee"},
  pastry:     {label:"Pastry",                icon:"🥐", note:"From the counter"},
  bouquet:    {label:"Flower Friday bouquet", icon:"💐", note:"Once a month"},
  birthday:   {label:"Birthday pastry",       icon:"🎂", note:"In your birthday month"}
};
const PER = {day:"today", week:"this week", month:"this month", birthday:"this year"};
const TIERS_FALLBACK = [
  {id:"islander", name:"Islander", price_cents:19900, tagline:"Your weekly loaf, sorted.",
   perks:[{item:"loaf",qty:1,per:"week"}], extras:["Member card in the app"]},
  {id:"harbour", name:"Harbour Club", price_cents:49900, tagline:"Bread and coffee, every week.",
   perks:[{item:"loaf",qty:1,per:"week"},{item:"cappuccino",qty:2,per:"week"},{item:"birthday",qty:1,per:"birthday"}], extras:["Birthday pastry on us"]},
  {id:"royale", name:"Île Royale", price_cents:149900, tagline:"The island, every day.",
   perks:[{item:"loaf",qty:2,per:"week"},{item:"cappuccino",qty:5,per:"week"},{item:"cappuccino",qty:1,per:"day"},{item:"pastry",qty:1,per:"week"},{item:"bouquet",qty:1,per:"month"},{item:"birthday",qty:1,per:"birthday"}],
   extras:["Birthday pastry on us","First access to Gift Sets"]}
];
const rand = c => "R" + Math.round(c/100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"}) : "";
const fmtTime = d => new Date(d).toLocaleString("en-ZA",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function perkLines(t){
  const seen = {};
  t.perks.forEach(p => { if(p.per==="day") return; (seen[p.item] ||= []).push(p); });
  const out = [];
  for(const [it, ps] of Object.entries(seen)){
    const p = ps[0], daily = t.perks.find(x=>x.item===it&&x.per==="day");
    if(p.per==="birthday") continue;
    const PL = {loaf:"classic loaves",cappuccino:"cappuccinos",pastry:"pastries",bouquet:"Flower Friday bouquets"};
    const nm = p.qty>1 ? PL[it] : (it==="bouquet" ? "Flower Friday bouquet" : ITEMS[it].label.toLowerCase());
    let s = `${p.qty} ${nm} ${p.per==="week"?"a week":"a month"}`;
    if(daily) s = `A ${ITEMS[it].label.toLowerCase()} every day we're open (up to ${p.qty} a week)`;
    out.push(ITEMS[it].icon + " " + s.charAt(0).toUpperCase() + s.slice(1));
  }
  return out;
}

/* ───── demo data, used only until Supabase is connected ───── */
const demo = {
  user: null,
  card: {name:"Mia Member", role:"member", tier:"royale", tier_name:"Île Royale", price_cents:149900, status:"active", active:true,
    paid_until: new Date(Date.now()+20*864e5).toISOString().slice(0,10),
    extras: TIERS_FALLBACK[2].extras,
    balances:{loaf:{allow:2,used:1,left:1,per:"week"},cappuccino:{allow:1,used:0,left:1,per:"day"},pastry:{allow:1,used:0,left:1,per:"week"},bouquet:{allow:1,used:0,left:1,per:"month"}},
    history:[{item:"loaf",qty:1,created_at:new Date(Date.now()-864e5*2).toISOString()},{item:"cappuccino",qty:1,created_at:new Date(Date.now()-864e5*2).toISOString()},{item:"bouquet",qty:1,created_at:new Date(Date.now()-864e5*9).toISOString()}]},
  members:[
    {id:"d1",full_name:"Mia Member",email:"mia@example.com",phone:"082 000 0001",role:"member",tier_id:"royale",status:"active",paid_until:"2026-11-30",active:true,uses_30d:14,created_at:"2026-10-02"},
    {id:"d2",full_name:"Pieter van Wyk",email:"pieter@example.com",phone:"082 000 0002",role:"member",tier_id:"harbour",status:"active",paid_until:"2026-11-18",active:true,uses_30d:9,created_at:"2026-10-05"},
    {id:"d3",full_name:"Anna Botha",email:"anna@example.com",phone:"082 000 0003",role:"member",tier_id:"islander",status:"pending",paid_until:null,active:false,uses_30d:0,created_at:"2026-10-30"},
    {id:"d4",full_name:"Counter Phone",email:"counter@iledepain.co.za",phone:"",role:"staff",tier_id:null,status:null,paid_until:null,active:false,uses_30d:0,created_at:"2026-10-01"},
    {id:"d5",full_name:"Sam Jacobs",email:"sam@example.com",phone:"082 000 0005",role:"member",tier_id:"islander",status:"active",paid_until:"2026-10-28",active:false,uses_30d:3,created_at:"2026-09-20"}],
  today:[{item:"cappuccino",qty:1,full_name:"Pieter van Wyk",staff:"Counter Phone",created_at:new Date(Date.now()-36e5).toISOString()},{item:"loaf",qty:1,full_name:"Mia Member",staff:"Counter Phone",created_at:new Date(Date.now()-72e5).toISOString()}]
};

async function rpc(name, args){
  if(DEMO){
    await new Promise(r=>setTimeout(r,250));
    if(name==="my_card"){ const w=Math.floor(Date.now()/30000); return {...demo.card, today:new Date().toISOString().slice(0,10), varieties:["Companio","Bagatta","Fougasse","Baguette","100% Vollkorn","100% Rye","100% Organic \"O\""], orders:[], token:"IDPCLUB:demo."+w+".demo", expires_in:30-Math.floor(Date.now()/1000)%30}; }
    if(name==="staff_lookup"){ return args.token.startsWith("IDPCLUB:") ? {ok:true,name:demo.card.name,tier:demo.card.tier,tier_name:demo.card.tier_name,paid_until:demo.card.paid_until,balances:demo.card.balances} : {ok:false,reason:"This code has expired or is not valid. Ask the member to open their card again."}; }
    if(name==="staff_redeem"){ const b=demo.card.balances[args.item]; if(!b||b.left<args.qty) return {ok:false,reason:"Nothing left for this item right now.",balances:demo.card.balances}; b.left-=args.qty;b.used+=args.qty; demo.card.history.unshift({item:args.item,qty:args.qty,created_at:new Date().toISOString()}); return {ok:true,balances:demo.card.balances}; }
    if(name==="admin_overview"){ return {members:demo.members,today:demo.today,mrr_cents:149900+49900,tiers:TIERS_FALLBACK}; }
    if(name==="admin_record_payment"){ const m=demo.members.find(x=>x.id===args.uid); const d=new Date(Math.max(Date.now(),m.paid_until?Date.parse(m.paid_until):0)); d.setMonth(d.getMonth()+args.months); Object.assign(m,{status:"active",active:true,paid_until:d.toISOString().slice(0,10)}); return null; }
    if(name==="admin_set_member"){ const m=demo.members.find(x=>x.id===args.uid); Object.assign(m,{tier_id:args.tier,status:args.status}); return null; }
    if(name==="admin_set_role"){ demo.members.find(x=>x.id===args.uid).role=args.new_role; return null; }
    if(name==="place_order"||name==="cancel_order"||name==="staff_collect"){ return {ok:true, balances:demo.card.balances}; }
    if(name==="choose_tier"){ demo.card.tier=args.tier; return null; }
    return null;
  }
  const {data, error} = await sb.rpc(name, args||{});
  if(error) throw new Error(error.message);
  return data;
}

async function tiers(){
  if(DEMO) return TIERS_FALLBACK;
  const {data, error} = await sb.from("tiers").select("*").order("sort");
  return error || !data?.length ? TIERS_FALLBACK : data;
}

const auth = {
  async user(){ if(DEMO) return demo.user; const {data} = await sb.auth.getUser(); return data.user; },
  async signIn(email, password){ if(DEMO){ demo.user={email}; return; } const {error} = await sb.auth.signInWithPassword({email, password}); if(error) throw new Error(friendly(error.message)); },
  async signUp(email, password, full_name, phone){
    if(DEMO){ demo.user={email}; demo.card.name=full_name||demo.card.name; return {needsConfirm:false}; }
    const {data, error} = await sb.auth.signUp({email, password, options:{data:{full_name, phone}, emailRedirectTo: location.origin + "/club/app/"}});
    if(error) throw new Error(friendly(error.message));
    return {needsConfirm: !data.session};
  },
  async reset(email){ if(DEMO) return; const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); if(error) throw new Error(friendly(error.message)); },
  async setPassword(password){ const {error} = await sb.auth.updateUser({password}); if(error) throw new Error(friendly(error.message)); },
  async signOut(){ if(DEMO){ demo.user=null; return; } await sb.auth.signOut(); },
  onChange(fn){ if(!DEMO) sb.auth.onAuthStateChange((ev)=>fn(ev)); }
};
function friendly(m){
  if(/Invalid login/i.test(m)) return "That email and password don't match. Try again or reset your password.";
  if(/already registered/i.test(m)) return "There's already an account with this email. Sign in instead.";
  if(/Password should be/i.test(m)) return "Please use a password of at least 8 characters.";
  if(/Email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox for our link.";
  return m;
}

/* register the service worker so the club installs like an app */
if("serviceWorker" in navigator) addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));

window.CLUB = {DEMO, sb, rpc, tiers, auth, ITEMS, PER, TIERS_FALLBACK, rand, esc, fmtDate, fmtTime, perkLines};
})();
