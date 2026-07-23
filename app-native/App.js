import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Dimensions, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import YoutubePlayer from 'react-native-youtube-iframe';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { C } from './src/theme';
import {
  totalSeconds, locate, livePosition as corePos, resolveAdvance,
  mapRow, mapNewsRow, activeNewsWindow, estimateMB,
} from './src/core';
import { buildTaste, personalizeProgramme, explain } from './src/taste';
import * as api from './src/api';

const MB_PER_SEC = 0.5;
const BREAK_MS = 2000;

// ---------- persistent signals (AsyncStorage) ----------
const store = {
  async get(k, d) { try { const v = await AsyncStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  async set(k, v) { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const fmtMin = s => Math.max(1, Math.round(s / 60)) + ' min';

export default function App() {
  const [view, setView] = useState('tunein');     // 'tunein' | 'player'
  const [ready, setReady] = useState(false);
  const [tunein, setTunein] = useState({ title: '…', badge: 'YouTube', sub: '' });
  const [chips, setChips] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);

  const [player, setPlayer] = useState(null);       // {type, videoId|src|channel, startAt}
  const [meta, setMeta] = useState({ block: '', title: '', badge: 'YouTube', time: '', live: false });
  const [guide, setGuide] = useState([]);
  const [transport, setTransport] = useState({ inNews: false, offLive: false });
  const [watching, setWatching] = useState('—');
  const [dataTxt, setDataTxt] = useState('~0 MB');
  const [loved, setLoved] = useState(false);
  const [why, setWhy] = useState(null);
  const [toast, setToast] = useState('');

  // engine refs (mutable, closure-safe)
  const R = useRef({
    RAW: [], PROG: [], NEWS: [], anchor: Date.UTC(2026, 0, 1), total: 1,
    taste: { items: {}, tags: {}, blocks: {}, seeds: new Set() },
    localOffset: 0, currentIndex: -1, elapsed: 0, session: 0,
    newsMode: null, dismissedNews: null, offLive: false, breaking: false,
    seedTags: [], events: [], lovedSet: new Set(), sessionId: 'anon',
  }).current;

  // ---------- load ----------
  useEffect(() => { (async () => {
    R.events = await store.get('signals', []);
    R.lovedSet = new Set(await store.get('loved', []));
    R.seedTags = await store.get('seedTags', []);
    R.sessionId = await store.get('session', null) || Math.random().toString(36).slice(2, 12);
    await store.set('session', R.sessionId);
    try {
      const [station, rows, news] = await Promise.all([
        api.fetchStation(), api.fetchProgramme(), api.fetchNewsWindows().catch(() => []),
      ]);
      if (rows && rows.length) { R.RAW = rows.map(mapRow); R.anchor = Number(station.anchor_ms) || R.anchor; }
      R.NEWS = (news || []).map(mapNewsRow);
    } catch { setToast('Offline — using cached backend'); }
    applyTaste();
    const tags = [...new Set(R.RAW.flatMap(i => i.tags || []))].slice(0, 12);
    setChips(tags);
    const firstVisit = !(await store.get('onboarded', false)) && R.events.length === 0;
    setShowPicker(firstVisit && tags.length > 0);
    setPicked(new Set(R.seedTags));
    setReady(true);
    refreshTunein();
  })(); }, []);

  function applyTaste() {
    const byId = Object.fromEntries(R.RAW.map(i => [i.id, i]));
    R.taste = buildTaste(R.events, byId, R.seedTags);
    R.PROG = personalizeProgramme(R.RAW, R.taste);
    R.total = totalSeconds(R.PROG) || 1;
  }

  const livePos = () => corePos(R.anchor, Date.now(), R.total, R.localOffset);

  function refreshTunein() {
    const w = activeNewsWindow(nowMins(), R.NEWS);
    if (w) { setTunein({ title: w.source, badge: 'LIVE', sub: w.label + ' · live now' }); return; }
    if (!R.PROG.length) return;
    const { index, offset } = locate(R.PROG, livePos());
    const it = R.PROG[index];
    setTunein({ title: it.title, badge: it.type === 'youtube' ? 'YouTube' : 'Station', sub: it.block + ' · ' + fmtMin(it.slot - offset) + ' left' });
  }
  useEffect(() => { if (view === 'tunein') { const t = setInterval(refreshTunein, 20000); return () => clearInterval(t); } }, [view, ready]);

  // ---------- signals ----------
  function logSignal(action, item, extra = {}) {
    R.events.push({ action, item: item.id, ts: Date.now(), ...extra });
    R.events = R.events.slice(-500);
    store.set('signals', R.events);
    api.postSignal({ session_id: R.sessionId, item_id: String(item.id), action, offset_seconds: extra.offset ?? null });
  }

  // ---------- playback ----------
  function playItem(index, offset) {
    const item = R.PROG[index];
    if (!item) return;
    R.currentIndex = index; R.elapsed = Math.floor(offset); R.newsMode = null; R.breaking = false;
    setWhy(null);
    setLoved(R.lovedSet.has(item.id));
    setMeta({ block: item.block, title: item.title, badge: item.type === 'youtube' ? 'YouTube' : 'Station',
      time: fmtMin(item.slot - offset) + ' left', live: false });
    setPlayer(item.type === 'youtube'
      ? { type: 'youtube', key: item.id + ':' + Date.now(), videoId: item.videoId, startAt: Math.max(0, Math.floor(offset)) }
      : { type: 'station', key: item.id + ':' + Date.now(), src: item.src, startAt: offset });
    renderGuide(index);
    renderTransport();
    logSignal('tune', item, { offset: Math.round(offset) });
  }

  function endOfItem(item, errored = false) {
    if (R.newsMode || R.breaking) return;
    if (!errored && item) {
      const ratio = Math.min(1, R.elapsed / item.slot);
      logSignal('finish', item, { offset: Math.round(R.elapsed), ratio });
    }
    const { nextIndex, drift } = resolveAdvance(R.PROG, R.currentIndex, livePos());
    R.localOffset += drift;
    R.breaking = true;
    setPlayer(null);
    setMeta(m => ({ ...m, title: 'Up next…', time: '' }));
    setTimeout(() => { R.breaking = false; playItem(nextIndex, 0); }, errored ? 400 : BREAK_MS);
  }

  // ---------- news ----------
  function enterNews(w) {
    R.newsMode = w; R.offLive = false;
    setPlayer({ type: 'news', key: 'news:' + w.label, channel: w.channel });
    setMeta({ block: w.label + ' · live now', title: w.source, badge: 'LIVE', time: '~' + newsRemaining(w) + ' min of news', live: true });
    renderNewsGuide(w);
    renderTransport();
    logSignal('tune', { id: 'news:' + w.label });
  }
  function exitToLoop() {
    R.newsMode = null;
    const { index, offset } = locate(R.PROG, livePos());
    playItem(index, offset);
  }
  function newsRemaining(w) {
    const n = nowMins();
    const rem = w.start <= w.end ? w.end - n : (n < w.end ? w.end - n : 1440 - n + w.end);
    return Math.max(1, rem);
  }
  function maybeSwitchNews() {
    const w = activeNewsWindow(nowMins(), R.NEWS);
    if (!w) { R.dismissedNews = null; if (R.newsMode) exitToLoop(); }
    else if (R.dismissedNews === w.label) { /* opted out */ }
    else if (!R.newsMode || R.newsMode.label !== w.label) enterNews(w);
    renderTransport();
  }

  // ---------- 1s ticker: progress, slot-end, data, news ----------
  useEffect(() => {
    if (view !== 'player') return;
    const t = setInterval(() => {
      if (R.breaking) return;
      R.session += 1;
      const mb = estimateMB(R.session, MB_PER_SEC);
      setDataTxt(mb >= 1024 ? '~' + (mb / 1024).toFixed(2) + ' GB' : '~' + mb + ' MB');
      if (R.newsMode) {
        setMeta(m => ({ ...m, time: '~' + newsRemaining(R.newsMode) + ' min of news' }));
      } else {
        R.elapsed += 1;
        const item = R.PROG[R.currentIndex];
        if (item) {
          setMeta(m => ({ ...m, time: fmtMin(Math.max(0, item.slot - R.elapsed)) + ' left' }));
          if (R.elapsed >= item.slot) endOfItem(item);
        }
      }
    }, 1000);
    const n = setInterval(maybeSwitchNews, 8000);
    return () => { clearInterval(t); clearInterval(n); };
  }, [view]);

  // ---------- presence ----------
  useEffect(() => {
    if (view !== 'player') return;
    let alive = true;
    const beat = async () => { await api.heartbeat(R.sessionId); if (alive) poll(); };
    const poll = async () => { try { const c = await api.getWatching(); if (alive) setWatching(String(c)); } catch {} };
    beat();
    const h = setInterval(() => api.heartbeat(R.sessionId), 20000);
    const p = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(h); clearInterval(p); };
  }, [view]);

  // ---------- guide / transport / why ----------
  function renderGuide(base) {
    const arr = [];
    const count = Math.min(4, R.PROG.length);
    for (let k = 0; k < count; k++) {
      const it = R.PROG[(base + k) % R.PROG.length];
      arr.push({ when: k === 0 ? 'Now' : 'Later', title: it.title, src: it.type === 'youtube' ? 'YouTube' : 'Station', now: k === 0 });
    }
    setGuide(arr);
  }
  function renderNewsGuide(w) {
    const base = locate(R.PROG, livePos()).index;
    const arr = [{ when: 'Live', title: w.source, src: 'LIVE NEWS', now: true }];
    for (let k = 0; k < Math.min(3, R.PROG.length); k++) {
      const it = R.PROG[(base + k) % R.PROG.length];
      if (it) arr.push({ when: 'After', title: it.title, src: it.type === 'youtube' ? 'YouTube' : 'Station', now: false });
    }
    setGuide(arr);
  }
  function renderTransport() { setTransport({ inNews: !!R.newsMode, offLive: R.offLive }); }

  // ---------- actions ----------
  const tuneIn = async () => {
    await store.set('onboarded', true);
    R.seedTags = [...picked];
    await store.set('seedTags', R.seedTags);
    applyTaste();
    setView('player');
    const w = activeNewsWindow(nowMins(), R.NEWS);
    if (w) enterNews(w);
    else { const { index, offset } = locate(R.PROG, livePos()); playItem(index, offset); }
  };
  const onLove = () => {
    const item = R.PROG[R.currentIndex]; if (!item || R.newsMode) return;
    const was = R.lovedSet.has(item.id);
    if (was) R.lovedSet.delete(item.id); else R.lovedSet.add(item.id);
    store.set('loved', [...R.lovedSet]);
    logSignal(was ? 'unlove' : 'love', item);
    setLoved(!was);
    if (!was) flashToast('Noted — more like this');
  };
  const onSkip = () => {
    const item = R.PROG[R.currentIndex]; if (!item || R.newsMode || R.breaking) return;
    logSignal('skip', item); R.offLive = true; flashToast('Skipping'); endOfItem(item, true);
  };
  const onNext = () => {
    const item = R.PROG[R.currentIndex]; if (!item || R.newsMode || R.breaking) return;
    R.offLive = true; endOfItem(item, true);
  };
  const onBackToLive = () => {
    R.dismissedNews = null; R.offLive = false; R.localOffset = 0;
    const w = activeNewsWindow(nowMins(), R.NEWS);
    if (w) enterNews(w);
    else { const { index, offset } = locate(R.PROG, livePos()); playItem(index, offset); }
    flashToast('Back to live');
  };
  const onSkipNews = () => {
    if (!R.newsMode) return;
    R.dismissedNews = R.newsMode.label; R.offLive = true; flashToast('Back to the programme'); exitToLoop();
  };
  const onWhy = () => {
    const item = R.PROG[R.currentIndex]; if (!item || R.newsMode) return;
    setWhy(why ? null : explain(R.taste, item));
  };
  const toggleChip = tag => setPicked(p => { const n = new Set(p); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
  let toastT = useRef(null);
  function flashToast(m) { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); }

  // ---------- player render ----------
  const W = Dimensions.get('window').width;
  const stageH = Math.round(Math.min(W, 900) * 9 / 16);
  const ytEnd = useCallback(s => { if (s === 'ended') { const it = R.PROG[R.currentIndex]; if (it) endOfItem(it); } }, []);
  const ytReady = useRef();

  function Stage() {
    if (!player) return <View style={[st.stage, { height: stageH, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: C.inkMuted }}>Up next…</Text></View>;
    if (player.type === 'youtube') {
      return <View style={[st.stage, { height: stageH }]}>
        <YoutubePlayer key={player.key} height={stageH} play videoId={player.videoId}
          initialPlayerParams={{ start: player.startAt, rel: false, controls: true, modestbranding: true }}
          onChangeState={ytEnd} webViewProps={{ allowsInlineMediaPlayback: true }} />
      </View>;
    }
    if (player.type === 'station') {
      return <View style={[st.stage, { height: stageH }]}>
        <Video key={player.key} style={{ flex: 1 }} source={{ uri: player.src }} useNativeControls
          resizeMode={ResizeMode.CONTAIN} shouldPlay positionMillis={Math.floor((player.startAt || 0) * 1000)}
          onPlaybackStatusUpdate={s => { if (s.didJustFinish) { const it = R.PROG[R.currentIndex]; if (it) endOfItem(it); } }} />
      </View>;
    }
    // news
    return <View style={[st.stage, { height: stageH }]}>
      <WebView key={player.key} source={{ uri: 'https://www.youtube.com/embed/live_stream?channel=' + player.channel + '&autoplay=1&playsinline=1' }}
        allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} style={{ flex: 1, backgroundColor: '#000' }} />
    </View>;
  }

  // ---------- views ----------
  if (view === 'tunein') {
    return <SafeAreaProvider><SafeAreaView style={st.screen}><StatusBar style="light" />
      <ScrollView contentContainerStyle={st.tuneWrap}>
        <Wordmark big />
        <Text style={st.logline}>Programmed by a person. Tuned to you.</Text>
        <View style={st.onair}><Dot /><Text style={st.onairT}>ON AIR</Text></View>
        <Text style={st.nowTitle}>{tunein.title}</Text>
        <View style={st.row}><Badge live={tunein.badge === 'LIVE'} text={tunein.badge} /><Text style={st.sub}>{tunein.sub}</Text></View>
        {showPicker && <View style={st.picker}>
          <Text style={st.pickerLabel}>First visit? Tap what you enjoy. (Optional)</Text>
          <View style={st.chips}>{chips.map(t =>
            <Pressable key={t} onPress={() => toggleChip(t)} style={[st.chip, picked.has(t) && st.chipOn]}>
              <Text style={[st.chipT, picked.has(t) && st.chipTOn]}>{t}</Text></Pressable>)}
          </View></View>}
        <Pressable style={st.tuneBtn} onPress={tuneIn} disabled={!ready}>
          <Text style={st.tuneBtnT}>▶  Tune in</Text></Pressable>
        <Text style={st.credit}>A personal station by Dex · One channel, always on</Text>
      </ScrollView>
      {toast ? <Toast text={toast} /> : null}
    </SafeAreaView></SafeAreaProvider>;
  }

  return <SafeAreaProvider><SafeAreaView style={st.screen}><StatusBar style="light" />
    <View style={st.topbar}>
      <Wordmark />
      <View style={st.stats}>
        <Text style={st.stat}>◱ {watching}</Text>
        <Text style={st.stat}>⚡ {dataTxt}</Text>
        <View style={st.onair}><Dot /><Text style={st.onairT}>ON AIR</Text></View>
      </View>
    </View>
    <ScrollView>
      <Stage />
      <View style={st.transport}>
        {transport.inNews
          ? <Pressable style={st.ghost} onPress={onSkipNews}><Text style={st.ghostT}>Skip the news  ▷</Text></Pressable>
          : <>
              {transport.offLive && <Pressable style={st.ghost} onPress={onBackToLive}><Text style={st.ghostT}>● Back to live</Text></Pressable>}
              <View style={{ flex: 1 }} />
              <Pressable style={st.ghost} onPress={onNext}><Text style={st.ghostT}>Next  ▷</Text></Pressable>
            </>}
      </View>
      <View style={st.below}>
        <Text style={st.block}>{meta.block}</Text>
        <Text style={st.title}>{meta.title}</Text>
        <View style={st.row}><Badge live={meta.live} text={meta.badge} /><Text style={st.sub}>{meta.time}</Text></View>
        {!transport.inNews && <View style={st.reactions}>
          <Pressable style={[st.ghost, loved && st.ghostOn]} onPress={onLove}><Text style={[st.ghostT, loved && st.ghostTOn]}>♥ {loved ? 'Loved' : 'Love'}</Text></Pressable>
          <Pressable style={st.ghost} onPress={onSkip}><Text style={st.ghostT}>▷ Skip</Text></Pressable>
          <Pressable style={st.ghost} onPress={onWhy}><Text style={st.ghostT}>? Why this</Text></Pressable>
        </View>}
        {why && <View style={st.why}>{why.map((r, i) => <Text key={i} style={st.whyT}>• {r}</Text>)}</View>}
      </View>
      <View style={st.guide}>
        <Text style={st.guideH}>Up next on Station One</Text>
        {guide.map((g, i) => <View key={i} style={[st.gItem, g.now && st.gNow]}>
          <Text style={[st.gWhen, g.now && { color: C.accent }]}>{g.when}</Text>
          <View style={{ flex: 1 }}><Text style={st.gTitle}>{g.title}</Text>
            <Text style={[st.gSrc, g.src === 'LIVE NEWS' && { color: C.accent }]}>{g.src}</Text></View>
        </View>)}
      </View>
    </ScrollView>
    {toast ? <Toast text={toast} /> : null}
  </SafeAreaView></SafeAreaProvider>;
}

// ---------- small components ----------
const Dot = () => <View style={st.dot} />;
const Wordmark = ({ big }) => <View style={st.wordmark}><View style={st.logo} /><Text style={[st.wordT, big && { fontSize: 26 }]}>Station One</Text></View>;
const Badge = ({ text, live }) => <View style={[st.badge, live && st.badgeLive]}><Text style={[st.badgeT, live && { color: '#fff' }]}>{text}</Text></View>;
const Toast = ({ text }) => <View style={st.toast}><Text style={st.toastT}>{text}</Text></View>;

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  tuneWrap: { padding: 24, alignItems: 'center', paddingTop: 60 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 22, height: 16, borderRadius: 4, borderWidth: 2, borderColor: C.accent },
  wordT: { color: C.ink, fontWeight: '700', fontSize: 17 },
  logline: { color: C.inkMuted, marginTop: 10, fontSize: 15 },
  onair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onairT: { color: C.ink, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  nowTitle: { color: C.ink, fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 40, marginBottom: 12 },
  sub: { color: C.inkMuted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  picker: { marginTop: 36, alignItems: 'center' },
  pickerLabel: { color: C.inkMuted, fontSize: 14, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 16 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipT: { color: C.ink, fontSize: 13 }, chipTOn: { color: '#fff' },
  tuneBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 44, marginTop: 40 },
  tuneBtnT: { color: '#fff', fontWeight: '700', fontSize: 18 },
  credit: { color: C.inkMuted, fontSize: 13, marginTop: 48, textAlign: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stat: { color: C.inkMuted, fontSize: 13 },
  stage: { backgroundColor: '#000', width: '100%', overflow: 'hidden' },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 12, minHeight: 44 },
  ghost: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  ghostOn: { backgroundColor: C.accent, borderColor: C.accent },
  ghostT: { color: C.ink, fontSize: 14, fontWeight: '600' }, ghostTOn: { color: '#fff' },
  below: { paddingHorizontal: 16, marginTop: 14 },
  block: { color: C.inkMuted, fontSize: 13, marginBottom: 6 },
  title: { color: C.ink, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  reactions: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  why: { marginTop: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16 },
  whyT: { color: C.inkMuted, fontSize: 14, marginBottom: 4 },
  guide: { paddingHorizontal: 16, marginTop: 22, paddingBottom: 40 },
  guideH: { color: C.inkMuted, fontSize: 14, fontWeight: '600', marginBottom: 14 },
  gItem: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center' },
  gNow: { backgroundColor: C.surface },
  gWhen: { color: C.inkMuted, fontSize: 13, width: 44 },
  gTitle: { color: C.ink, fontSize: 14, fontWeight: '500' },
  gSrc: { color: C.inkMuted, fontSize: 12, marginTop: 3 },
  badge: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  badgeLive: { backgroundColor: C.accent, borderColor: C.accent },
  badgeT: { color: C.inkMuted, fontSize: 11, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
  toastT: { color: C.ink, fontSize: 14 },
});
