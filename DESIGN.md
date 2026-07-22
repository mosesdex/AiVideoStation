# Station One — Design System & Brand Guide

Cinematic premium, OLED-dark, one signal-red accent. The research site established the seed; this document is the canonical brand guide for the product surfaces (player app, owner tools) and all future marketing.

## Identity

- **Name:** Station One. One station, one channel, always on.
- **Logline:** "Programmed by a person. Tuned to you."
- **Logo direction:** a rounded-rect screen glyph containing a play triangle (already seeded in the research site favicon), rendered in Signal Red on black. Wordmark set in Bricolage Grotesque SemiBold, tight but ≥ -0.03em tracking.
- **The on-air dot:** a small pulsing red dot is the brand's signature mark — it means "the station is live." Use it sparingly: nav, on-air badge, nothing else.

## Color (OKLCH)

Strategy: **Restrained** on product surfaces — near-black neutrals plus one accent under 10% of any screen. The video content is the color; the interface is the dark room around it.

| Token | OKLCH | Hex ref | Role |
|---|---|---|---|
| `--bg` | `oklch(0 0 0)` | `#000000` | App background (OLED black) |
| `--surface` | `oklch(0.13 0.01 280)` | `#0d0d14` | Panels, guide rail |
| `--surface-2` | `oklch(0.17 0.015 280)` | `#14141f` | Hover layer, inputs |
| `--ink` | `oklch(0.98 0.005 250)` | `#f8fafc` | Primary text |
| `--ink-muted` | `oklch(0.75 0.02 280)` | `#a3a3b8` | Secondary text (AA on bg/surface) |
| `--accent` | `oklch(0.55 0.21 20)` | `#e11d48` | Signal Red: primary actions, on-air, selection |
| `--border` | `oklch(0.25 0.02 280)` | `#26263a` | Hairlines |
| `--ok` | `oklch(0.79 0.15 165)` | `#34d399` | Success, "Station" source badge |
| `--warn` | `oklch(0.86 0.16 85)` | `#fbbf24` | Warnings |

Rules: Signal Red is for meaning (on-air, primary action, active state), never decoration. Body text is `--ink` or `--ink-muted`, nothing fainter. No gradients on text; the only permitted glow is the on-air dot's pulse and a subtle ambient light bleed behind the player.

## Typography

- **UI family: Instrument Sans** (400/500/600/700) — all labels, buttons, body, data. Fixed rem scale, ratio ≈1.2: 12 / 14 / 16 / 19 / 23 / 28.
- **Identity family: Bricolage Grotesque** — reserved for the wordmark, screen titles (one per screen max), and the off-air card. Never in buttons, labels, or body.
- Tabular numerals for clocks and schedule times. Line-height 1.5 for prose, 1.2 for display.

## Voice

Broadcast language, spoken quietly. The app talks like a station, not a startup:

- "On air" / "Up next" / "Later tonight" / "Off air"
- Tune in, not "log in to watch". Programme, not "queue".
- Buttons are verbs: "Tune in", "Start over", "Love", "Skip".
- Never: "content", "algorithm", "for you feed", exclamation marks.

## Components

- **Player shell:** 16:9 stage on black. Chrome sits beside/below, never over the video (ToS + brand principle). A faint ambient glow (blurred accent at 4–6% opacity) bleeds behind the stage.
- **Source badge:** every programme item carries one — `YouTube` (neutral outline) or `Station` (green tint). Required disclosure, treated as brand furniture.
- **On-air badge:** red dot + "ON AIR" in 12px/600 caps. The dot pulses 2s; static under reduced motion.
- **Guide rail ("Up next"):** vertical list of upcoming items: time, thumbnail, title, source badge. Now-playing item is accent-marked. No grid walls.
- **Reactions:** Love / Skip as two ghost buttons beside the player; press feedback within 100ms; Love fills Signal Red, Skip advances with a crossfade.
- **States:** every interactive element ships default / hover / focus-visible (2px accent ring) / active / disabled. Loading uses skeleton shimmer on the guide, never spinners over the stage.

## Motion

- Transitions 150–250ms, ease-out. Motion conveys state only.
- **Signature moment (the one indulgence):** tune-in. Pressing "Tune in" plays a 400ms TV-wake: black → brief horizontal light line → crossfade into the live programme. Under `prefers-reduced-motion`: instant cut.
- Between programme items: 200ms crossfade through black (the "station break"). No page-load choreography anywhere else.

## Layout

- Desktop: stage left (~70%), guide rail right; reactions and now-playing meta under the stage.
- Mobile: stage full-width at top (safe-area aware), meta + reactions below, guide as a vertical scroll beneath. No horizontal scrolling.
- Spacing on a 4px scale; container max 1200px; z-scale: base 0 / sticky 10 / sheet 40 / toast 50.

## Accessibility

WCAG AA. Verified pairs: `--ink` on all surfaces ≥ 12:1; `--ink-muted` on `--bg`/`--surface` ≥ 5:1; white on `--accent` ≥ 4.6:1. Player and guide fully keyboard-operable (space = play/pause, arrows = guide navigation); focus visible everywhere; reduced-motion alternative for every animation.
