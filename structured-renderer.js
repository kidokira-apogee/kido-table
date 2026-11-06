/*
 * 木戸表電子版 構造化データ用レンダラー
 * 2026-11-07
 *
 * 正本 index.html の既存クラス・DOM構造に合わせてHTML断片を生成する。
 * CSSは追加しない。DATE 2の4列値に対する赤強調は行わない。
 * TARGET色は options.applyTargetColors === true のときだけ表示比較用に適用。
 */
(function (global) {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const display = value => value === null || value === undefined || value === '' ? '—' : esc(value);
  const validColor = value => typeof value === 'string' && /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\([0-9.%\s,\/]+\)|hsla?\([0-9.%\s,\/]+\))$/i.test(value.trim());
  const styleAttr = (cell, enabled) => {
    if (!enabled || !cell) return '';
    const styles = [];
    if (validColor(cell.backgroundColor)) styles.push('background-color:' + cell.backgroundColor.trim());
    if (validColor(cell.textColor)) styles.push('color:' + cell.textColor.trim());
    return styles.length ? ' style="' + esc(styles.join(';')) + '"' : '';
  };
  const recordText = item => {
    if (Array.isArray(item?.record)) return '(' + item.record.map(display).join('-') + ')';
    if (item?.value !== undefined && item?.value !== null && item?.value !== '') return display(item.value);
    return '—';
  };
  const venueShort = { '札幌':'札', '函館':'函', '福島':'福', '新潟':'新', '東京':'東', '中山':'中', '中京':'名', '京都':'京', '阪神':'阪' };

  function formatCourse(raw) {
    const value = String(raw || '').trim();
    const m = value.match(/^([^･・]+)[･・]([TD])([0-9]{2,4})$/);
    if (!m) return { label: value || '—', attrs: '' };
    const distance = m[3].length <= 2 ? Number(m[3]) * 100 : Number(m[3]);
    const venue = Object.keys(venueShort).find(name => venueShort[name] === m[1]);
    const label = m[1] + '・' + m[2] + distance;
    return {
      label,
      attrs: venue ? ' data-distance="' + distance + '" data-surface="' + m[2] + '" data-venue="' + esc(venue) + '"' : ''
    };
  }

  function runHtml(run, index, styles, applyColors) {
    const fields = [
      ['頭数', run.fieldSize, 'fieldSize'], ['馬番', run.horseNumber, 'horseNumber'],
      ['人気', run.popularity, 'popularity'], ['着数', run.finish, 'finish'],
      ['着差', run.margin, 'margin'], ['指数', run.index, 'index'],
      ['上3F', run.last3F, 'last3F'], ['順', run.last3FRank, 'last3FRank'],
      ['間隔', run.interval, 'interval'], ['B', run.blinkers, 'blinkers']
    ];
    const indexNum = Number(run.index);
    const indexClass = Number.isFinite(indexNum) && run.index !== ''
      ? (indexNum >= 95 ? ' index-95' : indexNum >= 90 ? ' index-90' : indexNum >= 80 ? ' index-80' : '') : '';
    const course = formatCourse(run.courseRaw);
    const runningStyle = run.runningStyleRaw || '—';
    const passingValues = (run.passingOrder || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    const passing = passingValues.map(v => esc(v)).join(' - ');
    const passingStyleCell = (styles?.passingOrder || []).find(v => v && (v.textColor || v.backgroundColor));
    const metricHtml = fields.map(([label, value, key]) => {
      const cls = 'metric' + (key === 'index' ? indexClass : '');
      return '<div class="' + cls + '"' + styleAttr(styles?.[key], applyColors) + '><small>' + label + '</small><b>' + display(value) + '</b></div>';
    }).join('');
    const bodyWeight = run.bodyWeight ? display(run.bodyWeight) + 'kg' : '—';
    const weight = run.weight ? display(run.weight) + 'kg' : '—';
    const change = run.bodyWeightChange ? ' ( ' + display(run.bodyWeightChange) + ' )' : '';
    const subline = [run.ageClass, run.class, run.jockey, weight, bodyWeight + change, run.going]
      .filter(v => v !== null && v !== undefined && v !== '').map(display).join('　');
    return '<article class="run">' +
      '<div class="run-head"><strong>' + display(run.label || ['前走','2走前','3走前'][index]) + '</strong><span class="run-date"' + styleAttr(styles?.dateRaw, applyColors) + '>' + display(run.dateRaw) + '</span></div>' +
      '<div class="run-three-rows"><div class="run-summary"><strong' + styleAttr(styles?.raceName, applyColors) + '>' + display(run.raceName) + '</strong>' +
      '<div class="run-subline"><span class="run-course"' + course.attrs + styleAttr(styles?.courseRaw, applyColors) + '>' + display(course.label) + '</span><span>' + subline + '</span></div></div>' +
      '<div class="metrics-row"><div class="run-details">' + metricHtml + '</div></div>' +
      '<div class="run-passage"><span>脚質 <b' + styleAttr(styles?.runningStyleRaw, applyColors) + '>' + display(runningStyle) + '</b></span>' +
      '<span>通過順 <b' + styleAttr(passingStyleCell, applyColors) + '>' + (passing || '—') + '</b></span></div></div></article>';
  }

  function statsCard(title, items) {
    if (!Array.isArray(items)) items = items ? [items] : [];
    const rows = items.map(item => {
      const value = recordText(item);
      // DATE 2の4列値は列意味・分母を確定できていないため、赤系強調を付けない。
      return '<div class="stat-row"><span>' + display(item?.label) + '</span><strong class="record">' + value + '</strong></div>';
    }).join('');
    return '<section class="panel-card"><h4>' + esc(title) + '</h4><div class="stats">' + rows + '</div></section>';
  }

  function dataPanel(horse, key, race) {
    const data = horse.dataTabs?.[key] || {};
    if (key === 'detail') return '<div class="panel-grid">' +
      statsCard('通算成績', data.overall) + statsCard(race.surface === '芝' ? '芝条件' : 'ダート条件', data.surfaceConditions) + '</div>';
    if (key === 'distanceCourse') return '<div class="panel-grid">' +
      statsCard('距離帯別実績', data.distanceBands) + statsCard('コース別実績', data.courseRecords) + statsCard('上がり性能', data.performance) + '</div>';
    if (key === 'conditions') {
      const rotationSeason = [data.rotation, data.season].filter(Boolean);
      const paceTurn = [...(data.pace || []), ...(data.turn || [])];
      return '<div class="panel-grid">' + statsCard('ローテーション・季節', rotationSeason) +
        statsCard('ペース・回り', paceTurn) + statsCard('頭数・人気別', data.fieldSizeAndPopularity) + '</div>';
    }
    return '<div class="panel-grid">' + statsCard('枠順別実績', data.frameRecords) + statsCard('連対実績', data.top2Records) + '</div>';
  }

  function summaryChip(item, label, kind) {
    const value = kind === 'record' ? recordText(item) : display(item?.value);
    const numerator = Number(item?.highlight?.numerator);
    const denominator = Number(item?.highlight?.denominator);
    const hasFraction = Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0;
    const lateClass = kind === 'lateRate' && item?.highlight?.apply === true && hasFraction && (numerator / denominator) * 100 >= 25 ? ' late' : '';
    return '<div class="data-chip' + lateClass + '"><small>' + esc(label) + '</small><b>' + value + '</b></div>';
  }

  function horseHtml(horse, race, applyColors) {
    const p = horse.profile || {};
    const pedigree = horse.pedigree || {};
    const pedigreeStyles = pedigree.sourceStyles || {};
    const horseStyles = horse.sourceStyles || {};
    const profileStyles = horseStyles.profile || {};
    const summary = horse.topSummary || {};
    const frame = Number(horse.frameNumber);
    const frameClass = Number.isInteger(frame) && frame >= 1 && frame <= 8 ? ' frame-' + frame : '';
    const affiliation = p.affiliation === '美浦' ? 'miho' : p.affiliation === '栗東' ? 'ritto' : '';
    const affiliationLabel = p.affiliation ? '・' + p.affiliation + '所属' : '';
    const current = horse.comments?.current || {};
    const previous = horse.comments?.previousRun || {};
    const runs = (horse.recentRuns || []).slice(0, 3);
    const runStyles = horseStyles.recentRuns || [];
    const tabs = [ ['detail','詳細成績'], ['distanceCourse','距離・コース'], ['conditions','条件別'], ['frameAndTop2','枠順・連対実績'] ];
    const tabButtons = tabs.map((tab, i) => '<button aria-selected="' + (i === 0 ? 'true' : 'false') + '" class="data-tab" data-panel="' + tab[0] + '-' + horse.horseNumber + '" role="tab" type="button">' + tab[1] + '</button>').join('');
    const panels = tabs.map((tab, i) => '<section class="data-panel' + (i === 0 ? ' active' : '') + '" id="' + tab[0] + '-' + horse.horseNumber + '" data-data-content="' + tab[0] + '-' + horse.horseNumber + '">' + dataPanel(horse, tab[0], race) + '</section>').join('');
    const surfaceLabel = race.surface === '芝' ? '芝成績' : 'ダート成績';
    const summaryHtml = '<div class="data-existing">' +
      summaryChip(summary.allRecord, '全成績', 'record') +
      summaryChip(summary.surfaceRecord, surfaceLabel, 'record') +
      summaryChip(summary.courseRecord, summary.courseRecord?.sourceLabel || '今回コース条件', 'record') +
      summaryChip(summary.turnRecord, summary.turnRecord?.sourceLabel || '今回周り条件', 'record') +
      summaryChip(summary.lateStartRate, '出遅れ率', 'lateRate') + '</div>';
    const currentText = typeof current.text === 'string' ? current.text : '';
    const previousText = typeof previous.text === 'string' ? previous.text : '';
    const comments = currentText || previousText ? '<section class="stable-comment"><div class="stable-comment-head"><strong>【' + display(p.trainer) + '厩舎】</strong></div>' +
      (currentText ? '<p class="stable-comment-body' + (current.isIchioshi ? ' is-ichioshi' : '') + '">' + esc(currentText) + '</p>' : '') +
      (previousText ? '<p class="stable-comment-previous">' + esc(previousText) + '</p>' : '') + '</section>' : '';
    const surfaceCode = race.surface === '芝' ? 'T' : 'D';
    return '<section class="horse-card" id="horse-' + horse.horseNumber + '" data-current-distance="' + esc(race.distanceM) + '" data-current-surface="' + surfaceCode + '" data-current-venue="' + esc(race.venue) + '" data-field-size="' + esc(race.fieldSize) + '" data-place-rate-min-starts="3" data-place-rate-threshold="0.5">' +
      '<div class="profile"><div class="profile-main"><div class="identity"><div class="number-wrap"><span class="frame-no' + frameClass + '" data-horse="' + esc(horse.horseNumber) + '">' + esc(horse.horseNumber) + '</span></div>' +
      '<div class="identity-main"><strong class="horse-name"' + styleAttr(profileStyles.horseName, applyColors) + '>' + display(horse.horseName) + '</strong><div class="horse-facts">' +
      '<span class="basic sex-age-pill"><label>性齢</label><b' + styleAttr(profileStyles.sexAge, applyColors) + '>' + display(p.sexAge) + '</b></span>' +
      '<span class="basic weight-pill"><label>斤量</label><b' + styleAttr(profileStyles.handicapWeight, applyColors) + '>' + (p.handicapWeight !== null && p.handicapWeight !== undefined && p.handicapWeight !== '' ? display(p.handicapWeight) + 'kg' : '—') + '</b></span>' +
      '<span class="basic"><label>騎手</label><b class="affiliation ' + affiliation + '" aria-label="' + esc(p.jockeyRaw) + esc(affiliationLabel) + '"' + styleAttr(profileStyles.jockeyRaw, applyColors) + '>' + display(p.jockeyRaw) + '</b></span>' +
      '<span class="basic"><label>調教師</label><b class="affiliation ' + affiliation + '" aria-label="' + esc(p.trainer) + esc(affiliationLabel) + '"' + styleAttr(profileStyles.trainer, applyColors) + '>' + display(p.trainer) + '</b></span>' +
      '</div></div></div></div>' +
      '<div class="pedigree-inline"><strong class="pedigree-father"' + styleAttr(pedigreeStyles.sire, applyColors) + '>父　' + display(pedigree.sire) + '</strong>' +
      '<strong class="pedigree-mother"><span class="dam-name"' + styleAttr({ textColor: pedigreeStyles.dam?.textColor }, applyColors) + '>' + display(pedigree.dam) + '</span><span class="dam-line"' + styleAttr(pedigreeStyles.damsire, applyColors) + '>（' + display(pedigree.damsire) + '）</span></strong></div></div>' +
      '<section class="runs-section"><div class="runs">' + runs.map((run, i) => runHtml(run, i, runStyles[i] || {}, applyColors)).join('') + '</div></section>' +
      '<section class="data-section">' + summaryHtml + '<div aria-label="DATA項目" class="data-tabs" role="tablist">' + tabButtons + '</div>' + panels + '</section>' + comments + '</section>';
  }

  function renderRace(data, options) {
    if (!data || !data.race || !Array.isArray(data.horses)) throw new Error('Invalid structured race data');
    const race = data.race;
    const applyColors = options?.applyTargetColors === true;
    const d = new Date(race.date + 'T00:00:00');
    const dateLabel = Number.isNaN(d.getTime()) ? race.date : d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
    const dateItems = [dateLabel, race.meetingLabel, race.fieldSize + '頭', race.startTime ? race.startTime + '発走' : null].filter(Boolean);
    const surfaceText = race.surface + ' ' + Number(race.distanceM).toLocaleString('ja-JP') + 'm';
    const subtitle = [race.classLabel, race.weightType].filter(Boolean).join('　');
    const header = '<nav class="race-nav"><button id="back-to-race-list-' + esc(race.id) + '" type="button">← レース一覧</button><span>木戸表 電子版</span></nav>' +
      '<header class="racehead"><div class="head-inner"><div class="date-line">' + dateItems.map(v => '<span>' + display(v) + '</span>').join('') + '</div>' +
      '<div class="title-line"><span class="race-no">' + esc(String(race.venue).toUpperCase()) + ' ' + esc(race.raceNumber) + 'R</span><span class="race-title">' + display(race.name) + '</span></div>' +
      '<div class="race-subtitle">' + display(subtitle) + '</div><div class="race-pills"><span class="pill">' + display(race.venue) + '</span><span class="pill">' + display(surfaceText) + '</span><span class="pill">' + display(race.direction === '右' ? '右回り' : race.direction === '左' ? '左回り' : race.direction) + '</span><span class="pill">' + display(race.currentGoing) + '</span></div></div></header>';
    const cards = data.horses.slice().sort((a, b) => a.horseNumber - b.horseNumber).map(h => horseHtml(h, race, applyColors)).join('');
    return '<div data-kido-structured-renderer="true">' + header + cards + '</div>';
  }

  global.KidoStructuredRenderer = { renderRace };
})(window);
