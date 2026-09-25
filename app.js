import {createScene,buildSite} from './scene.js';
import {createPhysics} from './physics.js';
const view=createScene(document.querySelector('#viewport'));
const site=buildSite(view.scene);const physics=createPhysics(site);physics.load.velocity.x=3;
document.querySelector('#loading').remove();let last=performance.now(),acc=0;function loop(now){requestAnimationFrame(loop);acc+=Math.min((now-last)/1000,.1);last=now;while(acc>=1/60){physics.step(1/60);acc-=1/60}view.render()}requestAnimationFrame(loop);
window.__sim={view,site,physics};
