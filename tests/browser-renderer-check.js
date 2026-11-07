#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
const RACES = [
  {
    key: 'kyoto-7',
    file: 'candidate-data/2026-11-01-kyoto-7_candidate_v3.json',
    manifest: { id: '2026-11-01-kyoto-7', date: '2026-11-01', venue: '京都', raceNo: 7, file: 'kyoto-7.json', title: '1勝クラス', classLabel: '３歳以上・１勝クラス', horseCount: 16, distance: 'ダ1400m', status: 'in-progress' }
  },
  {
    key: 'kyoto-12',
    file: 'candidate-data/2026-10-31-kyoto-12_candidate_v3.json',
    manifest: { id: '2026-10-31-kyoto-12', date: '2026-10-31', venue: '京都', raceNo: 12, file: 'kyoto-12.json', title: '1勝クラス', classLabel: '３歳以上・１勝クラス', horseCount: 18, distance: '芝1600m', status: 'in-progress' }
  }
];

const loaded = new Map();
for (const race of RACES) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, race.file), 'utf8'));
  if (data.status?.complete !== false) {
    throw new Error(race.key + ': sample candidate must remain status.complete=false');
  }
  if (race.manifest.status !== 'in-progress') {
    throw new Error(race.key + ': sample manifest entry must remain in-progress');
  }
  if (data.render?.preserveSourceColors !== true) {
    throw new Error(race.key + ': candidate render.preserveSourceColors must be true after browser color verification');
  }
  loaded.set(race.key, data);
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) && target !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(target, (err, bytes) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': contentType(target), 'cache-control': 'no-store' });
    res.end(bytes);
  });
});

async function verifyColors(page, data, label) {
  return page.evaluate(({ raceData, label }) => {
    const mismatches = [];
    let checked = 0;
    const validColor = value => typeof value === 'string' &&
      /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\([0-9.%\s,\/]+\)|hsla?\([0-9.%\s,\/]+\))$/i.test(value.trim());
    const isGray = value => {
      const v = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (['silver','gray','grey','#c0c0c0','#808080','#a9a9a9','#d3d3d3','#e8e8e8','#bfbfbf','#d9d9d9','#f0f0f0'].includes(v)) return true;
      const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      let rgb = null;
      if (m) {
        const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
        rgb = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
      } else {
        const c = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (c) rgb = [Number(c[1]), Number(c[2]), Number(c[3])];
      }
      if (!rgb) return false;
      const [r,g,b] = rgb;
      return Math.max(r,g,b)-Math.min(r,g,b) <= 8 && r >= 110 && r <= 245;
    };
    const computed = (property, value) => {
      if (!validColor(value)) return null;
      const probe = document.createElement('span');
      probe.style.setProperty(property, value.trim());
      if (!probe.style.getPropertyValue(property)) return null;
      document.body.appendChild(probe);
      const result = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return result;
    };
    const compare = (el, cell, where, options = {}) => {
      if (!cell || !el) return;
      for (const [sourceKey, property] of [['textColor','color'], ['backgroundColor','background-color']]) {
        if (options[sourceKey] === false) continue;
        const source = cell[sourceKey];
        if (!source || (property === 'background-color' && isGray(source))) continue;
        const expected = computed(property, source);
        if (!expected) continue;
        checked++;
        const actual = getComputedStyle(el).getPropertyValue(property);
        if (actual !== expected) mismatches.push({ where, property, source, expected, actual });
      }
    };
    const horses = raceData.horses.slice().sort((a,b) => a.horseNumber-b.horseNumber);
    const cards = [...document.querySelectorAll('#race-detail-container .horse-card')];
    if (cards.length !== horses.length) mismatches.push({ where: label, issue: 'horse-card count', expected: horses.length, actual: cards.length });

    const metricKeys = ['fieldSize','horseNumber','popularity','finish','margin','index','last3F','last3FRank','interval','blinkers'];
    const sublineKeys = ['ageClass','class','jockey','weight','bodyWeight','going'];

    horses.forEach((horse, hi) => {
      const card = cards[hi];
      if (!card) return;
      const name = '馬' + horse.horseNumber + ' ' + horse.horseName;
      const profile = horse.sourceStyles?.profile || {};
      compare(card.querySelector('.horse-name'), profile.horseName, name + '/horseName');
      compare(card.querySelector('.horse-facts > .basic:nth-child(1) b'), profile.sexAge, name + '/sexAge');
      compare(card.querySelector('.horse-facts > .basic:nth-child(2) b'), profile.handicapWeight, name + '/handicapWeight');
      compare(card.querySelector('.horse-facts > .basic:nth-child(3) b'), profile.jockeyRaw, name + '/jockeyRaw');
      compare(card.querySelector('.horse-facts > .basic:nth-child(4) b'), profile.trainer, name + '/trainer');

      const pedigree = horse.pedigree?.sourceStyles || {};
      compare(card.querySelector('.pedigree-father'), pedigree.sire, name + '/sire');
      compare(card.querySelector('.pedigree-mother'), pedigree.damsire, name + '/damsire');
      compare(card.querySelector('.dam-name'), pedigree.dam, name + '/dam', { backgroundColor: false });

      const runs = (horse.recentRuns || []).slice(0,3);
      const runStyles = horse.sourceStyles?.recentRuns || [];
      const runCards = [...card.querySelectorAll('.runs > .run')];
      if (runCards.length !== runs.length) mismatches.push({ where: name + '/recentRuns', issue: 'run count', expected: runs.length, actual: runCards.length });

      runs.forEach((run, ri) => {
        const runCard = runCards[ri];
        if (!runCard) return;
        const styles = runStyles[ri] || {};
        const runLabel = name + '/' + (run.label || ('run' + (ri+1)));
        compare(runCard.querySelector('.run-date'), styles.dateRaw, runLabel + '/dateRaw');
        compare(runCard.querySelector('.run-course'), styles.courseRaw, runLabel + '/courseRaw');
        compare(runCard.querySelector('.run-summary > strong'), styles.raceName, runLabel + '/raceName');

        const metricNodes = [...runCard.querySelectorAll('.run-details > .metric')];
        metricKeys.forEach((key, mi) => {
          const options = key === 'index' ? { backgroundColor: false } : {};
          compare(metricNodes[mi], styles[key], runLabel + '/' + key, options);
        });

        const sublineContainer = runCard.querySelector('.run-subline > span:nth-child(2)');
        const sublineNodes = sublineContainer ? [...sublineContainer.children] : [];
        let sublineIndex = 0;
        for (const key of sublineKeys) {
          const value = run[key];
          if (value === null || value === undefined || value === '' || !value) continue;
          const node = sublineNodes[sublineIndex++];
          compare(node, styles[key], runLabel + '/' + key);
          if (key === 'bodyWeight' && run.bodyWeightChange) {
            compare(node?.querySelector('span'), styles.bodyWeightChange, runLabel + '/bodyWeightChange');
          }
        }
        compare(runCard.querySelector('.run-passage > span:first-child b'), styles.runningStyleRaw, runLabel + '/runningStyleRaw');
        const passingStyle = (styles.passingOrder || []).find(v => v && (v.textColor || v.backgroundColor));
        compare(runCard.querySelector('.run-passage > span:nth-child(2) b'), passingStyle, runLabel + '/passingOrder');
      });
    });
    return { checked, mismatches };
  }, { raceData: data, label });
}

async function verifyMissingValueDisplay(page, data) {
  return page.evaluate(raceData => {
    const errors = [];
    const cards = [...document.querySelectorAll('#race-detail-container .horse-card')];
    const metricKeys = ['fieldSize','horseNumber','popularity','finish','margin','index','last3F','last3FRank','interval','blinkers'];
    raceData.horses.slice().sort((a,b)=>a.horseNumber-b.horseNumber).forEach((horse, hi) => {
      const card = cards[hi];
      if (!card) return;
      const runs = (horse.recentRuns || []).slice(0,3);
      const runCards = [...card.querySelectorAll('.runs > .run')];
      runs.forEach((run, ri) => {
        const runCard = runCards[ri];
        if (!runCard) return;
        const metrics = [...runCard.querySelectorAll('.run-details > .metric')];
        metricKeys.forEach((key, mi) => {
          const value = run[key];
          if (value === null || value === undefined || value === '') {
            const actual = metrics[mi]?.querySelector('b')?.textContent.trim();
            if (actual !== '—') errors.push('horse ' + horse.horseNumber + ' run ' + (ri+1) + ' ' + key + ': expected em dash, got ' + JSON.stringify(actual));
          }
        });
        const checks = [
          ['dateRaw', run.dateRaw, runCard.querySelector('.run-date')],
          ['raceName', run.raceName, runCard.querySelector('.run-summary > strong')],
          ['courseRaw', run.courseRaw, runCard.querySelector('.run-course')]
        ];
        for (const [key, value, node] of checks) {
          if ((value === null || value === undefined || value === '') && node?.textContent.trim() !== '—') {
            errors.push('horse ' + horse.horseNumber + ' run ' + (ri+1) + ' ' + key + ': missing value was not rendered as em dash');
          }
        }
        if (!run.runningStyleRaw && runCard.querySelector('.run-passage > span:first-child b')?.textContent.trim() !== '—') {
          errors.push('horse ' + horse.horseNumber + ' run ' + (ri+1) + ' runningStyleRaw: missing value was not rendered as em dash');
        }
        const passing = (run.passingOrder || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (!passing.length && runCard.querySelector('.run-passage > span:nth-child(2) b')?.textContent.trim() !== '—') {
          errors.push('horse ' + horse.horseNumber + ' run ' + (ri+1) + ' passingOrder: missing value was not rendered as em dash');
        }
      });
    });
    const badTokens = cards.flatMap(card => [...card.querySelectorAll('*')])
      .filter(node => node.children.length === 0 && /\b(undefined|null)\b/i.test(node.textContent || ''))
      .map(node => node.textContent.trim());
    if (badTokens.length) errors.push('visible undefined/null tokens: ' + JSON.stringify(badTokens.slice(0,10)));
    return errors;
  }, data);
}

async function verifyMobileRunLayout(page, expectedCards) {
  return page.evaluate(expectedCards => {
    const errors = [];
    const cards = [...document.querySelectorAll('#race-detail-container .horse-card')];
    if (cards.length !== expectedCards) errors.push('horse card count ' + cards.length + '/' + expectedCards);

    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      const runs = [...card.querySelectorAll('.runs > .run')];
      for (const [runIndex, run] of runs.entries()) {
        const details = run.querySelector('.run-details');
        const metrics = [...(details?.querySelectorAll(':scope > .metric') || [])];
        if (metrics.length !== 10) {
          errors.push(card.id + ' run ' + (runIndex + 1) + ': expected 10 metrics, got ' + metrics.length);
          continue;
        }
        const rects = metrics.map(node => node.getBoundingClientRect());
        const tops = rects.map(rect => rect.top);
        if (Math.max(...tops) - Math.min(...tops) > 1) {
          errors.push(card.id + ' run ' + (runIndex + 1) + ': 10 metrics are not on one row');
        }
        if (rects.some(rect => rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1)) {
          errors.push(card.id + ' run ' + (runIndex + 1) + ': a metric extends outside the horse card');
        }
        const gridColumns = getComputedStyle(details).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
        if (gridColumns.length !== 10) {
          errors.push(card.id + ' run ' + (runIndex + 1) + ': expected 10 grid columns, got ' + gridColumns.length);
        }

        const condition = run.querySelector('.run-subline span:not(.run-course)');
        if (condition) {
          const range = document.createRange();
          range.selectNodeContents(condition);
          const textRect = range.getBoundingClientRect();
          if (textRect.width > 0 && (textRect.left < cardRect.left - 1 || textRect.right > cardRect.right + 1)) {
            errors.push(card.id + ' run ' + (runIndex + 1) + ': course-condition line is clipped by the horse card');
          }
        }
      }
    }
    return errors;
  }, expectedCards);
}

async function verifyTabs(page, expectedCards) {
  return page.evaluate(expectedCards => {
    const cards = [...document.querySelectorAll('#race-detail-container .horse-card')];
    let tested = 0;
    const errors = [];
    if (cards.length !== expectedCards) errors.push('horse cards ' + cards.length + '/' + expectedCards);
    for (const card of cards) {
      const tabs = [...card.querySelectorAll('.data-tab')];
      const panels = [...card.querySelectorAll('.data-panel')];
      if (tabs.length !== 4 || panels.length !== 4) errors.push(card.id + ': tabs=' + tabs.length + ', panels=' + panels.length);
      for (const tab of tabs) {
        tab.click();
        tested++;
        const active = panels.filter(panel => panel.classList.contains('active'));
        if (active.length !== 1 || active[0]?.dataset.dataContent !== tab.dataset.panel) {
          errors.push(card.id + ': tab ' + tab.textContent.trim() + ' did not activate its panel');
        }
      }
      tabs[0]?.click();
    }
    return { tested, errors };
  }, expectedCards);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), browser: 'Chromium headless', races: [], errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.route('**/data/races/index.json', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ races: RACES.map(r => r.manifest) })
    }));
    await page.route('**/data/races/kyoto-7.json', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(loaded.get('kyoto-7'))
    }));
    await page.route('**/data/races/kyoto-12.json', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(loaded.get('kyoto-12'))
    }));

    await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
    await page.locator('.race-list-item').first().waitFor();
    for (let ri = 0; ri < RACES.length; ri++) {
      const race = RACES[ri];
      if (ri === 1) {
        await page.locator('#archive-date-tabs button').filter({ hasText: '10/31' }).click();
      }
      await page.locator('.race-list-item').first().click();
      await page.locator('#race-detail-container .horse-card').first().waitFor();
      const data = loaded.get(race.key);
      const count = data.horses.length;
      // Reset viewport for each race before the desktop pass.
      await page.setViewportSize({ width: 1440, height: 1000 });
      const actualCards = await page.locator('#race-detail-container .horse-card').count();
      assert.equal(actualCards, count, race.key + ': rendered horse count');

      const tabResult = await verifyTabs(page, count);
      assert.deepEqual(tabResult.errors, [], race.key + ': DATA tab interaction');
      const missingValueErrors = await verifyMissingValueDisplay(page, data);
      assert.deepEqual(missingValueErrors, [], race.key + ': missing-value display');
      const colorResult = await verifyColors(page, data, race.key);
      assert.deepEqual(colorResult.mismatches, [], race.key + ': TARGET source colors');

      const desktopMetrics = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardWidth: document.querySelector('.horse-card')?.getBoundingClientRect().width
      }));
      assert.ok(desktopMetrics.documentWidth <= desktopMetrics.viewport + 1,
        race.key + ': desktop horizontal overflow ' + JSON.stringify(desktopMetrics));
      await page.screenshot({ path: path.join(ARTIFACTS, race.key + '-desktop.png'), fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      const mobileMetrics = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardWidth: document.querySelector('.horse-card')?.getBoundingClientRect().width,
        cardLeft: document.querySelector('.horse-card')?.getBoundingClientRect().left,
        cardRight: document.querySelector('.horse-card')?.getBoundingClientRect().right
      }));
      assert.ok(mobileMetrics.documentWidth <= mobileMetrics.viewport + 1,
        race.key + ': mobile horizontal overflow ' + JSON.stringify(mobileMetrics));
      assert.ok(mobileMetrics.cardLeft >= -1 && mobileMetrics.cardRight <= mobileMetrics.viewport + 1,
        race.key + ': mobile horse card outside viewport ' + JSON.stringify(mobileMetrics));
      const mobileRunLayoutErrors = await verifyMobileRunLayout(page, count);
      assert.deepEqual(mobileRunLayoutErrors, [], race.key + ': mobile 10-metric single-row layout');
      await page.screenshot({ path: path.join(ARTIFACTS, race.key + '-mobile.png'), fullPage: true });

      report.races.push({
        id: data.race.id, horses: count,
        recentRuns: data.horses.reduce((n,h)=>n+Math.min(3,(h.recentRuns||[]).length),0),
        tabClicks: tabResult.tested, missingValueChecks: 'passed', colorPropertiesChecked: colorResult.checked,
        desktop: desktopMetrics, mobile: mobileMetrics
      });
      await page.locator('#race-detail-container .race-nav button').click();
    }
    assert.deepEqual(pageErrors, [], 'browser page errors');
    report.pageErrors = pageErrors;
    fs.writeFileSync(path.join(ARTIFACTS, 'browser-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.errors.push(error.stack || String(error));
    fs.writeFileSync(path.join(ARTIFACTS, 'browser-verification.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
