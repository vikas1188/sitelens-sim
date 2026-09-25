import {Engine,HttpError,validateEvent} from './engine.mjs';
import {CloudStore} from './cloud-store.mjs';
import {RawTree} from './rawtree.mjs';
import {Jev} from './jev.mjs';
import {loadRules} from './rules.mjs';

/** Blob owns operational state/outbox; RawTree owns the complete evidence history. */
export class CloudService {
 constructor({store,rawtree=new RawTree(),jev=new Jev(),rules}={}){this.store=store||new CloudStore({path:process.env.STATE_BLOB_PATH||'sitelens/production-state-v1.json'});this.rawtree=rawtree;this.jev=jev;this.rules=rules;this.ready=null}
 async initialize(){this.rules ||= await loadRules();if(!this.ready)this.ready=this.rawtree.init().catch(error=>{this.ready=null;throw error});await this.ready}
 async read(){this.rules ||= await loadRules();const {value}=await this.store.read();return {snapshot:value||{},engine:Engine.fromSnapshot(value,value?.rules?.rules||this.rules.rules)}}
 async mutate(fn){await this.initialize();let result;const snapshot=await this.store.update(async previous=>{const engine=Engine.fromSnapshot(previous,previous?.rules?.rules||this.rules.rules);result=await fn(engine);return {...previous,...engine.snapshot()}});await this.flush().catch(()=>{});return {event:result,state:snapshot.state}}
 async hydrate(engine,id){if(engine.events.has(id))return;const event=await this.rawtree.getEvent(id);if(event)engine.events.set(id,event)}
 async ingest(input){const raw=validateEvent(input);return this.mutate(async engine=>{await this.hydrate(engine,raw.event_id);if(engine.events.has(raw.event_id))return engine.ingest(raw);let decision;try{decision=await this.jev.decide(raw,engine.state,engine.rules)}catch{}return engine.ingest(raw,decision)})}
 async action(id,action,input){return this.mutate(async engine=>{await this.hydrate(engine,id);return action==='verdict'?engine.verdict(id,input.verdict):action==='ack'?engine.ack(id):engine.correction(id,input)})}
 async flush(){await this.initialize();const {value}=await this.store.read();const records=value?.outbox||[];if(!records.length)return;for(let i=0;i<records.length;i+=100)await this.rawtree.appendBatch(records.slice(i,i+100));const sent=new Set(records.map(r=>r.record_id));if(await this.rawtree.visibleRecordCount(records)!==sent.size)throw new HttpError(503,'Evidence indexing; retry shortly');await this.store.update(value=>({...value,outbox:(value?.outbox||[]).filter(r=>!sent.has(r.record_id))}))}
 async feed(){await this.initialize();await this.flush().catch(()=>{});const {snapshot,engine}=await this.read();try{const data=engine.state.revision?await this.rawtree.feed():{events:[],metrics:{total_alerts:0,confirmed:0,precision:null}};const merged=new Map(data.events.map(e=>[e.event_id,e]));for(const e of engine.events.values())merged.set(e.event_id,e);return {...data,events:[...merged.values()].sort((a,b)=>b.ts.localeCompare(a.ts)).slice(0,200),source:'rawtree',sync:{pending:snapshot.outbox?.length||0}}}catch(error){return {...engine.feed(),source:'durable-cache',sync:{pending:snapshot.outbox?.length||0,detail:'RawTree unavailable; latest 200 persisted events shown'}}}}
 async reportInput(){await this.initialize();await this.flush();const {snapshot,engine}=await this.read();if(snapshot.outbox?.length)throw new HttpError(503,'Evidence indexing; retry shortly');const events=engine.state.revision?await this.rawtree.allEvents():[];const merged=new Map(events.map(e=>[e.event_id,e]));for(const e of engine.events.values())merged.set(e.event_id,e);if(merged.size<(engine.state.evidence_count||0))throw new HttpError(503,'Evidence history is still indexing; retry shortly');return {events:[...merged.values()],state:engine.state,rules:snapshot.rules||this.rules,source:'RawTree complete evidence history with durable pending updates'}}
 async saveRules(rules){await this.store.update(value=>({...value,rules}));this.rules=rules;return rules}
}
