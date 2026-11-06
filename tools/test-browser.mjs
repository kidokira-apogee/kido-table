#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildStructuredBrowserFixture } from './structured-browser-fixture.mjs';

const fixture = buildStructuredBrowserFixture();
const server = spawn('python', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  await sleep(1200);
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1280]) {
    const baselinePage = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const baselineResponse = await baselinePage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    assert.equal(baselineResponse.status(), 200);
    await baselinePage.waitForSelector('[data-race-id="2026-11-01-tokyo-9"]');
    await baselinePage.locator('[data-race-id="2026-11-01-tokyo-9"]').click();
    await baselinePage.waitForSelector('.horse-card');
    const baselineGeometry = await baselinePage.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return { header: rect('.racehead'), card: rect('.horse-card'), profile: rect('.horse-card .profile'),
        runs: rect('.horse-card .runs-section'), data: rect('.horse-card .data-section') };
    });
    await baselinePage.close();

    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.route('**/data/races/2026-11-01-tokyo-9.json*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(fixture)
    }));
    await page.waitForSelector('[data-race-id="2026-11-01-tokyo-9"]');
    await page.locator('[data-race-id="2026-11-01-tokyo-9"]').click();
    await page.waitForSelector('.horse-card');
    assert.equal(await page.locator('.horse-card').count(), 14, width + 'px structured horse cards');
    assert.equal(await page.locator('.data-tab').count(), 56, width + 'px structured tabs');
    assert.equal(await page.locator('.run').count(), 42, width + 'px structured recent runs');
    assert.equal(await page.locator('.data-chip').count(), 70, width + 'px structured summary chips');
    assert.equal(await page.locator('.comments').count(), 14, width + 'px structured comment sections');
    assert.equal(await page.locator('.racehead').innerText().then(text => text.includes('紅葉ステークス')), true);
    const structuredGeometry = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return { header: rect('.racehead'), card: rect('.horse-card'), profile: rect('.horse-card .profile'),
        runs: rect('.horse-card .runs-section'), data: rect('.horse-card .data-section') };
    });
    for (const key of ['header', 'card', 'profile', 'runs', 'data']) {
      assert.ok(Math.abs(structuredGeometry[key].x - baselineGeometry[key].x) <= 2, width + 'px ' + key + ' left edge matches archive');
      assert.ok(Math.abs(structuredGeometry[key].width - baselineGeometry[key].width) <= 2, width + 'px ' + key + ' width matches archive');
    }
    const tab = page.locator('.horse-card').first().locator('.data-tab').nth(1);
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.horse-card').first().locator('.data-panel.active').count(), 1);
    const collapse = page.locator('.horse-card').first().locator('.section-toggle');
    await collapse.click();
    assert.equal(await collapse.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, width + 'px horizontal overflow');
    await page.screenshot({ path: '/tmp/kido-structured-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, [], width + 'px page errors');
    await page.locator('.race-nav button').click();
    assert.equal(await page.locator('#race-list-view').isVisible(), true);
    await page.close();
  }
  const kiyosatoData = JSON.parse(readFileSync(new URL('../data/races/2026-11-01-tokyo-12.json', import.meta.url), 'utf8'));
  assert.equal(kiyosatoData.horses.length, 14);
  assert.ok(kiyosatoData.horses.every(horse =>
    horse.comments?.rawCombined &&
    horse.comments?.splitStatus?.includes("explicit '前走' label") &&
    horse.comments?.current?.text &&
    horse.comments?.previousRun?.text &&
    !/[（(][^）)]*記者[）)]/.test(horse.comments.current.text) &&
    !/[（(][^）)]*記者[）)]/.test(horse.comments.previousRun.text)
  ), 'all horses retain explicitly split comments without reporter names in display text');
  assert.deepEqual(kiyosatoData.horses.filter(horse => horse.comments.current.isIchioshi).map(horse => horse.horseNumber), [8, 13]);
  assert.ok(kiyosatoData.horses.every(horse => !('isIchioshi' in horse.comments.previousRun)), 'previous-run comments must never carry ichioshi');
  const manifest = JSON.parse(readFileSync(new URL('../data/races/index.json', import.meta.url), 'utf8'));
  const kiyosatoEntry = manifest.races.find(race => race.id === '2026-11-01-tokyo-12');
  assert.ok(kiyosatoEntry, 'Kiyosato must remain registered in the archive');
  kiyosatoEntry.status = 'complete'; // Test-only override; repository status remains in_progress until sign-off.
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/races/index.json*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(manifest)
    }));
    const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-race-id="2026-11-01-tokyo-12"]');
    await page.locator('[data-race-id="2026-11-01-tokyo-12"]').click();
    await page.waitForSelector('.horse-card');
    assert.equal(await page.locator('.horse-card').count(), 14, width + 'px Kiyosato horse cards');
    assert.equal(await page.locator('.data-tab').count(), 56, width + 'px Kiyosato tabs');
    assert.equal(await page.locator('.run').count(), 42, width + 'px Kiyosato recent runs');
    assert.equal(await page.locator('.data-chip').count(), 70, width + 'px Kiyosato summary chips');
    assert.equal(await page.locator('.data-chip.late').count(), 7, width + 'px Kiyosato late-start highlight threshold');
    assert.deepEqual(await page.locator('.horse-card .data-existing .data-chip:last-child b').allTextContents(), ['36%','50%','14%','7%','28%','27%','52%','23%','22%','40%','11%','0%','11%','38%'], width + 'px Kiyosato late-start rates');
    assert.equal(await page.locator('.comments').count(), 14, width + 'px Kiyosato comments');
    assert.equal((await page.locator('.racehead').innerText()).includes('清里特別'), true);
    assert.equal(await page.locator('.data-tab').filter({ hasText: '枠順・脚質' }).count(), 14);
    assert.equal(await page.locator('.data-tab').filter({ hasText: '枠順・連対実績' }).count(), 0);
    assert.equal(await page.locator('.horse-card').first().locator('[data-data-content="detail"]').innerText().then(t => t.includes('東京')), true);
    const venueRows = await page.locator('.horse-card [data-data-content="detail"]').evaluateAll(nodes => nodes.map(node => node.textContent.includes('東京')));
    assert.deepEqual(venueRows, Array(14).fill(true), width + 'px independent Tokyo venue row for all horses');
    const courseRows = await page.locator('.horse-card [data-data-content="distanceCourse"]').evaluateAll(nodes => nodes.map(node => node.textContent.includes('東京ダ1600m')));
    assert.deepEqual(courseRows, Array(14).fill(true), width + 'px Tokyo dirt 1600 course record for all horses');
    const tab = page.locator('.horse-card').first().locator('.data-tab').nth(1);
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.horse-card').first().locator('.data-panel.active').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, width + 'px Kiyosato horizontal overflow');
    await page.screenshot({ path: '/tmp/kido-kiyosato-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, [], width + 'px Kiyosato page errors');
    await page.close();
  }
  console.log('PASS: archive fixture and actual Kiyosato structured data at 390px and 1280px; 14 horses, 4 tabs, 3 runs, 5 chips, comments, tab interaction, no horizontal overflow.');
  console.log('PASS: structured renderer via archive flow at 390px and 1280px; 14 horses, 4 tabs, 3 runs, 5 chips, comments, collapse, navigation; screenshots saved.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
