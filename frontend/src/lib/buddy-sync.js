// Client helper for live "Gym Buddy" co-op sessions (/api/buddy/*).
import { api } from './api.js'

export const createBuddyRoom = () => api('POST', '/api/buddy/create', {})
export const joinBuddyRoom = code => api('POST', '/api/buddy/join', { code })
export const fetchBuddyRoom = code => api('GET', `/api/buddy/state?code=${encodeURIComponent(code)}`)
export const updateBuddyStatus = (code, patch) => api('POST', '/api/buddy/update', { code, ...patch })
export const leaveBuddyRoom = code => api('POST', '/api/buddy/leave', { code })
