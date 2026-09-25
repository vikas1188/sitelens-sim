import test from 'node:test';
import assert from 'node:assert/strict';
import {RawTree, normalizeRawTreeTimestamp} from '../src/rawtree.mjs';
import {CURATED_RULES, loadRules, refreshRules, RULES_PATH} from '../src/rules.mjs';

test('RawTree rejects invalid identifiers and malformed records',async()=>{
  assert.throws(()=>new RawTree({env:{RAWTREE_TABLE:'events; DROP'}}),/identifier/);
  await assert.rejects(new RawTree({env:{}}).append({kind:'ack'}),/record_id/);
});
test('RawTree batches one validated transaction into one array request',async()=>{
  const requests=[];const r=new RawTree({env:{RAWTREE_API_KEY:'test'},fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({inserted:2});}});
  const rows=['detection','enrichment'].map(kind=>({record_id:kind,event_id:'e',kind,ts:'2026-09-25T22:00:00Z'}));
  assert.deepEqual(await r.appendBatch(rows),{inserted:2});assert.equal(requests.length,1);assert.deepEqual(requests[0].body,rows);
  assert.deepEqual(await r.appendBatch([]),{inserted:0});assert.equal(requests.length,1);
  await assert.rejects(r.appendBatch([rows[0],{}]),/record_id/);assert.equal(requests.length,1);
  await assert.rejects(r.appendBatch(null),/array/);
});
test('RawTree timestamps are explicit UTC and browser-portable',()=>{
  assert.equal(normalizeRawTreeTimestamp('2026-09-25 22:00:00.123456789'),'2026-09-25T22:00:00.123Z');
  assert.equal(normalizeRawTreeTimestamp('2026-09-25 22:00:00'),'2026-09-25T22:00:00.000Z');
  assert.equal(normalizeRawTreeTimestamp('2026-09-25T22:00:00.123Z'),'2026-09-25T22:00:00.123Z');
  assert.equal(new Date(normalizeRawTreeTimestamp('2026-09-25 22:00:00.123456789')).toISOString(),'2026-09-25T22:00:00.123Z');
});
test('RawTree status redacts credentials and failed writes throw',async()=>{
  const r=new RawTree({env:{RAWTREE_API_KEY:'secret-token'},fetchImpl:async()=>new Response('secret-token failed',{status:503})});
  await assert.rejects(r.append({record_id:'r',event_id:'e',kind:'ack',ts:'2026-09-25'}),/503/);
  assert.equal(r.status.connected,false);assert.ok(!r.status.error.includes('secret-token'));
});
test('RawTree feed obtains event aggregation and all-history metrics in SQL',async()=>{
  const sql=[];
  const r=new RawTree({env:{RAWTREE_API_KEY:'test'},fetchImpl:async(url,options)=>{
    const query=JSON.parse(options.body).sql;sql.push(query);
    const data=query.includes('count() AS total_alerts')?[{total_alerts:'2',confirmed:'1',false_alarms:'1',acknowledged:'1'}]:[{detection:JSON.stringify({event_id:'e',zone:'ZONE-A'}),enrichment_record:JSON.stringify({enrichment:{severity:3},decision:{violation:true},suppressed:false}),verdict_record:JSON.stringify({verdict:'confirmed'}),ack_record:JSON.stringify({acknowledged:true,ts:'2026-09-25'})}];
    return Response.json({data});
  }});
  const result=await r.feed();assert.equal(result.events[0].acknowledged,true);assert.equal(result.events[0].verdict,'confirmed');assert.equal(result.metrics.precision,0.5);
  assert.equal(sql.length,2);assert.match(sql[1],/suppressed.*false/);assert.match(sql[1],/violation.*true/);assert.ok(!sql[1].includes('LIMIT 200'));assert.match(sql[0],/argMaxIf/);
});
test('eight scoped OSHA rules include PPE, Focus Four, and added scenarios',async()=>{
  assert.equal(CURATED_RULES.length,8);assert.equal(new Set(CURATED_RULES.map(r=>r.rule_id)).size,8);
  assert.match(CURATED_RULES[0].scope_note,/not a universal/);
  const document=await loadRules();assert.equal(document.rules.length,CURATED_RULES.length);
});
test('live RawTree ingestion, replay deduplication, SQL feed and metrics',{skip:process.env.RUN_LIVE_SPONSOR_TESTS !== '1'},async()=>{
  const env={...process.env,RAWTREE_TABLE:`sitelens_smoke_${Date.now()}`};const r=new RawTree({env});await r.init();
  const ts=new Date().toISOString();const record=(kind,event_id,extra={})=>({record_id:`${event_id}-${kind}`,kind,event_id,ts,...extra});
  try {
    const detection=record('detection','smoke-alert',{zone:'ZONE-A',type:'ppe_violation',source:'sponsor-live-smoke'});
    const batch=[detection,detection,record('enrichment','smoke-alert',{decision:{violation:true},suppressed:false,enrichment:{severity:3}}),record('verdict','smoke-alert',{verdict:'confirmed'}),record('ack','smoke-alert',{acknowledged:true}),record('detection','smoke-clear'),record('enrichment','smoke-clear',{decision:{violation:false},suppressed:false,enrichment:{}}),record('detection','smoke-suppressed'),record('enrichment','smoke-suppressed',{decision:{violation:true},suppressed:true,enrichment:{}})];
    const started=performance.now();const inserted=await r.appendBatch(batch);console.log(JSON.stringify({batch_records:batch.length,inserted:inserted.inserted,latency_ms:Math.round(performance.now()-started)}));assert.equal(inserted.inserted,9);
    let result;
    for(let attempt=0;attempt<12;attempt++){result=await r.feed();if(result.events.length===3) break;await new Promise(resolve=>setTimeout(resolve,250));}
    assert.equal(result.events.length,3);assert.equal(result.metrics.total_alerts,1);assert.equal(result.metrics.confirmed,1);assert.equal(result.metrics.precision,1);const alert=result.events.find(e=>e.event_id==='smoke-alert');assert.equal(alert.acknowledged,true);assert.equal(alert.ts,ts);assert.equal(alert.source,'sponsor-live-smoke');assert.equal(alert.acknowledged_at,ts);assert.equal(result.metrics.source,'rawtree_sql');
  } finally {await r.request(`/v1/tables/${r.table}`,undefined,'DELETE');}
});

test('RawTree hydration strips envelope fields and preserves latest correction',async()=>{
 const row={detection:JSON.stringify({kind:'detection',record_id:'r',event_id:'e',ts:'2026-09-25 22:00:00.123000000',source:'iphone-1'}),enrichment_record:JSON.stringify({decision:{violation:true}}),correction_record:JSON.stringify({closed:true,corrective_action:{action:'Barrier installed',status:'completed',completed_at:'2026-09-25 22:10:00.000000000'}})};
 const r=new RawTree({env:{RAWTREE_API_KEY:'test'},fetchImpl:async()=>Response.json({data:[row]})});const event=await r.getEvent('e');assert.equal(event.closed,true);assert.equal(event.corrective_action.action,'Barrier installed');assert.equal(event.corrective_action.completed_at,'2026-09-25T22:10:00.000Z');assert.equal(event.raw.kind,undefined);assert.equal(event.raw.record_id,undefined);assert.equal(event.raw.ts,'2026-09-25T22:00:00.123Z');await assert.rejects(r.getEvent("e' OR 1=1"),/event_id/);
});
test('RawTree report query rejects truncation and feed validates pagination',async()=>{
 const r=new RawTree({env:{RAWTREE_API_KEY:'test'},fetchImpl:async()=>Response.json({data:[{total_event_count:'201',detection:'{}'}]})});await assert.rejects(r.allEvents(),/truncated/);await assert.rejects(r.feed({limit:1001}),/pagination/);await assert.rejects(r.feed({offset:-1}),/pagination/);
});
test('live RawTree full report exceeds 200 rows and correction latest hydrates',{skip:process.env.RUN_LIVE_SPONSOR_TESTS!=='1'},async()=>{
 const r=new RawTree({env:{...process.env,RAWTREE_TABLE:`sitelens_report_smoke_${Date.now()}`}});await r.init();const ts=new Date().toISOString();
 try {
  const rows=Array.from({length:205},(_,i)=>{const event_id=`report-${String(i).padStart(3,'0')}`;return [{kind:'detection',record_id:`${event_id}-d`,event_id,ts,source:'test-report',zone:'ZONE-A',type:'ppe_violation',detector_payload:{violation:true,description:'Test fixture only'}},{kind:'enrichment',record_id:`${event_id}-e`,event_id,ts,enrichment:{severity:3},decision:{violation:true},suppressed:false}];}).flat();
  rows.push({kind:'correction',record_id:'corr-old',event_id:'report-000',ts,closed:false,corrective_action:{action:'Work scheduled',status:'open'}},{kind:'correction',record_id:'corr-new',event_id:'report-000',ts:new Date(Date.parse(ts)+1000).toISOString(),closed:true,corrective_action:{action:'Barrier installed',status:'completed',completed_at:ts,verified_by:'Test fixture'}});
  assert.equal((await r.appendBatch(rows)).inserted,412);
  let all;for(let attempt=0;attempt<15;attempt++){all=await r.allEvents();if(all.length===205)break;await new Promise(resolve=>setTimeout(resolve,200));}assert.equal(all.length,205);
  const hydrated=await r.getEvent('report-000');assert.equal(hydrated.closed,true);assert.equal(hydrated.corrective_action.action,'Barrier installed');assert.equal(hydrated.raw.record_id,undefined);
  const first=await r.feed({limit:200,offset:0}),last=await r.feed({limit:200,offset:200});assert.equal(first.events.length,200);assert.equal(first.pagination.has_more,true);assert.equal(first.pagination.next_offset,200);assert.equal(last.events.length,5);assert.equal(last.pagination.has_more,false);assert.equal(new Set([...first.events,...last.events].map(e=>e.event_id)).size,205);assert.equal(first.metrics.total_alerts,205);assert.equal(await r.getEvent('does-not-exist'),null);
 } finally {await r.request(`/v1/tables/${r.table}`,undefined,'DELETE');}
});

test('Nimble can refresh all configured rules without filesystem persistence',async()=>{
 const {readFile}=await import('node:fs/promises');const before=await readFile(RULES_PATH,'utf8');
 const result=await refreshRules({persist:false,env:{NIMBLE_API_KEY:'test'},fetchImpl:async(url)=>Response.json(url.endsWith('/search')?{results:[]}:{data:{markdown:CURATED_RULES.flatMap(r=>r.evidence_terms).join(' ')}})});
 assert.equal(result.provenance.status,'verified');assert.equal(result.provenance.verified_rule_count,CURATED_RULES.length);assert.equal(await readFile(RULES_PATH,'utf8'),before);
});

test('RawTree visibility fence counts unique UUID records and rejects injection',async()=>{
 const sql=[];const r=new RawTree({env:{RAWTREE_API_KEY:'test'},fetchImpl:async(url,options)=>{sql.push(JSON.parse(options.body).sql);return Response.json({data:[{visible_records:'1'}]});}});
 const row={record_id:'01234567-89ab-cdef-0123-456789abcdef'};assert.equal(await r.visibleRecordCount([row,row]),1);assert.equal(sql.length,1);assert.match(sql[0],/uniqExact/);assert.equal(await r.visibleRecordCount([]),0);await assert.rejects(r.visibleRecordCount([{record_id:"bad' OR 1=1"}]),/UUID/);
});
test('live RawTree visibility fence counts indexed unique records',{skip:process.env.RUN_LIVE_SPONSOR_TESTS!=='1'},async()=>{
 const {randomUUID}=await import('node:crypto');const r=new RawTree({env:{...process.env,RAWTREE_TABLE:`sitelens_visibility_smoke_${Date.now()}`}});await r.init();
 try{const rows=[0,1].map(i=>({record_id:randomUUID(),event_id:`visible-${i}`,kind:'state',ts:new Date().toISOString()}));await r.appendBatch([...rows,rows[0]]);let visible=0;for(let attempt=0;attempt<15;attempt++){visible=await r.visibleRecordCount(rows);if(visible===2)break;await new Promise(resolve=>setTimeout(resolve,200));}assert.equal(visible,2);const withMissing=[...rows,{record_id:randomUUID()}];let withMissingCount=0;for(let attempt=0;attempt<15;attempt++){withMissingCount=await r.visibleRecordCount(withMissing);if(withMissingCount===2)break;await new Promise(resolve=>setTimeout(resolve,200));}assert.equal(withMissingCount,2);}finally{await r.request(`/v1/tables/${r.table}`,undefined,'DELETE');}
});
