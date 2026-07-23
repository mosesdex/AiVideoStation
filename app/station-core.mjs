/* Station One — pure schedule engine (tested in station-core.test.mjs) */

/* Live-news windows are real time-of-day slots (minutes since local
   midnight) that override the loop with a live channel. A window whose
   start > end wraps past midnight. First match wins. */
export function activeNewsWindow(mins, windows) {
  for (const w of windows) {
    const inside = w.start <= w.end
      ? (mins >= w.start && mins < w.end)
      : (mins >= w.start || mins < w.end);
    if (inside) return w;
  }
  return null;
}

export function mapNewsRow(row) {
  return {
    label: row.label,
    start: Number(row.start_min),
    end: Number(row.end_min),
    channel: row.channel_id,
    source: row.source_name,
  };
}

/* Rough data-used estimate: no exact byte count is available for a
   cross-origin YouTube embed, so we approximate from watch time and a
   labeled per-second rate. Honest ballpark, shown to the viewer as "~". */
export function estimateMB(seconds, mbPerSec) {
  return Math.max(0, Math.round(seconds * mbPerSec * 10) / 10);
}

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
    tags: row.tags || [],
    smart: !!row.smart,
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
