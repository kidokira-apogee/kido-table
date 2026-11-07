/*
 * 木戸表電子版：既存openRace()との互換アダプター
 * 既存HTML方式を維持し、構造化JSONだけレンダラーへフォールバックする。
 */
(function (global) {
  'use strict';
  function prepareRace(data) {
    if (!data || typeof data !== 'object') throw new Error('レースJSONが不正です');
    if (typeof data.render?.html === 'string' && data.render.html.length) {
      return { html: data.render.html, structured: false, source: 'legacy-html' };
    }
    if (data.render?.layoutId === 'tokyo9-production-locked' && Array.isArray(data.horses)) {
      if (!global.KidoStructuredRenderer || typeof global.KidoStructuredRenderer.renderRace !== 'function') {
        throw new Error('構造化レンダラーが読み込まれていません');
      }
      const html = global.KidoStructuredRenderer.renderRace(data, {
        applyTargetColors: data.render.preserveSourceColors === true
      });
      if (typeof html !== 'string' || !html.includes('data-kido-structured-renderer="true"')) {
        throw new Error('構造化レンダラーの出力が不正です');
      }
      return { html, structured: true, source: 'structured-json' };
    }
    throw new Error('対応していないレースJSON形式です');
  }
  global.KidoRaceRendererAdapter = { prepareRace };
})(window);
