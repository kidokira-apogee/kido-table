export function buildStructuredBrowserFixture() {
  const record = (label, values) => ({ label, record: values });
  const styleCell = () => ({ backgroundColor: null, textColor: null });
  const profileStyles = () => Object.fromEntries(
    ['horseNumber', 'horseName', 'sexAge', 'handicapWeight', 'jockeyRaw', 'affiliation', 'trainer'].map(key => [key, styleCell()])
  );
  const runStyles = () => {
    const keys = ['dateRaw', 'courseRaw', 'ageClass', 'class', 'raceName', 'weight', 'jockey', 'bodyWeight',
      'bodyWeightChange', 'going', 'mark', 'fieldSize', 'horseNumber', 'popularity', 'finish', 'margin',
      'index', 'last3F', 'last3FRank', 'interval', 'blinkers', 'runningStyleRaw'];
    return Array.from({ length: 3 }, () => ({
      ...Object.fromEntries(keys.map(key => [key, styleCell()])),
      passingOrder: Array.from({ length: 4 }, styleCell)
    }));
  };
  const run = (i) => ({
    label: ['前走', '2走前', '3走前'][i], dateRaw: ['10.18', '9.21', '8.30'][i],
    courseRaw: '東･T16', ageClass: '３上', class: '3勝', raceName: ['紅葉Ｓ･3勝', '秋風Ｓ･3勝', '長岡Ｓ･3勝'][i],
    weight: '57', jockey: '横山武史', bodyWeight: '480', bodyWeightChange: '+2', going: '良',
    fieldSize: '14', horseNumber: '4', popularity: '3', finish: String(i + 1), margin: '0.2',
    index: '94', last3F: '34.1', last3FRank: '2', interval: '4', blinkers: '',
    passingOrder: ['5', '5', '4', '3'], runningStyleRaw: '先'
  });
  const horse = (n) => ({
    horseNumber: n, frameNumber: Math.ceil(n / 2), horseName: '構造化テスト馬' + n,
    profile: { sexAge: '牡4', handicapWeight: '57', jockeyRaw: '横山武史', affiliation: '美浦', trainer: '木村哲也' },
    pedigree: { sire: 'エピファネイア', dam: 'テスト母', damsire: 'キングカメハメハ',
      sireLine: null, damsireLine: null,
      colors: { sireBackground: '#ffc0ff', damText: null, damsireBackground: '#00ffff',
        sireLineBackground: null, damsireLineBackground: null },
      sourceStyles: { sire: styleCell(), dam: styleCell(), damsire: styleCell(),
        sireLine: styleCell(), damsireLine: styleCell() } },
    recentRuns: [run(0), run(1), run(2)],
    topSummary: {
      allRecord: record('全着', ['3', '2', '1', '10']),
      surfaceRecord: record('全芝', ['3', '2', '1', '10']),
      courseRecord: record('東京芝1600m', ['1', '1', '0', '3']),
      turnRecord: record('左回', ['2', '1', '1', '6']),
      lateStartRate: { label: '出遅れ率', value: '10%' }
    },
    dataTabs: {
      detail: { overall: [record('全着', ['3','2','1','10'])], surfaceConditions: [record('芝', ['3','2','1','10'])] },
      distanceCourse: { distanceBands: [record('1400m-1600m', ['2','1','1','6'])], courseRecords: [record('東京芝1600m', ['1','1','0','3'])], performance: [{ label: '当距離', value: '34.1' }] },
      conditions: { rotation: record('中４週', ['1','1','0','2']), season: record('10月～12月', ['1','0','0','2']), pace: [record('Hペ', ['1','1','0','3'])], turn: [record('左回', ['2','1','1','6'])], fieldSizeAndPopularity: [record('10頭上', ['2','2','1','8'])] },
      frameAndTop2: { frameRecords: [record('内枠', ['1','1','0','3'])], top2Records: [{ label: '連対距離', value: '1400～1800' }] }
    },
    comments: { current: { text: '状態は良好。スムーズなら楽しみ。', source: '東スポ', isIchioshi: n === 4 }, previousRun: { text: '前走は直線でよく伸びた。', source: '東スポ' } },
    sourceStyles: { profile: profileStyles(), recentRuns: runStyles() }
  });
  return {
    schemaVersion: '1.0.0',
    race: { id: '2026-11-01-tokyo-9', date: '2026-11-01', venue: '東京', raceNumber: 9,
      name: '紅葉ステークス', surface: '芝', distanceM: 1600, direction: '左',
      fieldSize: 14, class: '3歳以上・3勝クラス', weightType: '定量', startTime: '14:25',
      metadataSource: '① TARGET' },
    sourceAudit: {},
    horses: Array.from({ length: 14 }, (_, i) => horse(i + 1)),
    render: { layoutId: 'tokyo9-production-locked', preserveSourceColors: true }
  };
}
