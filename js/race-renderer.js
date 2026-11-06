(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=v=>v===null||v===undefined||v===''?'－':esc(v);
const validColor=value=>value!==null&&value!==undefined&&value!==''&&/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\(\s*[0-9.%\s,\/]+\)|hsla?\(\s*[0-9.%\s,\/]+\))$/i.test(String(value).trim());
const isGraySourceColor=value=>{
 if(value===null||value===undefined||value==='')return false;
 const v=String(value).trim().toLowerCase().replace(/\s+/g,' ');
 if(['silver','gray','grey','#c0c0c0','#808080','#a9a9a9','#d3d3d3','#e8e8e8','#bfbfbf','#d9d9d9','#f0f0f0'].includes(v))return true;
 let rgb=null,m=v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
 if(m){const h=m[1].length===3?m[1].split('').map(x=>x+x).join(''):m[1];rgb=[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
 else{m=v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(m)rgb=[Number(m[1]),Number(m[2]),Number(m[3])];}
 return !!rgb&&Math.max(...rgb)-Math.min(...rgb)<=8&&rgb[0]>=110&&rgb[0]<=245;
};
const sourceStyle=(cell,bgFallback,textFallback,bgOverride)=>{
 const sourceBg=cell&&cell.backgroundColor!==null&&cell.backgroundColor!==undefined?cell.backgroundColor:undefined;
 const bg=sourceBg!==undefined&&!isGraySourceColor(sourceBg)?sourceBg:(bgOverride!==undefined?bgOverride:(sourceBg!==undefined?sourceBg:bgFallback));
 const fg=cell&&cell.textColor!==null&&cell.textColor!==undefined?cell.textColor:textFallback;
 const rules=[];
 if(validColor(bg))rules.push('background-color:'+esc(String(bg).trim()));
 if(validColor(fg))rules.push('color:'+esc(String(fg).trim()));
 return rules.length?' style="'+rules.join(';')+'"':'';
};
const record=r=>Array.isArray(r)?'('+r.map(v=>v===null||v===undefined||v===''?'－':String(v)).join('-')+')':r&&Array.isArray(r.record)?'('+r.record.map(v=>v===null||v===undefined||v===''?'－':String(v)).join('-')+')':'－';
const recordIsStrong=x=>{
 const r=Array.isArray(x)?x:x&&Array.isArray(x.record)?x.record:null;
 if(!r||r.length<4)return false;
 const n=r.slice(0,4).map(Number);
 return n.every(Number.isFinite)&&n[3]>=3&&(n[0]+n[1]+n[2])/n[3]>=0.5;
};
const itemRows=items=>(items||[]).map(x=>'<div class="stats"><span>'+txt(x.label)+'</span><strong class="'+(recordIsStrong(x)?'record good':'record')+'">'+txt(x.value??record(x))+'</strong></div>').join('');
const card=(title,items)=>'<section class="panel-card"><h4>'+esc(title)+'</h4>'+itemRows(items)+'</section>';
const recordCard=(title,items)=>card(title,items);
const tabs=[
 ['detail','詳細成績'],['distanceCourse','距離・コース'],['conditions','条件別'],['frameAndTop2','枠順・連対実績']
];
function summaryChip(x,label){
 const rec=x?.record;
 const val=rec?record(rec):x?.value;
 let classes='';
 if(Array.isArray(rec)&&rec.length>=4){
  const nums=rec.slice(0,3).map(Number),den=Number(rec[3]);
  if(nums.every(Number.isFinite)&&Number.isFinite(den)&&den>=3&&nums.reduce((a,n)=>a+n,0)/den>=0.5)classes+=' hit';
 }
 if(String(x?.label||'').includes('出遅れ')){
  const rate=Number(String(val??'').replace('%',''));
  if(Number.isFinite(rate)&&rate>=25)classes+=' late';
 }
 return '<div class="data-chip'+classes+'"><small>'+txt(label||x?.label)+'</small><b>'+txt(val)+'</b></div>';
}
function tabPanel(h,key,race){
 const d=h.dataTabs?.[key]||{};
 if(key==='detail')return '<div class="panel-grid">'+
 card('通算成績',d.overall)+card(race.surface==='芝'?'芝条件':'ダート条件',d.surfaceConditions)+
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
function formatCourse(raw){
 const value=String(raw||'').trim();
 const match=value.match(/^([^･・]+)[･・]([TD])([0-9]{2,4})$/);
 if(!match)return {label:value,attrs:''};
 const code=match[1],surface=match[2],digits=match[3];
 const distance=digits.length<=2?Number(digits)*100:Number(digits);
 const venues={'札':'札幌','函':'函館','福':'福島','新':'新潟','東':'東京','中':'中山','名':'中京','京':'京都','阪':'阪神','船':'船橋'};
 const venue=venues[code];
 const attrs=venue?' data-venue="'+esc(venue)+'" data-surface="'+surface+'" data-distance="'+distance+'"':'';
 return {label:code+'・'+surface+distance,attrs};
}
function recentRun(run,i,styles={}){
 const fields=[
  ['頭数',run.fieldSize,'fieldSize'],['馬番',run.horseNumber,'horseNumber'],['人気',run.popularity,'popularity'],['着数',run.finish,'finish'],
  ['着差',run.margin,'margin'],['指数',run.index,'index'],['上3F',run.last3F,'last3F'],['順',run.last3FRank,'last3FRank'],['間隔',run.interval,'interval'],['B',run.blinkers,'blinkers']
 ];
 const style=({'逃':'逃げ','先':'先行','中':'中団','後':'後方','マ':'マクリ'})[run.runningStyleRaw]||run.runningStyleRaw||'－';
 const course=formatCourse(run.courseRaw);
 const bodyWeight=run.bodyWeight?txt(run.bodyWeight)+'kg':'－';
 const carriedWeight=run.weight?txt(run.weight)+'kg':'－';
 const band=value=>{const n=Number(value);return !Number.isFinite(n)?undefined:n>=95?'#ffc0ff':n>=90?'#F4A09A':n>=80?'#00ff00':undefined;};
 const passage=(run.passingOrder||[]).map((v,j)=>'<span'+sourceStyle((styles.passingOrder||[])[j])+'>'+txt(v)+'</span>').join('<i> - </i>');
 const courseStyle=styles.courseRaw||{};
 return '<article class="run"><div class="run-head"><strong>'+txt(run.label||(['前走','2走前','3走前'][i]))+'</strong><span class="run-date"'+sourceStyle(styles.dateRaw)+'>'+txt(run.dateRaw)+'</span></div>'+
 '<div class="run-three-rows"><div class="run-summary"><strong'+sourceStyle(styles.raceName)+'>'+txt(run.raceName)+'</strong><div class="run-subline"><span class="run-course"'+(course.attrs||'')+sourceStyle(courseStyle)+'>'+txt(course.label)+'</span><span'+sourceStyle(styles.ageClass)+'>'+txt(run.ageClass)+'</span>・<span'+sourceStyle(styles.class)+'>'+txt(run.class)+'</span>　<span'+sourceStyle(styles.jockey)+'>'+txt(run.jockey)+'</span>　<span'+sourceStyle(styles.weight)+'>'+carriedWeight+'</span>　<span'+sourceStyle(styles.bodyWeight)+'>'+bodyWeight+'</span>'+(run.bodyWeightChange?'<span'+sourceStyle(styles.bodyWeightChange)+'>( '+txt(run.bodyWeightChange)+' )</span>':'')+'　<span'+sourceStyle(styles.going)+'>'+txt(run.going)+'</span></div></div>'+
 '<div class="metrics-row"><div class="run-details">'+fields.map(v=>'<div class="metric'+(v[2]==='index'?(Number(run.index)>=95?' index-95':Number(run.index)>=90?' index-90':Number(run.index)>=80?' index-80':''):'')+'"'+sourceStyle(styles[v[2]],null,null,v[2]==='index'?band(run.index):undefined)+'><label>'+v[0]+'</label><b>'+txt(v[1])+'</b></div>').join('')+'</div></div>'+
 '<div class="run-passage"><span><label>脚質</label><b'+sourceStyle(styles.runningStyleRaw)+'>'+txt(style)+'</b></span><span><label>通過順</label><strong>'+passage+'</strong></span></div></div></article>';
}
function horseCard(h,race){
 const p=h.profile||{},ped=h.pedigree||{},c=h.comments||{};
 const summary=h.topSummary||{};
 const summaries=[
  [summary.allRecord,'全成績'],
  [summary.surfaceRecord,race.surface==='芝'?'芝成績':'ダート成績'],
  [summary.courseRecord,'今回コース条件'],
  [summary.turnRecord,'今回周り条件'],
  [summary.lateStartRate,'出遅れ率']
 ];
 const affiliationClass=p.affiliation==='美浦'?'miho':p.affiliation==='栗東'?'ritto':'';
 const affiliationLabel=p.affiliation?p.affiliation+'所属':'';
 const frameClass=Number.isInteger(h.frameNumber)?' frame-'+h.frameNumber:'';
 const pc=ped.colors||{},ps=ped.sourceStyles||{},ts=h.sourceStyles||{},prof=ts.profile||{};

 const damStyle=sourceStyle(ps.dam,null,null);
 const pedigree='<div class="pedigree-inline">'+
 '<strong class="pedigree-father"'+sourceStyle(ps.sire,pc.sireBackground,null)+'>'+txt(ped.sire)+'</strong><strong class="pedigree-mother"'+damStyle+'><span class="dam-name"'+sourceStyle({backgroundColor:null,textColor:ps.dam?.textColor},null,pc.damText)+'>'+txt(ped.dam)+'</span><span class="dam-line"'+sourceStyle(ps.damsire,pc.damsireBackground,null)+'>（'+txt(ped.damsire)+'）</span></strong></div>';
 const tabsHtml=tabs.map((t,i)=>'<button type="button" class="data-tab" data-panel="'+t[0]+'" aria-selected="'+(i===0)+'">'+t[1]+'</button>').join('');
 const panels=tabs.map((t,i)=>'<div class="data-panel '+(i===0?'active':'')+'" data-data-content="'+t[0]+'">'+tabPanel(h,t[0],race)+'</div>').join('');
 const current=c.current||{},previous=c.previousRun||{};
 const comments='<section class="comments"><div class="comments-head">厩舎・陣営コメント</div>'+
 (current.text?'<div class="comment-current '+(current.isIchioshi?'is-ichioshi':'')+'">'+esc(current.text)+'</div>':'')+
 (previous.text?'<div class="comment-previous">'+esc(previous.text)+'</div>':'')+'</section>';
 return '<article class="horse-card" data-current-distance="'+esc(race.distanceM)+'" data-current-surface="'+(race.surface==='芝'?'T':'D')+'" data-current-venue="'+esc(race.venue)+'" data-field-size="'+esc(race.fieldSize)+'" data-ichioshi="'+String(!!current.isIchioshi)+'">'+
 '<div class="profile"><div class="profile-main"><div class="identity"><div class="number-wrap"><div class="frame-no'+frameClass+'" data-horse="'+esc(h.horseNumber)+'" data-frame-number="'+esc(h.frameNumber??'')+'"'+sourceStyle(prof.horseNumber)+'>'+esc(h.horseNumber)+'</div></div><div class="identity-main"><strong class="horse-name"'+sourceStyle(prof.horseName)+'>'+esc(h.horseName)+'</strong><div class="horse-facts"><span class="basic sex-age-pill"><label>性齢</label><b'+sourceStyle(prof.sexAge)+'>'+txt(p.sexAge)+'</b></span><span class="basic weight-pill"><label>斤量</label><b'+sourceStyle(prof.handicapWeight)+'>'+(p.handicapWeight!==null&&p.handicapWeight!==undefined&&p.handicapWeight!==''?txt(p.handicapWeight)+'kg':'－')+'</b></span><span class="basic"><label>騎手</label><b class="affiliation '+affiliationClass+'"'+sourceStyle(prof.jockeyRaw)+(affiliationLabel?' aria-label="'+esc(p.jockeyRaw||'')+'・'+esc(affiliationLabel)+'"':'')+'>'+txt(p.jockeyRaw)+'</b></span><span class="basic"><label>調教師</label><b class="affiliation '+affiliationClass+'"'+sourceStyle(prof.trainer)+(affiliationLabel?' aria-label="'+esc(p.trainer||'')+'・'+esc(affiliationLabel)+'"':'')+'>'+txt(p.trainer)+'</b></span></div></div></div></div>'+pedigree+'</div>'+
 '<section class="horse-section recent-block"><button type="button" aria-expanded="true" class="horse-section-head section-toggle"><span>RECENT FORM</span><b aria-hidden="true" class="section-collapse-mark">−</b></button><div class="horse-section-content"><section class="runs-section"><div class="runs">'+(h.recentRuns||[]).slice(0,3).map((run,i)=>recentRun(run,i,(ts.recentRuns||[])[i]||{})).join('')+'</div></section></div></section>'+
 '<section class="data-section"><div class="data-head"><strong>DATA</strong></div><div class="data-existing">'+summaries.map(([item,label])=>summaryChip(item,label)).join('')+'</div><div class="data-tabs">'+tabsHtml+'</div>'+panels+'</section>'+comments+'</article>';
}
function renderRace(data){
 if(!data||!data.race||!Array.isArray(data.horses))throw new Error('Invalid structured race data');
 const r=data.race;
 const date=new Date(r.date+'T00:00:00');
 const dateLabel=isNaN(date)?r.date:(date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日（'+'日月火水木金土'[date.getDay()]+'）');
 const dirt=r.surface==='ダート';
 const dateItems=[dateLabel,r.meetingLabel,r.venue,r.fieldSize!==undefined?String(r.fieldSize)+'頭':null,r.startTime?String(r.startTime)+'発走':null].filter(Boolean);
 const coursePill=r.courseLabel?'<span class="pill">'+esc(r.courseLabel)+'</span>':'';
 const directionPill=r.direction&&r.direction!=='不明'?'<span class="pill">'+esc(r.direction==='左'?'左回り':r.direction==='右'?'右回り':r.direction)+'</span>':'';
 const goingPill=r.going?'<span class="pill">'+txt(r.going)+'</span>':'';
 const header='<nav class="race-nav"><button id="back-to-race-list" type="button">← レース一覧</button><span>木戸表 電子版</span></nav>'+
 '<header class="racehead '+(dirt?'racehead-dirt':'')+'"><div class="head-inner"><div class="date-line">'+dateItems.map((v,i)=>(i?'<i class="dot"></i>':'')+'<span>'+esc(v)+'</span>').join('')+'</div><div class="title-line"><span class="race-no">'+esc(String(r.venue).toUpperCase())+' '+esc(r.raceNumber)+'R</span><span class="race-title">'+esc(r.name)+'</span></div><div class="race-subtitle">'+txt(r.class)+'　'+txt(r.weightType)+'</div><div class="race-pills"><span class="pill">'+esc(r.venue)+'</span><span class="pill">'+esc(r.surface)+' '+esc(r.distanceM)+'m</span>'+coursePill+directionPill+goingPill+'</div></div></header>';
 return header+data.horses.slice().sort((a,b)=>a.horseNumber-b.horseNumber).map(h=>horseCard(h,r)).join('');
}
global.KidoRaceRenderer={renderRace};
})(window);
