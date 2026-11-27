import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuddyStore } from '../buddy-session.js';

test('buddy session lifecycle: create, join, update, get, leave', () => {
  let t = 1000;
  const store = createBuddyStore({ now: () => t, ttlMs: 60_000 });

  const room = store.create({ id: 'u1', name: 'Alice' });
  assert.equal(room.code.length, 6);
  assert.equal(room.members.length, 1);

  const joined = store.join(room.code, { id: 'u2', name: 'Bob' });
  assert.equal(joined.room.members.length, 2);

  t += 1000;
  const updated = store.update(room.code, 'u2', { exercise: 'Bench Press', doneSets: 3, totalSets: 4 });
  assert.equal(updated.room.members.find(m => m.id === 'u2').exercise, 'Bench Press');
  assert.equal(updated.room.members.find(m => m.id === 'u2').doneSets, 3);

  const forbidden = store.get(room.code, 'u3');
  assert.equal(forbidden.status, 403);

  store.leave(room.code, 'u1');
  store.leave(room.code, 'u2');
  const gone = store.get(room.code, 'u1');
  assert.equal(gone.status, 404);
});
