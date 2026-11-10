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
<title>Fact Ledger · Portfolio map</title>
<style>
:root{
  --ink:#e8efe6;--muted:#8a9a90;--line:#2a3832;--accent:#9fd08a;
  --paper:#0f1613;--panel:#15201b;--node:#1c2a24;--glow:#9fd08a55;
  --audited:#9fd08a;--seeded:#6b8f7a;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 "Avenir Next","Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 3%;border-bottom:1px solid var(--line);background:#121a16}
header a{color:var(--accent);text-decoration:none}
header strong{letter-spacing:-.02em;font-size:15px}
main{display:grid;grid-template-columns:1fr 300px;min-height:calc(100vh - 58px)}
.stage{position:relative;overflow:hidden}
svg{width:100%;height:calc(100vh - 58px);display:block;cursor:grab}
svg:active{cursor:grabbing}
.hud{position:absolute;left:18px;top:18px;z-index:2;max-width:min(420px,70vw);pointer-events:none}
.hud h1{margin:0 0 6px;font-size:28px;letter-spacing:-.04em;font-weight:650}
.hud p{margin:0;color:var(--muted);font-size:13px}
.side{border-left:1px solid var(--line);background:var(--panel);padding:18px;overflow:auto}
.side h2{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:650}
.statrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 18px}
.stat{border:1px solid var(--line);border-radius:10px;padding:12px}
.stat b{display:block;font-size:22px;letter-spacing:-.03em}
.stat span{color:var(--muted);font-size:11px}
.filters{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
input,select{width:100%;background:#0f1613;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:10px}
.detail{border:1px solid var(--line);border-radius:12px;padding:14px;min-height:140px}
.detail .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.detail h3{margin:0 0 8px;font-size:18px;letter-spacing:-.02em}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:11px;margin:0 6px 6px 0;color:var(--muted)}
.pill.on{border-color:var(--accent);color:var(--accent)}
.legend{margin-top:18px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
@media(max-width:900px){main{grid-template-columns:1fr} .side{border-left:0;border-top:1px solid var(--line)} svg{height:58vh}}
</style>
</head>
<body>
<header>
  <strong>Fact Ledger · Portfolio map</strong>
  <nav><a href="/">Fact library</a> · <a href="/inventory">Inventory</a></nav>
</header>
<main>
  <section class="stage">
    <div class="hud">
      <h1>Property graph</h1>
      <p>Regions as hubs. Properties as satellites. Drag to pan · scroll to zoom · click a node.</p>
    </div>
    <svg id="map" xmlns="http://www.w3.org/2000/svg"></svg>
  </section>
  <aside class="side">
    <h2>Snapshot</h2>
    <div class="statrow" id="stats"></div>
    <div class="filters">
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
      <p class="muted" style="color:var(--muted);margin:0">Click a hub or property node.</p>
    </div>
    <div class="legend">
      <div><i style="background:var(--audited)"></i>Audited</div>
      <div><i style="background:var(--seeded)"></i>Seeded</div>
      <div><i style="background:#3d5a4c"></i>Region hub</div>
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

document.getElementById('stats').innerHTML=
  [['all','Properties'],['seeded','Seeded'],['audited','Audited']].map(([k,l])=>
    '<div class="stat"><b>'+(DATA.totals[k]??0)+'</b><span>'+l+'</span></div>'
  ).join('')+
  '<div class="stat"><b>'+DATA.properties.reduce((s,p)=>s+p.facts,0)+'</b><span>Seed facts</span></div>';

const regionSel=document.getElementById('region');
REGIONS.sort().forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;regionSel.appendChild(o)});

let transform={x:0,y:0,k:1};
let dragging=false,last={x:0,y:0};
let selected=null;

function filters(){
  const q=document.getElementById('q').value.trim().toLowerCase();
  const region=regionSel.value;
  const status=document.getElementById('status').value;
  return DATA.properties.filter(p=>{
    if(region&&p.region!==region) return false;
    if(status&&p.status!==status) return false;
    if(q&&!(p.label.toLowerCase().includes(q)||p.slug.includes(q))) return false;
    return true;
  });
}

function layout(props){
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
        id:p.slug,kind:'prop',region,label:p.label,slug:p.slug,status:p.status,facts:p.facts,
        x:hx+Math.cos(b)*rr,y:hy+Math.sin(b)*rr,hubX:hx,hubY:hy
      });
    });
  });
  nodes.push({id:'core',kind:'core',label:'Fact Ledger',x:cx,y:cy});
  return nodes;
}

function applyTransform(){
  gRoot.setAttribute('transform','translate('+transform.x+','+transform.y+') scale('+transform.k+')');
}

function showDetail(n){
  const el=document.getElementById('detail');
  if(!n||n.kind==='core'){
    el.innerHTML='<div class="label">Selection</div><h3>Fact Ledger</h3><p style="color:var(--muted);margin:0">'+DATA.totals.all+' English properties in the registry.</p>';
    return;
  }
  if(n.kind==='hub'){
    el.innerHTML='<div class="label">Region</div><h3>'+n.label+'</h3><span class="pill on">'+n.count+' properties</span>';
    return;
  }
  el.innerHTML='<div class="label">Property</div><h3>'+n.label+'</h3>'+
    '<span class="pill '+(n.status==='audited'?'on':'')+'">'+n.status+'</span>'+
    '<span class="pill">'+n.facts+' facts</span>'+
    '<p style="color:var(--muted);margin:10px 0 0;font-size:12px">fourseasons.com/'+n.slug+'/</p>';
}

function draw(){
  const props=filters();
  const nodes=layout(props);
  const edges=[];
  for(const n of nodes){
    if(n.kind==='hub') edges.push({x1:W/2,y1:H/2,x2:n.x,y2:n.y,soft:true});
    if(n.kind==='prop') edges.push({x1:n.hubX,y1:n.hubY,x2:n.x,y2:n.y,soft:false});
  }
  let html='';
  for(const e of edges){
    html+='<line x1="'+e.x1+'" y1="'+e.y1+'" x2="'+e.x2+'" y2="'+e.y2+'" stroke="'+(e.soft?'#24352d':'#1e2c26')+'" stroke-width="'+(e.soft?1.2:1)+'" />';
  }
  for(const n of nodes){
    if(n.kind==='core'){
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="34" fill="#203129" stroke="#9fd08a" stroke-width="1.5"/><text x="'+n.x+'" y="'+(n.y+4)+'" text-anchor="middle" fill="#e8efe6" font-size="11" font-weight="650">Ledger</text></g>';
      continue;
    }
    if(n.kind==='hub'){
      const on=selected===n.id;
      html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+(on?28:24)+'" fill="#243830" stroke="'+(on?'#9fd08a':'#3d5a4c')+'" stroke-width="'+(on?2:1.25)+'"/><text x="'+n.x+'" y="'+(n.y-2)+'" text-anchor="middle" fill="#e8efe6" font-size="11" font-weight="650">'+n.label+'</text><text x="'+n.x+'" y="'+(n.y+12)+'" text-anchor="middle" fill="#8a9a90" font-size="10">'+n.count+'</text></g>';
      continue;
    }
    const audited=n.status==='audited';
    const on=selected===n.id;
    const r=on?7:audited?5.5:4.2;
    html+='<g data-id="'+n.id+'" style="cursor:pointer"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+(audited?'#9fd08a':on?'#8fb89a':'#4d6a5b')+'" stroke="'+(on?'#e8efe6':'transparent')+'" stroke-width="1.5"/><title>'+n.label+'</title></g>';
  }
  gRoot.innerHTML=html;
  gRoot.querySelectorAll('[data-id]').forEach(el=>{
    el.onclick=ev=>{
      ev.stopPropagation();
      selected=el.getAttribute('data-id');
      const n=nodes.find(x=>x.id===selected);
      showDetail(n);
      draw();
    };
  });
}

svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const delta=e.deltaY>0?0.92:1.08;
  transform.k=Math.min(3.2,Math.max(0.35,transform.k*delta));
  applyTransform();
},{passive:false});
svg.addEventListener('pointerdown',e=>{dragging=true;last={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId)});
svg.addEventListener('pointermove',e=>{if(!dragging)return;transform.x+=e.clientX-last.x;transform.y+=e.clientY-last.y;last={x:e.clientX,y:e.clientY};applyTransform()});
svg.addEventListener('pointerup',()=>dragging=false);
['q','region','status'].forEach(id=>document.getElementById(id).oninput=()=>{selected=null;showDetail(null);draw()});
showDetail({kind:'core'});
draw();
applyTransform();
</script>
</body>
</html>`;

const filled = html.replace('__DATA__', dataLiteral);
writeFileSync('worker/map-page.js', 'export const MAP_HTML = ' + JSON.stringify(filled) + ';\n');
console.log('Wrote worker/map-page.js (' + filled.length + ' chars)');
