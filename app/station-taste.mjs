/* Station One — taste engine (tested in station-taste.test.mjs)

   Design constraints (see DESIGN.md + research):
   - Learns ONLY from viewer signals + owner-authored tags/blocks: no
     platform metadata is retained, so the model survives the YouTube
     30-day data purge by construction.
   - Duration-bias corrected: watch-through counts by completion ratio,
     never raw seconds, so short items get no structural advantage.
   - Personalization reorders owner-defined smart runs only; the owner's
     programme structure is never replaced. */

const W_LOVE = 3;
const W_SKIP = -2;
const W_FINISH = 1;
const FINISH_MIN_RATIO = 0.7;

export function buildTaste(events, itemsById) {
  const taste = { items: {}, tags: {}, blocks: {} };
  const add = (bag, key, w) => { if (key) bag[key] = (bag[key] || 0) + w; };
  for (const ev of events) {
    const item = itemsById[ev.item];
    if (!item) continue;
    let w = 0;
    if (ev.action === 'love') w = W_LOVE;
    else if (ev.action === 'unlove') w = -W_LOVE;
    else if (ev.action === 'skip') w = W_SKIP;
    else if (ev.action === 'finish') w = (ev.ratio ?? 0) >= FINISH_MIN_RATIO ? W_FINISH : 0;
    if (!w) continue;
    add(taste.items, item.id, w);
    add(taste.blocks, item.block, w);
    for (const tag of item.tags || []) add(taste.tags, tag, w);
  }
  return taste;
}

export function scoreItem(taste, item) {
  let s = 2 * (taste.items[item.id] || 0) + 0.5 * (taste.blocks[item.block] || 0);
  for (const tag of item.tags || []) s += taste.tags[tag] || 0;
  return s;
}

/* Reorder each maximal run of consecutive smart items sharing a block.
   Sort is stable: equal scores keep the owner's order. */
export function personalizeProgramme(programme, taste) {
  const out = programme.slice();
  let i = 0;
  while (i < out.length) {
    if (!out[i].smart) { i++; continue; }
    let j = i + 1;
    while (j < out.length && out[j].smart && out[j].block === out[i].block) j++;
    if (j - i > 1) {
      const run = out.slice(i, j)
        .map((item, k) => ({ item, k, score: scoreItem(taste, item) }))
        .sort((a, b) => b.score - a.score || a.k - b.k)
        .map(r => r.item);
      out.splice(i, j - i, ...run);
    }
    i = j;
  }
  return out;
}

export function explain(taste, item) {
  const reasons = [];
  const own = taste.items[item.id] || 0;
  if (own > 0) reasons.push('You loved this one before.');
  else if (own < 0) reasons.push('You skipped this before — the schedule is giving it another spin.');

  const tagScores = (item.tags || [])
    .map(tag => ({ tag, score: taste.tags[tag] || 0 }))
    .filter(t => t.score !== 0)
    .sort((a, b) => b.score - a.score);
  if (tagScores.length && tagScores[0].score > 0) {
    reasons.push(`You watch a lot of ${tagScores[0].tag}.`);
  } else if (tagScores.length && tagScores[tagScores.length - 1].score < 0) {
    reasons.push(`You usually pass on ${tagScores[tagScores.length - 1].tag}.`);
  }

  if (!reasons.length) reasons.push('Programmed by the station for this block.');
  return reasons;
}
