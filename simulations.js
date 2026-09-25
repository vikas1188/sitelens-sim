import {THREE,box} from './scene.js';
import {CANNON} from './physics.js';
export function createBehaviors({site,physics,hazard}){
 const helpers=new THREE.Group();site.site.add(helpers);
 function clear(){for(const child of [...helpers.children]){helpers.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of [o.material].flat())m.dispose()})}site.worker.position.set(3,0,-5);site.worker.quaternion.identity();site.truck.position.set(14,0,13);site.wall.position.set(10,1.75,4);site.ladder.visible=false;site.slew.rotation.y=0;site.marker.visible=true;site.marker.position.set(3,.08,-5);site.marker.scale.set(1,1,1);site.load.visible=true;site.hook.visible=true;site.cable.visible=true}
 function workerBody(x,y,z,mass=0){return physics.body('worker',[.48,1,.4],[x,y+1,z],mass)}
 const behaviors={
 load:{setup(){clear();workerBody(3,0,-5);physics.load.velocity.set(1.2,0,0);physics.onContact((a,b)=>{if([a,b].includes('load')&&['ground','worker'].includes(a==='load'?b:a))hazard('load-contact')})},action(i){if(i===2)physics.release()},update(t){if(t<9.6){const angle=.07*Math.sin(t*.65);site.slew.rotation.y=angle;physics.anchor.position.set(-5+8*Math.cos(angle),18,-5-8*Math.sin(angle));physics.anchor.aabbNeedsUpdate=true}}}
 };
 return behaviors;
}
