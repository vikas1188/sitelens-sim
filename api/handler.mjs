import {randomUUID} from 'node:crypto';
import {CloudService} from '../src/cloud-service.mjs';
import {EvidenceImages} from '../src/evidence-images.mjs';
import {HttpError,validateEvent} from '../src/engine.mjs';
import {refreshRules} from '../src/rules.mjs';
import {generateReport} from '../src/reports.mjs';
import {handleEdge,edgeStatus,queueDetection} from '../src/edge-cloud.mjs';
let service;const images=new EvidenceImages();
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))};
async function readBody(req){if(req.body!==undefined){if(typeof req.body==='string')return JSON.parse(req.body);return req.body}let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4_200_000)throw new HttpError(413,'Image/request exceeds 4 MB limit');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{throw new HttpError(400,'Invalid JSON body')}}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');try{
 const url=new URL(req.url,'https://localhost');const path=url.searchParams.get('route')||url.pathname;
 if(req.method==='POST'){if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new HttpError(403,'Cross-origin writes are not allowed');if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'Use application/json')}
 const input=req.method==='POST'?await readBody(req):{};
 const imageMatch=path.match(/^\/api\/evidence-images\/([a-f0-9-]{36})$/);if(req.method==='GET'&&imageMatch){const bytes=await images.read(imageMatch[1]);res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','private, no-store');return res.end(bytes)}
 if(path.startsWith('/api/edge/')){const result=await handleEdge({path,method:req.method,input,authorization:req.headers.authorization});if(result===null)throw new HttpError(404,'Endpoint not found');return send(res,200,result)}
 service ||= new CloudService();
 if(req.method==='GET'&&path==='/health'){const {engine}=await service.read();return send(res,200,{ok:true,revision:engine.state.revision,persistence:'private-vercel-blob'})}
 if(req.method==='GET'&&path==='/api/state')return send(res,200,(await service.read()).engine.state);
 if(req.method==='GET'&&path==='/events')return send(res,200,await service.feed());
 if(req.method==='GET'&&path==='/api/rules'){const {snapshot}=await service.read();return send(res,200,snapshot.rules||service.rules)}
 if(req.method==='GET'&&path==='/api/status'){const {snapshot,engine}=await service.read();const rules=snapshot.rules||service.rules;try{await service.initialize()}catch{}const rs=service.rawtree.status;return send(res,200,{site_id:engine.state.site_id,integrations:{rawtree:{status:rs.connected?'live':rs.configured?'error':'offline',detail:rs.error||`Durable outbox: ${snapshot.outbox?.length||0} pending · ${service.rawtree.table}`},nimble:{status:rules.provenance.status==='verified'?'live':'partial',detail:`${rules.provenance.verified_rule_count} rules verified against OSHA sources`},liquid:await edgeStatus(),jev:{status:process.env.TYPESAFE_JEV_KEY?'configured':'unconfigured',detail:'Typed Jev decisions; per-event provider records actual use'}},runtime:{outbox_pending:snapshot.outbox?.length||0,state_revision:engine.state.revision,storage:'Private Vercel Blob + RawTree'}})}
 if(req.method==='POST'&&path==='/events'){const {event,state}=await service.ingest(input);return send(res,201,{...event,event,state_revision:state.revision})}
 const action=path.match(/^\/events\/([a-zA-Z0-9_.:-]+)\/(verdict|ack|correction|person)$/);if(req.method==='POST'&&action){const {event,state}=await service.action(action[1],action[2],input);return send(res,200,{...event,event,state_revision:state.revision})}
 if(req.method==='POST'&&['/api/detect','/detect/frame'].includes(path)){const detection=await queueDetection(input.image);const raw=validateEvent({event_id:randomUUID(),ts:new Date().toISOString(),source:'edge-worker-local-Liquid',type:'ppe_violation',zone:input.zone||'ZONE-A',person_label:input.person_label||'',detector_payload:detection});if(detection.workers_visible>0&&!detection.all_wearing_hardhats)raw.evidence_image=await images.save(raw.event_id,input.image);const {event}=await service.ingest(raw);return send(res,200,{detection,detector_payload:detection,event})}
 if(req.method==='POST'&&path==='/api/rules/refresh')return send(res,200,await service.saveRules(await refreshRules({persist:false})));
 if(req.method==='POST'&&path==='/api/report'){if(!['txt','docx'].includes(input.format))throw new HttpError(400,'Choose txt or docx');const result=await generateReport({...await service.reportInput(),site:input.site,include_simulations:input.include_simulations===true});res.statusCode=200;res.setHeader('Content-Type',input.format==='txt'?'text/plain; charset=utf-8':'application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.setHeader('Content-Disposition',`attachment; filename="sitelens-inspection-${new Date().toISOString().slice(0,10)}.${input.format}"`);return res.end(result[input.format])}
 if(req.method==='GET'&&path==='/api/evidence/export'){res.setHeader('Content-Disposition','attachment; filename="sitelens-evidence.json"');return send(res,200,{exported_at:new Date().toISOString(),...await service.reportInput()})}
 throw new HttpError(404,'Endpoint not found');
 }catch(error){console.error('Request failed:',error.code||error.name);return send(res,error.status||error.statusCode||503,{error:error.status||error.statusCode?error.message:'Service temporarily unavailable; retry shortly. No successful write has been discarded.'})}}
