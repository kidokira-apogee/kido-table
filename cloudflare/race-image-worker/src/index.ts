export interface Env {
  IMAGES: R2Bucket;
  ALLOWED_ORIGIN: string;
}
const MAX_BYTES = 8 * 1024 * 1024;
const cors = (env: Env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});
function json(data: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(data), {status, headers:{...cors(env),"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
function validRaceId(id:string){return /^\\d{4}-\\d{2}-\\d{2}-[a-z]+-\\d{1,2}$/.test(id);}
function keyFor(id:string){return "races/"+id+"/image";}
function detectImage(bytes:Uint8Array):string|null {
  if(bytes.length>=8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47 && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a)return "image/png";
  if(bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff)return "image/jpeg";
  if(bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return null;
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const headers=cors(env);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const origin=request.headers.get("Origin");
  // Browser uploads are accepted only from the configured site origin.
  if(origin!==env.ALLOWED_ORIGIN)return json({error:"origin not allowed"},403,env);
  const url=new URL(request.url);
  const match=url.pathname.match(/^\\/(image|upload)\\/([^/]+)$/);
  if(!match||!validRaceId(match[2]))return new Response("Not found",{status:404,headers});
  const [,action,raceId]=match;const key=keyFor(raceId);
  if(request.method==="GET"&&action==="image"){
   const object=await env.IMAGES.get(key);
   if(!object)return new Response("Not found",{status:404,headers});
   const out=new Headers(headers);out.set("Content-Type",object.httpMetadata?.contentType||"application/octet-stream");out.set("Cache-Control","public, max-age=300");out.set("X-Content-Type-Options","nosniff");
   return new Response(object.body,{headers:out});
  }
  if(request.method==="PUT"&&action==="upload"){
   const type=request.headers.get("Content-Type")||"";
   if(!["image/png","image/jpeg","image/webp"].includes(type))return json({error:"unsupported image type"},415,env);
   const length=Number(request.headers.get("Content-Length")||0);
   if(length>MAX_BYTES)return json({error:"file too large"},413,env);
   const data=await request.arrayBuffer();
   if(data.byteLength===0||data.byteLength>MAX_BYTES)return json({error:"invalid file size"},413,env);
   const detected=detectImage(new Uint8Array(data));
   if(detected!==type)return json({error:"file content does not match image type"},415,env);
   await env.IMAGES.put(key,data,{httpMetadata:{contentType:detected,cacheControl:"public, max-age=300"}});
   return json({ok:true,raceId},200,env);
  }
  if(request.method==="DELETE"&&action==="image"){
   await env.IMAGES.delete(key);
   return json({ok:true,raceId,deleted:true},200,env);
  }
  return new Response("Method not allowed",{status:405,headers});
 }
};
