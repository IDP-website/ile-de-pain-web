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
const N=(n,d=2)=>n==null||isNaN(n)?'':Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
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
  const {total,issues}=recipeCost(r);const per=['portion','each'].includes(r.yield_unit)?total/(r.yield_qty||1):null;
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
  S.cnt=new Map();for(const c of counts)S.cnt.set(c.item_id,(S.cnt.get(c.item_id)||0)+Number(c.count||0));
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
  renderCompanies();$('#co-name').textContent=$('#co-name2').textContent=co().name;
  $('#t-stock tbody').innerHTML='<tr><td colspan="9" class="muted">Loading…</td></tr>';
  try{await load()}catch(e){toast('Could not load: '+e.message);return}
  S.cur=null;$('#seed').classList.toggle('hide',S.items.length>0);fillFilters();renderStock();renderRecipeList();renderRecipe();
}
$$('#tabs button[data-tab]').forEach(b=>b.onclick=()=>{if(b.disabled)return;S.tab=b.dataset.tab;$$('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  $('#v-stock').classList.toggle('hide',S.tab!=='stock');$('#v-recipes').classList.toggle('hide',S.tab!=='recipes');if(S.tab==='recipes')renderRecipeList()});

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
  const q=$('#q').value.trim().toLowerCase().split(/\s+/).filter(Boolean),sup=$('#f-sup').value,dep=$('#f-dep').value,mine=$('#f-mine').checked,cnt=$('#f-counted').checked,rev=$('#f-review').checked;
  let L=S.items.filter(i=>{
    if(sup&&i.supplier!==sup)return false;if(dep&&i.department!==dep)return false;
    if(mine&&!(i.businesses||[]).includes(S.co)&&!S.cnt.has(i.id)&&!S.uses.has(i.id))return false;
    if(cnt&&!S.cnt.has(i.id))return false;if(rev&&!review(i))return false;
    if(q.length){const h=[i.name,i.supplier,i.category,i.sub_category,i.department,i.location].join(' ').toLowerCase();if(!q.every(w=>h.includes(w)))return false}
    return true});
  const [k,dir]=S.sort;const v=i=>k==='count'?(S.cnt.get(i.id)??-1):k==='value'?((S.cnt.get(i.id)||0)*(i.unit_price||0)):k==='unit_price'?Number(i.unit_price??-1):String(i[k]??'').toLowerCase();
  L.sort((a,b)=>{const x=v(a),y=v(b);return(x>y?1:x<y?-1:0)*dir});return L;
}
function renderStock(){
  const L=filtered();const shown=L.slice(0,400);
  let val=0,counted=0;for(const [id,c] of S.cnt){const it=S.byId.get(id);if(it){val+=c*(Number(it.unit_price)||0);counted++}}
  const mineAll=S.items.filter(i=>(i.businesses||[]).includes(S.co)||S.cnt.has(i.id));
  $('#kpis').innerHTML=`<div class="kpi"><span>Items for ${esc(co().name)}</span><b>${N(mineAll.length,0)}</b></div><div class="kpi"><span>Stock value · Oct 2026 count</span><b>${R(val)}</b></div><div class="kpi"><span>Items counted</span><b>${N(counted,0)}</b></div><div class="kpi warn"><span>Need review (new or no price)</span><b>${N(mineAll.filter(review).length,0)}</b></div>`;
  $('#t-stock tbody').innerHTML=shown.map(i=>{const c=S.cnt.get(i.id),u=S.uses.get(i.id);
    return `<tr data-id="${i.id}"><td class="name">${esc(i.name)}${i.added_from?'<span class="tag">new</span>':''}<small>${esc([i.department,i.location].filter(Boolean).join(' · '))}</small></td>
    <td class="muted">${esc(i.supplier||'')}</td><td class="muted">${esc(i.category||'')}</td><td class="muted">${N(i.count_size,3)} ${esc(i.count_unit)}</td>
    <td class="r">${Number(i.unit_price)>0?R(i.unit_price):'<span class="nil">no price</span>'}</td><td class="r muted">${perLabel(i)}</td>
    <td class="r">${c!=null?N(c,3):'<span class="muted">–</span>'}</td><td class="r">${c!=null&&i.unit_price?R(c*i.unit_price):''}</td><td class="r">${u?u:''}</td></tr>`}).join('')||'<tr><td colspan="9" class="muted">No items match.</td></tr>';
  $('#more').textContent=L.length>400?`Showing 400 of ${L.length} items. Search or filter to narrow it down.`:`${L.length} items`;
  $$('#t-stock tbody tr[data-id]').forEach(tr=>tr.onclick=()=>openItem(Number(tr.dataset.id)));
}
['#q','#f-sup','#f-dep','#f-mine','#f-counted','#f-review'].forEach(s=>$(s).addEventListener(s==='#q'?'input':'change',deb(renderStock,s==='#q'?150:0)));
$$('#t-stock th[data-s]').forEach(th=>th.onclick=()=>{const k=th.dataset.s;S.sort=[k,S.sort[0]===k?-S.sort[1]:1];renderStock()});
$('#b-export').onclick=()=>{const L=filtered();const rows=[['Item','Supplier','Department','Category','Count size','Count unit','Price ex VAT','Count','Value']].concat(L.map(i=>{const c=S.cnt.get(i.id);return[i.name,i.supplier,i.department,i.category,i.count_size,i.count_unit,i.unit_price,c??'',c!=null&&i.unit_price?(c*i.unit_price).toFixed(2):'']}));
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`master-stock-${S.co}.csv`;a.click()};
$('#b-add').onclick=()=>openItem(null);

// ---------- item drawer ----------
const closeDrawer=()=>$('#drawer').classList.add('hide');
$('#drawer').addEventListener('click',e=>{if(e.target.dataset.close!=null)closeDrawer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
async function openItem(id){
  const it=id?{...S.byId.get(id)}:{name:'',unit_price:null,count_size:1,count_unit:'each',businesses:[S.co]};
  const counts=id?S.counts.filter(c=>c.item_id===id):[];
  let used=[];if(id){const {data}=await sb.from('bo_recipe_lines').select('qty,unit,bo_recipes(name,company)').eq('item_id',id);used=data||[]}
  const f=(k,l,t='text',cls='')=>`<label class="${cls}">${l}<input name="${k}" type="${t}" ${t==='number'?'step="any"':''} value="${esc(it[k]??'')}"></label>`;
  $('#dr-panel').innerHTML=`<span class="eyebrow">${id?'Master stock item':'New item'}</span><h2>${esc(it.name||'New item')}</h2>
  <form id="f-item"><div class="form">
   ${f('name','Item name','text','full')}
   ${f('supplier','Supplier')}${f('department','Department')}
   ${f('category','Category')}${f('sub_category','Sub category')}
   ${f('unit_price','Price ex VAT (R)','number')}
   <label>Priced per<span style="display:flex;gap:6px"><input name="count_size" type="number" step="any" value="${esc(it.count_size??1)}" style="width:50%"><select name="count_unit" style="width:50%">${['each','g','kg','ml','L','cl'].map(u=>`<option ${String(it.count_unit).toLowerCase()===u.toLowerCase()?'selected':''}>${u}</option>`).join('')}</select></span></label>
   ${f('case_size','Case / box size')}${f('case_price','Case price ex VAT','number')}
   ${f('location','Storage / location')}${f('unit_label','Original unit label')}
   <div class="full calc"><span>Recipe cost</span><b id="dr-per">${perLabel(it)}</b></div>
   <div class="full"><label>Used by</label><div class="biz">${COS.map(c=>`<label><input type="checkbox" name="biz" value="${c.id}" ${(it.businesses||[]).includes(c.id)?'checked':''}> ${esc(c.name)}</label>`).join('')}</div></div>
   <label class="full">Notes<textarea name="notes" rows="2">${esc(it.notes||'')}</textarea></label>
   ${it.added_from?`<div class="full calc"><span>Added from</span><span>${esc(it.added_from)} <label style="display:inline-flex;flex-direction:row;gap:5px;margin-left:8px"><input type="checkbox" name="reviewed"> Mark as checked</label></span></div>`:''}
  </div>
  ${id?`<div class="sec"><h3>Stock count · ${esc(co().name)} · October 2026</h3><table class="mini">${counts.map(c=>`<tr><td>${esc(c.area)}</td><td class="r"><input data-cid="${c.id}" type="number" step="any" value="${c.count}"></td></tr>`).join('')||'<tr><td class="muted">Not counted at this business yet.</td></tr>'}
    <tr><td><input id="new-area" placeholder="Area, e.g. Kitchen" style="width:100%"></td><td class="r"><input id="new-cnt" type="number" step="any" placeholder="Count"></td></tr></table></div>
   <div class="sec"><h3>Used in recipes</h3>${used.length?used.map(u=>`<div class="calc" style="margin-bottom:6px"><span>${esc(u.bo_recipes?.name)} <small class="muted">· ${esc(COS.find(c=>c.id===u.bo_recipes?.company)?.name||'')}</small></span><span>${N(u.qty,3)} ${esc(u.unit)}</span></div>`).join(''):'<p class="muted">Not used in any recipe yet.</p>'}</div>`:''}
  <div class="dr-act">${id?'<button type="button" class="btn danger" id="b-del">Remove item</button>':'<span></span>'}<span style="display:flex;gap:8px"><button type="button" class="btn" data-close>Cancel</button><button class="btn fill">Save</button></span></div></form>`;
  $('#drawer').classList.remove('hide');
  const form=$('#f-item');
  form.addEventListener('input',()=>{const d=Object.fromEntries(new FormData(form));$('#dr-per').textContent=perLabel({unit_price:d.unit_price===''?null:+d.unit_price,count_size:+d.count_size||1,count_unit:d.count_unit})});
  form.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form));
    const row={name:d.name.trim(),supplier:d.supplier||null,department:d.department||null,category:d.category||null,sub_category:d.sub_category||null,unit_price:d.unit_price===''?null:+d.unit_price,
      count_size:+d.count_size||1,count_unit:d.count_unit,case_size:d.case_size||null,case_price:d.case_price===''?null:+d.case_price,location:d.location||null,unit_label:d.unit_label||null,notes:d.notes||null,
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
const cats=()=>[...new Set(S.recipes.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
function renderRecipeList(){
  $('#rcats').innerHTML=['All',...cats(),'To check'].map(c=>`<button class="${(S.rcat||'All')===c?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#rcats button').forEach(b=>b.onclick=()=>{S.rcat=b.dataset.c==='All'?'':b.dataset.c;renderRecipeList()});
  const q=$('#rq').value.trim().toLowerCase();
  const L=S.recipes.filter(r=>(!S.rcat||(S.rcat==='To check'?r.needs_check:r.category===S.rcat))&&(!q||r.name.toLowerCase().includes(q)));
  $('#rlist').innerHTML=L.map(r=>{const n=recipeNums(r);const sub=n.per!=null?`${R(n.per)} per ${esc(r.yield_unit)}`:`${R(n.total)} per batch`;
    return `<div class="ritem ${S.cur===r.id?'on':''}" data-id="${r.id}"><div><b>${r.needs_check?'<span title="Needs checking">⚑ </span>':''}${esc(r.name)}</b><small>${esc(r.category||'')} · ${sub}${n.issues?` · ${n.issues} to link`:''}</small></div>${r.selling_price?gpTag(n.gp):''}</div>`}).join('')
    ||'<p class="muted" style="padding:14px">No recipes here yet.</p>';
  $('#rlist').insertAdjacentHTML('beforeend',`<p style="padding:10px 10px 4px"><label class="link" style="display:inline;color:var(--ink-2)">Import recipes from file<input type="file" id="rimp" accept=".json" hidden></label> <span id="rimp-msg" class="saved"></span></p>`);
  $('#rimp').addEventListener('change',importRecipes);
  $$('.ritem').forEach(d=>d.onclick=()=>{S.cur=Number(d.dataset.id);S.link=null;renderRecipeList();renderRecipe()});
}
$('#rq').addEventListener('input',deb(renderRecipeList,120));
$('#b-newr').onclick=async()=>{const {data,error}=await sb.from('bo_recipes').insert({company:S.co,name:'New recipe',category:(S.rcat&&S.rcat!=='To check')?S.rcat:'Menu item',yield_qty:1,yield_unit:'portion'}).select().single();
  if(error)return toast(error.message);S.recipes.push(data);S.cur=data.id;renderRecipeList();renderRecipe();setTimeout(()=>{const n=$('.rname');n.focus();n.select()},50)};
const saveRecipe=deb(async(r)=>{const {error}=await sb.from('bo_recipes').update({name:r.name,category:r.category,yield_qty:r.yield_qty,yield_unit:r.yield_unit,selling_price:r.selling_price,notes:r.notes,method:r.method,needs_check:r.needs_check,updated_at:new Date().toISOString()}).eq('id',r.id);
  $('#rsaved')&&($('#rsaved').textContent=error?'Not saved: '+error.message:'Saved');renderRecipeList()},600);
function unitCostLabel(l,it,sr){
  if(it)return perLabel(it);
  if(sr){const t=recipeCost(sr).total,y=toBase(sr.yield_qty||1,sr.yield_unit),f=fam(sr.yield_unit);return y?R(t/y*(f==='n'?1:1000))+(f==='w'?' /kg':f==='v'?' /L':' /'+sr.yield_unit):'–'}
  return '';
}
function renderRecipe(){
  const r=S.recipes.find(x=>x.id===S.cur);const box=$('#redit');
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
  box.innerHTML=`<div class="rhead">
    <label class="rn">Recipe name<input class="rname" id="r-name" value="${esc(r.name)}"></label>
    <label>Category<input id="r-cat" list="catlist" value="${esc(r.category||'')}"><datalist id="catlist">${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</datalist></label>
    <label>Makes<span style="display:flex;gap:6px"><input id="r-yq" type="number" step="any" value="${esc(r.yield_qty??1)}" style="width:55%"><select id="r-yu" style="width:45%">${YUNITS.map(u=>`<option ${u===r.yield_unit?'selected':''}>${u}</option>`).join('')}</select></span></label>
    <label>Selling price incl VAT<input id="r-sp" type="number" step="any" placeholder="R" value="${esc(r.selling_price??'')}"></label>
    <label>&nbsp;<span class="saved" id="rsaved">Saves automatically</span></label></div>
   ${r.yield_text||r.needs_check?`<div class="rinfo">${r.yield_text?`<span>Batch as written: <b>${esc(r.yield_text)}</b></span>`:''}${r.needs_check?`<span class="flag">⚑ Needs checking <button class="link" id="b-checked">Mark as checked</button></span>`:''}</div>`:''}
   <table class="lines"><thead><tr><th>Ingredient</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit cost</th><th class="r">Line cost</th><th></th></tr></thead><tbody>${rows}</tbody></table>
   <div class="addline"><input id="addq" placeholder="${S.link?'Search the stock item to link this ingredient to…':'+ Add ingredient: search the master stock or another recipe…'}" autocomplete="off"><div class="sug hide" id="sug"></div></div>
   <div class="totals" id="tot"></div>
   <label style="margin-top:16px">Method<textarea id="r-method" rows="${Math.min(14,Math.max(3,(r.method||'').split('\n').length+1))}">${esc(r.method||'')}</textarea></label>
   <label style="margin-top:10px">Notes<textarea id="r-notes" rows="2">${esc(r.notes||'')}</textarea></label>
   ${r.source?`<p class="saved" style="margin-top:8px">Source: ${esc(r.source)}</p>`:''}
   <div class="dr-act"><button class="btn danger" id="b-delr">Delete recipe</button><button class="btn" id="b-dup">Duplicate</button></div>`;
  renderTotals(r);
  const upd=()=>{r.name=$('#r-name').value;r.category=$('#r-cat').value.trim()||null;r.yield_qty=+$('#r-yq').value||1;r.yield_unit=$('#r-yu').value;r.selling_price=$('#r-sp').value===''?null:+$('#r-sp').value;r.notes=$('#r-notes').value;r.method=$('#r-method').value;
    $('#rsaved').textContent='Saving…';renderTotals(r);saveRecipe(r)};
  ['#r-name','#r-yq','#r-sp','#r-notes','#r-method','#r-cat'].forEach(x=>$(x).addEventListener('input',upd));$('#r-yu').addEventListener('change',upd);
  $('#b-checked')&&($('#b-checked').onclick=()=>{r.needs_check=false;upd();renderRecipe()});
  $$('.lines tr[data-l]').forEach(tr=>{const l=S.lines.find(x=>x.id==tr.dataset.l);
    tr.querySelectorAll('[data-f]').forEach(inp=>inp.addEventListener('change',async()=>{l[inp.dataset.f]=inp.dataset.f==='qty'?(inp.value===''?null:+inp.value):inp.value;
      const {error}=await sb.from('bo_recipe_lines').update({qty:l.qty,unit:l.unit}).eq('id',l.id);if(error)toast(error.message);renderRecipe();renderRecipeList()}))});
  $$('[data-link]').forEach(b=>b.onclick=()=>{S.link=+b.dataset.link;const l=S.lines.find(x=>x.id===S.link);renderRecipe();const q=$('#addq');q.value=(l.label||'').replace(/\(.*?\)|,.*$/g,'').trim();q.focus();q.dispatchEvent(new Event('input'))});
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const id=+b.dataset.del;const {error}=await sb.from('bo_recipe_lines').delete().eq('id',id);if(error)return toast(error.message);S.lines=S.lines.filter(x=>x.id!==id);renderRecipe();renderRecipeList()});
  $('#b-delr').onclick=async()=>{if(!confirm(`Delete the recipe "${r.name}"?`))return;const {error}=await sb.from('bo_recipes').delete().eq('id',r.id);if(error)return toast(error.message.includes('foreign')?'This recipe is used inside another recipe. Remove it there first.':error.message);S.recipes=S.recipes.filter(x=>x.id!==r.id);S.lines=S.lines.filter(x=>x.recipe_id!==r.id);S.cur=null;renderRecipeList();renderRecipe()};
  $('#b-dup').onclick=async()=>{const {data,error}=await sb.from('bo_recipes').insert({company:r.company,name:r.name+' (copy)',category:r.category,yield_qty:r.yield_qty,yield_unit:r.yield_unit,selling_price:r.selling_price,notes:r.notes,method:r.method,yield_text:r.yield_text}).select().single();if(error)return toast(error.message);
    const ls=lines.map((l,i)=>({recipe_id:data.id,item_id:l.item_id,sub_recipe_id:l.sub_recipe_id,qty:l.qty,unit:l.unit,sort:i,label:l.label,section:l.section,as_written:l.as_written,no_cost:l.no_cost}));if(ls.length){const {data:nl}=await sb.from('bo_recipe_lines').insert(ls).select();S.lines.push(...(nl||[]))}
    S.recipes.push(data);S.cur=data.id;renderRecipeList();renderRecipe();toast('Recipe duplicated')};
  setupSearch(r);
}
function renderTotals(r){const n=recipeNums(r);const fc=n.per!=null&&n.sellEx?n.per/n.sellEx:null;
  $('#tot').innerHTML=`<div><span>Recipe cost</span><b>${R(n.total)}</b></div><div><span>Cost per ${esc(r.yield_unit)}</span><b>${n.per!=null?R(n.per):'–'}</b></div><div><span>Selling ex VAT</span><b>${n.sellEx?R(n.sellEx):'–'}</b></div><div><span>Food cost %</span><b>${fc!=null?Math.round(fc*100)+'%':'–'}</b></div><div><span>Gross profit</span><b>${n.gp!=null?Math.round(n.gp*100)+'%':'–'}</b></div>`+(n.issues?`<div style="grid-column:1/-1;background:var(--warn-bg);color:var(--warn)"><span style="color:inherit">${n.issues} ingredient line${n.issues>1?'s':''} can't be costed yet (see ⚠ above). The total leaves them out.</span></div>`:'')}
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
    const ins=await sb.from('bo_recipes').insert(todo.map(({ref,...r})=>r)).select('id');if(ins.error)throw ins.error;
    const idOf={};todo.forEach((r,i)=>idOf[r.ref]=ins.data[i].id);
    const all=await (async()=>{let out=[],from=0;for(;;){const {data,error}=await sb.from('bo_items').select('id,name').eq('active',true).range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000}return out})();
    const byName=new Map(all.map(i=>[i.name.toLowerCase(),i.id]));
    const rows=d.lines.filter(l=>idOf[l.recipe_ref]).map(l=>({recipe_id:idOf[l.recipe_ref],item_id:l.item?byName.get(l.item.toLowerCase())||null:null,sub_recipe_id:l.sub_ref?idOf[l.sub_ref]||null:null,qty:l.qty,unit:l.unit||'each',sort:l.sort,label:l.label,section:l.section||null,as_written:l.as_written||null,no_cost:!!l.no_cost}));
    for(let i=0;i<rows.length;i+=300){msg.textContent=`Loading ingredients ${i+1} of ${rows.length}…`;const {error}=await sb.from('bo_recipe_lines').insert(rows.slice(i,i+300));if(error)throw error}
    toast(`Loaded ${todo.length} recipes`);msg.textContent='';await switchCo(S.co);S.tab='recipes'}
  catch(err){msg.textContent='Could not load: '+err.message}e.target.value=''}

boot();
})();
