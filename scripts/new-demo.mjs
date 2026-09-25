import {mkdirSync,writeFileSync,renameSync} from 'node:fs';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));mkdirSync('.runtime',{recursive:true});
const id=new Date().toISOString().replace(/\D/g,'');const config={table:`sitelens_demo_${id}`,dataDir:`data/runtime/demo-${id}`,created_at:new Date().toISOString()};
writeFileSync('.runtime/active-session.tmp',JSON.stringify(config,null,2));renameSync('.runtime/active-session.tmp','.runtime/active-session.json');
console.log(`New isolated demo: ${config.table}. Previous evidence is retained.`);
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??0});
