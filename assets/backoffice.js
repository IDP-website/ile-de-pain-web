/* île de païn · Back Office (stock + recipes) */
(()=>{
const cfg=window.CLUB_CONFIG||{};
const sb=window.supabase.createClient(cfg.url,cfg.anon,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'idp-backoffice'}});
const USERS={mel:'backoffice@iledepain.co.za'};
const PERIOD='2026-10';
const COS=[{id:'idp',name:'île de païn',color:'#E17000'},{id:'gelato',name:'Gelato Infinito',color:'#E9573F'},{id:'nest',name:'Nest Food Bar',color:'#4E7A73'}];
const YUNITS=['portion','each','g','kg','ml','L'];
const LUNITS=['g','kg','ml','L','each','tsp','tbsp','cup','pinch','dash','bunch','can','slice','stalk'];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R=n=>n==null||isNaN(n)?'–':'R'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const N=(n,d=2)=>n==null||isNaN(n)?'':Number(n).toLocaleString('en-US',{maximumFractionDigits:d}).replace(/^-0(\.0+)?$/,'0');
const xu=u=>/^\d/.test(String(u||''))?'× '+u:String(u||'');
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.remove('hide');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.add('hide'),2200)};
const deb=(f,ms=500)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};

// ---------- units & costing ----------
const UN={kg:['w',1000],g:['w',1],pinch:['w',0.5],l:['v',1000],ml:['v',1],cl:['v',10],tsp:['v',5],tbsp:['v',15],cup:['v',250],dash:['v',0.6],each:['n',1],portion:['n',1],bunch:['n',1],can:['n',1],slice:['n',1],stalk:['n',1]};
const un=u=>UN[String(u||'each').toLowerCase()]||UN.each;
const fam=u=>un(u)[0];
const toBase=(q,u)=>Number(q||0)*un(u)[1];
const itemBase=it=>{const d=toBase(it.count_size||1,it.count_unit);return it.unit_price!=null&&d?Number(it.unit_price)/d:null};
const perLabel=it=>{const f=fam(it.count_unit),b=itemBase(it);if(b==null)return '–';return f==='w'?R(b*1000)+' /kg':f==='v'?R(b*1000)+' /L':R(b)+' /each'};
function recipeCost(r,depth=0){
  if(!r||depth>4)return{total:0,issues:1};
  let total=0,issues=0;
  for(const l of S.lines.filter(x=>x.recipe_id===r.id)){const c=lineCost(l,depth);if(c.cost==null)issues++;else total+=c.cost}
  return{total,issues};
}
function convQty(l,toUnit){ // returns {q, approx} in base units of toUnit's family
  const fl=fam(l.unit),ft=fam(toUnit);if(fl===ft)return{q:toBase(l.qty,l.unit),approx:false};
  if(fl!=='n'&&ft!=='n')return{q:toBase(l.qty,l.unit),approx:true}; // 1 ml ~ 1 g
  return null;
}
function lineCost(l,depth=0){
  if(l.no_cost)return{cost:0,free:true};
  if(l.qty==null||l.qty==='')return{cost:null,why:'No quantity'};
  if(l.item_id){const it=S.byId.get(l.item_id);if(!it)return{cost:null,why:'Item removed'};
    const b=itemBase(it);if(b==null||!(Number(it.unit_price)>0))return{cost:null,why:'No price on item'};
    const c=convQty(l,it.count_unit);if(!c)return{cost:null,why:`Unit mismatch: item is priced per ${it.count_size} ${it.count_unit}`};
    return{cost:b*c.q,approx:c.approx}}
  if(l.sub_recipe_id){const r=S.recipes.find(x=>x.id===l.sub_recipe_id);if(!r)return{cost:null,why:'Sub-recipe removed'};
    const c=convQty(l,r.yield_unit);if(!c)return{cost:null,why:`Unit mismatch: recipe makes ${r.yield_qty} ${r.yield_unit}`};
    const t=recipeCost(r,depth+1),y=toBase(r.yield_qty||1,r.yield_unit);return{cost:y?t.total/y*c.q:null,approx:c.approx}}
  return{cost:null,why:'Not linked to the master stock yet'};
}
function recipeNums(r){
  const {total,issues}=recipeCost(r);const per=r.kind==='menu'?total:['portion','each'].includes(r.yield_unit)?total/(r.yield_qty||1):null;
  const sellEx=r.selling_price?Number(r.selling_price)/1.15:null;
  const gp=per!=null&&sellEx?(sellEx-per)/sellEx:null;return{total,issues,per,sellEx,gp};
}
const gpTag=gp=>gp==null?'<span class="gp n">no price</span>':`<span class="gp ${gp>=.68?'g':gp>=.55?'m':'b'}">${Math.round(gp*100)}% GP</span>`;

// ---------- state ----------
const S={co:localStorage.getItem('bo-co')||'idp',tab:'stock',items:[],byId:new Map(),counts:[],recipes:[],lines:[],sort:['name',1],cur:null,rcat:''};
const co=()=>COS.find(c=>c.id===S.co);

async function all(table,sel='*',f=q=>q){let out=[],from=0;for(;;){const {data,error}=await f(sb.from(table).select(sel)).range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000}return out}
async function load(){
  const [items,counts,recipes]=await Promise.all([all('bo_items','*',q=>q.eq('active',true).order('name')),all('bo_counts','*',q=>q.eq('company',S.co).eq('period',PERIOD)),all('bo_recipes','*',q=>q.eq('company',S.co).order('name'))]);
  S.items=items;S.byId=new Map(items.map(i=>[i.id,i]));S.counts=counts;S.recipes=recipes;
  S.lines=recipes.length?await all('bo_recipe_lines','*',q=>q.in('recipe_id',recipes.map(r=>r.id)).order('sort')):[];
  const oh=await all('bo_on_hand','*',q=>q.eq('company',S.co));
  S.cnt=new Map();S.made=new Map();for(const o of oh){if(o.item_id)S.cnt.set(o.item_id,Number(o.qty));else if(o.recipe_id)S.made.set(o.recipe_id,Number(o.qty))}
  S.recById=new Map(recipes.map(r=>[r.id,r]));const miss=[...S.made.keys()].filter(id=>!S.recById.has(id));
  if(miss.length){const {data}=await sb.from('bo_recipes').select('*').in('id',miss);(data||[]).forEach(r=>S.recById.set(r.id,r))}
  S.uses=new Map();for(const l of S.lines)if(l.item_id)S.uses.set(l.item_id,(S.uses.get(l.item_id)||0)+1);
}

// ---------- auth ----------
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('#login').classList.remove('hide');$('#app').classList.add('hide');return}
  const {data:ok}=await sb.rpc('bo_is_admin');
  if(!ok){await sb.auth.signOut();showLoginErr('This account does not have back office access.');$('#login').classList.remove('hide');return}
  $('#login').classList.add('hide');$('#app').classList.remove('hide');
  $('#who').textContent=Object.keys(USERS).find(k=>USERS[k]===session.user.email)?.replace(/^./,c=>c.toUpperCase())||session.user.email;
  renderCompanies();await switchCo(S.co);
}
const showLoginErr=m=>{const e=$('#m-login');e.textContent=m;e.classList.remove('hide')};
$('#f-login').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);let u=String(f.get('user')).trim().toLowerCase();
  const email=USERS[u]||u;const btn=e.target.querySelector('button');btn.disabled=true;
  const {error}=await sb.auth.signInWithPassword({email,password:f.get('pass')});btn.disabled=false;
  if(error)return showLoginErr('That username and password don\'t match.');$('#m-login').classList.add('hide');boot()});
$('#b-out').onclick=async()=>{await sb.auth.signOut();location.reload()};

// ---------- shell ----------
function renderCompanies(){
  $('#companies').innerHTML=COS.map(c=>`<button data-co="${c.id}" class="${c.id===S.co?'on':''}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('');
  $$('#companies button').forEach(b=>b.onclick=()=>switchCo(b.dataset.co));
}
async function switchCo(id){
  S.co=id;localStorage.setItem('bo-co',id);document.documentElement.style.setProperty('--co',co().color);
  renderCompanies();$('#co-name').textContent=$('#co-name2').textContent=$('#co-name3').textContent=co().name;
  $('#t-stock tbody').innerHTML='<tr><td colspan="9" class="muted">Loading…</td></tr>';
  try{await load()}catch(e){toast('Could not load: '+e.message);return}
  try{await loadMoves()}catch(e){S.moves=[];toast('Could not load movements: '+e.message)}
  S.cur=null;$('#seed').classList.toggle('hide',S.items.length>0);fillFilters();renderStock();renderRecipeList();renderRecipe();showTab(S.tab||'stock');
}
function showTab(t){S.tab=t;$$('#tabs button').forEach(x=>x.classList.toggle('on',x.dataset.tab===t));S.ed=null;S.tk=null;
  $('#v-stock').classList.toggle('hide',t!=='stock');$('#v-recipes').classList.toggle('hide',t!=='recipes');$('#v-moves').classList.toggle('hide',t!=='moves');$('#v-mv').classList.add('hide');
  if(t==='recipes')renderRecipeList();if(t==='moves')renderMoves();if(t==='stock')renderStock()}
$$('#tabs button[data-tab]').forEach(b=>b.onclick=()=>{if(S.ed&&S.ed.dirty&&!confirm('Leave without posting? What you captured will be lost.'))return;showTab(b.dataset.tab)});

// ---------- one-time starting data ----------
$('#seed-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const msg=$('#seed-msg');
  try{const d=JSON.parse(await f.text());if(!d.items||!d.counts)throw new Error('This is not the starting data file');
    const {count}=await sb.from('bo_items').select('id',{count:'exact',head:true});if(count>0)throw new Error('The master stock already has items');
    const ids=[];for(let i=0;i<d.items.length;i+=250){msg.textContent=`Loading items ${i+1} to ${Math.min(i+250,d.items.length)} of ${d.items.length}…`;
      const {data,error}=await sb.from('bo_items').insert(d.items.slice(i,i+250)).select('id');if(error)throw error;ids.push(...data.map(x=>x.id))}
    const rows=d.counts.map(([company,ix,area,count])=>({company,item_id:ids[ix],area,period:PERIOD,count}));
    for(let i=0;i<rows.length;i+=400){msg.textContent=`Loading counts ${i+1} of ${rows.length}…`;const {error}=await sb.from('bo_counts').insert(rows.slice(i,i+400));if(error)throw error}
    msg.textContent='Done';toast(`Loaded ${ids.length} items and ${rows.length} counts`);await switchCo(S.co)}
  catch(err){msg.textContent='Could not load: '+err.message}e.target.value=''});

// ---------- master stock ----------
function fillFilters(){
  const sups=[...new Set(S.items.map(i=>i.supplier).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const deps=[...new Set(S.items.map(i=>i.department).filter(Boolean))].sort();
  const s=$('#f-sup').value,d=$('#f-dep').value;
  $('#f-sup').innerHTML='<option value="">All suppliers</option>'+sups.map(x=>`<option>${esc(x)}</option>`).join('');$('#f-sup').value=sups.includes(s)?s:'';
  $('#f-dep').innerHTML='<option value="">All departments</option>'+deps.map(x=>`<option>${esc(x)}</option>`).join('');$('#f-dep').value=deps.includes(d)?d:'';
}
const review=i=>!!i.added_from||!(Number(i.unit_price)>0);
function filtered(){
  const q=$('#q').value.trim().toLowerCase().split(/\s+/).filter(Boolean),sup=$('#f-sup').value,dep=$('#f-dep').value,mine=$('#f-mine').checked,cnt=$('#f-counted').checked,rev=$('#f-review').checked,vf=$('#f-vat').value;
  let L=S.items.filter(i=>{
    if(sup&&i.supplier!==sup)return false;if(dep&&i.department!==dep)return false;
    if(mine&&!(i.businesses||[]).includes(S.co)&&!S.cnt.has(i.id)&&!S.uses.has(i.id))return false;
    if(cnt&&!(S.cnt.get(i.id)>0))return false;if(rev&&!review(i))return false;if(vf&&(i.vat!==false)!==(vf==='1'))return false;
    if(q.length){const h=[i.name,i.supplier,i.category,i.sub_category,i.department,i.location].join(' ').toLowerCase();if(!q.every(w=>h.includes(w)))return false}
    return true});
  const [k,dir]=S.sort;const v=i=>k==='count'?(S.cnt.get(i.id)??-1):k==='value'?((S.cnt.get(i.id)||0)*(i.unit_price||0)):k==='unit_price'?Number(i.unit_price??-1):String(i[k]??'').toLowerCase();
  L.sort((a,b)=>{const x=v(a),y=v(b);return(x>y?1:x<y?-1:0)*dir});return L;
}
function renderStock(){
  const L=filtered();const shown=L.slice(0,400);
  let val=0,counted=0;for(const [id,c] of S.cnt){const it=S.byId.get(id);if(it&&c>0){val+=c*(Number(it.unit_price)||0);counted++}}
  const mineAll=S.items.filter(i=>(i.businesses||[]).includes(S.co)||S.cnt.has(i.id));
  $('#kpis').innerHTML=`<div class="kpi"><span>Items for ${esc(co().name)}</span><b>${N(mineAll.length,0)}</b></div><div class="kpi"><span>Stock value · on hand now</span><b>${R(val)}</b></div><div class="kpi"><span>Items in stock</span><b>${N(counted,0)}</b></div><div class="kpi warn"><span>Need review (new or no price)</span><b>${N(mineAll.filter(review).length,0)}</b></div>`;
  $('#t-stock tbody').innerHTML=shown.map(i=>{const c=S.cnt.get(i.id),u=S.uses.get(i.id);
    return `<tr data-id="${i.id}"><td class="name">${esc(i.name)}${i.added_from?'<span class="tag">new</span>':''}<small>${esc([i.department,i.location].filter(Boolean).join(' · '))}</small></td>
    <td class="muted">${esc(i.supplier||'')}</td><td class="muted">${esc(i.category||'')}</td><td class="muted">${N(i.count_size,3)} ${esc(i.count_unit)}</td>
    <td class="r">${Number(i.unit_price)>0?R(i.unit_price)+(i.vat!==false?`<small>incl ${R(i.unit_price*1.15)}</small>`:'<small>no VAT</small>'):'<span class="nil">no price</span>'}</td><td><button class="vtg ${i.vat!==false?'on':''}" data-vat="${i.id}" title="Tap to switch">${i.vat!==false?'VAT':'No VAT'}</button></td><td class="r muted">${perLabel(i)}</td>
    <td class="r">${c!=null?N(c,3):'<span class="muted">–</span>'}</td><td class="r">${c!=null&&i.unit_price?R(c*i.unit_price):''}</td><td class="r">${u?u:''}</td></tr>`}).join('')||'<tr><td colspan="10" class="muted">No items match.</td></tr>';
  $('#more').textContent=L.length>400?`Showing 400 of ${L.length} items. Search or filter to narrow it down.`:`${L.length} items`;
  $$('#t-stock tbody tr[data-id]').forEach(tr=>tr.onclick=e=>{if(e.target.closest('[data-vat]'))return;openItem(Number(tr.dataset.id))});
  $$('#t-stock [data-vat]').forEach(b=>b.onclick=async()=>{const it=S.byId.get(+b.dataset.vat);const v=it.vat===false;b.disabled=true;
    const {error}=await sb.from('bo_items').update({vat:v,updated_at:new Date().toISOString()}).eq('id',it.id);b.disabled=false;if(error)return toast('Not saved: '+error.message);
    it.vat=v;const x=S.items.find(i=>i.id===it.id);if(x)x.vat=v;toast(`${it.name}: ${v?'VAT applies (15%)':'no VAT'}`);renderStock()});
}
['#q','#f-sup','#f-dep','#f-vat','#f-mine','#f-counted','#f-review'].forEach(s=>$(s).addEventListener(s==='#q'?'input':'change',deb(renderStock,s==='#q'?150:0)));
$$('#t-stock th[data-s]').forEach(th=>th.onclick=()=>{const k=th.dataset.s;S.sort=[k,S.sort[0]===k?-S.sort[1]:1];renderStock()});
$('#b-export').onclick=()=>{const L=filtered();const rows=[['Item','Supplier','Department','Category','Count size','Count unit','Price ex VAT','VAT','Price incl VAT','On hand','Value']].concat(L.map(i=>{const c=S.cnt.get(i.id);return[i.name,i.supplier,i.department,i.category,i.count_size,i.count_unit,i.unit_price,i.vat!==false?'VAT':'No VAT',i.unit_price!=null?(i.unit_price*(i.vat!==false?1.15:1)).toFixed(2):'',c??'',c!=null&&i.unit_price?(c*i.unit_price).toFixed(2):'']}));
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`master-stock-${S.co}.csv`;a.click()};
$('#b-add').onclick=()=>openItem(null);

// ---------- item drawer ----------
const closeDrawer=()=>$('#drawer').classList.add('hide');
$('#drawer').addEventListener('click',e=>{if(e.target.dataset.close!=null)closeDrawer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
async function openItem(id){
  const it=id?{...S.byId.get(id)}:{name:'',unit_price:null,count_size:1,count_unit:'each',vat:true,businesses:[S.co]};
  const counts=id?S.counts.filter(c=>c.item_id===id):[];
  let used=[];if(id){const {data}=await sb.from('bo_recipe_lines').select('qty,unit,bo_recipes(name,company)').eq('item_id',id);used=data||[]}
  const f=(k,l,t='text',cls='')=>`<label class="${cls}">${l}<input name="${k}" type="${t}" ${t==='number'?'step="any"':''} value="${esc(it[k]??'')}"></label>`;
  $('#dr-panel').innerHTML=`<span class="eyebrow">${id?'Master stock item':'New item'}</span><h2>${esc(it.name||'New item')}</h2>
  <form id="f-item"><div class="form">
   ${f('name','Item name','text','full')}
   ${f('supplier','Supplier')}${f('department','Department')}
   ${f('category','Category')}${f('sub_category','Sub category')}
   <div class="full vatrow"><span>VAT</span><div class="seg2"><label><input type="radio" name="vat" value="1" ${it.vat!==false?'checked':''}><b>VAT applies</b><small>15% on top</small></label><label><input type="radio" name="vat" value="0" ${it.vat===false?'checked':''}><b>No VAT</b><small>Zero-rated or exempt</small></label></div></div>
   <label><span id="dr-pl">${it.vat!==false?'Price ex VAT (R)':'Price (R)'}</span><input name="unit_price" type="number" step="any" value="${esc(it.unit_price??'')}"><small class="muted" id="dr-incl"></small></label>
   <label>Priced per<span style="display:flex;gap:6px"><input name="count_size" type="number" step="any" value="${esc(it.count_size??1)}" style="width:50%"><select name="count_unit" style="width:50%">${['each','g','kg','ml','L','cl'].map(u=>`<option ${String(it.count_unit).toLowerCase()===u.toLowerCase()?'selected':''}>${u}</option>`).join('')}</select></span></label>
   ${f('case_size','Case / box size')}${f('case_price','Case price ex VAT','number')}
   ${f('location','Storage / location')}${f('unit_label','Original unit label')}
   <div class="full calc"><span>Recipe cost</span><b id="dr-per">${perLabel(it)}</b></div>
   <div class="full"><label>Used by</label><div class="biz">${COS.map(c=>`<label><input type="checkbox" name="biz" value="${c.id}" ${(it.businesses||[]).includes(c.id)?'checked':''}> ${esc(c.name)}</label>`).join('')}</div></div>
   <label class="full">Notes<textarea name="notes" rows="2">${esc(it.notes||'')}</textarea></label>
   ${it.added_from?`<div class="full calc"><span>Added from</span><span>${esc(it.added_from)} <label style="display:inline-flex;flex-direction:row;gap:5px;margin-left:8px"><input type="checkbox" name="reviewed"> Mark as checked</label></span></div>`:''}
  </div>
  ${id?`<div class="sec"><h3>On hand · ${esc(co().name)}</h3><div class="calc"><span>${N(S.cnt.get(id)||0,3)} ${esc(xu(ul(it)))}</span><b>${R((S.cnt.get(id)||0)*(Number(it.unit_price)||0))}</b></div>
    <div id="dr-hist" class="hist"><p class="muted">Loading movements…</p></div><p class="saved">Stock changes through Stock Movements: stock takes, transfers, wastage and manufacturing.</p></div>
   <div class="sec"><h3>Price history</h3><div id="dr-price" class="hist"><p class="muted">Loading…</p></div></div>
   <div class="sec"><h3>Used in recipes</h3>${used.length?used.map(u=>`<div class="calc" style="margin-bottom:6px"><span>${esc(u.bo_recipes?.name)} <small class="muted">· ${esc(COS.find(c=>c.id===u.bo_recipes?.company)?.name||'')}</small></span><span>${N(u.qty,3)} ${esc(u.unit)}</span></div>`).join(''):'<p class="muted">Not used in any recipe yet.</p>'}</div>`:''}
  <div class="dr-act">${id?'<button type="button" class="btn danger" id="b-del">Remove item</button>':'<span></span>'}<span style="display:flex;gap:8px"><button type="button" class="btn" data-close>Cancel</button><button class="btn fill">Save</button></span></div></form>`;
  $('#dr-panel').classList.remove('wide');$('#drawer').classList.remove('hide');
  if(id)sb.from('bo_movement_lines').select('qty,delta,counted,area,bo_movements(ref,type,mdate,company,to_company,status)').eq('item_id',id).order('id',{ascending:false}).limit(60).then(({data})=>{
    const L=(data||[]).filter(l=>{const m=l.bo_movements;return m&&m.status==='done'&&l.delta!=null&&Number(l.delta)!==0&&(m.company===S.co||m.to_company===S.co)}).slice(0,12);
    const h=$('#dr-hist');if(!h)return;h.innerHTML=L.length?L.map(l=>{const m=l.bo_movements,d=m.company===S.co?Number(l.delta):-Number(l.delta);
      return `<div><span>${fmtD(m.mdate)} · ${esc(TYPES[m.type])}${m.type==='transfer'?(m.company===S.co?' to '+esc(coName(m.to_company)):' from '+esc(coName(m.company))):''} <small class="muted">${esc(m.ref)}</small></span><b class="${d<0?'neg':'pos'}">${d>0?'+':''}${N(d,3)}</b></div>`}).join(''):'<p class="muted">No movements yet.</p>'});
  if(id)sb.from('bo_price_log').select('*').eq('item_id',id).order('id',{ascending:false}).limit(20).then(({data})=>{const h=$('#dr-price');if(!h)return;
    h.innerHTML=(data||[]).length?data.map(l=>`<div><span>${new Date(l.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · ${esc(l.source||'')}${l.applied?'':' <small class="muted">· lower than current, kept the higher price</small>'}</span><b class="${l.applied?'neg':'muted'}">${l.applied?R(l.old_price)+' → '+R(l.new_price):R(l.invoice_price)}</b></div>`).join(''):'<p class="muted">No price changes logged yet.</p>'});
  const form=$('#f-item');
  const vatUi=()=>{const d=Object.fromEntries(new FormData(form));const v=d.vat!=='0',p=d.unit_price===''?null:+d.unit_price;$('#dr-pl').textContent=v?'Price ex VAT (R)':'Price (R)';$('#dr-incl').textContent=p==null?'':v?`Incl VAT: ${R(p*1.15)}`:'No VAT added';};vatUi();
  form.addEventListener('input',()=>{vatUi();const d=Object.fromEntries(new FormData(form));$('#dr-per').textContent=perLabel({unit_price:d.unit_price===''?null:+d.unit_price,count_size:+d.count_size||1,count_unit:d.count_unit})});
  form.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form));
    const row={name:d.name.trim(),supplier:d.supplier||null,department:d.department||null,category:d.category||null,sub_category:d.sub_category||null,unit_price:d.unit_price===''?null:+d.unit_price,
      count_size:+d.count_size||1,count_unit:d.count_unit,case_size:d.case_size||null,case_price:d.case_price===''?null:+d.case_price,location:d.location||null,unit_label:d.unit_label||null,notes:d.notes||null,vat:d.vat!=='0',
      businesses:new FormData(form).getAll('biz'),updated_at:new Date().toISOString()};
    if(d.reviewed)row.added_from=null;
    if(!row.name)return toast('Give the item a name');
    let res=id?await sb.from('bo_items').update(row).eq('id',id).select().single():await sb.from('bo_items').insert(row).select().single();
    if(res.error)return toast('Not saved: '+res.error.message);
    const iid=res.data.id;
    for(const inp of $$('#dr-panel input[data-cid]')){const c=S.counts.find(x=>x.id==inp.dataset.cid);if(c&&Number(inp.value)!==Number(c.count)){await sb.from('bo_counts').update({count:inp.value===''?0:+inp.value,updated_at:new Date().toISOString()}).eq('id',c.id)}}
    const na=$('#new-area')?.value.trim(),nc=$('#new-cnt')?.value;if(na&&nc!==''){await sb.from('bo_counts').upsert({company:S.co,item_id:iid,area:na,period:PERIOD,count:+nc},{onConflict:'company,item_id,area,period'})}
    closeDrawer();toast(id?'Item saved. Recipes updated.':'Item added');await load();renderStock();renderRecipeList();renderRecipe()};
  $('#b-del')&&($('#b-del').onclick=async()=>{if(!confirm(`Remove "${it.name}" from the master stock?`))return;const {error}=await sb.from('bo_items').update({active:false}).eq('id',id);if(error)return toast(error.message);closeDrawer();toast('Item removed');await load();renderStock();renderRecipe()});
}

// ---------- recipes ----------
const cats=()=>[...new Set(S.recipes.filter(r=>r.kind===rk()).map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const rk=()=>S.rkind==='batch'?'batch':'menu';
function renderRecipeList(){
  const k=rk();
  $('#rmode').innerHTML=[['menu','Menu items','Dishes that are ordered. Costed per item.'],['batch','Manufacturing','Made in bulk. Yield, wastage and batch history.']].map(([v,t,d])=>`<button class="${k===v?'on':''}" data-k="${v}"><b>${t} <small>${S.recipes.filter(r=>r.kind===v).length}</small></b><span>${d}</span></button>`).join('');
  $$('#rmode button').forEach(b=>b.onclick=()=>{if(b.dataset.k===k)return;S.rkind=b.dataset.k;S.rcat='';S.cur=k==='menu'?'hist':null;renderRecipeList();renderRecipe()});
  $('#b-newr').classList.toggle('hide',k!=='menu');$('#b-newb').classList.toggle('hide',k!=='batch');$('#b-mk').classList.toggle('hide',k!=='batch');
  $('#rcats').innerHTML=['All',...cats(),'To check'].map(c=>`<button class="${(S.rcat||'All')===c?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#rcats button').forEach(b=>b.onclick=()=>{S.rcat=b.dataset.c==='All'?'':b.dataset.c;renderRecipeList()});
  const q=$('#rq').value.trim().toLowerCase();
  const L=S.recipes.filter(r=>r.kind===k&&(!S.rcat||(S.rcat==='To check'?r.needs_check:r.category===S.rcat))&&(!q||r.name.toLowerCase().includes(q)));
  $('#rlist').innerHTML=L.map(r=>{const n=recipeNums(r);const sub=k==='menu'?`${R(n.total)} per item`:`Yield ${N(r.yield_qty,3)} ${esc(r.yield_unit)} · `+(n.per!=null?`${R(n.per)} per ${esc(r.yield_unit)}`:`${R(n.total)} per batch`);
    return `<div class="ritem ${S.cur===r.id?'on':''}" data-id="${r.id}"><div><b>${r.needs_check?'<span title="Needs checking">⚑ </span>':''}${esc(r.name)}</b><small>${esc(r.category||'')} · ${sub}${r.kind==='batch'&&S.made?.get(r.id)?` · ${N(S.made.get(r.id),3)} in stock`:''}${n.issues?` · ${n.issues} to link`:''}</small></div>${r.selling_price?gpTag(n.gp):''}</div>`}).join('')
    ||'<p class="muted" style="padding:14px">No recipes here yet.</p>';
  if(k==='batch'){const n=(S.moves||[]).filter(m=>m.type==='manufacture'&&m.company===S.co).length;$('#rlist').insertAdjacentHTML('afterbegin',`<div class="ritem hist ${S.cur==='hist'?'on':''}" data-hist><div><b>▤ Batch history</b><small>${n} batch${n==1?'':'es'} made · yield, wastage and cost</small></div></div>`)}
  $('#rlist').insertAdjacentHTML('beforeend',`<p style="padding:10px 10px 4px"><label class="link" style="display:inline;color:var(--ink-2)">Import recipes from file<input type="file" id="rimp" accept=".json" hidden></label> <span id="rimp-msg" class="saved"></span></p>`);
  $('#rimp').addEventListener('change',importRecipes);
  $$('.ritem').forEach(d=>d.onclick=()=>{S.cur=d.dataset.hist!=null?'hist':Number(d.dataset.id);S.link=null;renderRecipeList();renderRecipe()});
}
$('#rq').addEventListener('input',deb(()=>{renderRecipeList();if(S.cur==='hist')renderRecipe()},120));
const newRecipe=async kind=>{const {data,error}=await sb.from('bo_recipes').insert({company:S.co,kind,name:kind==='menu'?'New menu item':'New batch recipe',category:(S.rcat&&S.rcat!=='To check')?S.rcat:kind==='menu'?'Mains':'Kitchen prep',yield_qty:kind==='menu'?1:10,yield_unit:'portion'}).select().single();
  if(error)return toast(error.message);S.recipes.push(data);S.recById?.set(data.id,data);S.rkind=kind;S.cur=data.id;renderRecipeList();renderRecipe();setTimeout(()=>{const n=$('.rname');n.focus();n.select()},50)};
$('#b-newr').onclick=()=>newRecipe('menu');$('#b-newb').onclick=()=>newRecipe('batch');$('#b-mk').onclick=()=>openMake(typeof S.cur==='number'&&getRec(S.cur)?.kind==='batch'?S.cur:null);
const saveRecipe=deb(async(r)=>{const {error}=await sb.from('bo_recipes').update({name:r.name,category:r.category,yield_qty:r.yield_qty,yield_unit:r.yield_unit,selling_price:r.selling_price,notes:r.notes,method:r.method,needs_check:r.needs_check,kind:r.kind,updated_at:new Date().toISOString()}).eq('id',r.id);
  $('#rsaved')&&($('#rsaved').textContent=error?'Not saved: '+error.message:'Saved');renderRecipeList()},600);
function unitCostLabel(l,it,sr){
  if(it)return perLabel(it);
  if(sr){const t=recipeCost(sr).total,y=toBase(sr.yield_qty||1,sr.yield_unit),f=fam(sr.yield_unit);return y?R(t/y*(f==='n'?1:1000))+(f==='w'?' /kg':f==='v'?' /L':' /'+sr.yield_unit):'–'}
  return '';
}
function renderRecipe(){
  const box=$('#redit');if(S.cur==='hist'&&rk()==='batch')return renderBatchHistory(box);
  const r=S.recipes.find(x=>x.id===S.cur&&x.kind===rk());
  if(!r){box.innerHTML='<div class="empty">Pick a recipe on the left, or create a new one.<br><br>Ingredients come straight from the Master Stock, so costs stay up to date.</div>';return}
  const lines=S.lines.filter(l=>l.recipe_id===r.id).sort((a,b)=>a.sort-b.sort);let lastSec=null;
  const rows=lines.map(l=>{const it=l.item_id?S.byId.get(l.item_id):null,sr=l.sub_recipe_id?S.recipes.find(x=>x.id===l.sub_recipe_id):null,c=lineCost(l);
     const name=it?.name||sr?.name||l.label||'(ingredient)';const linked=!!(it||sr);
     const sub=l.no_cost?'Not costed':linked?((l.label&&l.label!==name?`“${esc(l.label)}” · `:'')+(it?esc(it.supplier||'Master stock'):'Sub-recipe')):`<span class="nil">Not linked</span> · <button class="link" data-link="${l.id}">Link to stock item</button>`;
     const sec=l.section&&l.section!==lastSec?`<tr class="secrow"><td colspan="6">${esc(l.section)}</td></tr>`:'';lastSec=l.section||lastSec;
     const units=LUNITS.concat(l.unit&&!LUNITS.includes(l.unit)?[l.unit]:[]);
     return sec+`<tr data-l="${l.id}" class="${S.link===l.id?'linking':''}"><td><b>${esc(name)}</b><div class="src">${sub}${l.as_written?` · <i>${esc(l.as_written)}</i>`:''}</div></td>
      <td class="r"><input class="q" type="number" step="any" value="${esc(l.qty??'')}" data-f="qty"></td>
      <td><select data-f="unit">${units.map(u=>`<option ${u===l.unit?'selected':''}>${u}</option>`).join('')}</select></td>
      <td class="r muted">${unitCostLabel(l,it,sr)}</td><td class="r">${c.free?'<span class="muted">–</span>':c.cost!=null?(c.approx?'<span title="Converted at 1 ml ≈ 1 g">≈ </span>':'')+R(c.cost):`<span class="nil" title="${esc(c.why)}">⚠ ${esc(c.why)}</span>`}</td><td class="r"><button class="x" data-del="${l.id}" title="Remove">×</button></td></tr>`}).join('');
  const bt=r.kind==='batch';
  box.innerHTML=`<div class="rhead">
    <label class="rn">Recipe name<input class="rname" id="r-name" value="${esc(r.name)}"></label>
    <label>Category<input id="r-cat" list="catlist" value="${esc(r.category||'')}"><datalist id="catlist">${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</datalist></label>
    ${bt?`<label>Portion yield per batch<span style="display:flex;gap:6px"><input id="r-yq" type="number" step="any" value="${esc(r.yield_qty??1)}" style="width:55%"><select id="r-yu" style="width:45%">${YUNITS.map(u=>`<option ${u===r.yield_unit?'selected':''}>${u}</option>`).join('')}</select></span></label>`:''}
    <label>${bt?'Selling price per '+esc(r.yield_unit)+' incl VAT':'Selling price incl VAT'}<input id="r-sp" type="number" step="any" placeholder="R" value="${esc(r.selling_price??'')}"></label>
    <label>&nbsp;<span class="saved" id="rsaved">Saves automatically</span></label></div>
   ${r.yield_text||r.needs_check?`<div class="rinfo">${r.yield_text?`<span>Batch as written: <b>${esc(r.yield_text)}</b></span>`:''}${r.needs_check?`<span class="flag">⚑ Needs checking <button class="link" id="b-checked">Mark as checked</button></span>`:''}</div>`:''}
   <table class="lines"><thead><tr><th>Ingredient</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit cost</th><th class="r">Line cost</th><th></th></tr></thead><tbody>${rows}</tbody></table>
   <div class="addline"><input id="addq" placeholder="${S.link?'Search the stock item to link this ingredient to…':'+ Add ingredient: search the master stock or another recipe…'}" autocomplete="off"><div class="sug hide" id="sug"></div></div>
   <div class="totals" id="tot"></div>
   <label style="margin-top:16px">Method<textarea id="r-method" rows="${Math.min(14,Math.max(3,(r.method||'').split('\n').length+1))}">${esc(r.method||'')}</textarea></label>
   <label style="margin-top:10px">Notes<textarea id="r-notes" rows="2">${esc(r.notes||'')}</textarea></label>
   ${r.source?`<p class="saved" style="margin-top:8px">Source: ${esc(r.source)}</p>`:''}
   <div class="dr-act"><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn danger" id="b-delr">Delete recipe</button><button class="btn" id="b-mv">${bt?'Move to Menu items':'Move to Manufacturing'}</button></span><span style="display:flex;gap:8px"><button class="btn" id="b-dup">Duplicate</button>${bt?'<button class="btn fill" id="b-make">Manufacture a batch</button>':''}</span></div>
   <p class="hint">${bt?'Batch recipes are made in bulk ahead of time. Use “Manufacture a batch” to take the ingredients out of stock and put the yield (after any wastage) into stock.':'Menu items have no yield. Each ingredient line is what goes into one item, and it comes out of stock per item sold, once sales from the till are linked up. To use something you made (e.g. a portion of lasagna), add the batch recipe as an ingredient.'}</p>`;
  renderTotals(r);
  $('#b-make')&&($('#b-make').onclick=()=>openMake(r.id));
  $('#b-mv').onclick=()=>{const to=bt?'menu':'batch';if(to==='menu'&&Number(r.yield_qty)!==1&&!confirm(`Menu items have no yield, so "${r.name}" will be costed as one item using all its ingredient lines (it makes ${N(r.yield_qty,3)} ${r.yield_unit} now). Move it?`))return;
    r.kind=to;if(to==='menu'){r.yield_qty=1;r.yield_unit='portion'}saveRecipe(r);S.rkind=to;renderRecipeList();renderRecipe();toast(to==='batch'?'Moved to Manufacturing':'Moved to Menu items')};
  const upd=()=>{r.name=$('#r-name').value;r.category=$('#r-cat').value.trim()||null;if(bt){r.yield_qty=+$('#r-yq').value||1;r.yield_unit=$('#r-yu').value}else{r.yield_qty=1;r.yield_unit='portion'}r.selling_price=$('#r-sp').value===''?null:+$('#r-sp').value;r.notes=$('#r-notes').value;r.method=$('#r-method').value;
    $('#rsaved').textContent='Saving…';renderTotals(r);saveRecipe(r)};
  ['#r-name','#r-yq','#r-sp','#r-notes','#r-method','#r-cat'].forEach(x=>$(x)?.addEventListener('input',upd));$('#r-yu')?.addEventListener('change',upd);
  $('#b-checked')&&($('#b-checked').onclick=()=>{r.needs_check=false;upd();renderRecipe()});
  $$('.lines tr[data-l]').forEach(tr=>{const l=S.lines.find(x=>x.id==tr.dataset.l);
    tr.querySelectorAll('[data-f]').forEach(inp=>inp.addEventListener('change',async()=>{l[inp.dataset.f]=inp.dataset.f==='qty'?(inp.value===''?null:+inp.value):inp.value;
      const {error}=await sb.from('bo_recipe_lines').update({qty:l.qty,unit:l.unit}).eq('id',l.id);if(error)toast(error.message);renderRecipe();renderRecipeList()}))});
  $$('[data-link]').forEach(b=>b.onclick=()=>{S.link=+b.dataset.link;const l=S.lines.find(x=>x.id===S.link);renderRecipe();const q=$('#addq');q.value=(l.label||'').replace(/\(.*?\)|,.*$/g,'').trim();q.focus();q.dispatchEvent(new Event('input'))});
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const id=+b.dataset.del;const {error}=await sb.from('bo_recipe_lines').delete().eq('id',id);if(error)return toast(error.message);S.lines=S.lines.filter(x=>x.id!==id);renderRecipe();renderRecipeList()});
  $('#b-delr').onclick=async()=>{if(!confirm(`Delete the recipe "${r.name}"?`))return;const {error}=await sb.from('bo_recipes').delete().eq('id',r.id);if(error)return toast(error.message.includes('foreign')?'This recipe is used inside another recipe. Remove it there first.':error.message);S.recipes=S.recipes.filter(x=>x.id!==r.id);S.lines=S.lines.filter(x=>x.recipe_id!==r.id);S.cur=null;renderRecipeList();renderRecipe()};
  $('#b-dup').onclick=async()=>{const {data,error}=await sb.from('bo_recipes').insert({company:r.company,kind:r.kind,name:r.name+' (copy)',category:r.category,yield_qty:r.yield_qty,yield_unit:r.yield_unit,selling_price:r.selling_price,notes:r.notes,method:r.method,yield_text:r.yield_text}).select().single();if(error)return toast(error.message);
    const ls=lines.map((l,i)=>({recipe_id:data.id,item_id:l.item_id,sub_recipe_id:l.sub_recipe_id,qty:l.qty,unit:l.unit,sort:i,label:l.label,section:l.section,as_written:l.as_written,no_cost:l.no_cost}));if(ls.length){const {data:nl}=await sb.from('bo_recipe_lines').insert(ls).select();S.lines.push(...(nl||[]))}
    S.recipes.push(data);S.cur=data.id;renderRecipeList();renderRecipe();toast('Recipe duplicated')};
  setupSearch(r);
}
function renderTotals(r){const n=recipeNums(r);const fc=n.per!=null&&n.sellEx?n.per/n.sellEx:null;const bt=r.kind==='batch';
  const c=(l,v)=>`<div><span>${l}</span><b>${v}</b></div>`;
  $('#tot').innerHTML=(bt?c('Batch cost',R(n.total))+c('Cost per '+esc(r.yield_unit),n.per!=null?R(n.per):'–'):c('Cost per item',R(n.total)))
    +c('Selling ex VAT',n.sellEx?R(n.sellEx):'–')+c('Food cost %',fc!=null?Math.round(fc*100)+'%':'–')+c('Gross profit',n.gp!=null?Math.round(n.gp*100)+'%':'–')
    +(bt?c('In stock (made)',`${N(S.made?.get(r.id)||0,3)} <small style="font-size:12px">${esc(r.yield_unit)}</small>`):'')
    +(n.issues?`<div style="grid-column:1/-1;background:var(--warn-bg);color:var(--warn)"><span style="color:inherit">${n.issues} ingredient line${n.issues>1?'s':''} can't be costed yet (see ⚠ above). The total leaves them out.</span></div>`:'')}
function renderBatchHistory(box){
  const q=($('#rq').value||'').trim().toLowerCase();
  const L=(S.moves||[]).filter(m=>m.type==='manufacture'&&m.company===S.co&&(!q||[m.ref,m.notes,getRec(m.recipe_id)?.name].join(' ').toLowerCase().includes(q)));
  const mon=today().slice(0,7),thisM=L.filter(m=>m.status==='done'&&String(m.mdate).startsWith(mon));
  const wv=m=>m.waste_qty&&m.expected_qty?Number(m.total_value||0)/Number(m.expected_qty)*Number(m.waste_qty):0;
  box.innerHTML=`<div class="hhead"><h2>Batch history</h2><button class="btn fill" id="bh-mk">Manufacture a batch</button></div>
   <div class="kpis sm"><div class="kpi"><span>Batches this month</span><b>${thisM.length}</b></div><div class="kpi"><span>Made this month</span><b>${R(thisM.reduce((a,m)=>a+Number(m.total_value||0),0))}</b></div><div class="kpi ${thisM.some(m=>m.waste_qty>0)?'warn':''}"><span>Production wastage this month</span><b>${R(thisM.reduce((a,m)=>a+wv(m),0))}</b></div></div>
   <div class="tablewrap"><table class="grid" id="t-batch"><thead><tr><th>Date</th><th>Ref</th><th>Recipe</th><th class="r">Batches</th><th class="r">Yield</th><th class="r">Wastage</th><th class="r">Batch cost</th><th class="r">Per unit</th><th>Status</th></tr></thead><tbody>
   ${L.map(m=>`<tr data-m="${m.id}" class="${m.status}"><td>${fmtD(m.mdate)}</td><td><b>${esc(m.ref||'')}</b></td><td>${esc(getRec(m.recipe_id)?.name||'Recipe')}</td><td class="r">${N(m.batches)}</td><td class="r">${N(m.yield_qty,3)} <small class="muted">${esc(m.yield_unit||'')}</small></td><td class="r ${m.waste_qty>0?'neg':'muted'}">${m.waste_qty>0?N(m.waste_qty,3)+(m.waste_reason?`<small>${esc(m.waste_reason)}</small>`:''):'–'}</td><td class="r">${R(m.total_value)}</td><td class="r">${m.yield_qty>0?R(m.total_value/m.yield_qty):'–'}</td><td>${m.status==='cancelled'?'<span class="tag bad">Cancelled</span>':'<span class="tag ok">Done</span>'}</td></tr>`).join('')||'<tr><td colspan="9" class="muted">No batches made yet. Pick a batch recipe and tap “Manufacture a batch”.</td></tr>'}</tbody></table></div>`;
  $('#bh-mk').onclick=()=>openMake(null);
  $$('#t-batch tr[data-m]').forEach(tr=>tr.onclick=()=>openMove(+tr.dataset.m))}
function setupSearch(r){
  const inp=$('#addq'),sug=$('#sug');let res=[],sel=0;
  const run=()=>{const q=inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!q.length){sug.classList.add('hide');return}
    const recs=S.recipes.filter(x=>x.id!==r.id&&q.every(w=>x.name.toLowerCase().includes(w))).slice(0,8).map(x=>({t:'r',x}));
    const its=S.items.filter(i=>{const h=(i.name+' '+(i.supplier||'')).toLowerCase();return q.every(w=>h.includes(w))});
    its.sort((a,b)=>((b.businesses||[]).includes(S.co)-(a.businesses||[]).includes(S.co))||((Number(b.unit_price)>0)-(Number(a.unit_price)>0))||a.name.length-b.name.length);
    res=recs.concat(its.slice(0,30).map(x=>({t:'i',x})));sel=0;draw()};
  const draw=()=>{sug.innerHTML=res.map((o,k)=>`<div class="${k===sel?'on':''}" data-k="${k}"><span>${o.t==='r'?'↳ ':''}${esc(o.x.name)}</span><small>${o.t==='r'?'Recipe · '+esc(o.x.category||''):esc((o.x.supplier||'')+' · '+perLabel(o.x))}</small></div>`).join('')||'<div><small>No match. Add the item to the Master Stock first.</small></div>';
    sug.classList.remove('hide');sug.querySelectorAll('[data-k]').forEach(d=>d.onmousedown=e=>{e.preventDefault();pick(res[+d.dataset.k])})};
  const pick=async o=>{if(!o)return;
    if(S.link){const l=S.lines.find(x=>x.id===S.link);const patch={item_id:o.t==='i'?o.x.id:null,sub_recipe_id:o.t==='r'?o.x.id:null};
      const {error}=await sb.from('bo_recipe_lines').update(patch).eq('id',l.id);if(error)return toast(error.message);Object.assign(l,patch);S.link=null;renderRecipe();renderRecipeList();toast('Linked');return}
    const f=o.t==='i'?fam(o.x.count_unit):fam(o.x.yield_unit);const unit=f==='w'?'g':f==='v'?'ml':'each';
    const row={recipe_id:r.id,item_id:o.t==='i'?o.x.id:null,sub_recipe_id:o.t==='r'?o.x.id:null,qty:f==='n'?1:100,unit,sort:Math.max(0,...S.lines.filter(l=>l.recipe_id===r.id).map(l=>l.sort||0))+1};
    const {data,error}=await sb.from('bo_recipe_lines').insert(row).select().single();if(error)return toast(error.message);S.lines.push(data);if(data.item_id)S.uses.set(data.item_id,(S.uses.get(data.item_id)||0)+1);
    renderRecipe();renderRecipeList();const q=$$('.lines tr[data-l] input.q');const last=q[q.length-1];last&&(last.focus(),last.select())};
  inp.addEventListener('input',run);inp.addEventListener('blur',()=>setTimeout(()=>sug.classList.add('hide'),150));
  inp.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){sel=Math.min(sel+1,res.length-1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);draw();e.preventDefault()}else if(e.key==='Enter'){e.preventDefault();pick(res[sel])}else if(e.key==='Escape'&&S.link){S.link=null;renderRecipe()}});
}
async function importRecipes(e){const f=e.target.files[0];if(!f)return;const msg=$('#rimp-msg');
  try{const d=JSON.parse(await f.text());if(!d.recipes||!d.lines)throw new Error('This is not a recipe file');
    const {data:ex}=await sb.from('bo_recipes').select('name,company');const have=new Set((ex||[]).map(x=>x.company+'|'+x.name.toLowerCase()));
    const todo=d.recipes.filter(r=>!have.has(r.company+'|'+r.name.toLowerCase()));if(!todo.length)throw new Error('These recipes are already loaded');
    msg.textContent=`Loading ${todo.length} recipes…`;
    const ins=await sb.from('bo_recipes').insert(todo.map(({ref,...r})=>({kind:'batch',...r}))).select('id');if(ins.error)throw ins.error;
    const idOf={};todo.forEach((r,i)=>idOf[r.ref]=ins.data[i].id);
    const all=await (async()=>{let out=[],from=0;for(;;){const {data,error}=await sb.from('bo_items').select('id,name').eq('active',true).range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000}return out})();
    const byName=new Map(all.map(i=>[i.name.toLowerCase(),i.id]));
    const rows=d.lines.filter(l=>idOf[l.recipe_ref]).map(l=>({recipe_id:idOf[l.recipe_ref],item_id:l.item?byName.get(l.item.toLowerCase())||null:null,sub_recipe_id:l.sub_ref?idOf[l.sub_ref]||null:null,qty:l.qty,unit:l.unit||'each',sort:l.sort,label:l.label,section:l.section||null,as_written:l.as_written||null,no_cost:!!l.no_cost}));
    for(let i=0;i<rows.length;i+=300){msg.textContent=`Loading ingredients ${i+1} of ${rows.length}…`;const {error}=await sb.from('bo_recipe_lines').insert(rows.slice(i,i+300));if(error)throw error}
    toast(`Loaded ${todo.length} recipes`);msg.textContent='';await switchCo(S.co);S.tab='recipes'}
  catch(err){msg.textContent='Could not load: '+err.message}e.target.value=''}

// ---------- stock movements ----------
const TYPES={opening:'Opening stock',stocktake:'Stock take',transfer:'Branch transfer',wastage:'Wastage',manufacture:'Manufacturing'};
const REASONS=['Expired','Spoiled / gone off','Damaged','Dropped or spilled','Over-production','Quality / returned','Staff meal','Tasting / samples','Other'];
const coName=id=>COS.find(c=>c.id===id)?.name||id||'';
const ul=it=>!it?'':Number(it.count_size||1)===1?it.count_unit:`${N(it.count_size,3)} ${it.count_unit}`;
const getRec=id=>S.recById?.get(id)||S.recipes.find(r=>r.id===id);
const rUnit=r=>r&&r.yield_qty?recipeCost(r).total/r.yield_qty:0;
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const fmtD=d=>d?new Date(d+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const whoIs=e=>e==='system'?'System':(Object.keys(USERS).find(k=>USERS[k]===e)||e||'').replace(/^./,c=>c.toUpperCase());
function thing(kind,id){
  if(kind==='i'){const it=S.byId.get(id);if(!it)return null;return{kind,id,name:it.name,unit:ul(it),cost:Number(it.unit_price)||0,on:S.cnt.get(id)||0,sub:[it.supplier,it.department].filter(Boolean).join(' · ')}}
  const r=getRec(id);if(!r)return null;return{kind,id,name:r.name,unit:r.yield_unit,cost:rUnit(r),on:S.made.get(id)||0,sub:'Made here · '+(r.category||'')}}
function findThings(q,made=true){const w=q.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!w.length)return[];
  const its=S.items.filter(i=>{const h=(i.name+' '+(i.supplier||'')).toLowerCase();return w.every(x=>h.includes(x))});
  its.sort((a,b)=>((S.cnt.get(b.id)>0)-(S.cnt.get(a.id)>0))||((b.businesses||[]).includes(S.co)-(a.businesses||[]).includes(S.co))||a.name.length-b.name.length);
  const recs=made?[...S.recById.values()].filter(r=>(r.company===S.co||S.made.has(r.id))&&w.every(x=>r.name.toLowerCase().includes(x))).slice(0,8):[];
  return recs.map(r=>thing('r',r.id)).concat(its.slice(0,25).map(i=>thing('i',i.id)))}
function picker(inp,sug,onPick,made=true){let res=[],sel=0;
  const draw=()=>{sug.innerHTML=res.map((o,k)=>`<div class="${k===sel?'on':''}" data-k="${k}"><span>${o.kind==='r'?'↳ ':''}${esc(o.name)}</span><small>${esc(o.sub)} · on hand ${N(o.on,3)} ${esc(xu(o.unit))}</small></div>`).join('')||'<div><small>No match</small></div>';
    sug.classList.remove('hide');sug.querySelectorAll('[data-k]').forEach(d=>d.onmousedown=e=>{e.preventDefault();go(res[+d.dataset.k])})};
  const go=o=>{if(!o)return;inp.value='';sug.classList.add('hide');onPick(o)};
  inp.addEventListener('input',()=>{res=findThings(inp.value,made);sel=0;inp.value.trim()?draw():sug.classList.add('hide')});
  inp.addEventListener('blur',()=>setTimeout(()=>sug.classList.add('hide'),150));
  inp.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){sel=Math.min(sel+1,res.length-1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);draw();e.preventDefault()}else if(e.key==='Enter'){e.preventDefault();go(res[sel])}})}

async function loadMoves(){const {data,error}=await sb.from('bo_movements').select('*').or(`company.eq.${S.co},to_company.eq.${S.co}`).order('mdate',{ascending:false}).order('id',{ascending:false}).limit(600);if(error)throw error;S.moves=data||[]}
const mvValue=m=>m.total_value==null?'':R(Math.abs(m.total_value));
function mvDetail(m){
  if(m.type==='transfer')return m.company===S.co?`<span class="dir out">→</span> To ${esc(coName(m.to_company))}`:`<span class="dir in">←</span> From ${esc(coName(m.company))}`;
  if(m.type==='manufacture')return `${esc(getRec(m.recipe_id)?.name||'Recipe')} · ${N(m.batches)} batch${m.batches==1?'':'es'} · yield ${N(m.yield_qty)} ${esc(m.yield_unit||'')}`;
  if(m.type==='stocktake')return m.status==='draft'?'<b class="warnt">In progress · tap to carry on counting</b>':`Variance ${m.total_value<0?'−':'+'}${R(Math.abs(m.total_value||0))}`;
  return esc(m.notes||'')}
function renderMoves(){
  const q=(S.mq||'').toLowerCase();
  const L=(S.moves||[]).filter(m=>m.type!=='manufacture'&&(!S.mtype||m.type===S.mtype)&&(!q||[m.ref,m.notes,TYPES[m.type],coName(m.to_company),coName(m.company),getRec(m.recipe_id)?.name].join(' ').toLowerCase().includes(q)));
  let iv=0;for(const [id,c] of S.cnt){const it=S.byId.get(id);if(it&&c>0)iv+=c*(Number(it.unit_price)||0)}
  let mv=0;for(const [id,c] of S.made)if(c>0)mv+=c*rUnit(getRec(id));
  const mon=today().slice(0,7);const waste=(S.moves||[]).filter(m=>m.type==='wastage'&&m.status==='done'&&m.company===S.co&&String(m.mdate).startsWith(mon)).reduce((a,m)=>a+Math.abs(Number(m.total_value)||0),0);
  const lt=(S.moves||[]).find(m=>m.type==='stocktake'&&m.status==='done'&&m.company===S.co);
  $('#mkpis').innerHTML=`<div class="kpi"><span>Stock on hand now</span><b>${R(iv)}</b></div><div class="kpi"><span>Made items on hand</span><b>${R(mv)}</b></div><div class="kpi ${waste?'warn':''}"><span>Wastage this month</span><b>${R(waste)}</b></div><div class="kpi"><span>Last stock take</span><b>${lt?fmtD(lt.mdate):'None yet'}</b></div>`;
  $('#mtypes').innerHTML=[['','All'],...Object.entries(TYPES).filter(([k])=>k!=='manufacture')].map(([k,v])=>`<button class="${(S.mtype||'')===k?'on':''}" data-t="${k}">${v}</button>`).join('');
  $$('#mtypes button').forEach(b=>b.onclick=()=>{S.mtype=b.dataset.t;renderMoves()});
  $('#t-moves tbody').innerHTML=L.map(m=>`<tr data-m="${m.id}" class="${m.status}"><td>${fmtD(m.mdate)}</td><td><b>${esc(m.ref||'')}</b></td><td><span class="pill t-${m.type}">${TYPES[m.type]}</span></td><td class="det">${mvDetail(m)}</td><td class="r">${m.status==='draft'?'':mvValue(m)}</td><td class="muted">${esc(whoIs(m.created_by))}</td><td>${m.status==='draft'?'<span class="tag">Draft</span>':m.status==='cancelled'?'<span class="tag bad">Cancelled</span>':'<span class="tag ok">Done</span>'}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">Nothing here yet.</td></tr>';
  $$('#t-moves tr[data-m]').forEach(tr=>tr.onclick=()=>{const m=S.moves.find(x=>x.id==tr.dataset.m);if(m.type==='stocktake'&&m.status==='draft'&&m.company===S.co)openTake(m.id);else openMove(m.id)});
}
$('#mq').addEventListener('input',deb(()=>{S.mq=$('#mq').value.trim();renderMoves()},150));

// ----- one movement: detail, print, cancel -----
async function getLines(id){const {data,error}=await sb.from('bo_movement_lines').select('*').eq('movement_id',id).order('sort').order('id');if(error)throw error;return data||[]}
const lname=l=>l.name||(l.item_id?S.byId.get(l.item_id)?.name:getRec(l.recipe_id)?.name)||'(item)';
function linesTable(m,lines){
  const tot=(v,c)=>`<tr class="tot"><td colspan="${c}">Total</td><td class="r">${R(v)}</td></tr>`;
  if(m.type==='stocktake'){const g=new Map();for(const l of lines){const k=(l.item_id||'')+'|'+(l.recipe_id||'');const o=g.get(k)||{l,c:0,e:null,d:null,v:0,areas:[]};o.c+=Number(l.counted||0);if(l.expected!=null)o.e=Number(l.expected);if(l.delta!=null)o.d=Number(l.delta);o.v+=Number(l.value||0);if(l.area)o.areas.push(l.area);g.set(k,o)}
    const rows=[...g.values()].sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)||lname(a.l).localeCompare(lname(b.l)));
    return `<table class="mvt"><thead><tr><th>Item</th><th class="r">Counted</th><th class="r">Expected</th><th class="r">Difference</th><th class="r">Value</th></tr></thead><tbody>${rows.map(o=>`<tr><td><b>${esc(lname(o.l))}</b><small>${esc(o.l.unit||'')}${o.areas.length?' · '+esc([...new Set(o.areas)].join(', ')):''}</small></td><td class="r">${N(o.c,3)}</td><td class="r">${o.e==null?'–':N(o.e,3)}</td><td class="r ${o.d<0?'neg':o.d>0?'pos':''}">${o.d==null?'–':(o.d>0?'+':'')+N(o.d,3)}</td><td class="r ${o.v<0?'neg':''}">${o.v?R(o.v):''}</td></tr>`).join('')}${tot(rows.reduce((a,o)=>a+o.v,0),4)}</tbody></table>`}
  if(m.type==='manufacture'){const used=lines.filter(l=>l.delta<0),made=lines.filter(l=>l.delta>0);
    const t=(L,h)=>`<tr class="sub"><td colspan="4">${h}</td></tr>`+L.map(l=>`<tr><td><b>${esc(lname(l))}</b><small>${esc(l.reason||'')}</small></td><td class="r">${N(l.qty,3)}</td><td>${esc(l.unit||'')}</td><td class="r">${R(l.value)}</td></tr>`).join('');
    return `<table class="mvt"><thead><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Value</th></tr></thead><tbody>${t(used,'Taken out of stock')}${t(made,'Yield added to stock')}<tr class="tot"><td colspan="3">Batch cost</td><td class="r">${R(m.total_value)}</td></tr></tbody></table>
    <div class="mvmeta">${m.expected_qty!=null?`<div><span>Expected yield</span><b>${N(m.expected_qty,3)} ${esc(m.yield_unit||'')}</b></div>`:''}<div><span>Production wastage</span><b>${m.waste_qty>0?`${N(m.waste_qty,3)} ${esc(m.yield_unit||'')} · ${esc(m.waste_reason||'')}`:'None'}</b></div><div><span>Actual yield</span><b>${N(m.yield_qty,3)} ${esc(m.yield_unit||'')}</b></div><div><span>Cost per ${esc(m.yield_unit||'unit')}</span><b>${m.yield_qty>0?R(m.total_value/m.yield_qty):'–'}</b></div></div>`}
  const rs=m.type==='wastage';const op=m.type==='opening';
  return `<table class="mvt"><thead><tr><th>Item</th>${op?'<th>Area</th>':''}<th class="r">Qty</th><th>Unit</th><th class="r">Unit cost</th><th class="r">Value</th>${rs?'<th>Reason</th>':''}</tr></thead><tbody>${lines.map(l=>`<tr><td><b>${esc(lname(l))}</b></td>${op?`<td>${esc(l.area||'')}</td>`:''}<td class="r">${N(l.qty,3)}</td><td>${esc(l.unit||'')}</td><td class="r">${R(l.unit_cost)}</td><td class="r">${R(l.value)}</td>${rs?`<td>${esc(l.reason||'')}</td>`:''}</tr>`).join('')}${`<tr class="tot"><td colspan="${op?5:4}">Total</td><td class="r">${R(lines.reduce((a,l)=>a+Number(l.value||0),0))}</td>${rs?'<td></td>':''}</tr>`}</tbody></table>`}
function metaHtml(m){return `<div class="mvmeta"><div><span>Date</span><b>${fmtD(m.mdate)}</b></div>${m.type==='transfer'?`<div><span>From</span><b>${esc(coName(m.company))}</b></div><div><span>To</span><b>${esc(coName(m.to_company))}</b></div>`:`<div><span>Business</span><b>${esc(coName(m.company))}</b></div>`}<div><span>Captured by</span><b>${esc(whoIs(m.created_by))}</b></div>${m.notes?`<div class="full"><span>Notes</span><b>${esc(m.notes)}</b></div>`:''}</div>`}
async function openMove(id){const m=S.moves.find(x=>x.id===id)||(await sb.from('bo_movements').select('*').eq('id',id).single()).data;
  $('#dr-panel').innerHTML='<p class="muted">Loading…</p>';$('#drawer').classList.remove('hide');$('#dr-panel').classList.add('wide');
  let lines;try{lines=await getLines(id)}catch(e){$('#dr-panel').innerHTML=esc(e.message);return}
  $('#dr-panel').innerHTML=`<span class="eyebrow">${TYPES[m.type]} · ${esc(m.ref)}</span><h2>${m.type==='manufacture'?esc(getRec(m.recipe_id)?.name||'Manufacturing'):TYPES[m.type]}${m.status==='cancelled'?' <span class="tag bad">Cancelled</span>':''}</h2>${metaHtml(m)}${linesTable(m,lines)}
   <div class="dr-act">${m.status==='done'&&m.type!=='opening'?'<button class="btn danger" id="b-mvx">Cancel this movement</button>':'<span></span>'}<span style="display:flex;gap:8px"><button class="btn" data-close>Close</button><button class="btn fill" id="b-print">Print / Save PDF</button></span></div>`;
  $('#b-print').onclick=()=>printMove(m,lines);
  $('#b-mvx')&&($('#b-mvx').onclick=async()=>{if(!confirm(`Cancel ${m.ref}? Its stock changes will be undone. It stays in the history as cancelled.`))return;
    const {error}=await sb.rpc('bo_cancel_movement',{mid:m.id});if(error)return toast(error.message);closeDrawer();toast(m.ref+' cancelled');await refreshStock()})}
function printMove(m,lines){
  $('#print').innerHTML=`<div class="pd-h"><img src="/assets/img/logo-orange.png" alt=""><div class="r"><h1>${TYPES[m.type]}</h1><b>${esc(m.ref)}</b></div></div>
   ${m.type==='manufacture'?`<p class="pd-sub">${esc(getRec(m.recipe_id)?.name||'')} · ${N(m.batches)} batch${m.batches==1?'':'es'} · yield ${N(m.yield_qty)} ${esc(m.yield_unit||'')}</p>`:''}${metaHtml(m)}${linesTable(m,lines)}
   ${m.type==='transfer'?`<div class="sign"><div><span>Sent by (${esc(coName(m.company))})</span><i></i><small>Name, signature and date</small></div><div><span>Received by (${esc(coName(m.to_company))})</span><i></i><small>Name, signature and date</small></div></div>`:m.type==='stocktake'?`<div class="sign"><div><span>Counted by</span><i></i><small>Name and signature</small></div><div><span>Checked by</span><i></i><small>Name and signature</small></div></div>`:''}
   <p class="pd-foot">Printed ${new Date().toLocaleString('en-GB')} · île de païn Back Office</p>`;
  window.print()}
async function refreshStock(){await load();await loadMoves();renderStock();renderRecipeList();renderRecipe();renderMoves()}

// ----- editors -----
function showEditor(title,html,from='moves'){S.edFrom=from;$('#v-moves').classList.add('hide');$('#v-recipes').classList.add('hide');$('#v-mv').classList.remove('hide');
  $('#v-mv').innerHTML=`<header class="head"><div><button class="link" id="mv-back">← ${from==='recipes'?'Manufacturing':'Stock Movements'}</button><br><span class="eyebrow">${esc(co().name)}</span><h1>${title}</h1></div></header>${html}`;
  $('#mv-back').onclick=()=>{if(S.ed&&S.ed.dirty&&!confirm('Leave without posting? What you captured here will be lost.'))return;backToList()};window.scrollTo(0,0)}
function backToList(){S.ed=null;S.tk=null;$('#v-mv').classList.add('hide');if(S.edFrom==='recipes'){S.rkind='batch';$('#v-recipes').classList.remove('hide');renderRecipeList();renderRecipe()}else{$('#v-moves').classList.remove('hide');renderMoves()}}

// transfer + wastage
function openLines(type){
  const others=COS.filter(c=>c.id!==S.co);S.ed={type,lines:[],to:others[0].id,date:today(),notes:'',dirty:false};
  showEditor(type==='transfer'?'New branch transfer':'Record wastage',`<div class="mvcard">
   <div class="mvform">${type==='transfer'?`<label>From<input value="${esc(co().name)}" disabled></label><label>To<select id="ed-to">${others.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>`:''}
    <label>Date<input type="date" id="ed-date" value="${S.ed.date}"></label><label class="grow">Notes<input id="ed-notes" placeholder="${type==='transfer'?'e.g. Weekly bread order for Nest':'e.g. Fridge 2 failed overnight'}"></label></div>
   <div class="addline"><input id="ed-q" placeholder="+ Add item: search the master stock${type==='transfer'?' or made items':' or made items (e.g. cake slices)'}…" autocomplete="off"><div class="sug hide" id="ed-sug"></div></div>
   <div id="ed-lines" class="mvlines"></div>
   <div class="mvfoot"><span id="ed-sum"></span><span class="mvbtns"><button class="btn" id="ed-x">Cancel</button><button class="btn fill" id="ed-post">${type==='transfer'?'Post transfer':'Post wastage'}</button></span></div></div>`);
  $('#ed-to')&&($('#ed-to').onchange=e=>S.ed.to=e.target.value);$('#ed-date').onchange=e=>S.ed.date=e.target.value;$('#ed-notes').oninput=e=>S.ed.notes=e.target.value;
  $('#ed-x').onclick=()=>$('#mv-back').click();
  picker($('#ed-q'),$('#ed-sug'),o=>{const ex=S.ed.lines.find(l=>l.kind===o.kind&&l.id===o.id);if(!ex)S.ed.lines.push({...o,qty:'',reason:type==='wastage'?REASONS[0]:''});S.ed.dirty=true;drawLines();
    const k=S.ed.lines.findIndex(l=>l.kind===o.kind&&l.id===o.id);const q=$(`#ed-lines [data-i="${k}"] input.q`);q&&q.focus()});
  $('#ed-post').onclick=postLines;drawLines();setTimeout(()=>$('#ed-q').focus(),50)}
function drawLines(){const E=S.ed,w=E.type==='wastage';
  $('#ed-lines').innerHTML=E.lines.length?`<div class="mvl hd"><span>Item</span><span class="r">On hand</span><span class="r">Qty</span>${w?'<span>Reason</span>':''}<span class="r">Value</span><span></span></div>`+E.lines.map((l,i)=>{const over=+l.qty>l.on;
    return `<div class="mvl" data-i="${i}"><span class="nm"><b>${l.kind==='r'?'↳ ':''}${esc(l.name)}</b><small>${esc(l.sub)}</small></span><span class="r muted oh">${N(l.on,3)}</span>
     <span class="r qty"><input class="q" type="number" step="any" min="0" inputmode="decimal" value="${esc(l.qty)}"><small>${esc(xu(l.unit))}</small>${over&&l.qty!==''?'<em class="nil">more than on hand</em>':''}</span>
     ${w?`<span><select class="rs">${REASONS.map(r=>`<option ${r===l.reason?'selected':''}>${r}</option>`).join('')}</select></span>`:''}<span class="r val">${l.qty===''?'':R(+l.qty*l.cost)}</span><span class="r"><button class="x" title="Remove">×</button></span></div>`}).join('')
   :`<div class="empty sm">Search above to add ${E.type==='transfer'?'what is being sent':'what was thrown away'}.</div>`;
  const tot=E.lines.reduce((a,l)=>a+(+l.qty||0)*l.cost,0);$('#ed-sum').innerHTML=`${E.lines.length} item${E.lines.length==1?'':'s'} · <b>${R(tot)}</b>`;
  $$('#ed-lines .mvl[data-i]').forEach(row=>{const l=E.lines[+row.dataset.i];
    row.querySelector('input.q').addEventListener('input',e=>{l.qty=e.target.value;E.dirty=true;row.querySelector('.val').textContent=l.qty===''?'':R(+l.qty*l.cost);$('#ed-sum').innerHTML=`${E.lines.length} item${E.lines.length==1?'':'s'} · <b>${R(E.lines.reduce((a,l)=>a+(+l.qty||0)*l.cost,0))}</b>`});
    row.querySelector('input.q').addEventListener('change',drawLines);
    row.querySelector('.rs')?.addEventListener('change',e=>l.reason=e.target.value);
    row.querySelector('.x').onclick=()=>{E.lines.splice(+row.dataset.i,1);drawLines()}})}
async function postLines(){const E=S.ed;const L=E.lines.filter(l=>+l.qty>0);if(!L.length)return toast('Add at least one item with a quantity');
  if(E.type==='transfer'&&!E.to)return toast('Choose where it is going');
  const lines=L.map(l=>({item_id:l.kind==='i'?l.id:null,recipe_id:l.kind==='r'?l.id:null,name:l.name,qty:+l.qty,unit:l.unit,delta:-(+l.qty),unit_cost:l.cost,value:+l.qty*l.cost,reason:l.reason||null}));
  const total=lines.reduce((a,l)=>a+l.value,0);const btn=$('#ed-post');btn.disabled=true;
  const {data:id,error}=await sb.rpc('bo_post_movement',{p:{movement:{type:E.type,company:S.co,to_company:E.type==='transfer'?E.to:null,mdate:E.date,notes:E.notes||null,total_value:E.type==='wastage'?-total:total},lines}});
  btn.disabled=false;if(error)return toast('Not posted: '+error.message);
  toast(E.type==='transfer'?`Transfer posted. Stock moved to ${coName(E.to)}.`:'Wastage posted');S.ed=null;await refreshStock();backToList();openMove(id)}

// manufacturing (batch recipes; every line editable while making)
function openMake(rid){
  S.ed={type:'manufacture',rid:rid||null,batches:1,actual:null,waste:0,wreason:WREASONS[0],date:today(),notes:'',dirty:false,lines:[],unlinked:[]};
  const grp={};for(const r of S.recipes.filter(r=>r.kind==='batch'))(grp[r.category||'Other']??=[]).push(r);
  showEditor('Manufacture a batch',`<div class="mvcard">
   <div class="mvform"><label class="grow">Batch recipe<select id="mk-r"><option value="">Choose a batch recipe…</option>${Object.keys(grp).sort().map(g=>`<optgroup label="${esc(g)}">${grp[g].map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label>Batches<input id="mk-b" type="number" step="any" min="0" inputmode="decimal" value="1"></label><label>Date<input type="date" id="mk-d" value="${S.ed.date}"></label></div>
   <div id="mk-body"></div></div>`,'recipes');
  $('#mk-r').value=rid||'';$('#mk-r').onchange=e=>{S.ed.rid=+e.target.value||null;S.ed.actual=null;S.ed.waste=0;buildMake();drawMake()};
  $('#mk-b').oninput=e=>{S.ed.batches=+e.target.value||0;S.ed.actual=null;S.ed.dirty=true;scaleMake();drawMake()};$('#mk-d').onchange=e=>S.ed.date=e.target.value;buildMake();drawMake()}
function buildMake(){const E=S.ed,r=getRec(E.rid);E.lines=[];E.unlinked=[];if(!r)return;
  for(const l of S.lines.filter(x=>x.recipe_id===r.id).sort((a,b)=>a.sort-b.sort)){if(l.no_cost)continue;
    const it=l.item_id?S.byId.get(l.item_id):null,sr=l.sub_recipe_id?getRec(l.sub_recipe_id):null;
    if(!it&&!sr){E.unlinked.push(l.label||'(ingredient)');continue}
    E.lines.push({kind:it?'i':'r',id:it?it.id:sr.id,name:it?it.name:sr.name,per:l.qty==null||l.qty===''?null:Number(l.qty),unit:l.unit||'each',recUnit:l.unit,qty:null,edited:false,added:false})}
  scaleMake()}
function scaleMake(){const E=S.ed;for(const m of E.lines)if(!m.edited&&!m.added)m.qty=m.per==null?null:+(m.per*(E.batches||0)).toFixed(4)}
function mkCalc(m){
  if(m.qty==null||m.qty==='')return{warn:'enter how much you used'};
  if(m.kind==='i'){const it=S.byId.get(m.id);const c=convQty({qty:m.qty,unit:m.unit},it.count_unit);if(!c)return{warn:`${m.unit} doesn't match how it's stocked (${ul(it)})`};
    const q=c.q/toBase(it.count_size||1,it.count_unit),cost=Number(it.unit_price)||0;return{q,unit:ul(it),cost,value:q*cost,on:S.cnt.get(it.id)||0}}
  const sr=getRec(m.id);const c=convQty({qty:m.qty,unit:m.unit},sr.yield_unit);if(!c)return{warn:`recipe yields ${sr.yield_unit}, not ${m.unit}`};
  const q=c.q/un(sr.yield_unit)[1],cost=rUnit(sr);return{q,unit:sr.yield_unit,cost,value:q*cost,on:S.made.get(sr.id)||0}}
const WREASONS=['Trim / offcuts','Burnt or overcooked','Spilled or dropped','Failed quality check','Tasting','Other'];
function mkTotals(){const E=S.ed,r=getRec(E.rid);const exp=(Number(r.yield_qty)||1)*(E.batches||0);const waste=Number(E.waste)||0;const act=E.actual==null?Math.max(0,exp-waste):E.actual;
  const cost=E.lines.reduce((a,m)=>{const c=mkCalc(m);return a+(c.value||0)},0);return{r,exp,waste,act,cost,per:act>0?cost/act:null,wcost:exp>0?cost/exp*waste:0,other:exp-waste-act}}
function drawMake(){const E=S.ed,box=$('#mk-body');const r=getRec(E.rid);
  if(!r){box.innerHTML='<div class="empty sm">Choose a batch recipe to see what it uses.</div>';return}
  const units=m=>{const L=LUNITS.concat(m.unit&&!LUNITS.includes(m.unit)?[m.unit]:[]);return L.map(u=>`<option ${u===m.unit?'selected':''}>${u}</option>`).join('')};
  const rec=m=>m.added?'<em class="tagx">added</em>':m.per==null?'–':`${N(m.per*(E.batches||0),3)} ${esc(m.recUnit)}`;
  box.innerHTML=`<div class="mkyield"><div><span>Portion yield</span><b>${N(r.yield_qty)} ${esc(r.yield_unit)} per batch</b><small id="mk-exp"></small></div>
    <label>Production wastage<span class="qty"><input id="mk-w" type="number" step="any" min="0" inputmode="decimal" value="${E.waste||''}" placeholder="0"><small>${esc(r.yield_unit)}</small></span><select id="mk-wr">${WREASONS.map(x=>`<option ${x===E.wreason?'selected':''}>${x}</option>`).join('')}</select><small id="mk-wc"></small></label>
    <label>Actual yield into stock<span class="qty"><input id="mk-a" type="number" step="any" min="0" inputmode="decimal"><small>${esc(r.yield_unit)}</small></span><small id="mk-var"></small></label>
    <div><span>Cost per ${esc(r.yield_unit)}</span><b id="mk-per"></b><small>Batch cost <b id="mk-cost"></b> · in stock now ${N(S.made.get(r.id)||0,3)} ${esc(r.yield_unit)}</small></div></div>
   <p class="hint">The recipe is pulled through for ${N(E.batches)} batch${E.batches==1?'':'es'}. Change any quantity to what you actually used, swap the unit, remove a line, or add something extra.</p>
   <div class="mvlines" id="mk-lines"><div class="mvl hd mk"><span>Ingredient</span><span class="r">Recipe says</span><span class="r">Actually used</span><span class="r">Out of stock</span><span class="r">Cost</span><span></span></div>
   ${E.lines.map((m,i)=>`<div class="mvl mk ${m.edited?'edited':''}" data-i="${i}"><span class="nm"><b>${m.kind==='r'?'↳ ':''}${esc(m.name)}</b>${m.edited?`<small>Changed from recipe · <button class="link" data-reset>use recipe amount</button></small>`:''}</span>
     <span class="r muted rec">${rec(m)}</span><span class="r qty"><input class="q" type="number" step="any" min="0" inputmode="decimal" value="${m.qty==null?'':m.qty}"><select class="u">${units(m)}</select></span>
     <span class="r out"></span><span class="r val"></span><span class="r"><button class="x" title="Remove">×</button></span></div>`).join('')}</div>
   <div class="addline"><input id="mk-q" placeholder="+ Add something extra you used…" autocomplete="off"><div class="sug hide" id="mk-sug"></div></div>
   ${E.unlinked.length?`<div class="skip"><b>${E.unlinked.length} recipe ingredient${E.unlinked.length>1?'s are':' is'} not linked to the master stock</b>${E.unlinked.map(s=>`<div>${esc(s)}</div>`).join('')}<small>These can't come out of stock. Link them in the recipe, or add the stock item above.</small></div>`:''}
   <div class="skip hide" id="mk-warn"></div>
   <label style="margin-top:14px">Notes<input id="mk-n" value="${esc(E.notes)}" placeholder="e.g. Doubled the cheese, used 1.5 kg mince"></label>
   <div class="mvfoot"><span id="mk-sum"></span><span class="mvbtns"><button class="btn" id="mk-x">Cancel</button><button class="btn fill" id="mk-post">Post manufacturing</button></span></div>`;
  $('#mk-a').value=E.actual==null?+mkTotals().act.toFixed(3):E.actual;
  $('#mk-a').addEventListener('input',e=>{E.actual=e.target.value===''?0:+e.target.value;E.dirty=true;mkNums()});
  $('#mk-w').addEventListener('input',e=>{E.waste=+e.target.value||0;E.dirty=true;if(E.actual==null)$('#mk-a').value=+mkTotals().act.toFixed(3);mkNums()});
  $('#mk-wr').onchange=e=>E.wreason=e.target.value;
  $$('#mk-lines .mvl[data-i]').forEach(row=>{const m=E.lines[+row.dataset.i];
    const chg=()=>{m.edited=!m.added&&(m.qty!==(m.per==null?null:+(m.per*(E.batches||0)).toFixed(4))||m.unit!==m.recUnit);row.classList.toggle('edited',m.edited);E.dirty=true;mkNums()};
    row.querySelector('.q').addEventListener('input',e=>{m.qty=e.target.value===''?null:+e.target.value;chg()});
    row.querySelector('.q').addEventListener('change',()=>drawMakeKeep(row.dataset.i));
    row.querySelector('.u').addEventListener('change',e=>{m.unit=e.target.value;chg();drawMakeKeep()});
    row.querySelector('[data-reset]')?.addEventListener('click',()=>{m.edited=false;m.unit=m.recUnit;scaleMake();drawMake()});
    row.querySelector('.x').onclick=()=>{E.lines.splice(+row.dataset.i,1);E.dirty=true;drawMake()}});
  picker($('#mk-q'),$('#mk-sug'),o=>{const f=o.kind==='i'?fam(S.byId.get(o.id).count_unit):fam(getRec(o.id).yield_unit);
    E.lines.push({kind:o.kind,id:o.id,name:o.name,per:null,unit:f==='w'?'g':f==='v'?'ml':o.kind==='r'?getRec(o.id).yield_unit:'each',recUnit:null,qty:null,edited:false,added:true});E.dirty=true;drawMake();
    const q=$$('#mk-lines input.q');q[q.length-1]?.focus()});
  $('#mk-n').oninput=e=>E.notes=e.target.value;$('#mk-x').onclick=()=>$('#mv-back').click();$('#mk-post').onclick=postMake;mkNums()}
function drawMakeKeep(){const y=window.scrollY;drawMake();window.scrollTo(0,y)}
function mkNums(){const E=S.ed;const T=mkTotals();const warns=[];
  $$('#mk-lines .mvl[data-i]').forEach(row=>{const m=E.lines[+row.dataset.i];const c=mkCalc(m);
    if(c.warn){row.querySelector('.out').innerHTML=`<span class="nil">⚠ ${esc(c.warn)}</span>`;row.querySelector('.val').textContent='';warns.push(m.name)}
    else{row.querySelector('.out').innerHTML=`${N(c.q,3)} ${esc(xu(c.unit))}<small class="${c.on-c.q<-0.0005?'neg':'muted'}">left: ${N(c.on-c.q,3)}</small>`;row.querySelector('.val').textContent=R(c.value)}});
  $('#mk-exp').textContent=`Expected for ${N(E.batches)} batch${E.batches==1?'':'es'}: ${N(T.exp,3)} ${T.r.yield_unit}`;
  $('#mk-per').textContent=T.per!=null?R(T.per):'–';$('#mk-cost').textContent=R(T.cost);
  $('#mk-wc').textContent=T.waste>0?`Wastage cost about ${R(T.wcost)}`:'';$('#mk-wc').className=T.waste>0?'neg':'';
  const ov=Math.abs(T.other)>0.0005;$('#mk-var').textContent=ov?`Other yield variance: ${T.other>0?'−':'+'}${N(Math.abs(T.other),3)} ${T.r.yield_unit} (not explained by wastage)`:T.waste>0?'Expected yield less wastage':'';$('#mk-var').className=ov&&T.other>0?'neg':'';
  const w=$('#mk-warn');w.classList.toggle('hide',!warns.length);w.innerHTML=warns.length?`<b>${warns.length} line${warns.length>1?'s':''} won't come out of stock</b>${warns.map(x=>`<div>${esc(x)}</div>`).join('')}<small>Fix the quantity or unit above, or remove the line.</small>`:'';
  $('#mk-sum').innerHTML=`Yield: ${N(T.act,3)} ${esc(T.r.yield_unit)} into stock · <b>${R(T.cost)}</b>`}
async function postMake(){const E=S.ed;const T=mkTotals();if(!T.r)return;if(!(E.batches>0))return toast('Enter how many batches');if(!(T.act>0))return toast('Enter the actual yield');
  const lines=[];for(const m of E.lines){const c=mkCalc(m);if(c.warn||!c.q)continue;
    lines.push({item_id:m.kind==='i'?m.id:null,recipe_id:m.kind==='r'?m.id:null,name:m.name,qty:c.q,unit:c.unit,delta:-c.q,unit_cost:c.cost,value:c.value,
      reason:m.added?`Added: ${N(m.qty,3)} ${m.unit}`:m.edited?`Used ${N(m.qty,3)} ${m.unit} (recipe ${N(m.per*E.batches,3)} ${m.recUnit})`:`Used ${N(m.qty,3)} ${m.unit}`})}
  const skipped=E.lines.filter(m=>mkCalc(m).warn).length;if(skipped&&!confirm(`${skipped} line${skipped>1?'s':''} can't come out of stock (see the warning). Post anyway?`))return;
  lines.push({recipe_id:T.r.id,name:T.r.name,qty:T.act,unit:T.r.yield_unit,delta:T.act,unit_cost:T.cost/T.act,value:T.cost,reason:T.waste>0?`Yield after ${N(T.waste,3)} ${T.r.yield_unit} wastage (${E.wreason})`:'Yield'});
  $('#mk-post').disabled=true;const {data:id,error}=await sb.rpc('bo_post_movement',{p:{movement:{type:'manufacture',company:S.co,mdate:E.date,recipe_id:T.r.id,batches:E.batches,yield_qty:T.act,yield_unit:T.r.yield_unit,expected_qty:T.exp,waste_qty:T.waste||null,waste_reason:T.waste>0?E.wreason:null,notes:E.notes||null,total_value:T.cost},lines}});
  if(error){$('#mk-post').disabled=false;return toast('Not posted: '+error.message)}
  toast(`Yield of ${N(T.act,3)} ${T.r.yield_unit} ${T.r.name} added to stock`);S.ed=null;S.rkind='batch';S.cur='hist';await refreshStock();backToList();openMove(id)}

// stock take
const MADE='Made items',OTHER='Other';
async function newTake(){const d=(S.moves||[]).find(m=>m.type==='stocktake'&&m.status==='draft'&&m.company===S.co);if(d){toast('Carrying on with the stock take in progress');return openTake(d.id)}
  const {data,error}=await sb.from('bo_movements').insert({type:'stocktake',company:S.co,status:'draft',mdate:today()}).select().single();if(error)return toast(error.message);await loadMoves();openTake(data.id)}
async function openTake(mid){let lines;try{lines=await getLines(mid)}catch(e){return toast(e.message)}
  const m=S.moves.find(x=>x.id===mid);const map=new Map();for(const l of lines)map.set(`${l.item_id?'i'+l.item_id:'r'+l.recipe_id}|${l.area}`,l);
  const areas=[...new Set(S.counts.map(c=>c.area).concat(lines.map(l=>l.area)).filter(a=>a&&a!==MADE&&a!==OTHER))].sort();
  S.tk={m,map,areas:[...areas,OTHER,MADE],area:areas[0]||OTHER,q:'',exp:false};
  showEditor('Stock take',`<div class="mvcard tk">
   <div class="mvform"><label>Count date<input type="date" id="tk-d" value="${m.mdate||today()}"></label><label class="grow">Notes<input id="tk-n" value="${esc(m.notes||'')}" placeholder="e.g. Month-end count"></label><label class="chip"><input type="checkbox" id="tk-e"> Show expected</label></div>
   <div class="rcats" id="tk-areas"></div>
   <div class="search"><span>⌕</span><input id="tk-q" placeholder="Search to count any item into this area…" autocomplete="off"></div>
   <div id="tk-list" class="tklist"></div>
   <div class="mvfoot sticky"><span id="tk-sum"></span><span class="mvbtns"><button class="btn danger" id="tk-del">Delete draft</button><button class="btn" id="tk-close">Save & close</button><button class="btn fill" id="tk-fin">Finish stock take</button></span></div></div>`);
  const saveHead=deb(async()=>{await sb.from('bo_movements').update({mdate:$('#tk-d').value||today(),notes:$('#tk-n').value||null,updated_at:new Date().toISOString()}).eq('id',mid);m.mdate=$('#tk-d').value;m.notes=$('#tk-n').value},500);
  $('#tk-d').onchange=saveHead;$('#tk-n').oninput=saveHead;$('#tk-e').onchange=e=>{S.tk.exp=e.target.checked;drawTake()};
  $('#tk-q').oninput=deb(e=>{S.tk.q=$('#tk-q').value.trim();drawTake()},150);
  $('#tk-close').onclick=backToList;$('#tk-fin').onclick=finishTake;
  $('#tk-del').onclick=async()=>{if(!confirm('Delete this stock take draft and its counts?'))return;const {error}=await sb.from('bo_movements').delete().eq('id',mid);if(error)return toast(error.message);await loadMoves();backToList();toast('Draft deleted')};
  drawTake()}
function takeRows(){const T=S.tk,a=T.area;
  if(T.q)return findThings(T.q,true);
  if(a===MADE)return [...S.recById.values()].filter(r=>r.company===S.co||S.made.has(r.id)).filter(r=>(S.made.get(r.id)||0)!==0||T.map.has(`r${r.id}|${a}`)||['portion','each'].includes(r.yield_unit)).sort((x,y)=>x.name.localeCompare(y.name)).map(r=>thing('r',r.id));
  const inArea=new Set(S.counts.filter(c=>c.area===a).map(c=>c.item_id));for(const k of T.map.keys()){const [t,ar]=k.split('|');if(ar===a&&t[0]==='i')inArea.add(+t.slice(1))}
  if(a===OTHER){const placed=new Set(S.counts.map(c=>c.item_id));for(const i of S.items)if(!placed.has(i.id)&&((i.businesses||[]).includes(S.co)||(S.cnt.get(i.id)||0)!==0))inArea.add(i.id)}
  return [...inArea].map(id=>thing('i',id)).filter(Boolean).sort((x,y)=>(S.byId.get(x.id).department||'').localeCompare(S.byId.get(y.id).department||'')||x.name.localeCompare(y.name))}
function drawTake(){const T=S.tk;const key=o=>`${o.kind}${o.id}`;
  const cntIn=a=>[...T.map.entries()].filter(([k,l])=>k.endsWith('|'+a)&&l.counted!=null).length;
  $('#tk-areas').innerHTML=T.areas.map(a=>`<button class="${a===T.area?'on':''}" data-a="${esc(a)}">${esc(a)}${cntIn(a)?` <small>${cntIn(a)}</small>`:''}</button>`).join('')+'<button data-add>+ Area</button>';
  $$('#tk-areas [data-a]').forEach(b=>b.onclick=()=>{T.area=b.dataset.a;T.q='';$('#tk-q').value='';drawTake()});
  $('#tk-areas [data-add]').onclick=()=>{const n=prompt('Name of the new area (e.g. Walk-in fridge)');if(n&&n.trim()){T.areas.splice(T.areas.length-2,0,n.trim());T.area=n.trim();drawTake()}};
  const rows=takeRows();let lastDep=null;
  $('#tk-list').innerHTML=(T.q?`<p class="hint">Counting into <b>${esc(T.area)}</b></p>`:'')+rows.map(o=>{const l=T.map.get(`${key(o)}|${T.area}`);
    const else_=[...T.map.entries()].filter(([k,x])=>k.startsWith(key(o)+'|')&&!k.endsWith('|'+T.area)&&x.counted!=null).map(([k,x])=>`${N(x.counted,3)} in ${k.split('|')[1]}`);
    const dep=o.kind==='i'?S.byId.get(o.id).department||'':'';const h=!T.q&&T.area!==MADE&&dep!==lastDep?`<div class="tkdep">${esc(dep||'Other')}</div>`:'';lastDep=dep;
    return h+`<div class="tkrow ${l&&l.counted!=null?'done':''}" data-k="${key(o)}"><span class="nm"><b>${esc(o.name)}</b><small>${esc(o.sub)}${else_.length?' · <i>'+esc(else_.join(', '))+'</i>':''}</small></span>${T.exp?`<span class="r muted ex">exp. ${N(o.on,3)}</span>`:''}<span class="qty"><input type="number" step="any" min="0" inputmode="decimal" value="${l&&l.counted!=null?l.counted:''}" placeholder="–"><small>${esc(xu(o.unit))}</small></span></div>`}).join('')
   ||'<div class="empty sm">Nothing listed in this area yet. Search above to add items.</div>';
  const all=[...T.map.values()].filter(l=>l.counted!=null);const items=new Set(all.map(l=>(l.item_id?'i'+l.item_id:'r'+l.recipe_id)));
  $('#tk-sum').innerHTML=`<b>${items.size}</b> item${items.size==1?'':'s'} counted <span class="saved" id="tk-saved"></span>`;
  $$('#tk-list .tkrow').forEach(row=>{const k=row.dataset.k;const inp=row.querySelector('input');inp.addEventListener('change',()=>saveCount(k,inp.value,row));
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const n=row.nextElementSibling?.matches('.tkdep')?row.nextElementSibling.nextElementSibling:row.nextElementSibling;n?.querySelector('input')?.focus()}})})}
async function saveCount(k,v,row){const T=S.tk,mk=`${k}|${T.area}`;let l=T.map.get(mk);const kind=k[0],id=+k.slice(1);const o=thing(kind,id);$('#tk-saved').textContent='Saving…';let error;
  if(v===''){if(l){({error}=await sb.from('bo_movement_lines').delete().eq('id',l.id));T.map.delete(mk)}}
  else if(l){({error}=await sb.from('bo_movement_lines').update({counted:+v,unit_cost:o.cost}).eq('id',l.id));l.counted=+v}
  else{const r=await sb.from('bo_movement_lines').insert({movement_id:T.m.id,item_id:kind==='i'?id:null,recipe_id:kind==='r'?id:null,name:o.name,unit:o.unit,area:T.area,counted:+v,unit_cost:o.cost}).select().single();error=r.error;if(r.data)T.map.set(mk,r.data)}
  $('#tk-saved').textContent=error?'Not saved: '+error.message:'Saved';row.classList.toggle('done',v!=='');
  const items=new Set([...T.map.values()].filter(x=>x.counted!=null).map(x=>(x.item_id?'i'+x.item_id:'r'+x.recipe_id)));$('#tk-sum b').textContent=items.size;
  $$('#tk-areas [data-a]').forEach(b=>{const a=b.dataset.a,n=[...T.map.entries()].filter(([kk,x])=>kk.endsWith('|'+a)&&x.counted!=null).length;b.innerHTML=esc(a)+(n?` <small>${n}</small>`:'')})}
function finishTake(){const T=S.tk;const g=new Map();for(const l of T.map.values()){if(l.counted==null)continue;const k=l.item_id?'i'+l.item_id:'r'+l.recipe_id;g.set(k,(g.get(k)||0)+Number(l.counted))}
  if(!g.size)return toast('Nothing counted yet');
  let varV=0,up=0,down=0;for(const [k,c] of g){const o=thing(k[0],+k.slice(1));if(!o)continue;const d=c-o.on;varV+=d*o.cost;if(d>0)up++;if(d<0)down++}
  const unc=[];for(const [id,q] of S.cnt)if(q!==0&&!g.has('i'+id))unc.push(thing('i',id));for(const [id,q] of S.made)if(q!==0&&!g.has('r'+id)){const t=thing('r',id);t&&unc.push(t)}
  const uncV=unc.reduce((a,o)=>a+o.on*o.cost,0);
  $('#dr-panel').classList.remove('wide');$('#drawer').classList.remove('hide');
  $('#dr-panel').innerHTML=`<span class="eyebrow">Stock take · ${esc(co().name)}</span><h2>Finish and post</h2>
   <div class="mvmeta"><div><span>Items counted</span><b>${g.size}</b></div><div><span>Counted more than expected</span><b>${up}</b></div><div><span>Counted less than expected</span><b>${down}</b></div><div><span>Value difference</span><b class="${varV<0?'neg':''}">${varV<0?'−':'+'}${R(Math.abs(varV))}</b></div></div>
   <p class="hint">After posting, stock on hand for every counted item becomes exactly what you counted. The differences are saved on the stock take.</p>
   ${unc.length?`<label class="chip" style="margin-top:12px;white-space:normal"><input type="checkbox" id="fz"> Set the ${unc.length} items that have stock but weren't counted to zero (${R(uncV)})</label><p class="hint">Leave this off for a partial count, e.g. only the pastry fridge.</p>`:''}
   <div class="dr-act"><button class="btn" data-close>Back to counting</button><button class="btn fill" id="fz-post">Post stock take</button></div>`;
  $('#fz-post').onclick=async()=>{$('#fz-post').disabled=true;const {data,error}=await sb.rpc('bo_post_stocktake',{mid:T.m.id,zero_uncounted:!!$('#fz')?.checked});
    if(error){$('#fz-post').disabled=false;return toast('Not posted: '+error.message)}closeDrawer();const id=T.m.id;S.tk=null;await refreshStock();backToList();toast('Stock take posted');openMove(id)}}

$('#b-take').onclick=newTake;$('#b-tr').onclick=()=>openLines('transfer');$('#b-ws').onclick=()=>openLines('wastage')

boot();
})();
