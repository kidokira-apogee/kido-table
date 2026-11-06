#!/usr/bin/env node
/** Browser-free render contract tests. Usage: node tools/test-renderer.mjs <race.json> */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const racePath = process.argv[2];
if (!racePath) {
  console.error('Usage: node tools/test-renderer.mjs <race.json>');
  process.exit(2);
}
const source = fs.readFileSync(path.join(here, '../js/race-renderer.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'js/race-renderer.js' });
const renderRace = context.window.KidoRaceRenderer?.renderRace;
assert.equal(typeof renderRace, 'function', 'renderer should export renderRace');

const raceData = JSON.parse(fs.readFileSync(racePath, 'utf8'));
const count = (html, re) => [...html.matchAll(re)].length;
const html = renderRace(raceData);
const horseCount = raceData.horses.length;
assert.equal(count(html, /<article class="horse-card"/g), horseCount, 'one horse card per horse');
assert.equal(count(html, /class="data-tab"/g), horseCount * 4, 'exactly four tabs per horse');
assert.equal(count(html, /<article class="run"/g), horseCount * 3, 'exactly three recent-run blocks per horse');
assert.equal(count(html, /class="data-chip/g), horseCount * 5, 'exactly five summary chips per horse');
assert.equal(count(html, /class="pedigree-father"/g), horseCount, 'one sire field per horse');
assert.equal(count(html, /class="pedigree-mother"/g), horseCount, 'one dam/damsire field per horse');
assert.equal(count(html, /class="pedigree-line/g), 0, 'family-line cells are retained in data, not added to the visible pedigree row');

const expectedTabs = ['詳細成績', '距離・コース', '条件別', '枠順・連対実績'];
for (const title of expectedTabs) assert.ok(html.includes('>' + title + '</button>'), 'tab title: ' + title);
assert.ok(html.includes('今回馬場の条件成績'));
assert.ok(html.includes('ローテーション・季節'));
assert.ok(html.includes('枠順別実績'));
assert.ok(html.includes('連対実績'));

const firstHorse = raceData.horses[0];
const frameAttr = 'data-frame-number="' + String(firstHorse.frameNumber ?? '') + '"';
assert.ok(html.includes(frameAttr), 'structured card exposes source frame number, including explicit missing value');
assert.ok(html.includes('class="affiliation '), 'jockey/trainer affiliation is represented near the profile');
assert.ok(!html.includes('affiliation-chip'), 'jockey/trainer must not be appended to the pedigree row');

const styleProbe = structuredClone(raceData);
styleProbe.horses[0].pedigree.sourceStyles.sire = { backgroundColor: '#123456', textColor: 'navy' };
styleProbe.horses[0].pedigree.sourceStyles.dam = { backgroundColor: 'gold', textColor: 'rebeccapurple' };
styleProbe.horses[0].pedigree.sourceStyles.damsire = { backgroundColor: 'cyan', textColor: 'brown' };
let probeHtml = renderRace(styleProbe);
assert.ok(probeHtml.includes('style="background-color:#123456;color:navy"'));
assert.ok(probeHtml.includes('style="background-color:gold"'));
assert.ok(probeHtml.includes('style="color:rebeccapurple"'));
assert.ok(probeHtml.includes('style="background-color:cyan;color:brown"'));

styleProbe.horses[0].pedigree.sourceStyles.sire.backgroundColor = 'red;position:fixed';
probeHtml = renderRace(styleProbe);
assert.ok(!probeHtml.includes('position:fixed'), 'invalid CSS injection must not enter markup');

const xssProbe = structuredClone(raceData);
xssProbe.race.name = '<img src=x onerror=alert(1)>';
xssProbe.horses[0].horseName = '<svg onload=alert(2)>';
xssProbe.horses[0].comments.current.text = '<script>alert(3)</script>';
const escapedHtml = renderRace(xssProbe);
assert.ok(escapedHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(escapedHtml.includes('&lt;svg onload=alert(2)&gt;'));
assert.ok(escapedHtml.includes('&lt;script&gt;alert(3)&lt;/script&gt;'));
assert.ok(!escapedHtml.includes('<script>alert(3)</script>'));

const courseProbe = structuredClone(raceData);
courseProbe.horses[0].recentRuns[0].courseRaw = '札･D17';
const courseHtml = renderRace(courseProbe);
assert.ok(courseHtml.includes('data-venue="札幌" data-surface="D" data-distance="1700"'), 'TARGET course abbreviation maps only from explicit source token');
assert.ok(courseHtml.includes('札・D1700'));

const dirt = structuredClone(raceData);
dirt.race.surface = 'ダート';
const dirtHtml = renderRace(dirt);
assert.ok(dirtHtml.includes('class="racehead racehead-dirt"'));
const turf = structuredClone(raceData);
turf.race.surface = '芝';
const turfHtml = renderRace(turf);
assert.ok(turfHtml.includes('class="racehead "'));
assert.equal(count(turfHtml, /class="data-tab"/g), count(dirtHtml, /class="data-tab"/g));
assert.equal(count(turfHtml, /class="panel-card"/g), count(dirtHtml, /class="panel-card"/g));

for (const n of [6, 8, 9, 16, 17, 18]) {
  const variant = structuredClone(raceData);
  variant.horses = variant.horses.slice(0, n).map((h, i) => ({ ...h, horseNumber: i + 1 }));
  variant.race.fieldSize = n;
  const variantHtml = renderRace(variant);
  assert.equal(count(variantHtml, /<article class="horse-card"/g), n, n + ' horse cards');
  assert.equal(count(variantHtml, /class="data-tab"/g), n * 4, n + ' × 4 tabs');
  assert.equal(count(variantHtml, /<article class="run"/g), n * 3, n + ' × 3 runs');
}
console.log('PASS: ' + raceData.race.id + ' / ' + horseCount + ' horses / 4 fixed tabs / 3 recent runs / 5 chips / source-style + XSS + course + surface + 6–18 headcount');
