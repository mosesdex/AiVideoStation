# Station One — Native app (Expo / React Native)

Real iOS + Android app. Same Supabase backend, same tested engines (`src/core.js`, `src/taste.js` are copied verbatim from the web app), YouTube via the **official iframe player** (ToS-safe, ads intact), self-hosted video via `expo-av`, and live-news channels via `WebView`.

## Run it today (on your phone)

1. Install Node 18+ and the Expo CLI is bundled via `npx`.
2. In this folder:
   ```bash
   npm install
   npx expo start
   ```
3. Install **Expo Go** on your iPhone/Android, scan the QR from the terminal. The app loads live, talking to the same backend as the web station.

Web preview (quick sanity): `npx expo start --web`.

## What's built

- Tune-in screen + first-visit taste picker (chips from the programme's tags)
- Wall-clock linear schedule (shared across viewers) with join-live, auto-advance, station breaks
- YouTube (iframe) + station video (expo-av) + **live news override** on real local time-of-day, with **Skip the news** / **Back to live** / **Next**
- Personalization (love / skip / finish → smart-block reorder), "Why this"
- Live viewer count (presence) + data-used estimate
- Persistent signals via AsyncStorage

## Ship to the stores (later, needs your accounts)

Store builds run in Expo's cloud (EAS) — can't be done on GitHub Pages.

```bash
npm i -g eas-cli
eas login                 # your Expo account
eas build:configure
eas build -p ios          # needs Apple Developer account ($99/yr)
eas build -p android      # needs Google Play account ($25 one-time)
eas submit -p ios         # uploads to App Store Connect
eas submit -p android
```

Add a real `assets/icon.png` (1024×1024) and splash before submitting; wire them in `app.json`.

## TV apps (later)

Apple TV / Android TV via the `react-native-tvos` fork + `react-tv-space-navigation` for D-pad focus (per the research plan). Separate build target.

## Notes / limits

- Not yet run through a store review; this is the working app scaffold.
- Live-news `WebView` plays a channel's current live stream; offline channels show YouTube's own fallback.
- YouTube background/PiP stays disabled (ToS). Background audio is reserved for station-owned files only.
