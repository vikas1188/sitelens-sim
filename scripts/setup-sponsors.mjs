import {RawTree} from '../src/rawtree.mjs';
import {refreshRules} from '../src/rules.mjs';
const results = await Promise.allSettled([new RawTree().init(),refreshRules()]);
for(let i=0;i<results.length;i++){
  const r=results[i]; const sponsor=['RawTree','Nimble'][i];
  if(r.status==='rejected'){console.error(`${sponsor}: ${r.reason.message}`);process.exitCode=1;}
  else console.log(JSON.stringify({sponsor,...(i===0?r.value:{provenance:r.value.provenance,rules:r.value.rules.map(rule=>({rule_id:rule.rule_id,verified:rule.evidence?.verified}))})},null,2));
}
