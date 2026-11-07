#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.resolve(process.env.MAIN_BASELINE_DIR || path.join(ROOT, '..', 'baseline'));
const ARTIFACTS = path.join(ROOT, 'artifacts');
const LEGACY_RACE_FILE = 'data/races/2026-11-01-tokyo-9.json';
const CANDIDATE_FILE = 'candidate-data/2026-11-01-kyoto-7_candidate_v3.json';
const LEGACY_MANIFEST = {
  races: [{
    id: '2026-11-01-tokyo-9',
    file: '2026-11-01-tokyo-9.json',
    date: '2026-11-01',
    dateLabel: '2026年11月1日（日）',
    venue: '東京',
    raceNo: 9,
    title: '紅葉ステークス',
    distance: '芝1600m（B）',
    classLabel: '3歳以上・3勝クラス',
    horseCount: 14,
    status: 'complete'
  }]
};
const CANDIDATE_MANIFEST = {
  races: [{
    id: '2026-11-01-kyoto-7',
    file: 'kyoto-7.json',
    date: '2026-11-01',
    dateLabel: '2026年11月1日（日）',
    venue: '京都',
    raceNo: 7,
    title: '1勝クラス',
    distance: 'ダ1400m',
    classLabel: '３歳以上・１勝クラス',
    horseCount: 16,
    status: 'in-progress'
  }]
};

const layoutSelectors = [
  '.racehead', '.horse-card', '.profile', '.profile-main', '.identity',
  '.number-wrap', '.frame-no', '.identity-main', '.horse-name', '.horse-facts',
  '.pedigree-inline', '.pedigree-father', '.pedigree-mother',
  '.runs-section', '.runs', '.run', '.run-head', '.run-three-rows',
  '.run-summary', '.run-subline', '.run-course', '.metrics-row',
  '.run-details', '.metric', '.run-passage', '.data-section',
  '.data-existing', '.data-tabs', '.data-tab', '.data-panel',
  '.panel-grid', '.panel-card', '.stats', '.stat-row', '.data-chip',
  '.stable-comment', '.stable-comment-head', '.stable-comment-body'
];
const requiredSelectors = [
  '.horse-card', '.profile', '.profile-main', '.pedigree-inline',
  '.runs-section', '.runs', '.run', '.data-section', '.data-tabs',
  '.data-tab', '.data-panel', '.panel-grid', '.panel-card'
];
const styleProperties = [
  'display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
  'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-size', 'font-weight', 'line-height', 'border-top-width',
  'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius', 'box-sizing', 'white-space', 'overflow', 'text-align'
];
const geometrySelectors = [
  '.horse-card', '.profile', '.profile-main', '.pedigree-inline',
  '.runs-section', '.runs', '.run', '.data-section', '.data-existing',
  '.data-tabs', '.data-tab', '.data-panel'
];

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function makeServer(root) {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) && target !== path.join(root, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(target, (err, bytes) => {
      if (err) { res.writeHead(404).end('Not found: ' + relative); return; }
      res.writeHead(200, {
        'content-type': contentType(target),
        'cache-control': 'no-store'
      });
      res.end(bytes);
    });
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function openRacePage(browser, config) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/data/races/index.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(config.manifest)
  }));
  if (config.candidateData) {
    await page.route('**/data/races/kyoto-7.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config.candidateData)
    }));
  }
  await page.goto(config.url, { waitUntil: 'networkidle' });
  await page.locator('.race-list-item').first().waitFor();
  await page.locator('.race-list-item').first().click();
  await page.locator('#race-detail-container .horse-card').first().waitFor();
  return { page, errors };
}

async function snapshot(page, label) {
  return page.evaluate(({ selectors, required, properties, geometry, label }) => {
    const card = document.querySelector('#race-detail-container .horse-card');
    if (!card) throw new Error(label + ': first horse card missing');
    const missing = required.filter(selector => !card.querySelector(selector));
    const style = {};
    const rects = {};
    const cardRect = card.getBoundingClientRect();

    for (const selector of selectors) {
      const node = selector === '.racehead'
        ? document.querySelector('#race-detail-container .racehead')
        : card.querySelector(selector);
      if (!node) {
        style[selector] = null;
        continue;
      }
      const computed = getComputedStyle(node);
      style[selector] = {};
      for (const property of properties) {
        style[selector][property] = computed.getPropertyValue(property);
      }
    }
    for (const selector of geometry) {
      const node = card.querySelector(selector);
      if (!node) {
        rects[selector] = null;
        continue;
      }
      const rect = node.getBoundingClientRect();
      rects[selector] = {
        width: Number(rect.width.toFixed(2)),
        leftWithinCard: Number((rect.left - cardRect.left).toFixed(2))
      };
    }
    const tabs = [...card.querySelectorAll('.data-tab')];
    const panels = [...card.querySelectorAll('.data-panel')];
    return {
      label,
      missing,
      horseCards: document.querySelectorAll('#race-detail-container .horse-card').length,
      runs: card.querySelectorAll('.runs > .run').length,
      tabs: tabs.length,
      panels: panels.length,
      style,
      rects,
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      cardWidth: Number(cardRect.width.toFixed(2)),
      cardLeft: Number(cardRect.left.toFixed(2)),
      cardRight: Number(cardRect.right.toFixed(2))
    };
  }, { selectors: layoutSelectors, required: requiredSelectors, properties: styleProperties, geometry: geometrySelectors, label });
}

function compareSnapshots(base, candidate, viewportLabel) {
  const errors = [];
  for (const selector of requiredSelectors) {
    if (base.missing.includes(selector) || candidate.missing.includes(selector)) {
      errors.push(viewportLabel + ' required structure missing: ' + selector);
    }
  }
  for (const selector of layoutSelectors) {
    const a = base.style[selector];
    const b = candidate.style[selector];
    if (!a || !b) {
      if (Boolean(a) !== Boolean(b)) errors.push(viewportLabel + ' selector presence differs: ' + selector);
      continue;
    }
    for (const property of styleProperties) {
      if (a[property] !== b[property]) {
        errors.push(viewportLabel + ' computed style differs: ' + selector + ' ' + property +
          ' baseline=' + JSON.stringify(a[property]) + ' structured=' + JSON.stringify(b[property]));
      }
    }
  }
  for (const selector of geometrySelectors) {
    const a = base.rects[selector];
    const b = candidate.rects[selector];
    if (!a || !b) {
      if (Boolean(a) !== Boolean(b)) errors.push(viewportLabel + ' geometry selector presence differs: ' + selector);
      continue;
    }
    if (Math.abs(a.width - b.width) > 1) {
      errors.push(viewportLabel + ' width differs: ' + selector + ' baseline=' + a.width + ' structured=' + b.width);
    }
    if (Math.abs(a.leftWithinCard - b.leftWithinCard) > 1) {
      errors.push(viewportLabel + ' horizontal position differs: ' + selector +
        ' baseline=' + a.leftWithinCard + ' structured=' + b.leftWithinCard);
    }
  }
  if (base.runs !== 3 || candidate.runs !== 3) errors.push(viewportLabel + ' recent-run count must be 3 in both views');
  if (base.tabs !== 4 || candidate.tabs !== 4 || base.panels !== 4 || candidate.panels !== 4) {
    errors.push(viewportLabel + ' DATA tab/panel count must be 4 in both views');
  }
  if (base.documentWidth > base.viewport + 1 || candidate.documentWidth > candidate.viewport + 1) {
    errors.push(viewportLabel + ' horizontal overflow detected');
  }
  if (Math.abs(base.cardWidth - candidate.cardWidth) > 1) {
    errors.push(viewportLabel + ' horse-card width differs: ' + base.cardWidth + ' vs ' + candidate.cardWidth);
  }
  if (Math.abs(base.cardLeft - candidate.cardLeft) > 1 || Math.abs(base.cardRight - candidate.cardRight) > 1) {
    errors.push(viewportLabel + ' horse-card horizontal bounds differ');
  }
  return errors;
}

async function verifyTabs(page, label) {
  return page.evaluate(label => {
    const card = document.querySelector('#race-detail-container .horse-card');
    const tabs = [...card.querySelectorAll('.data-tab')];
    const panels = [...card.querySelectorAll('.data-panel')];
    const errors = [];
    for (const tab of tabs) {
      tab.click();
      const active = panels.filter(panel => panel.classList.contains('active'));
      if (active.length !== 1 || active[0].dataset.dataContent !== tab.dataset.panel) {
        errors.push(label + ': tab failed: ' + tab.textContent.trim());
      }
    }
    tabs[0]?.click();
    return { clicks: tabs.length, errors };
  }, label);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  assert.ok(fs.existsSync(path.join(BASELINE, 'index.html')), 'main baseline checkout is missing: ' + BASELINE);
  const legacyData = JSON.parse(fs.readFileSync(path.join(BASELINE, LEGACY_RACE_FILE), 'utf8'));
  const candidateData = JSON.parse(fs.readFileSync(path.join(ROOT, CANDIDATE_FILE), 'utf8'));
  assert.equal(candidateData.status.complete, false, 'candidate data must remain incomplete');
  assert.equal(legacyData.race.id, '2026-11-01-tokyo-9', 'baseline race identity changed');

  const baselineServer = makeServer(BASELINE);
  const candidateServer = makeServer(ROOT);
  await listen(baselineServer, 4174);
  await listen(candidateServer, 4175);
  const browser = await chromium.launch({ headless: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseline: { ref: 'main', race: '2026-11-01-tokyo-9', horses: legacyData.race.fieldSize },
    candidate: { ref: 'feature/structured-renderer-integration-v2', race: candidateData.race.id, horses: candidateData.horses.length },
    browser: 'Chromium headless',
    viewports: [],
    errors: []
  };
  let baselinePage;
  let candidatePage;
  try {
    const openedBaseline = await openRacePage(browser, {
      url: 'http://127.0.0.1:4174/index.html',
      manifest: LEGACY_MANIFEST
    });
    const openedCandidate = await openRacePage(browser, {
      url: 'http://127.0.0.1:4175/index.html',
      manifest: CANDIDATE_MANIFEST,
      candidateData
    });
    baselinePage = openedBaseline.page;
    candidatePage = openedCandidate.page;
    assert.deepEqual(openedBaseline.errors, [], 'main baseline page errors');
    assert.deepEqual(openedCandidate.errors, [], 'structured candidate page errors');

    const expectedCounts = {
      baseline: legacyData.race.fieldSize,
      candidate: candidateData.horses.length
    };
    assert.equal(await baselinePage.locator('#race-detail-container .horse-card').count(), expectedCounts.baseline);
    assert.equal(await candidatePage.locator('#race-detail-container .horse-card').count(), expectedCounts.candidate);

    for (const viewport of [
      { name: 'desktop-1440', width: 1440, height: 1000 },
      { name: 'mobile-390', width: 390, height: 844 }
    ]) {
      await baselinePage.setViewportSize({ width: viewport.width, height: viewport.height });
      await candidatePage.setViewportSize({ width: viewport.width, height: viewport.height });
      await baselinePage.waitForTimeout(100);
      await candidatePage.waitForTimeout(100);

      const baseSnapshot = await snapshot(baselinePage, 'main');
      const candidateSnapshot = await snapshot(candidatePage, 'structured');
      const differences = compareSnapshots(baseSnapshot, candidateSnapshot, viewport.name);
      assert.deepEqual(differences, [], viewport.name + ' main/structured visual structure comparison');

      const baselineTabs = await verifyTabs(baselinePage, 'main');
      const candidateTabs = await verifyTabs(candidatePage, 'structured');
      assert.deepEqual(baselineTabs.errors, [], viewport.name + ' main DATA tabs');
      assert.deepEqual(candidateTabs.errors, [], viewport.name + ' structured DATA tabs');

      await baselinePage.screenshot({
        path: path.join(ARTIFACTS, 'main-' + viewport.name + '.png'),
        fullPage: true
      });
      await candidatePage.screenshot({
        path: path.join(ARTIFACTS, 'structured-' + viewport.name + '.png'),
        fullPage: true
      });
      report.viewports.push({
        name: viewport.name,
        comparison: 'PASS',
        baseline: baseSnapshot,
        structured: candidateSnapshot,
        tabClicks: { baseline: baselineTabs.clicks, structured: candidateTabs.clicks }
      });
    }

    await baselinePage.locator('#race-detail-container .race-nav button').click();
    await candidatePage.locator('#race-detail-container .race-nav button').click();
    assert.equal(await baselinePage.locator('#race-detail-container').isHidden(), true, 'main back navigation failed');
    assert.equal(await candidatePage.locator('#race-detail-container').isHidden(), true, 'structured back navigation failed');

    report.result = 'PASS';
    fs.writeFileSync(path.join(ARTIFACTS, 'main-structured-comparison.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      result: report.result,
      baseline: report.baseline,
      candidate: report.candidate,
      viewports: report.viewports.map(v => ({
        name: v.name,
        comparison: v.comparison,
        baselineCardWidth: v.baseline.cardWidth,
        structuredCardWidth: v.structured.cardWidth,
        baselineDocumentWidth: v.baseline.documentWidth,
        structuredDocumentWidth: v.structured.documentWidth,
        tabClicks: v.tabClicks
      }))
    }, null, 2));
  } catch (error) {
    report.result = 'FAIL';
    report.errors.push(error.stack || String(error));
    fs.writeFileSync(path.join(ARTIFACTS, 'main-structured-comparison.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally {
    if (baselinePage) await baselinePage.close();
    if (candidatePage) await candidatePage.close();
    await browser.close();
    await new Promise(resolve => baselineServer.close(resolve));
    await new Promise(resolve => candidateServer.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
