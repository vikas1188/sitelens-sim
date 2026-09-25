const ruleIds={load:'FOCUS4-STRUCK',vehicle:'VEHICLE-REVERSE',fall:'FOCUS4-FALL',caught:'LOAD-PINCH',electric:'LADDER-ELECTRIC'};
const hazardTypes={load:'struck_by',vehicle:'struck_by',fall:'falls',caught:'caught_between',electric:'electrocution'};
const enabled=new URLSearchParams(location.search).get('integration')!=='off';
const attempts=new Map();
export function persistHazard(player){
 if(!enabled)return;
 const s=player.scenario,key=`${s.id}:${player.eventTimestamp}`;
 if(!attempts.has(key))attempts.set(key,{event:{event_id:crypto.randomUUID(),ts:player.eventTimestamp,source:'simulation',type:'focus4_scenario',zone:s.zone,detector_payload:{violation:true,description:s.wrong,scenario_id:s.id,hazard_type:hazardTypes[s.id],rule_id:ruleIds[s.id],source_url:s.url,osha_citation:s.citation,recommended_action:s.prevention,simulated:true,confidence:1}},status:'pending'});
 const record=attempts.get(key);let panel=document.getElementById('evidence-save');if(!panel){panel=document.createElement('div');panel.id='evidence-save';panel.setAttribute('role','status');document.querySelector('.playback').append(panel)}
 const show=(message,retry=false)=>{if(panel.dataset.key!==key)return;panel.replaceChildren(document.createTextNode(message+' '));if(retry){const b=document.createElement('button');b.textContent='Retry save';b.onclick=()=>send();panel.append(b)}const a=document.createElement('a');a.href='/#evidence';a.target='_top';a.textContent='View evidence ↗';panel.append(a)};
 panel.dataset.key=key;
 async function send(){if(record.status==='saving')return;if(record.status==='saved'){show('Simulated hazard saved to the evidence trail.');return}record.status='saving';show('Saving simulated hazard…');try{const res=await fetch('/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record.event),signal:AbortSignal.timeout(45000)});const data=await res.json();if(!res.ok)throw Error(data.error||'Event could not be saved');record.status='saved';show('Simulated hazard saved. Human review is available in Live alerts.');window.parent.postMessage({type:'sitelens:event-saved',event_id:record.event.event_id},location.origin)}catch(e){record.status='failed';show(`Save failed: ${e.message}.`,true)}}
 send();
}
if(new URLSearchParams(location.search).get('embedded')==='1')document.documentElement.classList.add('embedded');
if(new URLSearchParams(location.search).get('embedded')==='1'){
 const observe=()=>{const app=document.getElementById('app');new ResizeObserver(()=>window.parent.postMessage({type:'sitelens:simulation-height',height:Math.ceil(app.getBoundingClientRect().height)},location.origin)).observe(app)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe);else observe();
}
