#!/usr/bin/env node
/** Rebuild worker/map-page.js from data/portfolio-map.json */
import {readFileSync, writeFileSync} from 'node:fs';

const data = JSON.parse(readFileSync('data/portfolio-map.json', 'utf8'));
const dataLiteral = JSON.stringify(data);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Provenance · Portfolio map</title>
<style>
:root{
  --ink:#f3eee6;--muted:#9a9186;--line:#2e2a24;--accent:#c6a75e;
  --paper:#0c0b0a;--panel:#161412;--node:#1c1915;--glow:#c6a75e55;
  --audited:#c6a75e;--seeded:#8a7a5c;--page:#8fa67a;--sage:#8fa67a;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1100px 560px at 12% -10%,#1a1612 0%,var(--paper) 55%);color:var(--ink);font:14px/1.45 "Avenir Next","Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 3%;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#151310 0%,#100e0c 100%)}
header a{color:var(--accent);text-decoration:none}
header strong{letter-spacing:-.02em;font:650 15px/1.2 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.crumbs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.crumbs button{background:transparent;border:0;color:var(--accent);cursor:pointer;padding:0;font:inherit}
.crumbs span{opacity:.55}
main{display:grid;grid-template-columns:1fr 320px;min-height:calc(100vh - 58px)}
.stage{position:relative;overflow:hidden}
svg{width:100%;height:calc(100vh - 58px);display:block;cursor:grab}
svg:active{cursor:grabbing}
.hud{position:absolute;left:18px;top:18px;z-index:2;max-width:min(460px,72vw);pointer-events:none}
.hud h1{margin:0 0 6px;font:650 28px/1.15 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;letter-spacing:-.04em}
.hud p{margin:0;color:var(--muted);font-size:13px}
.side{border-left:1px solid var(--line);background:var(--panel);padding:18px;overflow:auto}
.side h2{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:650}
.statrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 18px}
.stat{border:1px solid var(--line);border-radius:10px;padding:12px}
.stat b{display:block;font-size:22px;letter-spacing:-.03em}
.stat span{color:var(--muted);font-size:11px}
.filters{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
input,select,button.action{width:100%;background:#100e0c;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:10px;font:inherit}
button.action{cursor:pointer;text-align:left}
button.action:hover{border-color:var(--accent)}
button.primary{background:#1c1915;border-color:#4a4134;color:var(--ink)}
button.primary:hover{border-color:var(--accent);color:var(--accent);background:#221e19}
.detail{border:1px solid var(--line);border-radius:12px;padding:14px;min-height:160px}
.detail .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.detail h3{margin:0 0 8px;font-size:18px;letter-spacing:-.02em}
.detail .notes{margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:11px;margin:0 6px 6px 0;color:var(--muted)}
.pill.on{border-color:var(--accent);color:var(--accent)}
.pill.page{border-color:#3d5f6c;color:var(--page)}
.pagelist{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.pagelist button{text-align:left;background:#100e0c;border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);cursor:pointer;font:inherit}
.pagelist button:hover,.pagelist button.on{border-color:var(--accent)}
.pagelist small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.topiclist{margin:8px 0 0;padding:0;list-style:none}
.topiclist li{font-size:12px;color:var(--muted);padding:3px 0;border-bottom:1px solid #1c2923}
.legend{margin-top:18px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
@media(max-width:900px){main{grid-template-columns:1fr} .side{border-left:0;border-top:1px solid var(--line)} svg{height:52vh}}
</style>
</head>
<body>
<header>
  <div>
    <strong>Provenance · Portfolio map</strong>
    <div class="crumbs" id="crumbs"></div>
  </div>
  <nav><a href="/">Fact library</a> · <a href="/inventory">Inventory</a></nav>
</header>
<main>
  <section class="stage">
    <div class="hud">
      <h1 id="hudTitle">Property graph</h1>
      <p id="hudHint">Regions as hubs. Double-click a property to zoom into pages. Drag to pan · scroll to zoom.</p>
    </div>
    <svg id="map" xmlns="http://www.w3.org/2000/svg"></svg>
  </section>
  <aside class="side">
    <h2>Snapshot</h2>
    <div class="statrow" id="stats"></div>
    <div class="filters" id="filters">
      <input id="q" type="search" placeholder="Filter properties…">
      <select id="region"><option value="">All regions</option></select>
      <select id="status">
        <option value="">All statuses</option>
        <option value="audited">Audited</option>
        <option value="seeded">Seeded</option>
      </select>
    </div>
    <div class="detail" id="detail">
      <div class="label">Selection</div>
      <h3>Nothing selected</h3>
      <p class="notes">Click a hub or property node. Double-click a property to open page view.</p>
    </div>
    <div class="legend">
      <div><i style="background:var(--audited)"></i>Audited property</div>
      <div><i style="background:var(--seeded)"></i>Seeded property</div>
      <div><i style="background:var(--page)"></i>Inventory page</div>
      <div><i style="background:#3a342c"></i>Region hub</div>
    </div>
  </aside>
</main>
<script>
const DATA=__DATA__;
const REGIONS=[...new Set(DATA.properties.map(p=>p.region))];
const W=1200,H=900;
const svg=document.getElementById('map');
svg.setAttribute('viewBox','0 0 '+W+' '+H);
const gRoot=document.createElementNS('http://www.w3.org/2000/svg','g');
svg.appendChild(gRoot);

let transform={x:0,y:0,k:1};
let dragging=false,last={x:0,y:0},moved=false;
let selected=null;
let view={mode:'portfolio',slug:null,pageKey:null}; // portfolio | property
let nodesCache=[];

const regionSel=document.getElementById('region');
REGIONS.sort().forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;regionSel.appendChild(o)});

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function propBySlug(slug){return DATA.properties.find(p=>p.slug===slug)}

function renderStats(){
  const el=document.getElementById('stats');
  if(view.mode==='property'){
    const p=propBySlug(view.slug);
    const pages=p?.pages||[];
    const facts=pages.reduce((n,pg)=>n+(pg.facts||0),0);
    el.innerHTML=
      '<div class="stat"><b>'+pages.length+'</b><span>Pages</span></div>'+
      '<div class="stat"><b>'+facts+'</b><span>Seed facts</span></div>'+
      '<div class="stat"><b>'+(p?.topics?.length||0)+'</b><span>Topics</span></div>'+
      '<div class="stat"><b>'+esc(p?.status||'')+'</b><span>Status</span></div>';
    return;
  }
  el.innerHTML=
    [['all','Properties'],['seeded','Seeded'],['audited','Audited']].map(([k,l])=>
      '<div class="stat"><b>'+(DATA.totals[k]??0)+'</b><span>'+l+'</span></div>'
    ).join('')+
    '<div class="stat"><b>'+(DATA.totals.pages||DATA.properties.reduce((s,p)=>s+(p.pages?.length||0),0))+'</b><span>Pages</span></div>';
}

function renderCrumbs(){
  const el=document.getElementById('crumbs');
  if(view.mode==='portfolio'){
    el.innerHTML='<span>Portfolio</span>';
    return;
  }
  const p=propBySlug(view.slug);
  let html='<button type="button" data-crumb="portfolio">Portfolio</button><span>/</span>';
  html+='<button type="button" data-crumb="region">'+esc(p?.region||'Region')+'</button><span>/</span>';
  if(view.pageKey){
    html+='<button type="button" data-crumb="property">'+esc(p?.label||view.slug)+'</button><span>/</span>';
    const page=(p?.pages||[]).find(x=>x.key===view.pageKey);
    html+='<span>'+esc(page?.title||view.pageKey)+'</span>';
  }else{
    html+='<span>'+esc(p?.label||view.slug)+'</span>';
  }
  el.innerHTML=html;
  el.querySelectorAll('button[data-crumb]').forEach(btn=>{
    btn.onclick=()=>{
      const c=btn.getAttribute('data-crumb');
      if(c==='portfolio') enterPortfolio();
      if(c==='region'){enterPortfolio();regionSel.value=p?.region||'';draw()}
      if(c==='property'){view.pageKey=null;selected='prop:'+view.slug;showDetail();draw()}
    };
  });
}

function filters(){
  const q=document.getElementById('q').value.trim().toLowerCase();
  const region=regionSel.value;
  const status=document.getElementById('status').value;
  return DATA.properties.filter(p=>{
    if(region&&p.region!==region) return false;
    if(status&&p.status!==status) return false;
    if(q&&!(p.label.toLowerCase().includes(q)||p.slug.includes(q)||(p.topics||[]).some(t=>t.toLowerCase().includes(q)))) return false;
    return true;
  });
}

function layoutPortfolio(props){
  const by={};
  for(const p of props)(by[p.region]=by[p.region]||[]).push(p);
  const hubs=Object.keys(by).sort();
  const cx=W/2,cy=H/2;
  const hubR=Math.min(220, 90+hubs.length*28);
  const nodes=[];
  hubs.forEach((region,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/hubs.length);
    const hx=cx+Math.cos(a)*hubR;
    const hy=cy+Math.sin(a)*hubR;
    nodes.push({id:'hub:'+region,kind:'hub',region,label:region,x:hx,y:hy,count:by[region].length});
    const ring=Math.min(150, 48+by[region].length*3.2);
    by[region].forEach((p,j)=>{
      const b=a+(-0.55+(j/Math.max(by[region].length-1,1))*1.1);
      const rr=ring*(0.75+0.25*((j%3)/2));
      nodes.push({
        id:'prop:'+p.slug,kind:'prop',region,label:p.label,slug:p.slug,status:p.status,facts:p.facts,
        pages:p.pages?.length||0,x:hx+Math.cos(b)*rr,y:hy+Math.sin(b)*rr,hubX:hx,hubY:hy
      });
    });
  });
  nodes.push({id:'core',kind:'core',label:'Provenance',x:cx,y:cy});
  return nodes;
}

function layoutProperty(p){
  const cx=W/2,cy=H/2;
  const pages=p.pages||[];
  const nodes=[{id:'prop:'+p.slug,kind:'prop-focus',label:p.label,slug:p.slug,status:p.status,facts:p.facts,x:cx,y:cy}];
  const ring=Math.min(260, 110+pages.length*10);
  pages.forEach((pg,i)=>{
    const a=-Math.PI/2+i*(Math.PI*2/Math.max(pages.length,1));
    const rr=ring*(0.85+0.15*((i%2)/1));
    nodes.push({
      id:'page:'+pg.key,kind:'page',key:pg.key,label:pg.title,page_type:pg.page_type,url:pg.url,
      facts:pg.facts||0,topics:pg.topics||[],x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr,hubX:cx,hubY:cy
    });
  });
  return nodes;
}

function applyTransform(){
  gRoot.setAttribute('transform','translate('+transform.x+','+transform.y+') scale('+transform.k+')');
}

function enterPortfolio(){
  view={mode:'portfolio',slug:null,pageKey:null};
  selected=null;
  transform={x:0,y:0,k:1};
  document.getElementById('filters').style.display='flex';
  document.getElementById('hudTitle').textContent='Property graph';
  document.getElementById('hudHint').textContent='Regions as hubs. Double-click a property to zoom into pages. Drag to pan · scroll to zoom.';
  renderStats();renderCrumbs();showDetail(null);draw();applyTransform();
}

function enterProperty(slug,focusPage){
  const p=propBySlug(slug);
  if(!p) return;
  view={mode:'property',slug,pageKey:focusPage||null};
  selected=focusPage?('page:'+focusPage):('prop:'+slug);
  transform={x:0,y:0,k:1.05};
  document.getElementById('filters').style.display='none';
  document.getElementById('hudTitle').textContent=p.label;
  document.getElementById('hudHint').textContent=(p.pages?.length||0)+' inventory pages · click a page for topics · Esc or breadcrumb to go back';
  renderStats();renderCrumbs();showDetail();draw();applyTransform();
}

function showDetail(n){
  const el=document.getElementById('detail');
  if(!n){
    if(view.mode==='property'){
      n=nodesCache.find(x=>x.id===selected)||nodesCache.find(x=>x.kind==='prop-focus');
    }else if(selected){
      n=nodesCache.find(x=>x.id===selected);
    }
  }
  if(!n||n.kind==='core'){
    el.innerHTML='<div class="label">Selection</div><h3>Provenance</h3><p class="notes">'+DATA.totals.all+' English properties · '+(DATA.totals.pages||0)+' inventory pages in the map seed.</p>';
    return;
  }
  if(n.kind==='hub'){
    el.innerHTML='<div class="label">Region</div><h3>'+esc(n.label)+'</h3><span class="pill on">'+n.count+' properties</span><p class="notes">Filter to this region or click a satellite property. Double-click a property to open its page graph.</p>';
    return;
  }
  if(n.kind==='prop'||n.kind==='prop-focus'){
    const p=propBySlug(n.slug);
    const pages=p?.pages||[];
    let html='<div class="label">Property</div><h3>'+esc(n.label)+'</h3>'+
      '<span class="pill '+(n.status==='audited'?'on':'')+'">'+esc(n.status)+'</span>'+
      '<span class="pill">'+esc(String(n.facts||0))+' facts</span>'+
      '<span class="pill page">'+pages.length+' pages</span>';
    if(p?.note) html+='<p class="notes">'+esc(p.note)+'</p>';
    else html+='<p class="notes">fourseasons.com/'+esc(n.slug)+'/ · press kit linked in seed.</p>';
    if(p?.topics?.length){
      html+='<ul class="topiclist">'+p.topics.slice(0,10).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
    }
    html+='<div style="margin-top:12px"><button class="action primary" id="zoomProp">Zoom into pages</button></div>';
    if(pages.length){
      html+='<div class="pagelist">'+pages.map(pg=>
        '<button type="button" data-page="'+esc(pg.key)+'"'+(view.pageKey===pg.key?' class="on"':'')+'>'+esc(pg.title)+
        '<small>'+esc(pg.page_type)+' · '+(pg.facts||0)+' facts</small></button>'
      ).join('')+'</div>';
    }
    el.innerHTML=html;
    el.querySelector('#zoomProp')?.addEventListener('click',()=>enterProperty(n.slug));
    el.querySelectorAll('[data-page]').forEach(btn=>{
      btn.onclick=()=>{
        if(view.mode!=='property') enterProperty(n.slug, btn.getAttribute('data-page'));
        else {view.pageKey=btn.getAttribute('data-page');selected='page:'+view.pageKey;showDetail();draw();renderCrumbs()}
      };
    });
    return;
  }
  if(n.kind==='page'){
    view.pageKey=n.key;
    let html='<div class="label">Page</div><h3>'+esc(n.label)+'</h3>'+
      '<span class="pill page">'+esc(n.page_type||'Page')+'</span>'+
      '<span class="pill">'+(n.facts||0)+' facts</span>'+
      '<p class="notes"><a href="'+esc(n.url)+'" target="_blank" rel="noopener" style="color:var(--accent)">'+esc(n.url)+'</a></p>';
    if(n.topics?.length){
      html+='<div class="label" style="margin-top:12px">Topics on this page</div><ul class="topiclist">'+
        n.topics.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
    }else{
      html+='<p class="notes">No seed facts keyed to this page yet.</p>';
    }
    html+='<div style="margin-top:12px"><button class="action" id="backProp">Back to property</button></div>';
    el.innerHTML=html;
    el.querySelector('#backProp')?.addEventListener('click',()=>{view.pageKey=null;selected='prop:'+view.slug;showDetail();draw();renderCrumbs()});
    renderCrumbs();
  }
}

function draw(){
  let nodes;
  if(view.mode==='property'){
    const p=propBySlug(view.slug);
    nodes=layoutProperty(p||{slug:view.slug,label:view.slug,pages:[]});
  }else{
    nodes=layoutPortfolio(filters());
  }
  nodesCache=nodes;
  const edges=[];
  for(const n of nodes){
    if(n.kind==='hub') edges.push({x1:W/2,y1:H/2,x2:n.x,y2:n.y,soft:true});
    if(n.kind==='prop'||n.kind==='page') edges.push({x1:n.hubX,y1:n.hubY,x2:n.x,y2:n.y,soft:false});
  }
  let html='';
  for(const e of edges){
    html+='<line x1="'+e.x1+'" y1="'+e.y1+'" x2="'+e.x2+'" y2="'+e.y2+'" stroke="'+(e.soft?'#2e2a24':'#241f1a')+'" stroke-width="'+(e.soft?1.2:1)+'" />';
  }
  for(const n of nodes){
    const on=selected===n.id;
    if(n.kind==='core'){
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="34" fill="#1c1915" stroke="#c6a75e" stroke-width="1.5"/><text x="'+n.x+'" y="'+(n.y+4)+'" text-anchor="middle" fill="#f3eee6" font-size="10" font-weight="650">Provenance</text></g>';
      continue;
    }
    if(n.kind==='hub'){
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+(on?28:24)+'" fill="#1c1915" stroke="'+(on?'#c6a75e':'#3a342c')+'" stroke-width="'+(on?2:1.25)+'"/><text x="'+n.x+'" y="'+(n.y-2)+'" text-anchor="middle" fill="#f3eee6" font-size="11" font-weight="650">'+esc(n.label)+'</text><text x="'+n.x+'" y="'+(n.y+12)+'" text-anchor="middle" fill="#9a9186" font-size="10">'+n.count+'</text></g>';
      continue;
    }
    if(n.kind==='prop-focus'){
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="40" fill="#1c1915" stroke="#c6a75e" stroke-width="2"/><text x="'+n.x+'" y="'+(n.y-2)+'" text-anchor="middle" fill="#f3eee6" font-size="12" font-weight="650">'+esc(n.label.length>18?n.label.slice(0,16)+'…':n.label)+'</text><text x="'+n.x+'" y="'+(n.y+14)+'" text-anchor="middle" fill="#9a9186" font-size="10">'+(n.facts||0)+' facts</text></g>';
      continue;
    }
    if(n.kind==='page'){
      const r=on?16:12;
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+(on?'#243028':'#1a2218')+'" stroke="'+(on?'#8fa67a':'#2f3d2a')+'" stroke-width="'+(on?2:1.25)+'"/><text x="'+n.x+'" y="'+(n.y+r+14)+'" text-anchor="middle" fill="#c8d2bf" font-size="10">'+esc(n.label.length>22?n.label.slice(0,20)+'…':n.label)+'</text><title>'+esc(n.label)+' · '+(n.facts||0)+' facts</title></g>';
      continue;
    }
    const audited=n.status==='audited';
    const r=on?8:audited?5.5:4.2;
    html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+(audited?'#c6a75e':on?'#b89a5a':'#8a7a5c')+'" stroke="'+(on?'#f3eee6':'transparent')+'" stroke-width="1.5"/><title>'+esc(n.label)+(n.pages?' · '+n.pages+' pages':'')+'</title></g>';
  }
  gRoot.innerHTML=html;
  gRoot.querySelectorAll('[data-id]').forEach(el=>{
    el.onclick=ev=>{
      if(moved) return;
      ev.stopPropagation();
      selected=el.getAttribute('data-id');
      const n=nodes.find(x=>x.id===selected);
      if(n?.kind==='page') view.pageKey=n.key;
      showDetail(n);
      draw();
    };
    el.ondblclick=ev=>{
      ev.stopPropagation();
      const id=el.getAttribute('data-id');
      const n=nodes.find(x=>x.id===id);
      if(n?.kind==='prop'||n?.kind==='prop-focus') enterProperty(n.slug);
      if(n?.kind==='page'){view.pageKey=n.key;selected=n.id;showDetail(n);draw();renderCrumbs()}
    };
  });
}

svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const delta=e.deltaY>0?0.92:1.08;
  transform.k=Math.min(3.6,Math.max(0.35,transform.k*delta));
  applyTransform();
},{passive:false});
svg.addEventListener('pointerdown',e=>{dragging=true;moved=false;last={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId)});
svg.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dx=e.clientX-last.x,dy=e.clientY-last.y;
  if(Math.abs(dx)+Math.abs(dy)>3) moved=true;
  transform.x+=dx;transform.y+=dy;last={x:e.clientX,y:e.clientY};applyTransform();
});
svg.addEventListener('pointerup',()=>dragging=false);
['q','region','status'].forEach(id=>document.getElementById(id).oninput=()=>{
  if(view.mode!=='portfolio') return;
  selected=null;showDetail(null);draw();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&view.mode==='property'){
    if(view.pageKey){view.pageKey=null;selected='prop:'+view.slug;showDetail();draw();renderCrumbs()}
    else enterPortfolio();
  }
});
renderStats();
renderCrumbs();
showDetail({kind:'core'});
draw();
applyTransform();
</script>
</body>
</html>`;

const filled = html.replace('__DATA__', dataLiteral);
writeFileSync('worker/map-page.js', 'export const MAP_HTML = ' + JSON.stringify(filled) + ';\n');
console.log('Wrote worker/map-page.js (' + filled.length + ' chars)');
