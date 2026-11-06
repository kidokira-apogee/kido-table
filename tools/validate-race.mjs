#!/usr/bin/env node
/** Structural, provenance, and source-color checks for Kido Table race JSON. */
import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/validate-race.mjs <race.json>'); process.exit(2); }
const errors = [];
const fail = (m) => errors.push(m);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const required = (obj, keys, path) => { for (const k of keys) if (!(k in obj)) fail(path + '.' + k + ': missing'); };
const cssColor = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\(\s*[0-9.%\s,\/]+\)|hsla?\(\s*[0-9.%\s,\/]+\))$/i.test(v.trim());
const colorKeys = ['sireBackground','damText','damsireBackground','sireLineBackground','damsireLineBackground'];
let data;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('JSON parse failed: ' + e.message); process.exit(1); }

if (!isObject(data)) fail('$: root must be an object');
else {
  required(data, ['schemaVersion','race','sourceAudit','horses'], '$');
  if (data.schemaVersion !== '1.0.0') fail('schemaVersion must be 1.0.0');
  if (!isObject(data.race)) fail('race must be an object');
  else {
    required(data.race, ['id','date','venue','raceNumber','name','surface','distanceM','direction','fieldSize','metadataSource'], 'race');
    if (data.race.metadataSource !== '① TARGET') fail('race.metadataSource must be ① TARGET');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.race.date ?? ''))) fail('race.date must be YYYY-MM-DD');
    else if (Number.isNaN(Date.parse(String(data.race.date) + 'T00:00:00Z'))) fail('race.date is not a calendar date');
    if (!['芝','ダート'].includes(data.race.surface)) fail('race.surface must be 芝 or ダート');
    if (!Number.isInteger(data.race.fieldSize) || data.race.fieldSize < 6 || data.race.fieldSize > 18) fail('race.fieldSize must be 6–18');
    if (!Number.isInteger(data.race.distanceM) || data.race.distanceM < 1000) fail('race.distanceM must be an integer >= 1000');
  }
  if (!Array.isArray(data.horses)) fail('horses must be an array');
  else {
    if (data.horses.length < 6 || data.horses.length > 18) fail('horses count must be 6–18');
    const nums = data.horses.map(h => h?.horseNumber);
    if (new Set(nums).size !== nums.length) fail('horseNumber contains duplicates');
    for (const [i,h] of data.horses.entries()) {
      const p = 'horses[' + i + ']';
      if (!isObject(h)) { fail(p + ' must be an object'); continue; }
      required(h, ['horseNumber','frameNumber','horseName','profile','pedigree','recentRuns','topSummary','dataTabs','comments'], p);
      if (!Number.isInteger(h.horseNumber) || h.horseNumber < 1 || h.horseNumber > 18) fail(p + '.horseNumber invalid');
      if (typeof h.horseName !== 'string' || !h.horseName.trim()) fail(p + '.horseName empty');
      if (!isObject(h.pedigree)) fail(p + '.pedigree must be an object');
      else {
        required(h.pedigree, ['sire','dam','damsire','sireLine','damsireLine','colors'], p + '.pedigree');
        if (!isObject(h.pedigree.colors)) fail(p + '.pedigree.colors must be an object');
        else {
          required(h.pedigree.colors, colorKeys, p + '.pedigree.colors');
          for (const [key,value] of Object.entries(h.pedigree.colors)) {
            if (value !== null && !cssColor(value)) fail(p + '.pedigree.colors.' + key + ' must be a valid source CSS color or null');
          }
        }
      }
      if (!Array.isArray(h.recentRuns) || h.recentRuns.length !== 3) fail(p + '.recentRuns must contain exactly 3 runs');
      else h.recentRuns.forEach((run,j) => { if (!isObject(run)) fail(p + '.recentRuns[' + j + '] must be an object'); });
      if (!isObject(h.dataTabs)) fail(p + '.dataTabs must be an object');
      else required(h.dataTabs, ['detail','distanceCourse','conditions','frameAndTop2'], p + '.dataTabs');
      if (!isObject(h.comments)) fail(p + '.comments must be an object');
      else {
        required(h.comments, ['current','previousRun'], p + '.comments');
        if (isObject(h.comments.previousRun) && 'isIchioshi' in h.comments.previousRun) fail(p + '.comments.previousRun must not contain isIchioshi');
      }
    }
    if (isObject(data.race) && data.horses.length !== data.race.fieldSize) fail('horse count (' + data.horses.length + ') does not match race.fieldSize (' + data.race.fieldSize + ')');
    const sorted = [...nums].sort((a,b) => a-b);
    if (nums.some((n,i) => n !== sorted[i])) fail('horses must be ordered by horseNumber ascending');
  }
}
if (errors.length) {
  console.error('FAIL: ' + errors.length + ' validation error(s)');
  errors.forEach(e => console.error('- ' + e));
  process.exit(1);
}
console.log('PASS: ' + data.race.id + ' / ' + data.horses.length + ' horses / pedigree source colors / 3 recent runs each / 4 tabs');
