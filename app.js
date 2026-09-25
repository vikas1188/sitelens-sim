import {createScene,buildSite,THREE} from './scene.js';
const view=createScene(document.querySelector('#viewport'));
const site=buildSite(view.scene);
document.querySelector('#loading').remove();function loop(){requestAnimationFrame(loop);view.render()}loop();
