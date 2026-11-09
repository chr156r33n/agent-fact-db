// Server-side property/page inventory and batched human review.
// Authentication and same-origin checks are enforced by the parent Worker.
const TYPES=['General','Accommodation','Dining','Spa','Experiences','Events','Offers','Facilities','Other'];
const uid=()=>crypto.randomUUID();
const timestamp=()=>new Date().toISOString();
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const required=(v,max=8000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)bad('Invalid text');return v.trim()};
const pageURL=v=>{try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol))bad('Invalid URL');u.hash='';return u.href}catch{bad('Invalid HTTP(S) URL')}};
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const first=async(db,sql,...args)=>stmt(db,sql,...args).first();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const types=()=>TYPES;
function filters(u){
 const v={list_id:u.searchParams.get('list_id')||'',page_type:u.searchParams.get('page_type')||'',page_id:u.searchParams.get('page_id')||'',status:u.searchParams.get('status')||'',q:(u.searchParams.get('q')||'').trim().slice(0,200)};
 if(v.page_type&&!TYPES.includes(v.page_type))bad('Unknown page type');
 if(v.status&&!['pending','accepted','corrected','contested','duplicate'].includes(v.status))bad('Unknown status');
 return v;
}
function predicate(f){
 const w=[],p=[];
 if(f.list_id){w.push('f.list_id=?');p.push(f.list_id)}
 if(f.page_type){w.push('p.page_type=?');p.push(f.page_type)}
 if(f.page_id==='__unassigned__'){w.push('f.page_id IS NULL')}
 else if(f.page_id){w.push('f.page_id=?');p.push(f.page_id)}
 if(f.status){w.push('f.status=?');p.push(f.status)}
 if(f.q){w.push('(f.topic LIKE ? OR f.claim LIKE ? OR f.approved_claim LIKE ? OR p.url LIKE ?)');for(let i=0;i<4;i++)p.push('%'+f.q.replaceAll('%','\\%').replaceAll('_','\\_')+'%')}
 return {where:w.length?'WHERE '+w.join(' AND '):'',args:p};
}
const base=' FROM facts f LEFT JOIN pages p ON p.id=f.page_id JOIN lists l ON l.id=f.list_id ';
export async function inventoryApi(db,request,path){
 const u=new URL(request.url),method=request.method;
 if(method==='GET'&&path==='/api/inventory/meta'){
   const lists=await all(db,'SELECT id,name FROM lists ORDER BY name');
   const pages=await all(db,'SELECT id,list_id,page_type,title,url FROM pages ORDER BY title LIMIT 5000');
   const totals=await all(db,'SELECT list_id, COUNT(*) AS total, SUM(CASE WHEN status=\'pending\' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status=\'contested\' THEN 1 ELSE 0 END) AS contested FROM facts GROUP BY list_id');
   const page_counts=await all(db,'SELECT page_id, COUNT(*) AS total, SUM(CASE WHEN status=\'pending\' THEN 1 ELSE 0 END) AS pending FROM facts WHERE page_id IS NOT NULL GROUP BY page_id');
   const unassigned=await all(db,'SELECT list_id, COUNT(*) AS total, SUM(CASE WHEN status=\'pending\' THEN 1 ELSE 0 END) AS pending FROM facts WHERE page_id IS NULL GROUP BY list_id');
   return json({lists,pages,totals,page_counts,unassigned,types:TYPES});
 }
 if(method==='GET'&&path==='/api/inventory/facts'){
   const f=filters(u),{where,args}=predicate(f);
   const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||50)||50));
   const offset=Math.max(0,Math.min(1000000,Number(u.searchParams.get('offset')||0)||0));
   const total=(await first(db,'SELECT COUNT(*) AS n'+base+where,...args)).n;
   const facts=await all(db,'SELECT f.*,p.title AS page_title,p.url AS page_url,p.page_type,l.name AS property_name'+base+where+' ORDER BY CASE f.status WHEN \'contested\' THEN 0 WHEN \'pending\' THEN 1 ELSE 2 END, f.updated_at DESC, f.id LIMIT ? OFFSET ?',...args,limit,offset);
   return json({total,facts,limit,offset});
 }
 if(method!=='POST')return json({error:'Method not allowed'},405);
 const body=await request.text();if(body.length>80000)bad('Request too large',413);
 let b;try{b=JSON.parse(body)}catch{bad('Invalid JSON')}
 if(path==='/api/inventory/pages'){
   const list_id=required(b.list_id,100),url=pageURL(b.url),title=required(b.title,200),page_type=required(b.page_type,50);
   if(!TYPES.includes(page_type))bad('Unknown page type');
   if(!await first(db,'SELECT id FROM lists WHERE id=?',list_id))bad('Property not found',404);
   const existing=await first(db,'SELECT id FROM pages WHERE list_id=? AND url=?',list_id,url);
   if(existing){await stmt(db,'UPDATE pages SET title=?,page_type=? WHERE id=?',title,page_type,existing.id).run();return json({id:existing.id,updated:true})}
   const id=uid();await stmt(db,'INSERT INTO pages (id,list_id,url,title,page_type,created_at) VALUES (?,?,?,?,?,?)',id,list_id,url,title,page_type,timestamp()).run();return json({id,created:true});
 }
 if(path==='/api/inventory/assign'){
   const page_id=required(b.page_id,100), ids=b.fact_ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(x=>typeof x!=='string'))bad('Select 1-100 facts');
   const p=await first(db,'SELECT id,list_id FROM pages WHERE id=?',page_id);if(!p)bad('Page not found',404);
   const facts=await all(db,'SELECT id,list_id FROM facts WHERE id IN ('+ids.map(()=>'?').join(',')+')',...ids);
   if(facts.length!==new Set(ids).size||facts.some(f=>f.list_id!==p.list_id))bad('Facts must belong to the same property as the page');
   await db.batch(facts.map(f=>stmt(db,'UPDATE facts SET page_id=?,updated_at=? WHERE id=?',page_id,timestamp(),f.id)));
   return json({assigned:facts.length});
 }
 if(path==='/api/inventory/bulk'){
   const action=required(b.action,20);if(!['confirm','deny','amend'].includes(action))bad('Unknown bulk action');
   const scope=b.scope||'selected';let rows=[];
   if(scope==='selected'){
     if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)bad('Select 1-50 facts per batch');
     if(new Set(b.items.map(x=>x.id)).size!==b.items.length)bad('Duplicate facts');
     const ids=b.items.map(x=>required(x.id,100));
     rows=await all(db,'SELECT id,claim,status,revision FROM facts WHERE id IN ('+ids.map(()=>'?').join(',')+')',...ids);
     if(rows.length!==ids.length)bad('A selected fact was not found',409);
     for(const row of rows){const item=b.items.find(x=>x.id===row.id);if(!Number.isInteger(item.revision)||item.revision!==row.revision)bad('Fact changed; reload before reviewing',409)}
   }else if(scope==='filter'){
     if(action==='amend')bad('Bulk amendments require individual correction text');
     if(!b.filter||!b.filter.status)bad('Select a status filter to review all matching facts');
     const f=filters(new URL('https://local/?'+new URLSearchParams(b.filter)));
     const pred=predicate(f),after=typeof b.after_id==='string'?b.after_id:'';
     rows=await all(db,'SELECT f.id,f.claim,f.status,f.revision'+base+pred.where+(pred.where?' AND ':' WHERE ')+'f.id>? ORDER BY f.id LIMIT 50',...pred.args,after);
   }else bad('Unknown selection mode');
   const notes=typeof b.notes==='string'?b.notes.trim().slice(0,8000):'';
   if(action==='deny'&&!notes)bad('A reason is required when denying facts');
   if(!rows.length)return json({processed:0,next_after_id:null,completed:true});
   const byId=new Map((b.items||[]).map(x=>[x.id,x]));
   const updates=[];const stamp=timestamp();
   for(const f of rows){
     const correction=action==='amend'?required(byId.get(f.id)?.correction):null;
     const status=action==='confirm'?'accepted':action==='deny'?'contested':'corrected';
     const approved=action==='confirm'?f.claim:action==='amend'?correction:null;
     const claimLog=approved||f.claim;const reviewId=uid();
     updates.push(stmt(db,'INSERT INTO reviews (id,fact_id,status,claim,notes,actor,created_at) SELECT ?,id,?,?,?,?,? FROM facts WHERE id=? AND revision=?',reviewId,status,claimLog,notes,'administrator',stamp,f.id,f.revision));
     updates.push(stmt(db,'UPDATE facts SET status=?,approved_claim=?,notes=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?',status,approved,notes,stamp,f.id,f.revision));
   }
   const result=await db.batch(updates);
   if(result.some(x=>x.meta?.changes!==1))bad('Concurrent update detected. Refresh and retry.',409);
   return json({processed:rows.length,next_after_id:scope==='filter'?rows[rows.length-1].id:null,completed:rows.length<50});
 }
 return json({error:'Not found'},404);
}
