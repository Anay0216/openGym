import { describe, it, expect } from 'vitest'
import {
  parseTempoSeconds,
  unilateralImbalances,
  tutSummary,
  readinessScoreOf,
  readinessAndBlockSummary,
  suggestPainSafeSwaps,
} from './training-intelligence.js'

describe('parseTempoSeconds', () => {
  it('parses dashed and compact tempo notation', () => {
    expect(parseTempoSeconds('3-1-2-0')).toBe(6)
    expect(parseTempoSeconds('4-0-1')).toBe(5)
    expect(parseTempoSeconds('3110')).toBe(5)
    expect(parseTempoSeconds('')).toBeNull()
    expect(parseTempoSeconds('fast')).toBeNull()
  })
})

describe('unilateralImbalances', () => {
  it('detects left vs right volume and 1RM asymmetry', () => {
    const workouts = [
      {
        d: '2026-11-20',
        entries: [{
          id: 'db_curl',
          n: 'DB Curl',
          sets: [
            { sides: { L: { w: 12, r: 10, done: true }, R: { w: 16, r: 10, done: true } } },
            { sides: { L: { w: 12, r: 10, done: true }, R: { w: 16, r: 10, done: true } } },
          ],
        }],
      },
    ]
    const res = unilateralImbalances(workouts, { minSets: 2, thresholdPct: 10 })
    expect(res).toHaveLength(1)
    expect(res[0].stronger).toBe('R')
    expect(res[0].volDiffPct).toBe(25)
    expect(res[0].flagged).toBe(true)
  })
})

describe('tutSummary', () => {
  it('aggregates hold seconds and tempo-based TUT by muscle', () => {
    const index = {
      test_hold: { id: 'test_hold', tg: 'chest' },
      test_tempo: { id: 'test_tempo', tg: 'quads', sm: ['glutes'] },
    }
    const workouts = [
      {
        d: '2026-11-21',
        entries: [
          { id: 'test_hold', sets: [{ done: true, sec: 45 }] },
          { id: 'test_tempo', tempo: '3-1-1-0', sets: [{ done: true, w: 100, r: 8 }] },
        ],
      },
    ]
    const res = tutSummary(workouts, {}, index)
    expect(res.totalSec).toBe(85)
    expect(res.holdSets).toBe(1)
    expect(res.tempoSets).toBe(1)
    expect(res.muscles.length).toBeGreaterThan(0)
  })
})

describe('readinessAndBlockSummary', () => {
  it('computes ACWR and readiness correlation', () => {
    expect(readinessScoreOf({ sleep: 5, energy: 5, sore: 1, stress: 1 })).toBe(100)
    expect(readinessScoreOf({ sleep: 1, energy: 1, sore: 5, stress: 5 })).toBe(0)
    const S = {
      dayForm: {
        '2026-11-26': { sleep: 5, energy: 4, sore: 2, stress: 2 },
        '2026-11-10': { sleep: 2, energy: 2, sore: 4, stress: 4 },
      },
      workouts: [
        { d: '2026-11-26', entries: [{ id: 'a', sets: [{ done: true, w: 100, r: 10 }] }] },
        { d: '2026-11-10', entries: [{ id: 'a', sets: [{ done: true, w: 50, r: 10 }] }] },
      ],
    }
    const res = readinessAndBlockSummary(S, { today: '2026-11-27' })
    expect(res.recent7Vol).toBe(1000)
    expect(res.acwr).toBeGreaterThan(1.4)
    expect(res.status).toBe('overload')
    expect(res.highReadinessAvgVol).toBe(1000)
    expect(res.lowReadinessAvgVol).toBe(500)
  })
})

describe('suggestPainSafeSwaps', () => {
  it('recommends exercises that hit the target muscle while avoiding sore areas', () => {
    const list = [
      { id: 'back_squat', n: 'Back Squat', tg: 'quads', sm: ['lower-back', 'glutes'] },
      { id: 'belt_squat', n: 'Belt Squat', tg: 'quads', sm: ['glutes'] },
      { id: 'good_morning', n: 'Good Morning', tg: 'lower-back', sm: ['hamstrings'] },
    ]
    const index = Object.fromEntries(list.map(e => [e.id, e]))
    const swaps = suggestPainSafeSwaps('back_squat', ['lower-back'], list, 5, index)
    expect(swaps.map(s => s.id)).toEqual(['belt_squat'])
  })
})
