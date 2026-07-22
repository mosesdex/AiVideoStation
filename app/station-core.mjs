/* Station One — pure schedule engine (tested in station-core.test.mjs) */

export function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    videoId: row.video_id,
    src: row.src,
    title: row.title,
    block: row.block,
    slot: Number(row.slot),
    thumb: row.thumb || 'thumb-a',
  };
}

export function totalSeconds(programme) {
  return programme.reduce((sum, item) => sum + item.slot, 0);
}

export function locate(programme, pos) {
  let acc = 0;
  for (let i = 0; i < programme.length; i++) {
    if (pos < acc + programme[i].slot) return { index: i, offset: pos - acc };
    acc += programme[i].slot;
  }
  return { index: 0, offset: 0 };
}

export function livePosition(anchorMs, nowMs, total, localOffset) {
  const elapsed = (nowMs - anchorMs) / 1000 + localOffset;
  return ((elapsed % total) + total) % total;
}

/* Media for programme[currentIndex] ended at wall position `pos`.
   Decide what plays next and how far the local schedule pulls forward. */
export function resolveAdvance(programme, currentIndex, pos) {
  const { index, offset } = locate(programme, pos);
  if (index === currentIndex) {
    return {
      nextIndex: (currentIndex + 1) % programme.length,
      drift: programme[currentIndex].slot - offset,
    };
  }
  return { nextIndex: index, drift: 0 };
}

/* Seconds from `pos` until the start of slot index k (k may exceed the
   programme length to mean "after wrapping"). Negative = already started. */
export function slotStartDelta(programme, pos, k) {
  const loops = Math.floor(k / programme.length);
  let acc = loops * totalSeconds(programme);
  for (let i = 0; i < k % programme.length; i++) acc += programme[i].slot;
  return acc - pos;
}
