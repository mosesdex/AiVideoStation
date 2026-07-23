// Station One — Supabase REST wrapper for React Native (same backend as web)
const BASE = 'https://nmkjllosxsukurmffaix.supabase.co';
const KEY = 'sb_publishable_-H0BBgD0U04NpugyPzIc6w_gttpmRpq';
const HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function rpc(name, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.json();
}

export function fetchStation() { return rpc('get_station'); }

export async function fetchProgramme() {
  const res = await fetch(
    `${BASE}/rest/v1/programme_items?select=id,position,type,video_id,src,title,block,slot,thumb,tags,smart&active=eq.true&order=position.asc`,
    { headers: HEADERS });
  if (!res.ok) throw new Error('programme ' + res.status);
  return res.json();
}

export async function fetchNewsWindows() {
  const res = await fetch(
    `${BASE}/rest/v1/news_windows?select=label,start_min,end_min,channel_id,source_name&active=eq.true&order=sort.asc`,
    { headers: HEADERS });
  if (!res.ok) throw new Error('news ' + res.status);
  return res.json();
}

export function postSignal(signal) {
  return fetch(`${BASE}/rest/v1/signals`, {
    method: 'POST', headers: { ...HEADERS, Prefer: 'return=minimal' }, body: JSON.stringify(signal),
  }).catch(() => {});
}

export function heartbeat(session) { return rpc('heartbeat', { p_session: session }).catch(() => {}); }
export function getWatching() { return rpc('get_watching'); }
