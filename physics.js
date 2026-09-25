import * as CANNON from 'cannon-es';
import {updateCable} from './scene.js';
export {CANNON};
export function createPhysics(site){
 const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=20;world.defaultContactMaterial.friction=.55;world.defaultContactMaterial.restitution=.03;
 const ground=new CANNON.Body({mass:0,shape:new CANNON.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);ground.tag='ground';world.addBody(ground);
 const anchor=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC,position:new CANNON.Vec3(3,18,-5)});world.addBody(anchor);
 const load=new CANNON.Body({mass:180,shape:new CANNON.Box(new CANNON.Vec3(2,.45,.85)),position:new CANNON.Vec3(3,8,-5),linearDamping:.15,angularDamping:.7});load.tag='load';world.addBody(load);
 let cable,contact=null;const transient=[];
 const onContact=e=>{contact?.(e.body.tag,e.target.tag)};load.addEventListener('collide',onContact);
 function attach(length=10){if(cable)world.removeConstraint(cable);cable=new CANNON.DistanceConstraint(anchor,load,length,1e7);world.addConstraint(cable);site.cable.visible=true}
 function release(){if(cable)world.removeConstraint(cable);cable=null;site.cable.visible=false}
 function body(tag,half,position,mass=0){const b=new CANNON.Body({mass,shape:new CANNON.Box(new CANNON.Vec3(...half)),position:new CANNON.Vec3(...position)});b.tag=tag;b.addEventListener('collide',onContact);world.addBody(b);transient.push(b);return b}
 function reset(){contact=null;for(const b of transient)world.removeBody(b);transient.length=0;world.contacts.length=0;load.position.set(3,8,-5);load.velocity.setZero();load.angularVelocity.setZero();load.quaternion.set(0,0,0,1);load.force.setZero();load.torque.setZero();load.type=CANNON.Body.DYNAMIC;load.mass=180;load.updateMassProperties();load.wakeUp();anchor.position.set(3,18,-5);anchor.velocity.setZero();attach();sync()}
 function sync(){site.load.position.copy(load.position);site.load.quaternion.copy(load.quaternion);site.hook.position.copy(anchor.position);updateCable(site.cable,anchor.position,load.position)}
 attach();return {world,ground,anchor,load,body,attach,release,reset,sync,onContact(fn){contact=fn},step(dt){world.step(dt);sync()},get constraint(){return cable}};
}
