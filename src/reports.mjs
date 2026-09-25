const MISSING = 'Not recorded';
const clean = value => {
  if (value === undefined || value === null || value === '') return MISSING;
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\brt_[a-zA-Z0-9]{20,}\b/g, '[credential redacted]').replace(/\bBearer\s+\S+/gi, 'Bearer [credential redacted]');
};
const field = (label, value) => ({label, value: clean(value)});
export const REPORT_REFERENCES = [
  {title:'Cal OSHA Title 8 section 3203',url:'https://www.dir.ca.gov/title8/3203.html',detail:'Section 3203(b)(1) addresses inspection records identifying inspectors, unsafe conditions and practices, and corrective action taken; retention requirements and exceptions apply.'},
  {title:'Cal OSHA Title 8 section 1509',url:'https://www.dir.ca.gov/title8/1509.html',detail:'Section 1509(a) requires construction employers to maintain an effective Injury and Illness Prevention Program in accordance with section 3203.'},
  {title:'OSHA Hazard Identification and Assessment',url:'https://www.osha.gov/safety-management/hazard-Identification',detail:'Recommended practices support identifying and assessing workplace hazards. This report organizes evidence for human inspection and follow-up.'},
  {title:'OSHA Recordkeeping Forms',url:'https://www.osha.gov/recordkeeping/forms',detail:'This report is not OSHA Form 300, 300A or 301 and does not establish that a recordable injury or illness occurred.'}
];
export function isSimulated(event) {
  return event.simulated === true || event.is_simulation === true || event.detector_payload?.simulated === true || /(^|[-_ ])(simulation|simulated?|synthetic|demo|fixture)([-_ ]|$)/i.test(event.source || '');
}
function evidenceClass(event) {
  if(isSimulated(event)) return 'SIMULATED demonstration evidence';
  if(/replay|video[-_ ]?file|recorded/i.test(event.source || '')) return 'Recorded replay observation';
  if(/camera|iphone|ios|webcam/i.test(event.source || '')) return 'Camera observation assessed by a model';
  return 'Source classification not recorded';
}
function disposition(event) {
  if(event.verdict==='false_alarm') return 'Human reviewer marked false alarm';
  if(event.verdict==='confirmed') return 'Human reviewer confirmed the concern';
  if(event.suppressed) return 'Suppressed by learned triage rule; evidence retained';
  if((event.decision?.violation ?? event.detector_payload?.violation)===false) return 'No concern flagged in this observation';
  return 'Potential concern awaiting human review';
}
export function buildReportModel({events=[],metrics={},source,state={},rules=[],site={},include_simulations=true,generated_at=new Date().toISOString()}={}) {
  if(!Array.isArray(events)) throw new TypeError('Report events must be an array');
  const rulesList=Array.isArray(rules)?rules:(rules.rules || []);
  const ruleProvenance=Array.isArray(rules)?null:rules.provenance;
  const selected=events.filter(event=>include_simulations || !isSimulated(event));
  const ordered=[...selected].sort((a,b)=>String(a.ts || '').localeCompare(String(b.ts || '')) || String(a.event_id || '').localeCompare(String(b.event_id || '')));
  const records=ordered.map((event,index)=>{
    const en=event.enrichment || {},p=event.detector_payload || {},rule=rulesList.find(r=>r.rule_id===(en.rule_id || event.decision?.rule_id || p.rule_id));
    const correction=event.corrective_action || event.correction || {};
    const hasVerifiedClosure=Boolean(['verified','closed','completed'].includes(correction.status) && correction.action && correction.completed_at && correction.verified_by);
    return {
      number:index+1,event_id:clean(event.event_id),simulated:isSimulated(event),title:`Evidence record ${index+1}`,
      fields:[field('Evidence ID',event.event_id),field('Evidence classification',evidenceClass(event)),field('Observation date and time',event.ts),field('Zone',event.zone),field('Hazard type',p.hazard_type || rule?.hazard_type || event.type),field('Observation source',event.source),field('Hazard description',p.description || en.alert_text),field('Human verdict',disposition(event)),field('Reviewer',event.reviewed_by || event.verdict_by),field('Receipt acknowledgement',event.acknowledged?'Acknowledged receipt only; this does not verify correction':'Not recorded'),field('Acknowledgement date',event.acknowledged_at || event.ack_ts),field('Triage severity',en.severity ?? event.decision?.severity),field('Regulatory reference',en.osha_citation || rule?.osha_citation),field('Scoped rule',rule?.plain_english_rule),field('Rule qualifications',rule?.scope_note),field('Rule source',rule?.source_url),field('Recommended control',en.recommended_action || rule?.recommended_action)],
      correction:[field('Actual corrective action taken',correction.action),field('Responsible owner',correction.owner),field('Due date',correction.due_date || correction.due),field('Recorded correction status',correction.status),field('Completion date',correction.completed_at),field('Verified by',correction.verified_by),field('Closure evidence',hasVerifiedClosure?'Correction and verifier recorded; independently confirm supporting evidence':'Verified closure not established by the supplied record')],
      provenance:[field('Decision provider',event.decision?.provider),field('Decision model',event.decision?.model),field('Detector model',p.model),field('Alert text writer',en.writer),field('Rule retrieval provider',rule?.evidence?.provider || ruleProvenance?.provider),field('Rule retrieval verified',rule?.evidence?.verified===undefined?undefined:rule.evidence.verified?'Yes':'No'),field('Rule retrieval date',rule?.evidence?.fetched_at || ruleProvenance?.fetched_at)]
    };
  });
  const totalAlerts=selected.filter(e=>!e.suppressed && (e.decision?.violation ?? e.detector_payload?.violation)===true);
  const confirmed=totalAlerts.filter(e=>e.verdict==='confirmed').length;
  return {
    title:'Site safety inspection and corrective action record',
    introduction:'Review the observations, confirm applicable hazards and document corrective actions below. This record supports hazard identification and inspection follow-up. Missing inspection or correction details must be completed by the responsible person before treating the record as complete.',
    metadata:[field('Site',site.name || site.site_name || state.site_id),field('Location',site.location),field('Inspection date',site.inspection_date),field('Inspector',site.inspector || site.inspector_name),field('Prepared by',site.prepared_by),field('Inspection scope',site.scope),field('Report generated',generated_at),field('Evidence data source',source),field('Simulation inclusion',include_simulations?'Included and explicitly labelled':'Excluded')],
    summary:[field('Evidence records supplied',events.length),field('Evidence records included',selected.length),field('Simulated records included',selected.filter(isSimulated).length),field('Unsuppressed potential alerts included',totalAlerts.length),field('Human confirmed alerts included',confirmed),field('Human false alarms included',totalAlerts.filter(e=>e.verdict==='false_alarm').length),field('Confirmation rate for included alerts',totalAlerts.length?`${confirmed} / ${totalAlerts.length} (${Math.round(confirmed/totalAlerts.length*100)}%)`:'Not applicable; no included alerts'),field('Current state revision',state.revision)],
    metrics_context:{source:clean(metrics.source || source),total_alerts:metrics.total_alerts ?? null,confirmed:metrics.confirmed ?? null},
    limitations:'Model observations and regulatory suggestions require human assessment of site conditions and applicable exceptions. A confirmation verdict is not a regulatory finding. An acknowledgement records receipt, not hazard correction. No injury, illness, incident, inspector identity or completed corrective action is inferred. A simulation is not evidence of an actual site condition. This is an inspection support record, not proof of compliance or an official OSHA injury and illness form.',
    records,references:REPORT_REFERENCES,
    provenance_note:`The summary counts are recomputed from all ${selected.length} included records, without a display-feed limit. Supplied live metric source: ${clean(metrics.source || source)}. Supplied metrics may cover a different time or simulation scope. The current state card is context only and does not replace the event evidence.`
  };
}
function pairsTxt(fields){return fields.map(f=>`${f.label}: ${f.value}`).join('\n');}
export function renderTxt(model) {
  const sections=[model.title.toUpperCase(),model.introduction,'INSPECTION DETAILS',pairsTxt(model.metadata),'SUMMARY',pairsTxt(model.summary),model.provenance_note,'REVIEW LIMITATIONS',model.limitations];
  if(!model.records.length) sections.push('EVIDENCE RECORDS','No evidence records match the selected report scope. This does not establish that the site is safe.');
  for(const record of model.records) sections.push(record.title.toUpperCase(),pairsTxt(record.fields),'CORRECTIVE ACTION',pairsTxt(record.correction),'RECORD PROVENANCE',pairsTxt(record.provenance));
  sections.push('RECORDKEEPING REFERENCES',...model.references.map(r=>`${r.title}\n${r.detail}\n${r.url}`));
  return sections.join('\n\n')+'\n';
}
export async function renderDocx(model,{docx:injectedDocx}={}) {
  const d=injectedDocx || await import('docx');
  const {Document,Packer,Paragraph,TextRun,HeadingLevel,Footer,PageNumber,AlignmentType}=d;
  const p=(text,opts={})=>new Paragraph({children:[new TextRun({text,...(opts.run||{})})],spacing:{after:90,line:260},...opts});
  const heading=(text,level=HeadingLevel.HEADING_1)=>p(text,{heading:level,keepNext:true,spacing:{before:180,after:110}});
  const pairs=fields=>fields.map(f=>new Paragraph({children:[new TextRun({text:f.label+': ',bold:true}),new TextRun({text:f.value})],spacing:{after:70,line:240},keepNext:false}));
  const children=[p(model.title,{heading:HeadingLevel.TITLE,spacing:{after:200}}),p(model.introduction),heading('Inspection details'),...pairs(model.metadata),heading('Summary'),...pairs(model.summary),p(model.provenance_note,{run:{size:18}}),heading('Review limitations'),p(model.limitations,{run:{size:18}})];
  if(!model.records.length)children.push(heading('Evidence records'),p('No evidence records match the selected report scope. This does not establish that the site is safe.'));
  for(const record of model.records){children.push(new Paragraph({text:record.title,heading:HeadingLevel.HEADING_1,pageBreakBefore:true,spacing:{after:170},keepNext:true}),...pairs(record.fields),heading('Corrective action',HeadingLevel.HEADING_2),...pairs(record.correction),heading('Record provenance',HeadingLevel.HEADING_2),...pairs(record.provenance));}
  children.push(new Paragraph({text:'Recordkeeping references',heading:HeadingLevel.HEADING_1,pageBreakBefore:true,spacing:{after:170},keepNext:true}));
  for(const ref of model.references)children.push(heading(ref.title,HeadingLevel.HEADING_2),p(ref.detail),p(ref.url,{run:{size:18}}));
  const doc=new Document({creator:'SiteLens',title:model.title,description:'Inspection observations and corrective action record',styles:{default:{document:{run:{font:'Arial',size:20,color:'000000'},paragraph:{spacing:{line:260}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Arial',size:38,bold:true,color:'000000'},paragraph:{keepNext:true}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{font:'Arial',size:26,bold:true,color:'000000'},paragraph:{keepNext:true}},{id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',run:{font:'Arial',size:22,bold:true,color:'000000'},paragraph:{keepNext:true}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:850,bottom:850,left:950,right:950}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'SiteLens inspection record  |  Page ',size:16}),new TextRun({children:[PageNumber.CURRENT],size:16})]})]})},children}]});
  return Packer.toBuffer(doc);
}
export async function generateReport(input,options) {const model=buildReportModel(input);return {model,txt:renderTxt(model),docx:await renderDocx(model,options)};}
