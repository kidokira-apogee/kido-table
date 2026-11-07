#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020').default;

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/race-candidate-v1.schema.json'), 'utf8'));
const files = [
  'candidate-data/2026-11-01-kyoto-7_candidate_v3.json',
  'candidate-data/2026-10-31-kyoto-12_candidate_v3.json'
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);
let failed = false;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const errors = [];

  if (!validateSchema(data)) {
    for (const error of validateSchema.errors || []) {
      errors.push('JSON Schema 2020-12 ' + (error.instancePath || '$') + ': ' + error.message);
    }
  } else {
    console.log('AJV 2020-12 PASS ' + file);
  }

  if (data.status?.complete !== false) errors.push('$.status.complete: candidate must remain false');
  if (!Array.isArray(data.horses) || data.horses.length !== data.race?.fieldSize) {
    errors.push('$.horses: count must equal race.fieldSize');
  }

  const horseNumbers = new Set();
  const expectedTabs = ['detail', 'distanceCourse', 'conditions', 'frameAndTop2'];
  const expectedSummary = ['allRecord', 'surfaceRecord', 'courseRecord', 'turnRecord', 'lateStartRate'];
  const expectedRuns = ['前走', '2走前', '3走前'];

  for (const [i, horse] of (data.horses || []).entries()) {
    const at = '$.horses[' + i + ']';
    if (!Number.isInteger(horse.horseNumber) || horse.horseNumber < 1 || horse.horseNumber > 18) {
      errors.push(at + '.horseNumber: invalid horse number');
    }
    if (horseNumbers.has(horse.horseNumber)) errors.push(at + '.horseNumber: duplicate horse number ' + horse.horseNumber);
    horseNumbers.add(horse.horseNumber);

    if (typeof horse.horseName !== 'string' || !horse.horseName.trim()) errors.push(at + '.horseName: empty identity');
    if (horse.profile?.horseName !== horse.horseName) errors.push(at + '.profile.horseName: identity mismatch');
    if (String(horse.profile?.horseNumber) !== String(horse.horseNumber)) errors.push(at + '.profile.horseNumber: identity mismatch');

    const runLabels = (horse.recentRuns || []).map(run => run.label);
    if (JSON.stringify(runLabels) !== JSON.stringify(expectedRuns)) errors.push(at + '.recentRuns: expected 前走・2走前・3走前 order');

    for (const source of ['TARGET', 'DATE2', '東スポ']) {
      const ref = horse.sourceRefs?.[source];
      if (!ref) errors.push(at + '.sourceRefs.' + source + ': source reference missing');
      else if (ref.horseNumber !== horse.horseNumber || ref.horseName !== horse.horseName) {
        errors.push(at + '.sourceRefs.' + source + ': horse identity mismatch');
      }
    }

    if (JSON.stringify(Object.keys(horse.dataTabs || {})) !== JSON.stringify(expectedTabs)) {
      errors.push(at + '.dataTabs: keys/order differ from master');
    }
    if (JSON.stringify(Object.keys(horse.topSummary || {})) !== JSON.stringify(expectedSummary)) {
      errors.push(at + '.topSummary: keys/order differ from master');
    }

    if (horse.comments?.splitStatus === 'unclassified_requires_review') {
      if (horse.comments.current?.text !== '' || horse.comments.previousRun?.text !== '') {
        errors.push(at + '.comments: unclassified text must not be assigned to current/previous');
      }
      if (horse.comments.current?.isIchioshi === true) {
        errors.push(at + '.comments.current.isIchioshi: cannot be assigned while unclassified');
      }
    }
  }

  if (errors.length) {
    failed = true;
    console.error('FAIL ' + file + '\n' + errors.slice(0, 80).join('\n'));
  } else {
    console.log('PASS ' + file + ' (' + data.horses.length + ' horses; JSON Schema, identity, source refs, 3-run rows, and fixed tabs checked)');
  }
}

if (failed) process.exit(1);
