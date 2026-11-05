#!/usr/bin/env node
/** Structural and cross-record checks for Kido Table structured race JSON. */
import fs from 'node:fs';
const file=process.argv[2];
if(!file){console.error('Usage: node tools/validate-race.mjs <race.json>');process.exit(2);}
const errors=[];
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const required=(obj,keys,path)=>{for(const key of keys)if(!(key in obj))errors.push(`${path}.${key}: missing`);};
let data;
try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){console.error(`JSON parse failed: ${e.message}`);process.exit(1);}
if(!isObject(data))errors.push('$: root must be an object');
else{
 required(data,['schemaVersion','race','sourceAudit','horses'],'$');
 if(data.schemaVersion!=='1.0.0')errors.push('schemaVersion must be 1.0.0');
 if(!isObject(data.race))errors.push('race must be an object');
 else{
  required(data.race,['id','date','venue','raceNumber','name','surface','distanceM','direction','fieldSize','metadataSource'],'race');
  if(data.race.metadataSource!=='① TARGET')errors.push('race.metadataSource must be ① TARGET');
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(data.race.date??'')))errors.push('race.date must be YYYY-MM-DD');
  if(!['芝','ダート'].includes(data.race.surface))errors.push('race.surface must be 芝 or ダート');
  if(!Number.isInteger(data.race.fieldSize)||data.race.fieldSize<6||data.race.fieldSize>18)errors.push('race.fieldSize must be 6–18');
 }
 if(!Array.isArray(data.horses))errors.push('horses must be an array');
 else{
  if(data.horses.length<6||data.horses.length>18)errors.push('horses count must be 6–18');
  const nums=data.horses.map(h=>h?.horseNumber);
  if(new Set(nums).size!==nums.length)errors.push('horseNumber contains duplicates');
  for(const [i,h] of data.horses.entries()){
   const p=`horses[${i}]`;
   if(!isObject(h)){errors.push(`${p} must be an object`);continue;}
   required(h,['horseNumber','frameNumber','horseName','profile','pedigree','recentRuns','topSummary','dataTabs','comments'],p);
   if(!Number.isInteger(h.horseNumber)||h.horseNumber<1||h.horseNumber>18)errors.push(`${p}.horseNumber invalid`);
   if(!h.horseName)errors.push(`${p}.horseName empty`);
   if(!Array.isArray(h.recentRuns)||h.recentRuns.length!==3)errors.push(`${p}.recentRuns must contain exactly 3 runs`);
   else h.recentRuns.forEach((run,j)=>{if(!isObject(run))errors.push(`${p}.recentRuns[${j}] must be an object`);});
   if(!isObject(h.dataTabs))errors.push(`${p}.dataTabs must be an object`);
   else required(h.dataTabs,['detail','distanceCourse','conditions','frameAndTop2'],`${p}.dataTabs`);
   if(!isObject(h.comments))errors.push(`${p}.comments must be an object`);
   else{
    required(h.comments,['current','previousRun'],`${p}.comments`);
    if(isObject(h.comments.previousRun)&&'isIchioshi'in h.comments.previousRun)errors.push(`${p}.comments.previousRun must not contain isIchioshi`);
   }
  }
  if(isObject(data.race)&&data.horses.length!==data.race.fieldSize)errors.push(`horse count (${data.horses.length}) does not match race.fieldSize (${data.race.fieldSize})`);
  const sorted=[...nums].sort((a,b)=>a-b);
  if(nums.some((n,i)=>n!==sorted[i]))errors.push('horses must be ordered by horseNumber ascending');
 }
}
if(errors.length){console.error(`FAIL: ${errors.length} validation error(s)`);errors.forEach(e=>console.error('- '+e));process.exit(1);}
console.log(`PASS: ${data.race.id} / ${data.horses.length} horses / 3 recent runs each / 4 tabs / source provenance`);
