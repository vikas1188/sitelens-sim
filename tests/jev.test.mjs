import test from 'node:test';
import assert from 'node:assert/strict';
import {Jev} from '../src/jev.mjs';
import {CURATED_RULES} from '../src/rules.mjs';
const event={event_id:'jev-smoke',source:'test',type:'ppe_violation',zone:'ZONE-A',ts:'2026-09-25T00:00:00Z',detector_payload:{workers_visible:1,all_wearing_hardhats:false,violation:true,confidence:.6,pattern:'glare',description:'Worker without a hardhat below construction work.'}};
const card={site_id:'test',zones:[{zone_id:'ZONE-A',confidence_threshold:.8,suppression_rules:[]}],open_alerts:[],shift_summary:'Active overhead construction hazards in Zone A.'};
const response=()=>({model:'jev-test',answers:{violation:{type:'noul',noul:.98},severity:{type:'score',score:2.1},rule_id:{type:'choice',choice:'PPE-HEAD'},suppress:{type:'noul',noul:.99}},usage:{input_tokens:100,output_tokens:5}});
test('Jev typed contract passes only current card/event and protects suppression',async()=>{
 let payload;const jev=new Jev({env:{TYPESAFE_JEV_KEY:'test'},fetchImpl:async(url,opts)=>{payload=JSON.parse(opts.body);return Response.json(response());}});
 const result=await jev.decide(event,card,CURATED_RULES);assert.equal(result.provider,'jev');assert.equal(result.severity,3);assert.equal(result.confidence,null);assert.equal(result.probability,.98);assert.equal(result.suppress,false);assert.deepEqual(Object.keys(payload.state),['card','event','derived']);assert.equal(payload.state.derived.suppression_eligible,false);
 const learned=structuredClone(card);learned.zones[0].suppression_rules=[{pattern:'glare',type:'ppe_violation',learned_from:'human-reviewed-event'}];assert.equal((await jev.decide(event,learned,CURATED_RULES)).suppress,true);
 const unknown=structuredClone(event);delete unknown.detector_payload.confidence;assert.equal((await jev.decide(unknown,learned,CURATED_RULES)).suppress,false);
});
test('Jev rejects malformed, out-of-range and unknown answers',async()=>{
 for(const change of [r=>{r.answers.violation.noul=1.1},r=>{r.answers.rule_id.choice='invented'},r=>{r.answers.severity.score=9},r=>{delete r.answers.suppress}]){const body=response();change(body);const jev=new Jev({env:{TYPESAFE_JEV_KEY:'test'},fetchImpl:async()=>Response.json(body)});await assert.rejects(jev.decide(event,card,CURATED_RULES),/invalid typed/);}
});
test('Jev real typed decision',{skip:process.env.RUN_LIVE_JEV_TESTS!=='1'},async()=>{
 const jev=new Jev();const result=await jev.decide(event,card,CURATED_RULES);assert.equal(result.provider,'jev');assert.equal(typeof result.violation,'boolean');assert.equal(result.suppress,false);assert.ok(CURATED_RULES.some(r=>r.rule_id===result.rule_id));console.log(JSON.stringify({provider:result.provider,model:result.model,rule:result.rule_id,violation:result.violation,latency_ms:result.latency_ms,confidence:result.confidence,probability:result.probability,usage:result.usage}));
});
