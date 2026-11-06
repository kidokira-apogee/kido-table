(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=v=>v===null||v===undefined||v===''?'－':esc(v);
const record=r=>Array.isArray(r)?r.join('-'):r&&Array.isArray(r.record)?r.record.join('-'):'－';
const itemRows=items=>(items||[]).map(x=>'<div class="stats"><span>'+txt(x.label)+'</span><strong>'+txt(x.value??record(x))+'</strong></div>').join('');
const card=(title,items)=>'<section class="panel-card"><h4>'+esc(title)+'</h4>'+itemRows(items)+'</section>';
const recordCard=(title,items)=>card(title,items);
const tabs=[
 ['detail','詳細成績'],['distanceCourse','距離・コース'],['conditions','条件別'],['frameAndTop2','枠順・連対実績']
];
function summaryChip(x){
 const rec=x?.record;
 const val=rec?rec.join('-'):x?.value;
 let classes='';
 if(Array.isArray(rec)&&rec.length>=4){
  const nums=rec.slice(0,3).map(Number),den=Number(rec[3]);
  if(nums.every(Number.isFinite)&&Number.isFinite(den)&&den>=3&&nums.reduce((a,n)=>a+n,0)/den>=0.5)classes+=' hit';
 }
 if(String(x?.label||'').includes('出遅れ')){
  const rate=Number(String(val??'').replace('%',''));
  if(Number.isFinite(rate)&&rate>=25)classes+=' late';
 }
 return '<div class="data-chip'+classes+'"><small>'+txt(x?.label)+'</small><b>'+txt(val)+'</b></div>';
}
function tabPanel(h,key){
 const d=h.dataTabs?.[key]||{};
 if(key==='detail')return '<div class="panel-grid">'+
 card('通算成績',d.overall)+card('今回馬場の条件成績',d.surfaceConditions)+
 '</div>';
 if(key==='distanceCourse')return '<div class="panel-grid">'+
 card('距離帯別実績',d.distanceBands)+card('コース別実績',d.courseRecords)+
 card('上がり性能',d.performance)+'</div>';
 if(key==='conditions'){
  const rot=[d.rotation,d.season].filter(Boolean);
  return '<div class="panel-grid">'+card('ローテーション・季節',rot)+
  card('ペース・回り',[...(d.pace||[]),...(d.turn||[])])+card('頭数・人気別',d.fieldSizeAndPopularity)+'</div>';
 }
 return '<div class="panel-grid">'+card('枠順別実績',d.frameRecords)+card('連対実績',d.top2Records)+'</div>';
}
function recentRun(run,i){
 const vals=[
 ['頭数',run.fieldSize],['馬番',run.horseNumber],['人気',run.popularity],['着数',run.finish],
 ['着差',run.margin],['指数',run.index],['上3F',run.last3F],['順',run.last3FRank],['間隔',run.interval],['B',run.blinkers]
 ];
 const style=({'逃':'逃げ','先':'先行','中':'中団','後':'後方','マ':'マクリ'})[run.runningStyleRaw]||run.runningStyleRaw||'－';
 const course=run.courseRaw||'';
 const bodyWeight=run.bodyWeight?txt(run.bodyWeight)+'kg'+(run.bodyWeightChange?' ('+txt(run.bodyWeightChange)+')':''):'－';
 const carriedWeight=run.weight?txt(run.weight)+'kg':'－';
 const metricClass=(label,value)=>{if(label!=='指数')return '';const n=Number(value);return !Number.isFinite(n)?'':n>=95?' index-95':n>=90?' index-90':n>=80?' index-80':'';};
 return '<article class="run"><div class="run-head"><strong>'+txt(run.label||(['前走','2走前','3走前'][i]))+'</strong><span class="run-date">'+txt(run.dateRaw)+'</span></div>'+
 '<div class="run-three-rows"><div class="run-summary"><strong>'+txt(run.raceName)+'</strong><div class="run-subline"><span class="run-course">'+txt(course)+'</span><span>'+txt(run.ageClass)+'・'+txt(run.class)+'　'+txt(run.jockey)+'　'+carriedWeight+'　'+bodyWeight+'　'+txt(run.going)+'</span></div></div>'+
 '<div class="metrics-row"><div class="run-details">'+vals.map(v=>'<div class="metric'+metricClass(v[0],v[1])+'"><label>'+v[0]+'</label><b>'+txt(v[1])+'</b></div>').join('')+'</div></div>'+
 '<div class="run-passage"><span><label>脚質</label><b>'+txt(style)+'</b></span><span><label>通過順</label><strong>'+txt((run.passingOrder||[]).join(' - '))+'</strong></span></div></div></article>';
}
function horseCard(h,race){
 const p=h.profile||{},ped=h.pedigree||{},c=h.comments||{};
 const summary=h.topSummary||{};
 const summaries=[summary.allRecord,summary.surfaceRecord,summary.courseRecord,summary.turnRecord,summary.lateStartRate];
 const affiliationClass=p.affiliation==='美浦'?'base-miho':p.affiliation==='栗東'?'base-ritto':'';
 const frameClass=Number.isInteger(h.frameNumber)?' frame-'+h.frameNumber:'';
 const pc=ped.colors||{},ps=ped.sourceStyles||{};
 const validColor=value=>{if(value===null||value===undefined||value==='')return false;return /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\(\s*[0-9.%\s,\/]+\)|hsla?\(\s*[0-9.%\s,\/]+\))$/i.test(String(value).trim());};
 const sourceStyle=(cell,bgFallback,textFallback)=>{
  const bg=cell&&cell.backgroundColor!==null&&cell.backgroundColor!==undefined?cell.backgroundColor:bgFallback;
  const fg=cell&&cell.textColor!==null&&cell.textColor!==undefined?cell.textColor:textFallback;
  const rules=[];
  if(validColor(bg))rules.push('background-color:'+esc(String(bg).trim()));
  if(validColor(fg))rules.push('color:'+esc(String(fg).trim()));
  return rules.length?' style="'+rules.join(';')+'"':'';
 };
 const pedigree='<div class="pedigree-inline">'+
 '<strong class="pedigree-father"'+sourceStyle(ps.sire,pc.sireBackground,null)+'>'+txt(ped.sire)+'</strong><strong class="pedigree-mother"><span class="dam-name"'+sourceStyle(ps.dam,null,pc.damText)+'>'+txt(ped.dam)+'</span><span class="dam-line"'+sourceStyle(ps.damsire,pc.damsireBackground,null)+'>（'+txt(ped.damsire)+'）</span></strong>'+
 '<strong class="affiliation-chip '+affiliationClass+'"><small>騎手</small><span>'+txt(p.jockeyRaw)+'</span></strong><strong class="affiliation-chip '+affiliationClass+'"><small>厩舎</small><span>'+txt(p.trainer)+'</span></strong></div>';
 const tabsHtml=tabs.map((t,i)=>'<button type="button" class="data-tab" data-panel="'+t[0]+'" aria-selected="'+(i===0)+'">'+t[1]+'</button>').join('');
 const panels=tabs.map((t,i)=>'<div class="data-panel '+(i===0?'active':'')+'" data-data-content="'+t[0]+'">'+tabPanel(h,t[0])+'</div>').join('');
 const current=c.current||{},previous=c.previousRun||{};
 const comments='<section class="comments"><div class="comments-head">厩舎・陣営コメント</div>'+
 (current.text?'<div class="comment-current '+(current.isIchioshi?'is-ichioshi':'')+'">'+esc(current.text)+'</div>':'')+
 (previous.text?'<div class="comment-previous">'+esc(previous.text)+'</div>':'')+'</section>';
 return '<article class="horse-card" data-current-distance="'+esc(race.distanceM)+'" data-current-surface="'+(race.surface==='芝'?'T':'D')+'" data-current-venue="'+esc(race.venue)+'" data-field-size="'+esc(race.fieldSize)+'" data-ichioshi="'+String(!!current.isIchioshi)+'">'+
 '<div class="profile"><div class="profile-main"><div class="identity"><div class="number-wrap"><div class="frame-no'+frameClass+'" data-horse="'+esc(h.horseNumber)+'">'+esc(h.horseNumber)+'</div></div><div class="identity-main"><div class="horse-name">'+esc(h.horseName)+'</div><div class="horse-facts"><span class="basic sex-age-pill"><label>性齢</label><strong>'+txt(p.sexAge)+'</strong></span><span class="basic weight-pill"><label>斤量</label><strong>'+txt(p.handicapWeight)+'kg</strong></span></div></div></div></div>'+pedigree+'</div>'+
 '<section class="horse-section recent-block"><button type="button" aria-expanded="true" class="horse-section-head section-toggle"><span>RECENT FORM</span><b aria-hidden="true" class="section-collapse-mark">−</b></button><div class="horse-section-content"><section class="runs-section"><div class="runs">'+(h.recentRuns||[]).slice(0,3).map(recentRun).join('')+'</div></section></div></section>'+
 '<section class="data-section"><div class="data-head"><strong>DATA</strong></div><div class="data-existing">'+summaries.map(summaryChip).join('')+'</div><div class="data-tabs">'+tabsHtml+'</div>'+panels+'</section>'+comments+'</article>';
}
function renderRace(data){
 if(!data||!data.race||!Array.isArray(data.horses))throw new Error('Invalid structured race data');
 const r=data.race;
 const date=new Date(r.date+'T00:00:00');
 const dateLabel=isNaN(date)?r.date:(date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日（日月火水木金土'[date.getDay()]+'）');
 const dirt=r.surface==='ダート';
 const header='<nav class="race-nav"><button id="back-to-race-list" type="button">← レース一覧</button><span>木戸表 電子版</span></nav>'+
 '<header class="racehead '+(dirt?'racehead-dirt':'')+'"><div class="head-inner"><div class="date-line"><span>'+esc(dateLabel)+'</span><i class="dot"></i><span>'+esc(r.venue)+'</span><i class="dot"></i><span>'+esc(r.fieldSize)+'頭</span><i class="dot"></i><span>'+txt(r.startTime)+'発走</span></div><div class="title-line"><span class="race-no">'+esc(String(r.venue).toUpperCase())+' '+esc(r.raceNumber)+'R</span><span class="race-title">'+esc(r.name)+'</span></div><div class="race-subtitle">'+txt(r.class)+'　'+txt(r.weightType)+'</div><div class="race-pills"><span class="pill">'+esc(r.venue)+'</span><span class="pill">'+esc(r.surface)+' '+esc(r.distanceM)+'m</span><span class="pill">'+txt(r.going)+'</span></div></div></header>';
 return header+data.horses.slice().sort((a,b)=>a.horseNumber-b.horseNumber).map(h=>horseCard(h,r)).join('');
}
global.KidoRaceRenderer={renderRace};
})(window);
