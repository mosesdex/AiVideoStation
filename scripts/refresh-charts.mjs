#!/usr/bin/env node
/* Station One — weekly chart-music refresh.
   Re-validates the curated pool (drops dead videos), rotates a fresh
   NG/US/UK selection deterministically by ISO week, swaps them into the
   station's music slots, and republishes via save_programme.

   Env: STATION_KEY (owner key). Flags: --dry-run (print, don't save).
   Run by .github/workflows/refresh-charts.yml or locally. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://nmkjllosxsukurmffaix.supabase.co';
const KEY = 'sb_publishable_-H0BBgD0U04NpugyPzIc6w_gttpmRpq';
const HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const REGIONS = {
  'nigeria-top': { pick: 4, block: 'Breakfast Drive', extraTags: ['afrobeats'] },
  'us-top':      { pick: 3, block: 'Late Afternoon',  extraTags: ['pop'] },
  'uk-top':      { pick: 3, block: 'Midnight',        extraTags: ['pop'] },
};
const CHART_TAGS = Object.keys(REGIONS);
const DRY = process.argv.includes('--dry-run');
const __dir = dirname(fileURLToPath(import.meta.url));

const isChartItem = it => (it.tags || []).some(t => CHART_TAGS.includes(t));

// ISO week number → deterministic weekly rotation
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}
// rotate array so week N starts at a shifted offset (stable order, fresh window)
function rotate(arr, n) { const k = ((n % arr.length) + arr.length) % arr.length; return arr.slice(k).concat(arr.slice(0, k)); }

async function isEmbeddable(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    return r.status === 200;
  } catch { return false; }
}

async function fetchProgramme() {
  const r = await fetch(`${BASE}/rest/v1/programme_items?select=id,position,type,video_id,src,title,block,slot,thumb,tags,smart&active=eq.true&order=position.asc`, { headers: HEADERS });
  if (!r.ok) throw new Error('programme fetch ' + r.status);
  return r.json();
}

async function main() {
  const key = process.env.STATION_KEY;
  if (!key && !DRY) { console.error('STATION_KEY env required (or use --dry-run)'); process.exit(1); }

  const pool = JSON.parse(await readFile(join(__dir, 'chart-pool.json'), 'utf8'));
  const week = isoWeek();
  const THUMBS = ['thumb-a', 'thumb-b', 'thumb-c', 'thumb-d', 'thumb-e'];

  // build fresh chart items, validating each pick
  const chartItems = [];
  let ti = 0;
  for (const [region, cfg] of Object.entries(REGIONS)) {
    const rotated = rotate(pool[region] || [], week);
    let taken = 0;
    for (const song of rotated) {
      if (taken >= cfg.pick) break;
      if (!(await isEmbeddable(song.videoId))) { console.log(`  drop dead: ${region} ${song.videoId} ${song.title}`); continue; }
      chartItems.push({
        type: 'youtube', video_id: song.videoId, src: null, title: song.title,
        block: cfg.block, slot: 240, thumb: THUMBS[ti % THUMBS.length],
        tags: ['music', ...cfg.extraTags, region], smart: true,
      });
      taken++; ti++;
    }
    console.log(`  ${region}: ${taken}/${cfg.pick} fresh (week ${week})`);
  }
  if (!chartItems.length) { console.error('no valid chart items — aborting, leaving programme untouched'); process.exit(1); }

  // rebuild: keep every non-chart item in order, then append the fresh chart music
  const current = await fetchProgramme();
  const kept = current.filter(it => !isChartItem(it)).map(it => ({
    type: it.type, video_id: it.video_id, src: it.src, title: it.title,
    block: it.block, slot: it.slot, thumb: it.thumb, tags: it.tags || [], smart: !!it.smart,
  }));
  const next = kept.concat(chartItems);

  console.log(`\nprogramme: ${current.length} → ${next.length} (${kept.length} kept + ${chartItems.length} chart)`);
  if (DRY) { console.log('DRY RUN — not saving.'); chartItems.forEach(i => console.log('  +', i.block, '·', i.title)); return; }

  const r = await fetch(`${BASE}/rest/v1/rpc/save_programme`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ p_key: key, p_items: next }),
  });
  if (!r.ok) { console.error('save failed', r.status, await r.text()); process.exit(1); }
  console.log('published:', await r.json(), 'items. Chart music refreshed.');
}

main().catch(e => { console.error(e); process.exit(1); });
