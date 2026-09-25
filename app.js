import {createScene,box,THREE} from './scene.js';
const view=createScene(document.querySelector('#viewport'));
box(view.scene,50,.5,50,0,-.3,0,0xb5bba7);view.scene.add(new THREE.GridHelper(50,25,0x939d8f,0xa6af9c));box(view.scene,3,3,3,0,1.5,0,0xe8ad36);
document.querySelector('#loading').remove();function loop(){requestAnimationFrame(loop);view.render()}loop();
