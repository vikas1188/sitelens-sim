import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudService} from '../src/cloud-service.mjs';
import {CURATED_RULES} from '../src/rules.mjs';
const event=id=>({event_id:id,ts:'2026-09-25T10:00:00.000Z',source:'simulation',type:'focus4_scenario',zone:'ZONE-B',detector_payload:{violation:true,description:'Reversing truck entered worker zone',rule_id:'VEHICLE-REVERSE'}});
function setup(){let value=null;const records=[];const store={async read(){return {value:structuredClone(value)}},async update(fn){value=structuredClone(await fn(structuredClone(value)));return value}};const rawtree={async init(){},async appendBatch(rows){records.push(...rows)},async visibleRecordCount(rows){return new Set(rows.map(r=>r.record_id)).size},async getEvent(){return null},async allEvents(){return []},async feed(){return {events:[],metrics:{}}}};return {store,records,rawtree,service:new CloudService({store,rawtree,rules:{rules:CURATED_RULES},jev:{async decide(){throw Error('offline')}}})}}
test('cloud mutation durably commits and flushes outbox, then survives fresh service instance',async()=>{const c=setup();await c.service.ingest(event('cloud-1'));assert.equal(c.records.filter(r=>r.kind==='detection').length,1);assert.equal((await c.store.read()).value.outbox.length,0);const second=new CloudService({store:c.store,rawtree:c.rawtree,rules:{rules:CURATED_RULES}});const {engine}=await second.read();assert.equal(engine.state.stats.events_today,1);assert.equal(engine.get('cloud-1').zone,'ZONE-B');await second.action('cloud-1','ack',{});assert.equal((await second.read()).engine.state.open_alert_count,1);await second.action('cloud-1','correction',{action:'Install exclusion barrier',owner:'Site supervisor',status:'completed',verified_by:'Test verifier',completed_at:new Date().toISOString()});assert.equal((await second.read()).engine.state.open_alert_count,0)});
test('failed remote flush retains durable outbox for retry',async()=>{const c=setup();c.rawtree.appendBatch=async()=>{throw Error('offline')};await c.service.ingest(event('cloud-2'));assert.ok((await c.store.read()).value.outbox.length>=3);c.rawtree.appendBatch=async rows=>c.records.push(...rows);await c.service.flush();assert.equal((await c.store.read()).value.outbox.length,0)});
test('hydrated old event retry does not create a duplicate or inflate counters',async()=>{const c=setup();const result=await c.service.ingest(event('cloud-3'));await c.store.update(s=>({...s,events:[]}));c.rawtree.getEvent=async()=>result.event;await c.service.ingest({...event('cloud-3'),detector_payload:{rule_id:'VEHICLE-REVERSE',description:'Reversing truck entered worker zone',violation:true}});assert.equal((await c.store.read()).value.state.stats.events_today,1)});
test('failed complete-history query fails report instead of returning partial cache',async()=>{const c=setup();await c.service.ingest(event('cloud-4'));c.rawtree.allEvents=async()=>{throw Error('History unavailable')};await assert.rejects(c.service.reportInput(),/History unavailable/)});

test('indexing lag retains durable outbox and refuses incomplete report until recovered',async()=>{
 const c=setup();let indexed=false;c.rawtree.visibleRecordCount=async rows=>indexed?new Set(rows.map(r=>r.record_id)).size:0;
 const committed=await c.service.ingest(event('lag-record'));assert.equal(committed.event.event_id,'lag-record');assert.ok((await c.store.read()).value.outbox.length);
 const feed=await c.service.feed();assert.equal(feed.events.length,1);assert.equal(feed.events[0].event_id,'lag-record');assert.ok(feed.sync.pending>0);
 await assert.rejects(c.service.reportInput(),error=>error.status===503&&/indexing/.test(error.message));assert.ok((await c.store.read()).value.outbox.length);
 indexed=true;const report=await c.service.reportInput();assert.equal(report.events.length,1);assert.equal(report.events[0].event_id,'lag-record');assert.equal((await c.store.read()).value.outbox.length,0);
 const after=await c.service.feed();assert.equal(after.events.length,1);assert.equal(after.sync.pending,0);
});
test('report fails closed when a concurrent write creates a new outbox after flush',async()=>{
 const c=setup();await c.service.ingest(event('concurrent-report'));const originalRead=c.store.read;let reads=0;c.store.read=async()=>{const result=await originalRead();reads++;if(reads===2)result.value.outbox=[{record_id:'new-pending',event_id:'other'}];return result};await assert.rejects(c.service.reportInput(),/indexing/);
});

test('report rejects stale history missing older records beyond compact cache',async()=>{const c=setup();await c.service.ingest(event('report-count'));await c.store.update(s=>({...s,state:{...s.state,evidence_count:205}}));await assert.rejects(c.service.reportInput(),/history is still indexing/)});
