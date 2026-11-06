#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
  console.log('PASS: structured renderer via archive flow at 390px and 1280px; 14 horses, 4 tabs, 3 runs, 5 chips, comments, collapse, navigation; screenshots saved.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
