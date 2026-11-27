// Pure Training Intelligence & Analytics helpers: unilateral (L/R) balance,
// Time-Under-Tension (TUT) by muscle, readiness & block fatigue correlation, and
// pain/fatigue-aware exercise substitutions.
import { EXIDX } from './exercises.js'
import { workoutDay, workoutVolume } from './history.js'
import { isWarmupRow, hasCompletedWork } from './workout-model.js'
import { musclesOf, MUSCLE_NAME } from './muscles.js'
import { todayISO } from './format.js'

const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0)

/**
 * Parse a tempo string like "3-1-2-0" or "3120" into total seconds per rep.
 * Returns null if the string is not a recognized 3- or 4-phase tempo.
 */
export function parseTempoSeconds(tempo) {
  if (typeof tempo !== 'string') return null
  const s = tempo.trim()
  if (!s) return null
  const dashed = s.match(/^(\d+)\s*[-/]\s*(\d+)\s*[-/]\s*(\d+)(?:\s*[-/]\s*(\d+))?$/)
  if (dashed) {
    return (+dashed[1]) + (+dashed[2]) + (+dashed[3]) + (+(dashed[4] || 0))
  }
  const compact = s.match(/^(\d)(\d)(\d)(\d)?$/)
  if (compact) {
    return (+compact[1]) + (+compact[2]) + (+compact[3]) + (+(compact[4] || 0))
  }
  return null
}

/**
 * Compute Left vs. Right volume and estimated 1RM imbalances across workouts
 * containing unilateral (`s.sides`) sets.
 */
export function unilateralImbalances(workouts, { minSets = 2, thresholdPct = 10 } = {}) {
  const byEx = new Map()
  for (const w of workouts || []) {
    for (const e of w?.entries || []) {
      if (!e?.id) continue
      for (const s of e.sets || []) {
        if (!s?.sides || isWarmupRow(s) || !hasCompletedWork(s)) continue
        const lw = +s.sides.L?.w || 0, lr = +s.sides.L?.r || 0
        const rw = +s.sides.R?.w || 0, rr = +s.sides.R?.r || 0
        if (!(lr > 0 || rr > 0)) continue
        let rec = byEx.get(e.id)
        if (!rec) {
          rec = { id: e.id, name: e.n || '', sets: 0, leftVol: 0, rightVol: 0, left1RM: 0, right1RM: 0 }
          byEx.set(e.id, rec)
        }
        rec.sets += 1
        rec.leftVol += lw * lr
        rec.rightVol += rw * rr
        rec.left1RM = Math.max(rec.left1RM, e1rm(lw, lr))
        rec.right1RM = Math.max(rec.right1RM, e1rm(rw, rr))
      }
    }
  }
  const out = []
  for (const rec of byEx.values()) {
    if (rec.sets < minSets) continue
    const maxVol = Math.max(rec.leftVol, rec.rightVol)
    const volDiffPct = maxVol > 0 ? Math.round((Math.abs(rec.leftVol - rec.rightVol) / maxVol) * 100) : 0
    const max1RM = Math.max(rec.left1RM, rec.right1RM)
    const e1rmDiffPct = max1RM > 0 ? Math.round((Math.abs(rec.left1RM - rec.right1RM) / max1RM) * 100) : 0
    const stronger = rec.leftVol === rec.rightVol ? 'even' : (rec.leftVol > rec.rightVol ? 'L' : 'R')
    const diffPct = Math.max(volDiffPct, e1rmDiffPct)
    out.push({
      ...rec,
      leftVol: Math.round(rec.leftVol),
      rightVol: Math.round(rec.rightVol),
      left1RM: Math.round(rec.left1RM * 10) / 10,
      right1RM: Math.round(rec.right1RM * 10) / 10,
      volDiffPct,
      e1rmDiffPct,
      diffPct,
      stronger,
      flagged: diffPct >= thresholdPct,
    })
  }
  return out.sort((a, b) => b.diffPct - a.diffPct || b.sets - a.sets)
}

/**
 * Compute Time-Under-Tension (seconds) from timed holds and tempo-tagged sets,
 * grouped by primary muscle slug.
 */
export function tutSummary(workouts, { from = null, to = null } = {}, index = EXIDX) {
  const byMuscle = {}
  let totalSec = 0
  let tempoSets = 0
  let holdSets = 0
  for (const w of workouts || []) {
    const d = workoutDay(w)
    if (from && d && d < from) continue
    if (to && d && d > to) continue
    for (const e of w?.entries || []) {
      const ex = index[e.id] || e.exercise || e
      const weights = musclesOf(ex)
      const slugs = Object.keys(weights)
      if (!slugs.length) continue
      const entryTempo = parseTempoSeconds(e.tempo)
      for (const s of e.sets || []) {
        if (isWarmupRow(s) || !hasCompletedWork(s)) continue
        let sec = 0
        const hold = +(s.sec ?? s.dur ?? s.hold ?? 0)
        if (hold > 0) {
          sec = hold * (s.sides ? 2 : 1)
          holdSets += 1
        } else {
          const perRep = parseTempoSeconds(s.tempo) ?? entryTempo
          if (perRep && perRep > 0) {
            const reps = s.sides ? ((+s.sides.L?.r || 0) + (+s.sides.R?.r || 0)) : (+s.r || 0)
            sec = perRep * reps
            if (sec > 0) tempoSets += 1
          }
        }
        if (!(sec > 0)) continue
        totalSec += sec
        const totalW = slugs.reduce((sum, k) => sum + (weights[k] || 0), 0) || 1
        for (const k of slugs) {
          byMuscle[k] = (byMuscle[k] || 0) + sec * ((weights[k] || 0) / totalW)
        }
      }
    }
  }
  const muscles = Object.entries(byMuscle)
    .map(([slug, sec]) => ({ slug, name: MUSCLE_NAME[slug] || slug, sec: Math.round(sec) }))
    .filter(m => m.sec > 0)
    .sort((a, b) => b.sec - a.sec)
  return { totalSec: Math.round(totalSec), tempoSets, holdSets, muscles }
}

/**
 * Score a single `dayForm` entry (1..5 scale per field, stress inverted).
 * Returns 0..100 or null if no fields were logged.
 */
export function readinessScoreOf(form) {
  if (!form || typeof form !== 'object') return null
  const parts = []
  if (form.sleep >= 1 && form.sleep <= 5) parts.push((form.sleep - 1) / 4)
  if (form.energy >= 1 && form.energy <= 5) parts.push((form.energy - 1) / 4)
  if (form.sore >= 1 && form.sore <= 5) parts.push((5 - form.sore) / 4)
  if (form.stress >= 1 && form.stress <= 5) parts.push((5 - form.stress) / 4)
  if (!parts.length) return null
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)
}

/**
 * Correlate daily readiness (`S.dayForm`) with session volume and compare the
 * last 7 days against the prior 21-day baseline to detect acute load spikes.
 */
export function readinessAndBlockSummary(S, { today = todayISO() } = {}) {
  const workouts = Array.isArray(S?.workouts) ? S.workouts : []
  const dayForm = S?.dayForm && typeof S.dayForm === 'object' ? S.dayForm : {}
  const msToday = new Date(today + 'T12:00:00').getTime()
  const dayDiff = iso => {
    if (!iso) return Infinity
    const t = new Date(iso + 'T12:00:00').getTime()
    return Math.round((msToday - t) / 86400000)
  }

  let recent7Vol = 0, recent7Count = 0
  let base21Vol = 0, base21Count = 0
  const highReadinessVols = [], lowReadinessVols = []
  const readinessScores = []

  for (const [iso, form] of Object.entries(dayForm)) {
    const score = readinessScoreOf(form)
    if (score != null && dayDiff(iso) >= 0 && dayDiff(iso) < 28) readinessScores.push(score)
  }

  for (const w of workouts) {
    const d = workoutDay(w)
    const diff = dayDiff(d)
    if (diff < 0 || diff >= 28) continue
    const vol = workoutVolume(w)
    if (diff < 7) {
      recent7Vol += vol
      recent7Count += 1
    } else {
      base21Vol += vol
      base21Count += 1
    }
    const score = readinessScoreOf(dayForm[d])
    if (score != null && vol > 0) {
      if (score >= 65) highReadinessVols.push(vol)
      else lowReadinessVols.push(vol)
    }
  }

  const weeklyBaseVol = base21Count > 0 ? base21Vol / 3 : 0
  const acwr = weeklyBaseVol > 0 ? Math.round((recent7Vol / weeklyBaseVol) * 100) / 100 : null
  const avgReadiness = readinessScores.length
    ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
    : null
  const avg = arr => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)

  let status = 'steady'
  if (acwr != null && acwr >= 1.4) status = 'overload'
  else if (acwr != null && acwr <= 0.6 && recent7Count > 0) status = 'deload'
  else if (avgReadiness != null && avgReadiness < 45 && recent7Count >= 2) status = 'fatigued'

  return {
    recent7Vol: Math.round(recent7Vol),
    recent7Count,
    weeklyBaseVol: Math.round(weeklyBaseVol),
    acwr,
    avgReadiness,
    highReadinessAvgVol: avg(highReadinessVols),
    lowReadinessAvgVol: avg(lowReadinessVols),
    status,
  }
}

/**
 * Suggest pain/fatigue-safe exercise alternatives from `list` that still train
 * the target exercise's primary muscles while avoiding `avoidSlugs`.
 */
export function suggestPainSafeSwaps(exId, avoidSlugs = [], list = [], limit = 6, index = EXIDX) {
  const source = index[exId] || list.find(e => e.id === exId)
  if (!source) return []
  const avoid = new Set((avoidSlugs || []).filter(Boolean))
  const targetWeights = musclesOf(source)
  const targetSlugs = Object.keys(targetWeights)
  if (!targetSlugs.length) return []

  const candidates = []
  for (const ex of list) {
    if (!ex || ex.id === exId) continue
    const w = musclesOf(ex)
    let overlap = 0
    for (const s of targetSlugs) {
      if (!avoid.has(s) && w[s]) overlap += Math.min(targetWeights[s], w[s])
    }
    if (!(overlap > 0)) continue
    let avoidHit = 0
    for (const a of avoid) {
      if (w[a]) avoidHit += w[a]
    }
    if (avoidHit > 0.35) continue
    const score = overlap - avoidHit * 2
    candidates.push({ ex, score, overlap, avoidHit })
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.avoidHit - b.avoidHit)
    .slice(0, limit)
    .map(c => c.ex)
}
