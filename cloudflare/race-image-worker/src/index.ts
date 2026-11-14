export interface Env {
  IMAGES: R2Bucket;
  ADMIN_PASSWORD: string;
  TOKEN_SECRET: string;
  ALLOWED_ORIGIN: string;
}
const MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const cors = (env: Env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
});
function json(data: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(data), {status, headers:{...cors(env),"Content-Type":"application/json","Cache-Control":"no-store"}});
}
function b64url(bytes: Uint8Array) {
  let s=""; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function unb64url(value:string) {
  const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function sign(value:string, secret:string) {
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value))));
}
async function issueToken(secret:string) {
  const payload=b64url(encoder.encode(JSON.stringify({exp:Date.now()+8*60*60*1000,scope:"upload"})));
  return payload+"."+await sign(payload,secret);
}
async function validToken(request:Request,secret:string) {
  const value=request.headers.get("Authorization")||"";
  if(!value.startsWith("Bearer "))return false;
  const parts=value.slice(7).split(".");
  if(parts.length!==2)return false;
  if(await sign(parts[0],secret)!==parts[1])return false;
  try { const p=JSON.parse(new TextDecoder().decode(unb64url(parts[0]))); return p.scope==="upload"&&p.exp>Date.now(); } catch { return false; }
}
function validRaceId(id:string){return /^\d{4}-\d{2}-\d{2}-[a-z]+-\d{1,2}$/.test(id);}
function keyFor(id:string){return "races/"+id+"/image";}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const headers=cors(env);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const url=new URL(request.url);
  if(request.method==="POST"&&url.pathname==="/login"){
   let body:any;try{body=await request.json();}catch{return json({error:"bad request"},400,env);}
   if(typeof body?.password!=="string"||body.password!==env.ADMIN_PASSWORD)return json({error:"unauthorized"},401,env);
   return json({token:await issueToken(env.TOKEN_SECRET)},200,env);
  }
  const match=url.pathname.match(/^\/(image|upload)\/([^/]+)$/);
  if(!match||!validRaceId(match[2]))return new Response("Not found",{status:404,headers});
  const [,action,raceId]=match;const key=keyFor(raceId);
  if(request.method==="GET"&&action==="image"){
   const object=await env.IMAGES.get(key);
   if(!object)return new Response("Not found",{status:404,headers});
   const out=new Headers(headers);out.set("Content-Type",object.httpMetadata?.contentType||"application/octet-stream");out.set("Cache-Control","public, max-age=300");
   return new Response(object.body,{headers:out});
  }
  if(request.method==="PUT"&&action==="upload"){
   if(!await validToken(request,env.TOKEN_SECRET))return json({error:"unauthorized"},401,env);
   const type=request.headers.get("Content-Type")||"";
   if(!["image/png","image/jpeg","image/webp"].includes(type))return json({error:"unsupported image type"},415,env);
   const length=Number(request.headers.get("Content-Length")||0);
   if(length>MAX_BYTES)return json({error:"file too large"},413,env);
   const data=await request.arrayBuffer();
   if(data.byteLength===0||data.byteLength>MAX_BYTES)return json({error:"invalid file size"},413,env);
   await env.IMAGES.put(key,data,{httpMetadata:{contentType:type,cacheControl:"public, max-age=300"}});
   return json({ok:true,raceId},200,env);
  }
  return new Response("Method not allowed",{status:405,headers});
 }
};
