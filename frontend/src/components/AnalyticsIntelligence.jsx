import { useMemo, useState } from 'react'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { fmtNum, fmtDur } from '../lib/format.js'
import { EXIDX, allExercises } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import {
  unilateralImbalances,
  tutSummary,
  readinessAndBlockSummary,
  suggestPainSafeSwaps,
} from '../lib/training-intelligence.js'
import { SelectRow } from './ui.jsx'

const AVOID_OPTIONS = [
  { value: 'lower-back', label: 'Lower back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'knees', label: 'Knees' },
  { value: 'chest', label: 'Chest' },
  { value: 'forearms', label: 'Forearms' },
]

export default function AnalyticsIntelligence({ S }) {
  const workouts = S?.workouts || []
  const unit = S?.unit || 'kg'
  const allEx = useMemo(() => allExercises(S), [S])
  const [avoid, setAvoid] = useState('lower-back')
  const recentIds = useMemo(() => {
    const ids = new Set()
    for (const w of workouts.slice(-12)) for (const e of w.entries || []) if (e.id && EXIDX[e.id]) ids.add(e.id)
    if (!ids.size) for (const ex of allEx.slice(0, 12)) if (ex?.id) ids.add(ex.id)
    return [...ids]
  }, [workouts, allEx])
  const [swapEx, setSwapEx] = useState(() => recentIds[0] || '')

  const block = useMemo(() => readinessAndBlockSummary(S), [S])
  const imbalances = useMemo(() => unilateralImbalances(workouts), [workouts])
  const tut = useMemo(() => tutSummary(workouts), [workouts])
  const swaps = useMemo(
    () => (swapEx ? suggestPainSafeSwaps(swapEx, [avoid], allEx, 4) : []),
    [swapEx, avoid, allEx]
  )

  const statusText = !workouts.length
    ? t('Log your first workout to track load, readiness, and Left/Right balance.')
    : block.status === 'overload'
    ? t('Acute load spike — consider a lighter session')
    : block.status === 'deload'
    ? t('Deload / lighter week')
    : block.status === 'fatigued'
    ? t('Low readiness across recent sessions')
    : t('Load and readiness look steady')

  return <div className="card" data-testid="analytics-intelligence">
    <h2>{t('Training intelligence')}</h2>

    <div className="small dim" style={{ marginBottom: 10 }}>
      {statusText}
      {block.acwr != null ? ` · ACWR ${fmtNum(block.acwr)}` : ''}
      {block.avgReadiness != null ? ` · ${t('Readiness')} ${fmtNum(block.avgReadiness)}%` : ''}
    </div>

    {block.highReadinessAvgVol != null && block.lowReadinessAvgVol != null && (
      <div className="small" style={{ marginBottom: 10 }}>
        {t('High readiness avg')}: <b>{fmtNum(block.highReadinessAvgVol)} {unit}</b> · {t('Low readiness avg')}: <b>{fmtNum(block.lowReadinessAvgVol)} {unit}</b>
      </div>
    )}

    {imbalances.length > 0 && <div style={{ marginTop: 10 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{t('Left vs. Right balance')}</div>
      {imbalances.slice(0, 4).map(im => {
        const ex = EXIDX[im.id]
        const name = ex ? exerciseNameFor(ex) : (im.name || im.id)
        return <div key={im.id} className="row between small" style={{ padding: '4px 0' }}>
          <span>{name}</span>
          <span className={im.flagged ? 'gold' : 'dim'}>
            L {fmtNum(im.leftVol)} / R {fmtNum(im.rightVol)} {unit} ({im.diffPct}%)
          </span>
        </div>
      })}
    </div>}

    {tut.totalSec > 0 && <div style={{ marginTop: 10 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
        {t('Time under tension')}: {fmtDur(tut.totalSec * 1000)}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {tut.muscles.slice(0, 4).map(m => (
          <span key={m.slug} className="pill small">{t(MUSCLE_NAME[m.slug] || m.name)}: {fmtNum(m.sec)}s</span>
        ))}
      </div>
    </div>}

    {recentIds.length > 0 && <div style={{ marginTop: 12 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{t('Pain-safe swap finder')}</div>
      <SelectRow
        title={t('Exercise')}
        value={swapEx || recentIds[0]}
        onChange={setSwapEx}
        options={recentIds.map(id => ({ value: id, label: exerciseNameFor(EXIDX[id]) }))}
      />
      <SelectRow
        title={t('Avoid')}
        value={avoid}
        onChange={setAvoid}
        options={AVOID_OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))}
      />
      {swaps.length > 0 && <div className="small dim" style={{ marginTop: 6 }}>
        {t('Alternatives')}: {swaps.map(s => exerciseNameFor(s)).join(' · ')}
      </div>}
    </div>}
  </div>
}
