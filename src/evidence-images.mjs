import sharp from 'sharp';
import * as blob from '@vercel/blob';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {validateImage} from './vision.mjs';
import {HttpError} from './engine.mjs';
const validId=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(400,'Invalid image identifier');return id};
export async function prepareEvidenceImage(image){validateImage(image);try{const {data,info}=await sharp(Buffer.from(image.split(',')[1],'base64'),{limitInputPixels:25_000_000}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:78,mozjpeg:true}).toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height}}catch{throw new HttpError(400,'Image could not be decoded safely')}}
export class EvidenceImages {
 constructor({dir=null,sdk=blob}={}){this.dir=dir;this.sdk=sdk;this.auth=process.env.BLOB_READ_WRITE_TOKEN?{token:process.env.BLOB_READ_WRITE_TOKEN}:{};this.prefix=(process.env.STATE_BLOB_PATH||'sitelens/production-state-v1.json').replace(/\.json$/,'')+'-evidence-images'}
 path(id){validId(id);return this.dir?join(this.dir,'evidence-images',id+'.jpg'):`${this.prefix}/${id}.jpg`}
 async save(id,image){const prepared=await prepareEvidenceImage(image);const path=this.path(id);if(this.dir){await mkdir(join(this.dir,'evidence-images'),{recursive:true});await writeFile(path,prepared.data,{flag:'wx',mode:0o600})}else await this.sdk.put(path,prepared.data,{...this.auth,access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'image/jpeg',cacheControlMaxAge:60});return {url:`/api/evidence-images/${id}`,width:prepared.width,height:prepared.height,captured_at:new Date().toISOString(),content_type:'image/jpeg',retention:'Retained with this observation for human review'}}
 async read(id){try{if(this.dir)return await readFile(this.path(id));const r=await this.sdk.get(this.path(id),{...this.auth,access:'private',useCache:false});if(!r)throw new HttpError(404,'Captured image is unavailable');return Buffer.from(await new Response(r.stream).arrayBuffer())}catch(error){if(error.code==='ENOENT')throw new HttpError(404,'Captured image is unavailable');throw error}}
 async remove(id){if(this.dir)await unlink(this.path(id)).catch(e=>{if(e.code!=='ENOENT')throw e});else await this.sdk.del(this.path(id),this.auth)}
}
