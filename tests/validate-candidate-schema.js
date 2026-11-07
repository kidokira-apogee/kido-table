#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/race-candidate-v1.schema.json'), 'utf8'));
const files = [
  'candidate-data/2026-11-01-kyoto-7_candidate_v3.json',
  'candidate-data/2026-10-31-kyoto-12_candidate_v3.json'
];
function matchesType(value, type) {
  if (Array.isArray(type)) return type.some(t => matchesType(value, t));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}
function validate(value, rule, at, errors) {
  if (rule.type && !matchesType(value, rule.type)) {
    errors.push(at + ': expected ' + [].concat(rule.type).join('|'));
    return;
  }
  if (rule.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(at + '.' + key + ': required property missing');
    }
    if (rule.additionalProperties === false) {\n      for (const key of Object.keys(value)) {\n        if (!Object.prototype.hasOwnProperty.call(rule.properties || {}, key)) errors.push(at + '.' + key + ': additional property is not allowed');\n      }\n    }\n    for (const [key, child] of Object.entries(rule.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validate(value[key], child, at + '.' + key, errors);
    }
  }
  if (rule.type === 'array' && Array.isArray(value) && rule.items) {
    value.forEach((item, index) => validate(item, rule.items, at + '[' + index + ']', errors));
  }
}
let failed = false;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const errors = [];
  validate(data, schema, '$', errors);
  if (data.status?.complete !== false) errors.push('$.status.complete: candidate must remain false');
  if (!Array.isArray(data.horses) || data.horses.length !== data.race?.fieldSize) errors.push('$.horses: count must equal race.fieldSize');
  const numbers = new Set();
  for (const [i, horse] of (data.horses || []).entries()) {
    const at = '$.horses[' + i + ']';
    if (!Number.isInteger(horse.horseNumber) || horse.horseNumber < 1) errors.push(at + '.horseNumber: invalid horse number');
    if (numbers.has(horse.horseNumber)) errors.push(at + '.horseNumber: duplicate horse number ' + horse.horseNumber);
    numbers.add(horse.horseNumber);
    if (typeof horse.horseName !== 'string' || !horse.horseName.trim()) errors.push(at + '.horseName: empty identity');
    if (horse.profile?.horseName !== horse.horseName) errors.push(at + '.profile.horseName: identity mismatch');
    if (String(horse.profile?.horseNumber) !== String(horse.horseNumber)) errors.push(at + '.profile.horseNumber: identity mismatch');
    if (!Array.isArray(horse.recentRuns) || horse.recentRuns.length !== 3) errors.push(at + '.recentRuns: exactly three rows required');
    for (const source of ['TARGET', 'DATE2', '東スポ']) {
      const ref = horse.sourceRefs?.[source];
      if (!ref) errors.push(at + '.sourceRefs.' + source + ': source reference missing');
      else if (ref.horseNumber !== horse.horseNumber || ref.horseName !== horse.horseName) errors.push(at + '.sourceRefs.' + source + ': horse identity mismatch');
    }
    for (const tab of ['detail', 'distanceCourse', 'conditions', 'frameAndTop2']) {
      if (!horse.dataTabs || !Object.prototype.hasOwnProperty.call(horse.dataTabs, tab)) errors.push(at + '.dataTabs.' + tab + ': tab missing');
    }
  }
  if (errors.length) {
    failed = true;
    console.error('FAIL ' + file + '\\n' + errors.slice(0, 50).join('\\n'));
  } else {
    console.log('PASS ' + file + ' (' + data.horses.length + ' horses; identity, source refs, 3-run rows, and four tabs checked)');
  }
}
if (failed) process.exit(1);
