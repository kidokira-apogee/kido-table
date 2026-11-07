#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020').default;

const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/race-candidate-v1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

const files = [
  'candidate-data/2026-11-01-kyoto-7_candidate_v3.json',
  'candidate-data/2026-10-31-kyoto-12_candidate_v3.json'
];

const expectedTabs = ['detail', 'distanceCourse', 'conditions', 'frameAndTop2'];
const expectedRunLabels = ['前走', '2走前', '3走前'];
const expectedSources = ['TARGET', 'DATE2', '東スポ'];

let failed = false;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const errors = [];

  if (!validateSchema(data)) {
    for (const error of validateSchema.errors || []) {
      errors.push('JSON Schema 2020-12 ' + (error.instancePath || '$') + ': ' + error.message);
    }
  }

  if (data.status?.complete !== false) {
    errors.push('$.status.complete: candidate must remain false');
  }

  if (!Array.isArray(data.horses) || data.horses.length !== data.race?.fieldSize) {
    errors.push('$.horses: count must equal race.fieldSize');
  }

  const seenNumbers = new Set();
  for (const [index, horse] of (data.horses || []).entries()) {
    const at = '$.horses[' + index + ']';

    if (!Number.isInteger(horse.horseNumber) || horse.horseNumber < 1) {
      errors.push(at + '.horseNumber: invalid horse number');
    }
    if (seenNumbers.has(horse.horseNumber)) {
      errors.push(at + '.horseNumber: duplicate horse number ' + horse.horseNumber);
    }
    seenNumbers.add(horse.horseNumber);

    if (typeof horse.horseName !== 'string' || !horse.horseName.trim()) {
      errors.push(at + '.horseName: non-empty horse name required');
    }
    if (horse.profile?.horseName !== horse.horseName) {
      errors.push(at + '.profile.horseName: identity mismatch');
    }
    if (String(horse.profile?.horseNumber) !== String(horse.horseNumber)) {
      errors.push(at + '.profile.horseNumber: identity mismatch');
    }

    if (!Array.isArray(horse.recentRuns) || horse.recentRuns.length !== 3) {
      errors.push(at + '.recentRuns: exactly three rows required');
    } else {
      horse.recentRuns.forEach((run, runIndex) => {
        if (run.label !== expectedRunLabels[runIndex]) {
          errors.push(at + '.recentRuns[' + runIndex + ']: label/order mismatch');
        }
      });
    }

    for (const sourceName of expectedSources) {
      const ref = horse.sourceRefs?.[sourceName];
      if (!ref) {
        errors.push(at + '.sourceRefs.' + sourceName + ': source reference missing');
      } else if (ref.horseNumber !== horse.horseNumber || ref.horseName !== horse.horseName) {
        errors.push(at + '.sourceRefs.' + sourceName + ': horse identity mismatch');
      }
    }

    const actualTabs = Object.keys(horse.dataTabs || {});
    if (JSON.stringify(actualTabs) !== JSON.stringify(expectedTabs)) {
      errors.push(at + '.dataTabs: expected exact tab keys/order ' + expectedTabs.join(','));
    }
  }

  if (errors.length) {
    failed = true;
    console.error('FAIL ' + file + ' (' + errors.length + ' errors)');
    for (const error of errors.slice(0, 80)) console.error('  ' + error);
  } else {
    console.log('PASS ' + file + ' (' + data.horses.length +
      ' horses; JSON Schema 2020-12, candidate status, identities, source refs, 3-run rows and exact tab order)');
  }
}

if (failed) process.exit(1);
