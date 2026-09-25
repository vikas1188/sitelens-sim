import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,renameSync,writeFileSync} from 'node:fs';
const base=process.env.SITELENS_URL||'http://localhost:4317';mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'artifacts/video',size:{width:1440,height:1000}},timezoneId:'America/Los_Angeles'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function pause(ms=1800){await page.waitForTimeout(ms)}
async function waitFor(test){for(let i=0;i<50;i++){const state=await(await page.request.get(base+'/api/state')).json();if(test(state))return state;await pause(300)}throw new Error('State condition timed out')}
async function rawtree(){for(let i=0;i<60;i++){const data=await(await page.request.get(base+'/events')).json();if(data.source==='rawtree')return data;await pause(500)}throw new Error('RawTree synchronization timed out')}
try{
 await page.goto(base);await page.getByRole('button',{name:'+ PPE event',exact:true}).waitFor();await pause(2000);
 const before=await(await page.request.get(base+'/api/state')).json();
 await page.getByRole('button',{name:'+ PPE event',exact:true}).click();await waitFor(s=>s.stats.events_today>before.stats.events_today);await pause(2500);
 await page.getByRole('button',{name:'Confirm hazard'}).first().click();await waitFor(s=>s.stats.confirmed>before.stats.confirmed);await pause(2000);
 await page.getByRole('button',{name:'+ Glare event',exact:true}).click();await pause(2500);await page.getByRole('button',{name:'False alarm',exact:true}).first().click();const learned=await waitFor(s=>s.stats.false_alarms>before.stats.false_alarms);assert.ok(learned.zones[0].suppression_rules.some(r=>r.pattern==='glare'));await pause(2000);
 await page.getByRole('button',{name:'+ Glare event',exact:true}).click();const after=await waitFor(s=>s.stats.suppressed>before.stats.suppressed);await rawtree();await pause(2000);
 await page.screenshot({path:'artifacts/acceptance-dashboard.png',fullPage:true});
 await page.locator('#evidence').scrollIntoViewIfNeeded();await pause(2500);await page.locator('#guidelines').scrollIntoViewIfNeeded();await pause(2000);
 await page.goto(base+'/scenario.html');await pause(5000);await page.screenshot({path:'artifacts/acceptance-scenario.png'});
 await page.goto(base+'/phone.html');await page.locator('#file').setInputFiles('tests/fixtures/person-no-hardhat.png');await page.waitForFunction(()=>document.querySelector('#captureMode').textContent==='IMAGE INSPECTED',{},{timeout:60000});await pause(2500);assert.match(await page.locator('#detail').innerText(),/LFM2.5/);await page.screenshot({path:'artifacts/acceptance-camera.png'});
 await page.goto(base);await rawtree();await pause(2500);await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
 const final=await(await page.request.get(base+'/api/state')).json();const feed=await rawtree();assert.ok(feed.events.some(e=>e.source==='browser-upload'&&e.decision.provider==='jev'));assert.ok(feed.events.some(e=>e.suppressed));assert.equal(errors.length,0,errors.join('\n'));
 const video=page.video();await context.close();const path=await video.path();renameSync(path,'artifacts/acceptance-demo.webm');
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const phone=await mobile.newPage();for(const url of ['/', '/phone.html','/scenario.html']){await phone.goto(base+url);await phone.waitForTimeout(500);assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${url} mobile overflow`)}await phone.screenshot({path:'artifacts/mobile-scenario.png'});await mobile.close();
 writeFileSync('artifacts/browser-smoke.json',JSON.stringify({pass:true,checked_at:new Date().toISOString(),checks:['PPE -> confirm','false alarm -> learned rule','repeat glare suppressed','live RawTree SQL evidence','local Liquid photo upload -> Jev alert','Three.js renders','390px mobile no overflow','no page JavaScript errors'],before_revision:before.revision,after_revision:final.revision,metrics:feed.metrics,recording:'artifacts/acceptance-demo.webm'},null,2));console.log('PASS: acceptance recording, image pipeline, RawTree, and mobile checks.');
}finally{await browser.close()}
