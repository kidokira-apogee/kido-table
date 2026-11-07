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
  if (Object.prototype.hasOwnProperty.call(rule, 'const') && value !== rule.const) errors.push(at + ': const mismatch');
  if (rule.enum && !rule.enum.includes(value)) errors.push(at + ': value is not in enum');
  if (typeof value === 'string') {
    if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) errors.push(at + ': pattern mismatch');
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(at + ': below minLength');
    if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(at + ': above maxLength');
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) errors.push(at + ': below minimum');
    if (rule.maximum !== undefined && value > rule.maximum) errors.push(at + ': above maximum');
  }
  if (rule.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(at + '.' + key + ': required property missing');
    }
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(rule.properties || {}, key)) errors.push(at + '.' + key + ': additional property is not allowed');
      }
    }
    for (const [key, child] of Object.entries(rule.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validate(value[key], child, at + '.' + key, errors);
    }
  }
  if (rule.type === 'array' && Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(at + ': below minItems');
    if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(at + ': above maxItems');
    if (rule.items) value.forEach((item, index) => validate(item, rule.items, at + '[' + index + ']', errors));
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
