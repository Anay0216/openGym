import { useEffect, useState } from 'react'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import {
  createBuddyRoom,
  joinBuddyRoom,
  fetchBuddyRoom,
  updateBuddyStatus,
  leaveBuddyRoom,
} from '../lib/buddy-sync.js'
import { Button, TextField } from './ui.jsx'

export default function BuddyPanel({ exercise = '', doneSets = 0, totalSets = 0, restUntil = 0 }) {
  const toast = useUI(s => s.toast)
  const [room, setRoom] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!room?.code) return
    const sync = () => {
      updateBuddyStatus(room.code, { exercise, doneSets, totalSets, restUntil })
        .then(r => { if (r?.room) setRoom(r.room) })
        .catch(() => {})
    }
    sync()
    const iv = setInterval(() => {
      fetchBuddyRoom(room.code).then(r => { if (r?.room) setRoom(r.room) }).catch(() => {})
    }, 5000)
    return () => clearInterval(iv)
  }, [room?.code, exercise, doneSets, totalSets, restUntil])

  const onCreate = () => {
    setBusy(true)
    createBuddyRoom()
      .then(r => setRoom(r.room || r))
      .catch(e => toast(e?.message || t('Could not start buddy session')))
      .finally(() => setBusy(false))
  }

  const onJoin = () => {
    if (!joinCode.trim()) return
    setBusy(true)
    joinBuddyRoom(joinCode.trim().toUpperCase())
      .then(r => setRoom(r.room || r))
      .catch(e => toast(e?.message || t('Room not found')))
      .finally(() => setBusy(false))
  }

  const onLeave = () => {
    const code = room?.code
    setRoom(null)
    if (code) leaveBuddyRoom(code).catch(() => {})
  }

  if (!room) {
    return <div className="card" data-testid="buddy-panel">
      <h3>{t('Gym buddy session')}</h3>
      <div className="small dim" style={{ marginBottom: 8 }}>
        {t('Train together live with a room code on your server.')}
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant="primary" disabled={busy} onClick={onCreate}>{t('Start room')}</Button>
        <TextField value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder={t('Room code')} aria-label={t('Room code')} style={{ maxWidth: 120 }} />
        <Button size="sm" disabled={busy || !joinCode.trim()} onClick={onJoin}>{t('Join')}</Button>
      </div>
    </div>
  }

  return <div className="card" data-testid="buddy-panel">
    <div className="row between" style={{ marginBottom: 8 }}>
      <h3 style={{ margin: 0 }}>{t('Buddy room')}: <code>{room.code}</code></h3>
      <Button size="xs" variant="plain" onClick={onLeave}>{t('Leave')}</Button>
    </div>
    {(room.members || []).map(m => (
      <div key={m.id} className="row between small" style={{ padding: '4px 0' }}>
        <span><b>{m.name}</b>{m.exercise ? ` · ${m.exercise}` : ''}</span>
        <span className="dim">{m.totalSets > 0 ? `${m.doneSets}/${m.totalSets}` : `${m.doneSets} sets`}</span>
      </div>
    ))}
  </div>
}
