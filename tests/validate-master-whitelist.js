#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [
  'candidate-data/2026-11-01-kyoto-7_candidate_v3.json',
  'candidate-data/2026-10-31-kyoto-12_candidate_v3.json'
];
const expected = {
  root: ['schemaVersion','race','sourceAudit','status','horses','render','integrationStatus','candidateLimitations'],
  horse: ['horseNumber','frameNumber','horseName','profile','pedigree','recentRuns','topSummary','dataTabs','comments','sourceStyles','sourceRefs'],
  tabs: ['detail','distanceCourse','conditions','frameAndTop2'],
  topSummary: {
    allRecord: ['全成績','全着'],
    surfaceRecord: ['今回馬場','SURFACE'],
    courseRecord: ['今回コース条件','COURSE'],
    turnRecord: ['今回周り','TURN'],
    lateStartRate: ['出遅れ率','出遅れ率']
  },
  detail: ['overall','surfaceConditions'],
  distanceCourse: ['distanceBands','courseRecords','performance'],
  conditions: ['rotation','season','pace','turn','fieldSizeAndPopularity'],
  frameAndTop2: ['frameRecords','top2Records'],
  performance: ['当距離','芝最高','ダ最高','近５平'],
  top2: ['連対体重','連対距離','連対平均']
};
const forbidden = ['当会場','関係者成績','通算脚質','最近5走','近5走','ベストタイム','コース別ベストタイム','出遅れ率','脚質別'];
function fail(errors, where, message) { errors.push(where + ': ' + message); }
function exactKeys(value, keys, where, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(errors, where, 'object required'); return; }
  const actual = Object.keys(value).sort(), wanted = [...keys].sort();
  for (const k of wanted) if (!Object.hasOwn(value,k)) fail(errors,where,'missing key '+k);
  for (const k of actual) if (!wanted.includes(k)) fail(errors,where,'unexpected key '+k);
}
function norm(v) { return String(v ?? '').replace(/[\s　]+/g,' ').trim(); }
function checkSource(h, item, where, errors) {
  const s = item?.source;
  if (!s || s.status !== 'extracted') { fail(errors,where,'source must be explicitly extracted'); return; }
  if (s.horseNumber !== h.horseNumber || s.horseName !== h.horseName) fail(errors,where,'source horse identity mismatch');
  const lines = s.sourceLine ? [s.sourceLine] : s.sourceLines;
  if (!Array.isArray(lines) || !lines.length || lines.some(n => !Number.isInteger(n) || n < 1)) fail(errors,where,'valid source line reference required');
}
function checkRecord(h, item, where, errors) {
  checkSource(h,item,where,errors);
  if (!Array.isArray(item.record) || item.record.length !== 4 || item.record.some(v => !/^\d+$/.test(String(v)))) fail(errors,where,'record must contain four numeric columns (1着・2着・3着・着外)');
}
function checkLabelList(h, list, labels, where, errors, record=true) {
  if (!Array.isArray(list)) { fail(errors,where,'array required'); return; }
  const actual=list.map(x=>x.label);
  if (actual.join('|') !== labels.join('|')) fail(errors,where,'labels/order mismatch: '+actual.join(' | '));
  for (let i=0;i<list.length;i++) {
    const item=list[i];
    if(record) checkRecord(h,item,where+'['+i+']',errors);
    else {
      checkSource(h,item,where+'['+i+']',errors);
      if (typeof item.value !== 'string') fail(errors,where+'['+i+']','value string required');
    }
  }
}
function inspectForbidden(value, where, errors) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((v,i)=>inspectForbidden(v,where+'['+i+']',errors)); return; }
  for (const [k,v] of Object.entries(value)) {
    if (forbidden.some(word => k.includes(word))) fail(errors,where+'.'+k,'master-excluded field');
    if (typeof v === 'string' && forbidden.some(word => v.includes(word))) fail(errors,where+'.'+k,'master-excluded label/value');
    inspectForbidden(v,where+'.'+k,errors);
  }
}
function validateHorse(h, data, at, errors) {
  exactKeys(h,expected.horse,at,errors);
  if (!Number.isInteger(h.horseNumber) || h.horseNumber<1) fail(errors,at,'invalid horse number');
  if (!h.horseName) fail(errors,at,'horse name required');
  if (String(h.profile?.horseNumber ?? '') !== String(h.horseNumber) || h.profile?.horseName !== h.horseName) fail(errors,at+'.profile','identity mismatch');
  if (!Array.isArray(h.recentRuns) || h.recentRuns.length!==3) fail(errors,at+'.recentRuns','exactly three runs required');
  else {
    const runLabels=['前走','2走前','3走前'];
    h.recentRuns.forEach((r,i)=>{
      if(r.label!==runLabels[i]) fail(errors,at+'.recentRuns['+i+']','label/order mismatch');
      if(!r.source || r.source.horseNumber!==h.horseNumber || r.source.horseName!==h.horseName) fail(errors,at+'.recentRuns['+i+']','TARGET source identity mismatch');
    });
  }
  for(const source of ['TARGET','DATE2','東スポ']) {
    const ref=h.sourceRefs?.[source];
    if(!ref || ref.horseNumber!==h.horseNumber || ref.horseName!==h.horseName) fail(errors,at+'.sourceRefs.'+source,'source identity mismatch');
  }
  exactKeys(h.dataTabs,expected.tabs,at+'.dataTabs',errors);
  const t=h.dataTabs||{};
  exactKeys(t.detail,expected.detail,at+'.dataTabs.detail',errors);
  exactKeys(t.distanceCourse,expected.distanceCourse,at+'.dataTabs.distanceCourse',errors);
  exactKeys(t.conditions,expected.conditions,at+'.dataTabs.conditions',errors);
  exactKeys(t.frameAndTop2,expected.frameAndTop2,at+'.dataTabs.frameAndTop2',errors);
  checkLabelList(h,t.detail?.overall,['全着','全芝','全ダ'],at+'.detail.overall',errors);
  const surface=data.race?.surface==='芝'?'芝':'ダ';
  checkLabelList(h,t.detail?.surfaceConditions,['坂有'+surface,'平坦'+surface,'重不'+surface],at+'.detail.surfaceConditions',errors);
  checkLabelList(h,t.distanceCourse?.distanceBands,['1000m-1300m','1400m-1600m','1700m-2000m','2100m-2400m'],at+'.distanceBands',errors);
  const course=data.race?.venue+surface+data.race?.distanceM+'m';
  const courseLabels=[course,'全場'+surface+(surface==='芝'?'1400m':'1200m'),'全場'+surface+(surface==='芝'?'1600m':'1400m'),'全場'+surface+(surface==='芝'?'1800m':'1600m')];
  checkLabelList(h,t.distanceCourse?.courseRecords,courseLabels,at+'.courseRecords',errors);
  checkLabelList(h,t.distanceCourse?.performance,expected.performance,at+'.performance',errors,false);
  for(const k of ['rotation','season']) {
    const item=t.conditions?.[k]; checkRecord(h,item,at+'.conditions.'+k,errors);
    if(!item?.label) fail(errors,at+'.conditions.'+k,'source label required');
  }
  checkLabelList(h,t.conditions?.pace,['Sペ','Hペ'],at+'.pace',errors);
  checkLabelList(h,t.conditions?.turn,['右回','左回'],at+'.turn',errors);
  checkLabelList(h,t.conditions?.fieldSizeAndPopularity,['９頭下','10頭上','３人上','４人下'],at+'.fieldSizeAndPopularity',errors);
  const frameLabel=String(h.frameNumber).replace(/[0-9]/g,d=>'０１２３４５６７８９'[Number(d)])+'枠';
  checkLabelList(h,t.frameAndTop2?.frameRecords,['内枠','中枠','外枠',frameLabel],at+'.frameRecords',errors);
  if(!Array.isArray(t.frameAndTop2?.top2Records) || t.frameAndTop2.top2Records.map(x=>x.label).join('|')!==expected.top2.join('|')) fail(errors,at+'.top2Records','連対実績 labels/order mismatch');
  else t.frameAndTop2.top2Records.forEach((item,i)=>{checkSource(h,item,at+'.top2Records['+i+']',errors);if(typeof item.value!=='string')fail(errors,at+'.top2Records['+i+']','value string required');});
  const s=h.topSummary||{};
  exactKeys(s,Object.keys(expected.topSummary),at+'.topSummary',errors);
  for(const [k,[label,sourceLabel]] of Object.entries(expected.topSummary)) {
    const item=s[k];
    if(item?.label!==label) fail(errors,at+'.topSummary.'+k,'display label mismatch');
    if(k==='lateStartRate') {
      checkSource(h,item,at+'.topSummary.'+k,errors);
      if(typeof item.value!=='string'||!/^\d+(?:\.\d+)?%$/.test(item.value)) fail(errors,at+'.topSummary.'+k,'percentage value required');
    } else {
      const expectedSource=k==='surfaceRecord'?'全'+surface:k==='courseRecord'?course:k==='turnRecord'?'右回':sourceLabel;
      if(item?.sourceLabel!==expectedSource) fail(errors,at+'.topSummary.'+k,'source label mismatch');
      checkRecord(h,item,at+'.topSummary.'+k,errors);
    }
  }
  const c=h.comments||{};
  for(const k of ['current','previousRun']) {
    if(typeof c[k]?.text!=='string') fail(errors,at+'.comments.'+k,'comment text required');
    if(!c[k]?.source) fail(errors,at+'.comments.'+k,'comment source reference required');
  }
  if(typeof c.rawCombined!=='string') fail(errors,at+'.comments.rawCombined','raw combined comment required');
  if(!['split_by_explicit_labels','unclassified_requires_review'].includes(c.splitStatus)) {
    fail(errors,at+'.comments.splitStatus','unsupported comment split status');
  } else if(c.splitStatus==='unclassified_requires_review') {
    if(c.current?.text!=='' || c.previousRun?.text!=='') fail(errors,at+'.comments','unclassified comments must not be assigned to current/previous text');
    if(c.current?.isIchioshi===true) fail(errors,at+'.comments.current.isIchioshi','ichioshi cannot be assigned to an unclassified comment');
    if(!c.rawCombined.trim()) fail(errors,at+'.comments.rawCombined','unclassified source text must be retained');
  }
  if(!c.splitEvidence) fail(errors,at+'.comments.splitEvidence','split evidence required');
  inspectForbidden(t,at+'.dataTabs',errors);
}
let failed=false;
for(const file of files) {
  const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const errors=[];
  exactKeys(data,expected.root,'$',errors);
  if(data.schemaVersion!=='1.0.0') fail(errors,'$.schemaVersion','must be 1.0.0');
  if(data.status?.complete!==false) fail(errors,'$.status.complete','candidate must remain false');
  if(!Array.isArray(data.horses)||data.horses.length!==data.race?.fieldSize) fail(errors,'$.horses','horse count must equal fieldSize');
  const seen=new Set();
  for(const [i,h] of (data.horses||[]).entries()) {
    if(seen.has(h.horseNumber)) fail(errors,'$.horses['+i+']','duplicate horse number');
    seen.add(h.horseNumber);
    validateHorse(h,data,'$.horses['+i+']',errors);
  }
  if(errors.length){failed=true;console.error('FAIL '+file+' ('+errors.length+')\\n'+errors.slice(0,80).join('\\n'));}
  else console.log('PASS '+file+' ('+data.horses.length+' horses; master whitelist, labels/order, source refs, four-column records, exclusions and comment split checked)');
}
if(failed)process.exit(1);
