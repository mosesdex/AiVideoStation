import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaste, scoreItem, personalizeProgramme, explain } from './station-taste.mjs';

const ITEMS = {
  psy:  { id: 'psy',  title: 'Gangnam Style', block: 'Music Break', slot: 253, smart: true,  tags: ['music', 'pop', 'dance'] },
  rick: { id: 'rick', title: 'Never Gonna',   block: 'Music Break', slot: 213, smart: true,  tags: ['music', 'pop', 'retro'] },
  bbb:  { id: 'bbb',  title: 'Big Buck Bunny', block: 'Evening',    slot: 596, smart: false, tags: ['animation', 'comedy'] },
  zoo:  { id: 'zoo',  title: 'Me at the Zoo',  block: 'Ident',      slot: 19,  smart: false, tags: ['archive'] },
};

test('love boosts the item and its tags', () => {
  const t = buildTaste([{ action: 'love', item: 'rick' }], ITEMS);
  assert.ok(t.items.rick > 0);
  assert.ok(t.tags.retro > 0);
  assert.ok(t.tags.music > 0);
});

test('skip penalizes the item and its tags', () => {
  const t = buildTaste([{ action: 'skip', item: 'zoo' }], ITEMS);
  assert.ok(t.items.zoo < 0);
  assert.ok(t.tags.archive < 0);
});

test('unlove cancels a prior love', () => {
  const t = buildTaste([
    { action: 'love', item: 'rick' },
    { action: 'unlove', item: 'rick' },
  ], ITEMS);
  assert.equal(t.items.rick || 0, 0);
  assert.equal(t.tags.retro || 0, 0);
});

test('finish counts equally for long and short items when watched through (duration-bias correction)', () => {
  // a finished 596s feature and a finished 19s ident contribute the same weight
  const t = buildTaste([
    { action: 'finish', item: 'bbb', ratio: 0.95 },
    { action: 'finish', item: 'zoo', ratio: 0.95 },
  ], ITEMS);
  assert.equal(t.items.bbb, t.items.zoo);
  assert.ok(t.items.bbb > 0);
});

test('a barely-watched finish is ignored', () => {
  const t = buildTaste([{ action: 'finish', item: 'bbb', ratio: 0.1 }], ITEMS);
  assert.equal(t.items.bbb || 0, 0);
});

test('scoreItem ranks an item with loved tags above a neutral one', () => {
  const t = buildTaste([{ action: 'love', item: 'rick' }], ITEMS);
  // psy shares music+pop with loved rick; zoo shares nothing
  assert.ok(scoreItem(t, ITEMS.psy) > scoreItem(t, ITEMS.zoo));
});

test('personalizeProgramme reorders a smart run by taste and leaves the rest in place', () => {
  const prog = [ITEMS.bbb, ITEMS.zoo, ITEMS.psy, ITEMS.rick];
  const t = buildTaste([{ action: 'love', item: 'rick' }], ITEMS);
  const out = personalizeProgramme(prog, t);
  assert.deepEqual(out.map(i => i.id), ['bbb', 'zoo', 'rick', 'psy']);
});

test('personalizeProgramme keeps the original order with no taste signals', () => {
  const prog = [ITEMS.bbb, ITEMS.zoo, ITEMS.psy, ITEMS.rick];
  const out = personalizeProgramme(prog, buildTaste([], ITEMS));
  assert.deepEqual(out.map(i => i.id), ['bbb', 'zoo', 'psy', 'rick']);
});

test('a non-smart item between smart items splits the reorderable run', () => {
  const a = { ...ITEMS.psy, id: 'a' };
  const b = { ...ITEMS.rick, id: 'b' };
  const wall = { ...ITEMS.bbb, id: 'wall' };
  const prog = [a, wall, b];
  const t = buildTaste([{ action: 'love', item: 'b' }], { a, b, wall });
  const out = personalizeProgramme(prog, t);
  assert.deepEqual(out.map(i => i.id), ['a', 'wall', 'b']); // b cannot jump the wall
});

test('explain names a direct love and a tag affinity', () => {
  const t = buildTaste([{ action: 'love', item: 'rick' }], ITEMS);
  const direct = explain(t, ITEMS.rick).join(' ');
  assert.match(direct, /loved/i);
  const viaTag = explain(t, ITEMS.psy).join(' ');
  assert.match(viaTag, /music|pop/i);
});

test('explain falls back to the owner-programmed message with no signals', () => {
  const t = buildTaste([], ITEMS);
  assert.match(explain(t, ITEMS.bbb).join(' '), /programmed/i);
});

test('seed tags boost matching tags and are recorded as seeds', () => {
  const t = buildTaste([], ITEMS, ['retro', 'music']);
  assert.ok(t.tags.retro > 0);
  assert.ok(t.tags.music > 0);
  assert.ok(t.seeds.has('retro'));
});

test('seeded taste reorders scoring in favor of matching items', () => {
  const t = buildTaste([], ITEMS, ['retro']);
  assert.ok(scoreItem(t, ITEMS.rick) > scoreItem(t, ITEMS.psy));
});

test('real signals outweigh a seed pointing the other way', () => {
  // seeded retro, but the viewer then loved psy (dance) and skipped rick (retro)
  const t = buildTaste([
    { action: 'love', item: 'psy' },
    { action: 'skip', item: 'rick' },
  ], ITEMS, ['retro']);
  assert.ok(scoreItem(t, ITEMS.psy) > scoreItem(t, ITEMS.rick));
});

test('explain says "you said you enjoy" for a purely seeded tag', () => {
  const t = buildTaste([], ITEMS, ['retro']);
  assert.match(explain(t, ITEMS.rick).join(' '), /you said you enjoy retro/i);
});

test('explain switches to watch-history phrasing once real signals back the tag', () => {
  const t = buildTaste([{ action: 'love', item: 'rick' }], ITEMS, ['retro']);
  assert.match(explain(t, ITEMS.psy).join(' '), /you watch a lot of/i);
});
