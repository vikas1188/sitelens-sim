import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export {THREE};
export function createScene(container){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e6e9df');
 const camera=new THREE.PerspectiveCamera(42,1,.1,200);camera.position.set(46,38,48);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor('#e6e9df');container.append(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,5,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.05;controls.minDistance=12;controls.maxDistance=100;
 scene.add(new THREE.HemisphereLight(0xffffff,0x6e7659,2.5));const sun=new THREE.DirectionalLight(0xfff5d7,3);sun.position.set(-20,40,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,far:100});sun.shadow.bias=-.001;scene.add(sun);
 const resize=()=>{const {width,height}=container.getBoundingClientRect();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height)};new ResizeObserver(resize).observe(container);resize();
 return {scene,camera,renderer,controls,render(){controls.update();renderer.render(scene,camera)}};
}
export function box(parent,w,h,d,x,y,z,color=0xa5afa5){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
export function rod(parent,a,b,r=.07,color=0x52625a){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),6),new THREE.MeshStandardMaterial({color,roughness:.8}));mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;parent.add(mesh);return mesh}
export function worker(parent,x=0,y=0,z=0,color=0xe67939){const g=new THREE.Group();parent.add(g);g.position.set(x,y,z);box(g,.65,.85,.4,0,1.05,0,color);box(g,.24,.65,.3,-.2,.34,0,0x344d4a);box(g,.24,.65,.3,.2,.34,0,0x344d4a);box(g,.15,.65,.25,-.43,1.06,0,color);box(g,.15,.65,.25,.43,1.06,0,color);const head=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),new THREE.MeshStandardMaterial({color:0xb78661}));head.position.y=1.7;g.add(head);box(g,.63,.16,.55,0,1.95,0,0xf4cc51);box(g,.67,.1,.44,0,1.17,.23,0xf5eaa2);return g}
export function buildSite(scene){
 const site=new THREE.Group();scene.add(site);
 box(site,50,.7,50,0,-.4,0,0xb9bfab);box(site,52,.65,52,0,-1.05,0,0x8d9e87);
 const grid=new THREE.GridHelper(50,25,0xa3ad99,0xaeb7a4);grid.position.y=.01;site.add(grid);
 box(site,44,.04,6,0,.015,13,0x849184);
 for(let x=-20;x<22;x+=4)box(site,1.8,.02,.12,x,.05,13,0xdfe0c5);
 function shell(x,z,floors,w=10,d=9){for(let f=0;f<=floors;f++){const y=f*4;box(site,w,.32,d,x,y+.16,z,0xc6c9b9);if(f<floors)for(const dx of [-w/2+.3,w/2-.3])for(const dz of [-d/2+.3,d/2-.3])box(site,.5,4,.5,x+dx,y+2,z+dz,0x86978e)}for(let i=0;i<5;i++)box(site,.12,1,.12,x-w/2+i*2.4,floors*4+.8,z-d/2,0xd6ad48);rod(site,[x-w/2,floors*4+1.2,z-d/2],[x+w/2,floors*4+1.2,z-d/2],.06,0xd6ad48)}
 shell(-14,-7,2);shell(-15,5,1,8,7);shell(9,-10,1,8,6);
 const crane=new THREE.Group();crane.position.set(-5,0,-5);site.add(crane);box(crane,4,1,4,0,.5,0,0x7b8a81);
 for(const x of [-.65,.65])for(const z of [-.65,.65])rod(crane,[x,.7,z],[x,20,z],.12,0xe5ac30);
 for(let y=1;y<20;y+=2){for(const z of [-.65,.65]){rod(crane,[-.65,y,z],[.65,y+2,z],.07,0xe5ac30);rod(crane,[-.65,y,z],[.65,y,z],.07,0xe5ac30)}for(const x of [-.65,.65])rod(crane,[x,y,-.65],[x,y+2,.65],.07,0xe5ac30)}
 const slew=new THREE.Group();slew.position.y=19;crane.add(slew);box(slew,22,.35,1.1,5,0,0,0xe9b037);box(slew,3,1.2,2,-4,0,0,0x78897c);box(slew,1.5,1.6,1.6,1,-.4,0,0xe8b53c);box(slew,1.52,.8,1.62,1,-.3,0,0x527474);
 for(let x=-6;x<16;x+=2){rod(slew,[x,0,-.5],[x+1,1,-.5],.07,0xe8b53c);rod(slew,[x+1,1,-.5],[x+2,0,-.5],.07,0xe8b53c);rod(slew,[x,1,-.5],[x+2,1,-.5],.07,0xe8b53c)}
 rod(slew,[0,3,0],[15,0,0],.04);rod(slew,[0,3,0],[-5,0,0],.04);rod(slew,[0,0,0],[0,3,0],.09,0xe8b53c);
 const hook=box(site,.6,.6,.6,3,18,-5,0xe7b236);
 const load=new THREE.Group();site.add(load);box(load,4,.7,1.7,0,0,0,0x526d72);for(const z of [-.7,.7])box(load,4,.15,.2,0,.43,z,0x789292);load.position.set(3,8,-5);
 const cable=rod(site,[3,18,-5],[3,8,-5],.035,0x394b45);
 const truck=new THREE.Group();site.add(truck);truck.position.set(14,0,13);box(truck,6,.5,2.8,0,1,0,0x54645b);box(truck,1.8,1.7,2.5,2,2,0,0xe5af44);box(truck,1.85,.7,2.55,2,2.35,0,0x6d9090);box(truck,4,.18,2.6,-.8,1.4,0,0xac9370);for(const x of [-2,2])for(const z of [-1.4,1.4]){const tire=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.35,12),new THREE.MeshStandardMaterial({color:0x34433e}));tire.rotation.x=Math.PI/2;tire.position.set(x,.7,z);truck.add(tire)}for(const z of [-1,1])box(truck,.1,.25,.4,-3.05,1,z,0xd85b3f);
 for(let i=0;i<4;i++)for(let j=0;j<3;j++){box(site,2,.18,1.6,13+i*2.4,.2+j*.35,4,0xa7885b);for(const x of [-.7,.7])box(site,.2,.22,1.5,13+i*2.4+x,.35+j*.35,4,0x8e714c)}
 const wall=box(site,.65,3.5,6,10,1.75,4,0xb5bca9);
 for(const x of [-21,21]){rod(site,[x,0,-19],[x,14,-19],.2,0x82775d);box(site,1, .15,3,x,13.5,-19,0x727b68)}
 for(const z of [-20,-19,-18]){const points=[];for(let i=0;i<=32;i++){const x=-21+42*i/32;points.push(new THREE.Vector3(x,13.5-1.2*(1-(x/21)**2),z))}site.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x46594e})))}
 const ladder=new THREE.Group();site.add(ladder);for(const x of [-.4,.4])box(ladder,.12,13,.12,x,6.5,0,0x9aa8a4);for(let y=.5;y<13;y+=.7)box(ladder,.9,.08,.12,0,y,0,0xc5ceca);ladder.position.set(14,0,-13);ladder.rotation.x=-Math.PI/2;
 const activeWorker=worker(site);const extras=[worker(site,-20,0,2),worker(site,17,0,7,0xd2b744),worker(site,-13,4.32,5),worker(site,8,4.32,-10,0xd2b744)];
 for(let x=-22;x<=22;x+=4){box(site,.13,1.1,.13,x,.55,22,0x788e73);if(x<22)rod(site,[x,1,22],[x+4,1,22],.045,0x889878)}
 for(const x of [-20,-17,17,20]){const cone=new THREE.Mesh(new THREE.ConeGeometry(.3,.8,8),new THREE.MeshStandardMaterial({color:0xd96d3d}));cone.position.set(x,.4,9);site.add(cone);box(site,.7,.09,.7,x,.05,9,0xd9d5b3)}
 const marker=new THREE.Mesh(new THREE.RingGeometry(2.3,2.5,64),new THREE.MeshBasicMaterial({color:0xd9573f,side:THREE.DoubleSide,transparent:true,opacity:.85}));marker.rotation.x=-Math.PI/2;marker.position.y=.08;site.add(marker);
 return {site,crane,slew,hook,load,cable,truck,wall,ladder,worker:activeWorker,extras,marker};
}
export function updateCable(cable,from,to){const a=new THREE.Vector3(from.x,from.y,from.z),b=new THREE.Vector3(to.x,to.y,to.z),d=b.clone().sub(a);cable.position.copy(a.add(b).multiplyScalar(.5));cable.scale.y=d.length()/10;cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())}
