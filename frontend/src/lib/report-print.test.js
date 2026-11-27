import { describe, it, expect } from 'vitest'
import { reportPrintHTML, workoutPrintHTML, reportExerciseIds } from './report-print.js'
import { PLACEHOLDER_PICTURE, MEDIA_CREDIT } from './print-pictures.js'
import { EXIDX } from './exercises.js'

const sampleExId = Object.keys(EXIDX)[0]

const sampleState = {
  unit: 'kg',
  workouts: [
    {
      id: 'w1',
      name: 'Push Day',
      d: '2026-11-25',
      start: 1732520000000,
      end: 1732523600000,
      prs: [sampleExId],
      entries: [
        { id: sampleExId, sets: [{ done: true, w: 80, r: 8 }] },
      ],
    },
  ],
  bodyweight: [],
}

describe('report-print with exercise pictures', () => {
  it('renders exercise thumbnails in analytics report and single workout PDF', () => {
    const pictures = { [sampleExId]: PLACEHOLDER_PICTURE }
    const reportHtml = reportPrintHTML(sampleState, { range: '4w', today: '2026-11-27', pictures })
    expect(reportHtml).toContain('<img class="ex-pic')
    expect(reportHtml).toContain(MEDIA_CREDIT)

    const workoutHtml = workoutPrintHTML(sampleState, sampleState.workouts[0], { pictures })
    expect(workoutHtml).toContain('<img class="ex-pic')
    expect(workoutHtml).toContain(MEDIA_CREDIT)
  })

  it('ignores non-data URLs and collects report exercise IDs', () => {
    const ids = reportExerciseIds(sampleState, { range: '4w', today: '2026-11-27' })
    expect(ids).toContain(sampleExId)

    const html = reportPrintHTML(sampleState, {
      range: '4w',
      today: '2026-11-27',
      pictures: { [sampleExId]: 'https://evil.example/img.png' },
    })
    expect(html).not.toContain('<img class="ex-pic')
  })
})
