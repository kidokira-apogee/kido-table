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
  // 着差だけはゼロの符号を保持し、小数第1位で表示する（0.0 / -0.0）。
  const displayMargin = value => {
    if (value === null || value === undefined || value === '') return '—';
    const raw = String(value).trim();
    // 着差の数値はすべて小数第1位に統一。負のゼロも符号を保持する。
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return display(value);
    const number = Number(raw);
    if (!Number.isFinite(number)) return display(value);
    if (number === 0 && raw.startsWith('-')) return '-0.0';
    return number.toFixed(1);
  };
  const validColor = value => typeof value === 'string' && /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\([0-9.%\s,\/]+\)|hsla?\([0-9.%\s,\/]+\))$/i.test(value.trim());
  // Excelの既定ベース色とグレー塗りは、意味を持つ着色としてWebへ引き継がない。
  const isNeutralSourceFill = value => {
    if (!validColor(value)) return false;
    const color = value.trim().toLowerCase();
    const namedNeutral = new Set(['gray', 'grey', 'silver', 'lightgray', 'lightgrey', 'darkgray', 'darkgrey']);
    if (namedNeutral.has(color)) return true;
    const hex = color.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
    if (!hex) return false;
    const rgb = hex[1].toUpperCase();
    if (rgb === 'E8E8C8') return true; // Excelでベース背景として使われている色
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    return r === g && g === b; // 灰色系の塗り
  };
  const styleAttr = (cell, enabled, importantText = false) => {
    if (!enabled || !cell) return '';
    const styles = [];
    if (validColor(cell.backgroundColor) && !isNeutralSourceFill(cell.backgroundColor)) {
      styles.push('background-color:' + cell.backgroundColor.trim());
    }
    if (validColor(cell.textColor)) styles.push('color:' + cell.textColor.trim() + (importantText ? '!important' : ''));
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
    const indexClass = Number.isFinite(indexNum) && String(run.index ?? '').trim() !== ''
      ? (indexNum >= 95 ? ' index-95' : indexNum >= 90 ? ' index-90' : indexNum >= 80 ? ' index-80' : '') : '';
    const course = formatCourse(run.courseRaw);
    const runningStyle = run.runningStyleRaw || '—';
    const passingValues = (run.passingOrder || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    const passing = passingValues.map(v => esc(v)).join(' - ');
    const passingStyleCell = (styles?.passingOrder || []).find(v => v && (v.textColor || v.backgroundColor));
    const metricHtml = fields.map(([label, value, key]) => {
      const cls = 'metric' + (key === 'index' ? indexClass : '');
      // 指数は指数専用の配色を最優先し、Excelセルの背景色は適用しない。文字色は保持する。
      const cellStyle = key === 'index'
        ? styleAttr({ textColor: styles?.[key]?.textColor }, applyColors)
        : styleAttr(styles?.[key], applyColors);
      const shownValue = key === 'margin' ? displayMargin(value) : display(value);
      return '<div class="' + cls + '"' + cellStyle + '><small>' + label + '</small><b>' + shownValue + '</b></div>';
    }).join('');
    const bodyWeight = run.bodyWeight ? display(run.bodyWeight) + 'kg' : '—';
    const weight = run.weight ? display(run.weight) + 'kg' : '—';
    const change = run.bodyWeightChange ? ' ( ' + display(run.bodyWeightChange) + ' )' : '';
    // Keep the existing single subline wrapper and spacing, but render each source field
    // separately so TARGET colors are applied only to the field that owns the source style.
    const sublineStyle = cell => {
      const attrs = styleAttr(cell, applyColors);
      return attrs ? attrs.replace(' style="', ' style="font-style:normal;') : ' style="font-style:normal"';
    };
    const sublineField = (key, value, content = display(value)) =>
      value === null || value === undefined || value === ''
        ? ''
        : '<i' + sublineStyle(styles?.[key]) + '>' + content + '</i>';
    const subline = [
      sublineField('ageClass', run.ageClass),
      sublineField('class', run.class),
      sublineField('jockey', run.jockey),
      sublineField('weight', weight),
      sublineField('bodyWeight', bodyWeight,
        bodyWeight + (change
          ? ' ( <i' + sublineStyle(styles?.bodyWeightChange) + '>' + display(run.bodyWeightChange) + '</i> )'
          : '')),
      sublineField('going', run.going)
    ].filter(Boolean).join('　');
    return '<article class="run">' +
      '<div class="run-head"><strong>' + display(run.label || ['前走','2走前','3走前'][index]) + '</strong><span class="run-date"' + styleAttr(styles?.dateRaw, applyColors) + '>' + display(run.dateRaw) + '</span></div>' +
      '<div class="run-three-rows"><div class="run-summary"><strong' + styleAttr(styles?.raceName, applyColors) + '>' + display(run.raceName) + '</strong>' +
      '<div class="run-subline"><span class="run-course"' + course.attrs + styleAttr(styles?.courseRaw, applyColors) + '>' + display(course.label) + '</span><span>' + subline + '</span></div></div>' +
      '<div class="metrics-row"><div class="run-details">' + metricHtml + '</div></div>' +
      '<div class="run-passage"><span>脚質 <b' + styleAttr(styles?.runningStyleRaw, applyColors) + '>' + display(runningStyle) + '</b></span>' +
      '<span>通過順 <b' + styleAttr(passingStyleCell, applyColors) + '>' + (passing || '—') + '</b></span></div></div></article>';
  }

  function isPlaceRateHit(item) {
    const record = item?.record;
    if (!Array.isArray(record) || record.length !== 4) return false;
    const values = record.map(value => /^\d+$/.test(String(value ?? '').trim()) ? Number(value) : NaN);
    if (values.some(value => !Number.isFinite(value) || value < 0)) return false;
    // 表記は「1着-2着-3着-着外」。分母は4区分の合計、複勝数は上位3区分の合計。
    const denominator = values[0] + values[1] + values[2] + values[3];
    const placeCount = values[0] + values[1] + values[2];
    return denominator >= 3 && placeCount / denominator >= 0.5;
  }

  function statsCard(title, items, stackedRows = false, twoColumnRows = false) {
    if (!Array.isArray(items)) items = items ? [items] : [];
    const rows = items.map(item => {
      const value = recordText(item);
      const good = isPlaceRateHit(item) ? ' good' : '';
      // 正本HTMLの各成績行は stat-row で包む。行ラッパーを維持する。
      return '<div class="stat-row"><span>' + display(item?.label) + '</span><strong class="record' + good + '">' + value + '</strong></div>';
    }).join('');
    return '<section class="panel-card' + (stackedRows ? ' stacked-records-card' : '') + (twoColumnRows ? ' two-column-records-card' : '') + '"><h4>' + esc(title) + '</h4><div class="stats">' + rows + '</div></section>';
  }

  function frameRecordsCard(items) {
    const labels = ['内枠','中枠','外枠','今回の枠番'];
    const byLabel = new Map((Array.isArray(items) ? items : []).map(item => [item?.label, item]));
    const rows = labels.map(label => {
      const item = byLabel.get(label);
      const values = Array.isArray(item?.record) ? item.record : [];
      const hasRecord = values.length === 4 && values.every(value => value !== null && value !== undefined && value !== '');
      const value = hasRecord ? '(' + values.map(esc).join('-') + ')' : '';
      const sourceLabel = label === '今回の枠番' && item?.sourceLabel
        ? ' <small class="frame-source-label">' + esc(item.sourceLabel) + '</small>' : '';
      const good = hasRecord && isPlaceRateHit(item) ? ' good' : '';
      return '<div class="stat-row"><span>' + label + sourceLabel + '</span><strong class="record' + good + '">' + value + '</strong></div>';
    }).join('');
    return '<section class="panel-card frame-records-card"><h4>枠順成績</h4><div class="stats">' + rows + '</div></section>';
  }

  function dataPanel(horse, key, race) {
    const data = horse.dataTabs?.[key] || {};
    if (key === 'detail') return '<div class="panel-grid">' +
      statsCard('通算成績', data.overall, false, true) + '</div>';
    if (key === 'distanceCourse') return '<div class="panel-grid">' +
      statsCard('距離別成績', data.distanceBands, true) + statsCard('同コース成績', data.courseRecords, true) + '</div>';
    if (key === 'conditions') {
      const rotationSeason = [data.rotation, data.season].filter(Boolean);
      return '<div class="panel-grid">' +
        statsCard('ローテーション・季節', rotationSeason, true) +
        statsCard('馬場・コース条件', data.terrain, true) +
        frameRecordsCard(data.frameRecords) +
        statsCard('右回り・左回り', data.turn) + '</div>';
    }
    return '<div class="panel-grid"></div>';
  }

  function summaryChip(item, label, kind) {
    const value = kind === 'record' ? recordText(item) : display(item?.value);
    const latePercent = Number.parseFloat(String(item?.value ?? '').replace('%', '').trim());
    const lateClass = kind === 'lateRate' && Number.isFinite(latePercent) && latePercent >= 25 ? ' late' : '';
    const hitClass = kind === 'record' && isPlaceRateHit(item) ? ' hit' : '';
    return '<div class="data-chip' + lateClass + hitClass + '"><small>' + esc(label) + '</small><b>' + value + '</b></div>';
  }

  function horseHtml(horse, race, applyColors) {
    const p = horse.profile || {};
    const pedigree = horse.pedigree || {};
    const pedigreeStyles = pedigree.sourceStyles || {};
    const horseStyles = horse.sourceStyles || {};
    const profileStyles = horseStyles.profile || {};
    const summary = horse.topSummary || {};
    // 上部サマリーの今回コース条件は距離別ではなく開催場単位の成績を表示する。
    // 開催場レコードが元データにない場合、距離別成績を代用せず「—」とする。
    const venueRecord = (horse.dataTabs?.detail?.overall || []).find(item => item?.label === race.venue);
    const summaryVenueRecord = venueRecord || { label: race.venue, value: '—' };
    const frame = Number(horse.frameNumber);
    const frameClass = Number.isInteger(frame) && frame >= 1 && frame <= 8 ? ' frame-' + frame : '';
    // 騎手・調教師の所属は別々に扱う。未確認の所属は着色しない。
    // 旧データの affiliation は調教師側の所属として互換利用する。
    const jockeyAffiliation = p.jockeyAffiliation === '美浦' ? 'miho' : p.jockeyAffiliation === '栗東' ? 'ritto' : '';
    const trainerAffiliationValue = p.trainerAffiliation || p.affiliation || '';
    const trainerAffiliation = trainerAffiliationValue === '美浦' ? 'miho' : trainerAffiliationValue === '栗東' ? 'ritto' : '';
    const jockeyAffiliationLabel = p.jockeyAffiliation ? '・' + p.jockeyAffiliation + '所属' : '';
    const trainerAffiliationLabel = trainerAffiliationValue ? '・' + trainerAffiliationValue + '所属' : '';
    const current = horse.comments?.current || {};
    const previous = horse.comments?.previousRun || {};
    const runs = (horse.recentRuns || []).slice(0, 3);
    const runStyles = horseStyles.recentRuns || [];
    const tabs = [
      ['detail','詳細成績','detail'],
      ['conditions','条件別','conditions'],
      ['distanceCourse','距離・コース','distance']
    ];
    const tabButtons = tabs.map((tab, i) => '<button aria-selected="' + (i === 0 ? 'true' : 'false') + '" class="data-tab" data-panel="' + tab[2] + '-' + horse.horseNumber + '" role="tab" type="button">' + tab[1] + '</button>').join('');
    const panels = tabs.map((tab, i) => '<section class="data-panel' + (i === 0 ? ' active' : '') + '" id="' + tab[2] + '-' + horse.horseNumber + '" data-data-content="' + tab[2] + '-' + horse.horseNumber + '">' + dataPanel(horse, tab[0], race) + '</section>').join('');
    const surfaceLabel = race.surface === '芝' ? '芝成績' : 'ダート成績';
    const summaryHtml = '<div class="data-existing">' +
      summaryChip(summary.allRecord, '全成績', 'record') +
      summaryChip(summary.surfaceRecord, surfaceLabel, 'record') +
      summaryChip(summaryVenueRecord, race.venue || '今回コース条件', 'record') +
      summaryChip(summary.turnRecord, (race.direction === '右' || race.direction === '左') ? race.direction + '回' : (summary.turnRecord?.sourceLabel || '回り不明'), 'record') +
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
      '<span class="basic sex-age-pill' + (/^牝/.test(String(p.sexAge || '').trim()) ? ' female' : '') + '"><label>性齢</label><b' + styleAttr(profileStyles.sexAge, applyColors) + '>' + display(p.sexAge) + '</b></span>' +
      '<span class="basic weight-pill"><label>斤量</label><b' + styleAttr(profileStyles.handicapWeight, applyColors) + '>' + (p.handicapWeight !== null && p.handicapWeight !== undefined && p.handicapWeight !== '' ? display(p.handicapWeight) + 'kg' : '—') + '</b></span>' +
      '<span class="basic"><label>騎手</label><b class="affiliation ' + jockeyAffiliation + '" aria-label="' + esc(p.jockeyRaw) + esc(jockeyAffiliationLabel) + '"' + styleAttr(profileStyles.jockeyRaw, applyColors, true) + '>' + display(p.jockeyRaw) + '</b></span>' +
      '<span class="basic"><label>調教師</label><b class="affiliation ' + trainerAffiliation + '" aria-label="' + esc(p.trainer) + esc(trainerAffiliationLabel) + '"' + styleAttr(profileStyles.trainer, applyColors, true) + '>' + display(p.trainer) + '</b></span>' +
      '</div></div></div></div>' +
      '<div class="pedigree-inline"><strong class="pedigree-father"' + styleAttr(pedigreeStyles.sire, applyColors) + '>父　' + display(pedigree.sire) + '</strong>' +
      '<strong class="pedigree-mother"' + styleAttr(pedigreeStyles.damsire, applyColors) + '><span class="dam-name"' + styleAttr({ textColor: pedigreeStyles.dam?.textColor }, applyColors) + '>' + display(pedigree.dam) + '</span><span class="dam-line">（' + display(pedigree.damsire) + '）</span></strong></div></div>' +
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
    const isDirt = race.surface === 'ダート' || race.surface === 'D';
    const header = '<nav class="race-nav"><button id="back-to-race-list-' + esc(race.id) + '" type="button">← レース一覧</button><span>木戸表 電子版</span></nav>' +
      '<header class="racehead"' + (isDirt ? ' style="background:#70452F;color:#fff"' : '') + '><div class="head-inner"><div class="date-line">' + dateItems.map(v => '<span>' + display(v) + '</span>').join('') + '</div>' +
      '<div class="title-line"><span class="race-no">' + esc(String(race.venue).toUpperCase()) + ' ' + esc(race.raceNumber) + 'R</span><span class="race-title">' + display(race.name) + '</span></div>' +
      '<div class="race-subtitle">' + display(subtitle) + '</div><div class="race-pills"><span class="pill">' + display(race.venue) + '</span><span class="pill">' + display(surfaceText) + '</span></div></div></header>';
    const cards = data.horses.slice().sort((a, b) => a.horseNumber - b.horseNumber).map(h => horseHtml(h, race, applyColors)).join('');
    return '<div data-kido-structured-renderer="true">' + header + cards + '</div>';
  }

  global.KidoStructuredRenderer = { renderRace };
})(window);
