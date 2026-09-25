import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const RULES_PATH = new URL('../data/rules.json', import.meta.url);
const source = number => `https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.${number}`;
export const CURATED_RULES = [
  {rule_id:'PPE-HEAD',hazard_type:'ppe_violation',title:'Head protection',osha_citation:'29 CFR 1926.100(a)',plain_english_rule:'Protective helmets are required where work exposes employees to possible head injury from impact, falling or flying objects, or electrical shock and burns.',recommended_action:'Pause exposed work, provide suitable head protection, and have a supervisor verify the hazard and protection before resuming.',source_url:source('100'),evidence_terms:['1926.100(a)','protective helmets'],scope_note:'A missing helmet is a potential violation only where a head-injury hazard exists. High-visibility clothing is not a universal requirement under this rule.'},
  {rule_id:'FOCUS4-STRUCK',hazard_type:'struck_by',title:'Keep clear of hoisted loads',osha_citation:'29 CFR 1926.1425(a), (b), (d)',plain_english_rule:'Minimize exposure along hoisting routes. Keep workers out of the fall zone of a stationary suspended load except for specified tasks; only workers needed to receive a landing load may enter its fall zone.',recommended_action:'Stop the lift when people are exposed; clear and control the fall zone, then have the lift supervisor verify permitted essential tasks.',source_url:source('1425'),evidence_terms:['1926.1425','fall zone'],scope_note:'The standard has task-specific exceptions. Camera proximity is a review signal, not proof that no exception applies.'},
  {rule_id:'FOCUS4-FALL',hazard_type:'falls',title:'Unprotected edges',osha_citation:'29 CFR 1926.501(b)(1)',plain_english_rule:'At an unprotected walking or working edge six feet or more above a lower level, protect employees with guardrails, safety nets, or personal fall arrest systems.',recommended_action:'Keep workers away from the exposed edge until a competent site reviewer verifies suitable fall protection.',source_url:source('501'),evidence_terms:['1926.501(b)(1)','6 feet'],scope_note:'This scenario concerns unprotected sides and edges. Other tasks and surfaces have different requirements.'},
  {rule_id:'FOCUS4-CAUGHT',hazard_type:'caught_between',title:'Excavation cave-in protection',osha_citation:'29 CFR 1926.652(a)(1)',plain_english_rule:'Protect employees in excavations against cave-ins with an adequate protective system, except in stable rock or an excavation under five feet where a competent person finds no indication of potential cave-in.',recommended_action:'Keep workers out of an unprotected excavation until a competent person evaluates conditions and provides the required protective system.',source_url:source('652'),evidence_terms:['1926.652(a)(1)','cave-ins'],scope_note:'Depth, soil conditions, and the competent-person determination cannot be established reliably from a single image.'},
  {rule_id:'FOCUS4-ELECTRIC',hazard_type:'electrocution',title:'Electrical exposure',osha_citation:'29 CFR 1926.416(a)(1)',plain_english_rule:'Do not permit work close enough to an electrical power circuit for contact unless employees are protected by de-energizing and grounding the circuit or by effective insulation or other guarding.',recommended_action:'Stop exposed work, isolate the area, and have qualified personnel verify de-energization or effective guarding before work resumes.',source_url:source('416'),evidence_terms:['1926.416(a)(1)','deenergizing'],scope_note:'An image cannot establish whether a circuit is energized or electrically safe.'},
  {rule_id:'VEHICLE-REVERSE',hazard_type:'vehicle_reverse',title:'Reversing vehicle visibility',osha_citation:'29 CFR 1926.601(b)(4)',plain_english_rule:'A covered motor vehicle with an obstructed rear view may not be operated in reverse unless it has a reverse alarm audible above surrounding noise or an observer signals that reversing is safe.',recommended_action:'Pause reversing where workers may be exposed. Confirm a functioning audible reverse alarm or an observer directing safe movement, and keep the reversing path clear.',source_url:source('601'),evidence_terms:['1926.601(b)(4)','obstructed view'],scope_note:'Section 1926.601 covers motor vehicles operating within an off-highway jobsite not open to public traffic and excludes equipment covered by 1926.602. A camera cannot establish alarm audibility or the driver rearward view.'},
  {rule_id:'LOAD-PINCH',hazard_type:'load_pinch',title:'Hoisted load exposure',osha_citation:'29 CFR 1926.1425(a)',plain_english_rule:'When available, use hoisting routes that minimize employee exposure to hoisted loads, consistent with public safety.',recommended_action:'Pause load movement when a person is exposed between the load and a fixed object. Review the hoisting route and clear the exposure area before resuming.',source_url:source('1425'),evidence_terms:['1926.1425(a)','hoisting routes'],scope_note:'This reference addresses hoisting route exposure; it is not a general pinch-point rule for all equipment. Confirm that the observed object is a hoisted load and assess the actual operation.'},
  {rule_id:'LADDER-ELECTRIC',hazard_type:'ladder_electrical',title:'Ladders near electrical equipment',osha_citation:'29 CFR 1926.1053(b)(12)',plain_english_rule:'Ladders must have nonconductive siderails where the employee or ladder could contact exposed energized electrical equipment.',recommended_action:'Stop ladder use near the electrical exposure. Have qualified personnel control the electrical hazard and verify a suitable ladder with nonconductive siderails.',source_url:source('1053'),evidence_terms:['1926.1053(b)(12)','nonconductive siderails'],scope_note:'A photograph cannot prove that equipment is energized, exposed, or within contact distance, or establish ladder conductivity. This is a prompt for human assessment.'}
];
export async function loadRules() {
  try {return JSON.parse(await readFile(RULES_PATH,'utf8'));}
  catch (error) {if(error.code !== 'ENOENT') throw error; return {rules:CURATED_RULES,provenance:{provider:'curated_fallback',status:'not_fetched',method:'Human-curated rules; Nimble retrieval pending',verified_rule_count:0}};}
}
async function nimble(path,body,{key,fetchImpl}) {
  const response = await fetchImpl(`https://sdk.nimbleway.com/v2/${path}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`Nimble ${path} HTTP ${response.status}`);
  return response.json();
}
function contentOf(value) {
  if(typeof value === 'string') return value;
  if(!value || typeof value !== 'object') return '';
  return Object.entries(value).filter(([key])=>['markdown','html','content','data','result','results','body'].includes(key)).map(([,val])=>Array.isArray(val)?val.map(contentOf).join('\n'):contentOf(val)).join('\n');
}
export async function refreshRules({env=process.env,fetchImpl=fetch,persist=true}={}) {
  if(!env.NIMBLE_API_KEY) throw new Error('NIMBLE_API_KEY is not configured');
  const options = {key:env.NIMBLE_API_KEY,fetchImpl};
  const fetched_at = new Date().toISOString();
  let discovery, searchError;
  try {discovery=await nimble('search',{query:'OSHA construction Focus Four falls struck by caught in between electrocution',include_domains:['osha.gov'],max_results:5},options);}
  catch(error){searchError=error.message;}
  const results = await Promise.allSettled(CURATED_RULES.map(async rule => {
    const result=await nimble('extract',{url:rule.source_url,formats:['markdown'],render:false},options);
    const content=contentOf(result);
    const normalized=content.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').toLowerCase();
    const matched=rule.evidence_terms.every(term=>normalized.includes(term.toLowerCase()));
    if(!matched) throw new Error('Fetched source did not contain expected citation and rule evidence');
    return {...rule,evidence:{provider:'nimble',fetched_at,verified:true,content_sha256:createHash('sha256').update(content).digest('hex'),content_characters:content.length,matched_terms:rule.evidence_terms,request_id:result.request_id || result.task_id || null}};
  }));
  const rules=results.map((result,index)=>result.status === 'fulfilled' ? result.value : {...CURATED_RULES[index],evidence:{provider:'curated_fallback',verified:false,error:result.reason.message}});
  const verified_rule_count=rules.filter(r=>r.evidence.verified).length;
  const provenance={provider:'nimble',status:verified_rule_count===CURATED_RULES.length?'verified':verified_rule_count?'partial':'failed',fetched_at,method:'Nimble v2 search + extract; deterministic human-curated mapping verified against retrieved OSHA source text. No generative legal interpretation.',verified_rule_count,search_request_id:discovery?.request_id || null,search_results:(discovery?.results || []).filter(r=>{try{return new URL(r.url).hostname.endsWith('osha.gov');}catch{return false;}}).map(r=>({title:r.title,url:r.url})),...(searchError?{search_error:searchError}:{})};
  const document={rules,provenance};
  if(persist) {
  await mkdir(new URL('../data/',import.meta.url),{recursive:true});
  const temp=new URL('../data/rules.json.tmp',import.meta.url);await writeFile(temp,JSON.stringify(document,null,2)+'\n');await rename(temp,RULES_PATH);
  }
  return document;
}

// Live world data: NWS San Francisco forecast via Nimble extract. The raw response goes to RawTree; only these fields enter the state card.
export const WEATHER_URL='https://forecast.weather.gov/MapClick.php?lat=37.7749&lon=-122.4194';
// Used only when Nimble fails. Value observed from the live NWS page on 2026-09-25; the UI labels it "cached".
export const CACHED_WEATHER={wind_mph:23,advisory:false,summary:'Partly cloudy. West wind 5 to 14 mph, gusts as high as 23 mph.',source:'cached'};
export function parseWeather(markdown){const period=(markdown.match(/\*\s+(?:Tonight|Today|This Afternoon|Overnight|[A-Z][a-z]+day(?: Night)?)\s*\n\s*!\[([^\]]+)\]/)||[])[1]||'';const speeds=[...period.matchAll(/(\d+)\s*mph/gi)].map(m=>Number(m[1]));if(!period||!speeds.length)throw new Error('NWS forecast wind not found');return {wind_mph:Math.max(...speeds),advisory:/\b(Wind Advisory|High Wind (?:Warning|Watch)|Gale Warning|Red Flag Warning)\b/i.test(markdown),summary:period.split(':').slice(1).join(':').trim().slice(0,300),source:'nimble-live'}}
export async function fetchWeather({env=process.env,fetchImpl=fetch}={}){if(!env.NIMBLE_API_KEY)throw new Error('NIMBLE_API_KEY is not configured');const raw=await nimble('extract',{url:WEATHER_URL,formats:['markdown'],render:false},{key:env.NIMBLE_API_KEY,fetchImpl});return {raw,weather:parseWeather(contentOf(raw.data||raw))}}
