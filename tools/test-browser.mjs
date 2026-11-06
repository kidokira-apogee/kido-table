#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server=spawn('python',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let browser;
try {
 await sleep(1200); browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1}); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'}); assert.equal(response.status(),200);
  await page.waitForSelector('[data-race-id="2026-11-01-tokyo-9"]');
  await page.locator('[data-race-id="2026-11-01-tokyo-9"]').click(); await page.waitForSelector('.horse-card');
  assert.equal(await page.locator('.horse-card').count(),14,width+'px cards');
  assert.equal(await page.locator('.data-tab').count(),56,width+'px tabs');
  assert.equal(await page.locator('.run').count(),42,width+'px recent runs');
  const tab=page.locator('.horse-card').first().locator('.data-tab').nth(1); await tab.click(); assert.equal(await tab.getAttribute('aria-selected'),'true');
  const toggle=page.locator('.horse-card').first().locator('.section-toggle'); await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'),'false'); await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,width+'px horizontal overflow');
  await page.screenshot({path:'/tmp/kido-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[],width+'px page errors'); await page.locator('#back-to-race-list').click(); assert.equal(await page.locator('#race-list-view').isVisible(),true); await page.close();
 }
 console.log('PASS: archive/detail/tabs/collapse/back at 390px and 1280px; screenshots saved.');
} finally {if(browser)await browser.close();server.kill('SIGTERM');}
