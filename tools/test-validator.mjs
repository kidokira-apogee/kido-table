#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStructuredBrowserFixture } from './structured-browser-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(here, 'validate-race.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kido-validator-'));
function validate(name, mutate, expectedStatus) {
  const data = buildStructuredBrowserFixture();
  mutate(data);
  const file = path.join(dir, name + '.json');
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  const result = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
  assert.equal(result.status, expectedStatus, name + ': ' + result.stderr + result.stdout);
  return result;
}
try {
  validate('both-comments-present', () => {}, 0);
  validate('both-comments-absent', data => {
    data.horses[0].comments = { current: {}, previousRun: {} };
  }, 0);
  validate('current-only', data => {
    data.horses[0].comments = { current: { text: '今回コメント', isIchioshi: true }, previousRun: {} };
  }, 0);
  validate('previous-only', data => {
    data.horses[0].comments = { current: {}, previousRun: { text: '前走コメント' } };
  }, 0);
  validate('ichioshi-without-current-comment', data => {
    data.horses[0].comments = { current: { isIchioshi: true }, previousRun: {} };
  }, 1);
  validate('previous-comment-cannot-be-ichioshi', data => {
    data.horses[0].comments.previousRun.isIchioshi = true;
  }, 1);
  console.log('PASS: structured race validator accepts both/current-only/previous-only/absent comments and rejects invalid ichioshi states.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
