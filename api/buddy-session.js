/* Live "Gym Buddy" co-op session store (in-memory, auto-expiring).
 * Allows signed-in users on the same server to share a short-lived room code
 * and see each other's active exercise, completed sets, and rest countdown. */
import crypto from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 4 * 60 * 60 * 1000;
const MAX_MEMBERS = 4;

const cleanStr = (v, n = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n) : '');

export function createBuddyStore({ now = Date.now, ttlMs = TTL_MS } = {}) {
  const rooms = new Map();

  const prune = () => {
    const t = now();
    for (const [code, room] of rooms) {
      if (t - room.updatedAt > ttlMs || room.members.size === 0) rooms.delete(code);
    }
  };

  const genCode = () => {
    for (let i = 0; i < 16; i++) {
      let c = '';
      const bytes = crypto.randomBytes(6);
      for (let j = 0; j < 6; j++) c += CODE_CHARS[bytes[j] % CODE_CHARS.length];
      if (!rooms.has(c)) return c;
    }
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  };

  const snapshot = room => ({
    code: room.code,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    members: [...room.members.values()].map(m => ({
      id: m.id,
      name: m.name,
      exercise: m.exercise,
      doneSets: m.doneSets,
      totalSets: m.totalSets,
      restUntil: m.restUntil,
      updatedAt: m.updatedAt,
    })),
  });

  return {
    create(user) {
      prune();
      const code = genCode();
      const t = now();
      const room = {
        code,
        createdAt: t,
        updatedAt: t,
        members: new Map([[user.id, {
          id: user.id,
          name: cleanStr(user.name, 40) || 'Lifter',
          exercise: '',
          doneSets: 0,
          totalSets: 0,
          restUntil: 0,
          updatedAt: t,
        }]]),
      };
      rooms.set(code, room);
      return snapshot(room);
    },

    join(code, user) {
      prune();
      const key = cleanStr(code, 12).toUpperCase();
      const room = rooms.get(key);
      if (!room) return { error: 'room-not-found', status: 404 };
      if (!room.members.has(user.id) && room.members.size >= MAX_MEMBERS) {
        return { error: 'room-full', status: 409 };
      }
      const t = now();
      if (!room.members.has(user.id)) {
        room.members.set(user.id, {
          id: user.id,
          name: cleanStr(user.name, 40) || 'Lifter',
          exercise: '',
          doneSets: 0,
          totalSets: 0,
          restUntil: 0,
          updatedAt: t,
        });
      }
      room.updatedAt = t;
      return { room: snapshot(room) };
    },

    update(code, userId, patch = {}) {
      prune();
      const key = cleanStr(code, 12).toUpperCase();
      const room = rooms.get(key);
      if (!room) return { error: 'room-not-found', status: 404 };
      const m = room.members.get(userId);
      if (!m) return { error: 'not-in-room', status: 403 };
      const t = now();
      if ('exercise' in patch) m.exercise = cleanStr(patch.exercise, 80);
      if (Number.isFinite(+patch.doneSets)) m.doneSets = Math.max(0, Math.min(200, Math.round(+patch.doneSets)));
      if (Number.isFinite(+patch.totalSets)) m.totalSets = Math.max(0, Math.min(200, Math.round(+patch.totalSets)));
      if (Number.isFinite(+patch.restUntil)) m.restUntil = Math.max(0, Math.round(+patch.restUntil));
      m.updatedAt = t;
      room.updatedAt = t;
      return { room: snapshot(room) };
    },

    get(code, userId) {
      prune();
      const key = cleanStr(code, 12).toUpperCase();
      const room = rooms.get(key);
      if (!room) return { error: 'room-not-found', status: 404 };
      if (!room.members.has(userId)) return { error: 'not-in-room', status: 403 };
      return { room: snapshot(room) };
    },

    leave(code, userId) {
      const key = cleanStr(code, 12).toUpperCase();
      const room = rooms.get(key);
      if (!room) return { ok: true };
      room.members.delete(userId);
      room.updatedAt = now();
      if (room.members.size === 0) rooms.delete(key);
      return { ok: true };
    },
  };
}
