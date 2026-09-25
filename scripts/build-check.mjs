import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const file of ['api/handler.mjs','src/cloud-service.mjs','public/app.js','public/simulation/integration.js'])execFileSync(process.execPath,['--check',file]);
const rules=JSON.parse(readFileSync('data/rules.json','utf8'));if(rules.rules.length<8)throw new Error('All eight OSHA rule mappings are required');
console.log('Combined app build validation passed');
