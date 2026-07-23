import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalSeconds, locate, livePosition, resolveAdvance, slotStartDelta } from './station-core.mjs';

const P = [
  { id: 'a', slot: 100 },
  { id: 'b', slot: 50 },
  { id: 'c', slot: 200 },
];

test('totalSeconds sums all slot lengths', () => {
  assert.equal(totalSeconds(P), 350);
});

test('locate finds the first item at position zero', () => {
  assert.deepEqual(locate(P, 0), { index: 0, offset: 0 });
});

test('locate finds an item mid-slot with its offset', () => {
  assert.deepEqual(locate(P, 120), { index: 1, offset: 20 });
});

test('locate lands on a boundary at the start of the next item', () => {
  assert.deepEqual(locate(P, 150), { index: 2, offset: 0 });
});

test('livePosition wraps the wall clock around the loop', () => {
  const anchor = 1000_000; // ms
  const now = anchor + 351 * 1000; // one loop + 1s
  assert.equal(livePosition(anchor, now, 350, 0), 1);
});

test('livePosition applies local drift offset', () => {
  const anchor = 0;
  const now = 10 * 1000;
  assert.equal(livePosition(anchor, now, 350, 5), 15);
});

test('livePosition never returns a negative position', () => {
  const anchor = 20 * 1000; // anchor in the future relative to now
  const now = 0;
  const pos = livePosition(anchor, now, 350, 0);
  assert.ok(pos >= 0 && pos < 350, `expected 0<=pos<350, got ${pos}`);
});

test('resolveAdvance moves to the next item when media ends early in its slot', () => {
  // wall clock still inside item 0 (pos 60), item 0's media ended
  const r = resolveAdvance(P, 0, 60);
  assert.equal(r.nextIndex, 1);
  assert.equal(r.drift, 40); // pulls schedule forward by the unplayed remainder
});

test('resolveAdvance follows the wall clock when it already moved past the item', () => {
  // media of item 0 ended but wall clock is already inside item 2
  const r = resolveAdvance(P, 0, 200);
  assert.equal(r.nextIndex, 2);
  assert.equal(r.drift, 0);
});

test('resolveAdvance wraps from the last item to the first', () => {
  const r = resolveAdvance(P, 2, 300);
  assert.equal(r.nextIndex, 0);
  assert.equal(r.drift, 50);
});

test('slotStartDelta is negative-or-zero for the current slot and positive for later ones', () => {
  // pos 120 = inside item 1 (which started at 100)
  assert.equal(slotStartDelta(P, 120, 1), -20); // current slot started 20s ago
  assert.equal(slotStartDelta(P, 120, 2), 30);  // next slot starts in 30s
  assert.equal(slotStartDelta(P, 120, 3), 230); // wraps: first item again after c
});

test('mapRow converts a DB programme row into a player item', async () => {
  const { mapRow } = await import('./station-core.mjs');
  assert.deepEqual(
    mapRow({ id: 'u1', position: 2, type: 'youtube', video_id: 'abc123', src: null,
             title: 'T', block: 'B', slot: 60, thumb: 'thumb-b', active: true }),
    { id: 'u1', type: 'youtube', videoId: 'abc123', src: null, title: 'T',
      block: 'B', slot: 60, thumb: 'thumb-b', tags: [], smart: false }
  );
});

test('mapRow defaults a missing thumb and coerces slot to a number', async () => {
  const { mapRow } = await import('./station-core.mjs');
  const item = mapRow({ id: 'u2', type: 'station', video_id: null, src: 'x.mp4',
                        title: 'S', block: 'B', slot: '90', thumb: null });
  assert.equal(item.slot, 90);
  assert.equal(item.thumb, 'thumb-a');
});

test('mapRow carries tags and smart through, defaulting when absent', async () => {
  const { mapRow } = await import('./station-core.mjs');
  const full = mapRow({ id: 'u3', type: 'youtube', video_id: 'x', src: null, title: 'T',
                        block: 'B', slot: 60, thumb: 'thumb-a', tags: ['music'], smart: true });
  assert.deepEqual(full.tags, ['music']);
  assert.equal(full.smart, true);
  const bare = mapRow({ id: 'u4', type: 'station', video_id: null, src: 'x.mp4',
                        title: 'S', block: 'B', slot: 60, thumb: null });
  assert.deepEqual(bare.tags, []);
  assert.equal(bare.smart, false);
});

test('estimateMB scales watched seconds by the per-second rate', async () => {
  const { estimateMB } = await import('./station-core.mjs');
  assert.equal(estimateMB(0, 0.5), 0);
  assert.equal(estimateMB(120, 0.5), 60);   // 2 min at 0.5 MB/s = 60 MB
  assert.equal(estimateMB(10, 0.5), 5);
});

test('estimateMB rounds to one decimal and never goes negative', async () => {
  const { estimateMB } = await import('./station-core.mjs');
  assert.equal(estimateMB(7, 0.5), 3.5);
  assert.equal(estimateMB(-100, 0.5), 0);
});
