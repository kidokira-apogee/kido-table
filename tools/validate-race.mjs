#!/usr/bin/env node
/** Structural, provenance, color, and display-contract checks for Kido Table race JSON v1. */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/validate-race.mjs <race.json>');
  process.exit(2);
}

const errors = [];
const fail = (message) => errors.push(message);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const required = (object, keys, path) => {
  for (const key of keys) {
    if (!(key in object)) fail(path + '.' + key + ': missing');
  }
};
const cssColor = (value) => typeof value === 'string' &&
  /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,30}|rgba?\(\s*[0-9.%\s,\/]+\)|hsla?\(\s*[0-9.%\s,\/]+\))$/i.test(value.trim());
const colorKeys = ['sireBackground', 'damText', 'damsireBackground', 'sireLineBackground', 'damsireLineBackground'];
const styleCellKeys = ['sire', 'dam', 'damsire', 'sireLine', 'damsireLine'];

function validateRows(rows, path, options = {}) {
  if (!Array.isArray(rows)) {
    fail(path + ' must be an array');
    return;
  }
  rows.forEach((row, index) => {
    const rowPath = path + '[' + index + ']';
    if (!isObject(row)) {
      fail(rowPath + ' must be an object');
      return;
    }
    if (typeof row.label !== 'string' || !row.label.trim()) fail(rowPath + '.label must be a non-empty string');
    const hasRecord = Array.isArray(row.record) && row.record.length === 4;
    const hasValue = Object.prototype.hasOwnProperty.call(row, 'value');
    if (options.recordOnly && !hasRecord) fail(rowPath + '.record must contain four values');
    if (options.valueOnly && !hasValue) fail(rowPath + '.value is required');
    if (!options.recordOnly && !options.valueOnly && !hasRecord && !hasValue) {
      fail(rowPath + ' must contain record[4] or value');
    }
  });
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error('JSON parse failed: ' + error.message);
  process.exit(1);
}

if (!isObject(data)) {
  fail('$ must be an object');
} else {
  required(data, ['schemaVersion', 'race', 'sourceAudit', 'render', 'horses'], '$');
  if (data.schemaVersion !== '1.0.0') fail('schemaVersion must be 1.0.0');

  if (!isObject(data.race)) {
    fail('race must be an object');
  } else {
    required(data.race, [
      'id', 'date', 'venue', 'raceNumber', 'name', 'surface', 'distanceM',
      'direction', 'fieldSize', 'metadataSource'
    ], 'race');

    if (data.race.metadataSource !== '① TARGET') fail('race.metadataSource must be ① TARGET');

    const raceDate = String(data.race.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
      fail('race.date must be YYYY-MM-DD');
    } else {
      const parsedDate = new Date(raceDate + 'T00:00:00Z');
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== raceDate) {
        fail('race.date is not a calendar date');
      }
    }
    if (typeof data.race.venue !== 'string' || !data.race.venue.trim()) fail('race.venue must be non-empty');
    if (!Number.isInteger(data.race.raceNumber) || data.race.raceNumber < 1 || data.race.raceNumber > 12) fail('race.raceNumber must be 1–12');
    if (typeof data.race.name !== 'string' || !data.race.name.trim()) fail('race.name must be non-empty');
    if (!['芝', 'ダート'].includes(data.race.surface)) fail('race.surface must be 芝 or ダート');
    if (!Number.isInteger(data.race.distanceM) || data.race.distanceM < 1000) fail('race.distanceM must be an integer >= 1000');
    if (!['左', '右', '直線', '不明'].includes(data.race.direction)) fail('race.direction must be 左／右／直線／不明');
    if (!Number.isInteger(data.race.fieldSize) || data.race.fieldSize < 6 || data.race.fieldSize > 18) fail('race.fieldSize must be 6–18');
  }

  if (!isObject(data.sourceAudit)) {
    fail('sourceAudit must be an object');
  }

  if (!isObject(data.render)) {
    fail('render must be an object');
  } else {
    required(data.render, ['layoutId', 'preserveSourceColors'], 'render');
    if (data.render.layoutId !== 'tokyo9-production-locked') fail('render.layoutId must be tokyo9-production-locked');
    if (typeof data.render.preserveSourceColors !== 'boolean') fail('render.preserveSourceColors must be boolean');
    if ('html' in data.render) fail('render.html is prohibited in structured JSON; do not store raw HTML');
  }

  if (!Array.isArray(data.horses)) {
    fail('horses must be an array');
  } else {
    if (data.horses.length < 6 || data.horses.length > 18) fail('horses count must be 6–18');
    const numbers = data.horses.map((horse) => horse?.horseNumber);
    if (new Set(numbers).size !== numbers.length) fail('horseNumber contains duplicates');

    for (const [index, horse] of data.horses.entries()) {
      const path = 'horses[' + index + ']';
      if (!isObject(horse)) {
        fail(path + ' must be an object');
        continue;
      }

      required(horse, [
        'horseNumber', 'frameNumber', 'horseName', 'profile', 'pedigree',
        'recentRuns', 'topSummary', 'dataTabs', 'comments', 'sourceStyles'
      ], path);

      if (!Number.isInteger(horse.horseNumber) || horse.horseNumber < 1 || horse.horseNumber > 18) fail(path + '.horseNumber invalid');
      if (!(horse.frameNumber === null || (Number.isInteger(horse.frameNumber) && horse.frameNumber >= 1 && horse.frameNumber <= 8))) {
        fail(path + '.frameNumber must be 1–8 or null');
      }
      if (typeof horse.horseName !== 'string' || !horse.horseName.trim()) fail(path + '.horseName must be non-empty');
      if (!isObject(horse.profile)) fail(path + '.profile must be an object');
      else required(horse.profile, ['sexAge', 'handicapWeight', 'jockeyRaw', 'affiliation', 'trainer'], path + '.profile');

      if (!isObject(horse.sourceStyles)) {
        fail(path + '.sourceStyles must be an object');
      } else {
        required(horse.sourceStyles, ['profile', 'recentRuns'], path + '.sourceStyles');
        const profileStyle = horse.sourceStyles.profile;
        const profileKeys = ['horseNumber', 'horseName', 'sexAge', 'handicapWeight', 'jockeyRaw', 'affiliation', 'trainer'];
        if (!isObject(profileStyle)) fail(path + '.sourceStyles.profile must be an object');
        else {
          required(profileStyle, profileKeys, path + '.sourceStyles.profile');
          for (const [key, style] of Object.entries(profileStyle)) {
            if (!isObject(style)) fail(path + '.sourceStyles.profile.' + key + ' must be an object');
            else {
              required(style, ['backgroundColor', 'textColor'], path + '.sourceStyles.profile.' + key);
              for (const prop of ['backgroundColor', 'textColor']) if (style[prop] !== null && style[prop] !== undefined && !cssColor(style[prop])) fail(path + '.sourceStyles.profile.' + key + '.' + prop + ' invalid');
            }
          }
        }
        const runStyles = horse.sourceStyles.recentRuns;
        const runKeys = ['dateRaw','courseRaw','ageClass','class','raceName','weight','jockey','bodyWeight','bodyWeightChange','going','mark','fieldSize','horseNumber','popularity','finish','margin','index','last3F','last3FRank','interval','blinkers','runningStyleRaw'];
        if (!Array.isArray(runStyles) || runStyles.length !== 3) fail(path + '.sourceStyles.recentRuns must contain exactly 3 runs');
        else runStyles.forEach((runStyle, runIndex) => {
          const rp = path + '.sourceStyles.recentRuns[' + runIndex + ']';
          if (!isObject(runStyle)) { fail(rp + ' must be an object'); return; }
          required(runStyle, [...runKeys, 'passingOrder'], rp);
          for (const [key, style] of Object.entries(runStyle)) {
            const list = key === 'passingOrder';
            const styles = list ? style : [style];
            if (list && (!Array.isArray(style) || style.length !== 4)) { fail(rp + '.passingOrder must contain four styles'); return; }
            for (const [j, cellStyle] of styles.entries()) {
              if (!isObject(cellStyle)) { fail(rp + '.' + key + (list ? '[' + j + ']' : '') + ' must be an object'); continue; }
              required(cellStyle, ['backgroundColor', 'textColor'], rp + '.' + key);
              for (const prop of ['backgroundColor', 'textColor']) if (cellStyle[prop] !== null && cellStyle[prop] !== undefined && !cssColor(cellStyle[prop])) fail(rp + '.' + key + '.' + prop + ' invalid');
            }
          }
        });
      }

      if (!isObject(horse.pedigree)) {
        fail(path + '.pedigree must be an object');
      } else {
        required(horse.pedigree, [
          'sire', 'dam', 'damsire', 'sireLine', 'damsireLine', 'colors', 'sourceStyles'
        ], path + '.pedigree');

        if (!isObject(horse.pedigree.colors)) {
          fail(path + '.pedigree.colors must be an object');
        } else {
          required(horse.pedigree.colors, colorKeys, path + '.pedigree.colors');
          for (const [key, value] of Object.entries(horse.pedigree.colors)) {
            if (value !== null && !cssColor(value)) fail(path + '.pedigree.colors.' + key + ' must be a valid source CSS color or null');
          }
        }

        if (!isObject(horse.pedigree.sourceStyles)) {
          fail(path + '.pedigree.sourceStyles must be an object');
        } else {
          required(horse.pedigree.sourceStyles, styleCellKeys, path + '.pedigree.sourceStyles');
          for (const [cell, style] of Object.entries(horse.pedigree.sourceStyles)) {
            if (!isObject(style)) {
              fail(path + '.pedigree.sourceStyles.' + cell + ' must be an object');
              continue;
            }
            required(style, ['backgroundColor', 'textColor'], path + '.pedigree.sourceStyles.' + cell);
            for (const key of ['backgroundColor', 'textColor']) {
              const value = style[key];
              if (value !== null && value !== undefined && !cssColor(value)) {
                fail(path + '.pedigree.sourceStyles.' + cell + '.' + key + ' must be a valid source CSS color or null');
              }
            }
          }
        }
      }

      if (!Array.isArray(horse.recentRuns) || horse.recentRuns.length !== 3) {
        fail(path + '.recentRuns must contain exactly 3 runs');
      } else {
        horse.recentRuns.forEach((run, runIndex) => {
          if (!isObject(run)) fail(path + '.recentRuns[' + runIndex + '] must be an object');
          else required(run, [
            'label', 'dateRaw', 'courseRaw', 'raceName', 'ageClass', 'class',
            'weight', 'jockey', 'bodyWeight', 'bodyWeightChange', 'going',
            'fieldSize', 'horseNumber', 'popularity', 'finish', 'margin',
            'index', 'last3F', 'last3FRank', 'interval', 'blinkers',
            'passingOrder', 'runningStyleRaw'
          ], path + '.recentRuns[' + runIndex + ']');
        });
      }

      if (!isObject(horse.topSummary)) {
        fail(path + '.topSummary must be an object');
      } else {
        required(horse.topSummary, ['allRecord', 'surfaceRecord', 'courseRecord', 'turnRecord', 'lateStartRate'], path + '.topSummary');
        for (const key of ['allRecord', 'surfaceRecord', 'courseRecord', 'turnRecord']) {
          const item = horse.topSummary[key];
          if (!isObject(item)) fail(path + '.topSummary.' + key + ' must be an object');
          else {
            if (typeof item.label !== 'string' || !item.label.trim()) fail(path + '.topSummary.' + key + '.label must be non-empty');
            if (!Array.isArray(item.record) || item.record.length !== 4) fail(path + '.topSummary.' + key + '.record must contain four values');
          }
        }
        const late = horse.topSummary.lateStartRate;
        if (!isObject(late)) fail(path + '.topSummary.lateStartRate must be an object');
        else {
          if (typeof late.label !== 'string' || !late.label.trim()) fail(path + '.topSummary.lateStartRate.label must be non-empty');
          if (!Object.prototype.hasOwnProperty.call(late, 'value')) fail(path + '.topSummary.lateStartRate.value is required');
        }
      }

      if (!isObject(horse.dataTabs)) {
        fail(path + '.dataTabs must be an object');
      } else {
        required(horse.dataTabs, ['detail', 'distanceCourse', 'conditions', 'frameAndTop2'], path + '.dataTabs');
        const detail = horse.dataTabs.detail;
        if (!isObject(detail)) fail(path + '.dataTabs.detail must be an object');
        else {
          required(detail, ['overall', 'surfaceConditions'], path + '.dataTabs.detail');
          validateRows(detail.overall, path + '.dataTabs.detail.overall', { recordOnly: true });
          validateRows(detail.surfaceConditions, path + '.dataTabs.detail.surfaceConditions', { recordOnly: true });
        }
        const distance = horse.dataTabs.distanceCourse;
        if (!isObject(distance)) fail(path + '.dataTabs.distanceCourse must be an object');
        else {
          required(distance, ['distanceBands', 'courseRecords', 'performance'], path + '.dataTabs.distanceCourse');
          validateRows(distance.distanceBands, path + '.dataTabs.distanceCourse.distanceBands', { recordOnly: true });
          validateRows(distance.courseRecords, path + '.dataTabs.distanceCourse.courseRecords', { recordOnly: true });
          validateRows(distance.performance, path + '.dataTabs.distanceCourse.performance', { valueOnly: true });
        }
        const conditions = horse.dataTabs.conditions;
        if (!isObject(conditions)) fail(path + '.dataTabs.conditions must be an object');
        else {
          required(conditions, ['rotation', 'season', 'pace', 'turn', 'fieldSizeAndPopularity'], path + '.dataTabs.conditions');
          for (const key of ['rotation', 'season']) {
            if (!isObject(conditions[key])) fail(path + '.dataTabs.conditions.' + key + ' must be an object');
            else {
              if (typeof conditions[key].label !== 'string' || !conditions[key].label.trim()) fail(path + '.dataTabs.conditions.' + key + '.label must be non-empty');
              if (!Array.isArray(conditions[key].record) || conditions[key].record.length !== 4) fail(path + '.dataTabs.conditions.' + key + '.record must contain four values');
            }
          }
          validateRows(conditions.pace, path + '.dataTabs.conditions.pace', { recordOnly: true });
          validateRows(conditions.turn, path + '.dataTabs.conditions.turn', { recordOnly: true });
          validateRows(conditions.fieldSizeAndPopularity, path + '.dataTabs.conditions.fieldSizeAndPopularity', { recordOnly: true });
        }
        const frame = horse.dataTabs.frameAndTop2;
        if (!isObject(frame)) fail(path + '.dataTabs.frameAndTop2 must be an object');
        else {
          required(frame, ['frameRecords', 'top2Records'], path + '.dataTabs.frameAndTop2');
          validateRows(frame.frameRecords, path + '.dataTabs.frameAndTop2.frameRecords', { recordOnly: true });
          validateRows(frame.top2Records, path + '.dataTabs.frameAndTop2.top2Records', { valueOnly: true });
        }
      }

      if (!isObject(horse.comments)) {
        fail(path + '.comments must be an object');
      } else {
        required(horse.comments, ['current', 'previousRun'], path + '.comments');
        if (!isObject(horse.comments.current)) fail(path + '.comments.current must be an object');
        else {
          const current = horse.comments.current;
          if ('text' in current && typeof current.text !== 'string') fail(path + '.comments.current.text must be a string');
          if ('isIchioshi' in current && typeof current.isIchioshi !== 'boolean') fail(path + '.comments.current.isIchioshi must be boolean');
          if (typeof current.text === 'string' && current.text.length > 0 && typeof current.isIchioshi !== 'boolean') {
            fail(path + '.comments.current.isIchioshi is required when current comment exists');
          }
          if ((!current.text || typeof current.text !== 'string') && current.isIchioshi === true) {
            fail(path + '.comments.current cannot be ichioshi without current comment');
          }
        }
        if (!isObject(horse.comments.previousRun)) fail(path + '.comments.previousRun must be an object');
        else {
          const previous = horse.comments.previousRun;
          if ('text' in previous && typeof previous.text !== 'string') fail(path + '.comments.previousRun.text must be a string');
          if ('isIchioshi' in previous) fail(path + '.comments.previousRun must not contain isIchioshi');
        }
      }
    }

    if (isObject(data.race) && data.horses.length !== data.race.fieldSize) {
      fail('horse count (' + data.horses.length + ') does not match race.fieldSize (' + data.race.fieldSize + ')');
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    if (numbers.some((number, index) => number !== sorted[index])) fail('horses must be ordered by horseNumber ascending');
    if (sorted.some((number, index) => number !== index + 1)) fail('horseNumber sequence must cover every number from 1 through fieldSize');
  }
}

if (errors.length) {
  console.error('FAIL: ' + errors.length + ' validation error(s)');
  errors.forEach((error) => console.error('- ' + error));
  process.exit(1);
}
console.log('PASS: ' + data.race.id + ' / ' + data.horses.length + ' horses / 5 summary slots / 4 tabs / 3 recent runs / pedigree source styles');
