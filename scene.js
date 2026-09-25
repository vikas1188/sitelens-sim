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
