/* Station One — Supabase REST wrapper (no SDK, zero dependencies) */

const BASE = 'https://nmkjllosxsukurmffaix.supabase.co';
const KEY = 'sb_publishable_-H0BBgD0U04NpugyPzIc6w_gttpmRpq';

const HEADERS = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  'Content-Type': 'application/json',
};

async function rpc(name, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status}`);
  return res.json();
}

export function fetchStation() {
  return rpc('get_station');
}

export async function fetchProgramme() {
  const res = await fetch(
    `${BASE}/rest/v1/programme_items?select=id,position,type,video_id,src,title,block,slot,thumb,tags,smart&active=eq.true&order=position.asc`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error('programme fetch failed: ' + res.status);
  return res.json();
}

export function postSignal(signal) {
  // fire-and-forget; the viewer experience never blocks on telemetry
  return fetch(`${BASE}/rest/v1/signals`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(signal),
  }).catch(() => {});
}

export function verifyOwnerKey(key) {
  return rpc('verify_owner_key', { p_key: key });
}

export function saveProgramme(key, items) {
  return rpc('save_programme', { p_key: key, p_items: items });
}
