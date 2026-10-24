# Weekly 150: design spec

Build target: one self-contained HTML file that obeys `page-contract.md` (no doctype/html/head/body tags, starts with `<title>`, then `<meta name="claude:viewport-fit-sides" content="cover">`, then `<style>`, content, `<script>`). Vanilla JS only. No libraries.

---

## 1. Product

- **Name:** Weekly 150
- **`<title>`:** `Weekly 150`
- **One sentence:** A pocket training log that helps you bank 150 active minutes a week, one small session at a time.

---

## 2. Design direction

**Track meet, not fitness app.** The page borrows from a club athletics meet: a paper race bib pinned to your shirt, the blue synthetic surface of a stadium track with white lane lines, and the results sheets taped to the wall afterwards (hairline rules, condensed type, right-aligned tabular numbers). The weekly target is a 150-minute straight: you are a runner moving down your lane, and your bib number is the minutes you have banked this week. Everything else is set like a results sheet: left-aligned, ruled, numeric, calm. Colour is used the way a track uses it: one big field of blue, white lines, a red sponsor band on the bib, and amber only to mean "vigorous". No gradients, no glow, no emoji, one shadow on the whole page (the bib, because it is a physical object).

**The aesthetic risk:** the hero is a full-bleed, flat, saturated track-blue band with white lane lines running edge to edge, and on it sits a slightly tilted paper race bib whose number, set in huge condensed numerals (up to 152px), is the user's live weekly minutes, zero-padded like a real bib (`096`). The bib stays paper-white in dark mode too, because it is an object, not a surface. The blue band is louder than most "calm wellness" pages dare to be, and the bib number is the largest type on the page, bigger than the headline.

---

## 3. Tokens

### 3.1 Named palette (7)

| Name | Light hex | Dark hex | Role |
|---|---|---|---|
| Tyvek | `#F1F2EE` | `#0F141C` | Page background (bib paper stock in light; night stadium in dark) |
| Ink | `#111A2B` | `#E8ECF2` | Text and rules |
| Chalk Grey | `#C9CEC6` | `#2E3847` | Hairlines, empty cells |
| Track Blue | `#1E4FA0` | `#16366F` (band) / `#5C8FE6` (data fill) | Hero band, moderate minutes, grid fill |
| Lane White | `#DCE6F7` | `#8FA9D6` | Lane lines and ticks on the band |
| Bib Red | `#C8281C` | `#FF5A4A` | Primary actions, bib sponsor band, today marker |
| Zone Amber | `#E8A317` | `#F5B731` | Vigorous minutes only |

### 3.2 CSS tokens (copy exactly)

```css
:root {
  /* surfaces */
  --bg: #F1F2EE;
  --surface: #FFFFFF;
  --surface-2: #E4E7E1;
  --fg: #111A2B;
  --fg-muted: #4A5363;
  --line: #C9CEC6;
  --line-strong: #111A2B;

  /* track band */
  --track: #1E4FA0;          /* band background */
  --track-fill: #1E4FA0;     /* moderate minutes + grid level 3 on light surfaces */
  --track-soft: #A9C0E6;     /* grid level 1 */
  --track-mid: #5F86C7;      /* grid level 2 */
  --track-ink: #FFFFFF;      /* text on band, moderate fill inside the lane */
  --lane-line: #DCE6F7;      /* lane lines and ticks */

  /* bib (stays paper in both themes) */
  --bib-paper: #FFFFFF;
  --bib-ink: #111A2B;
  --bib-hole: #1E4FA0;       /* pin holes show the band through them */
  --bib-muted: #4A5363;      /* secondary text on the bib, same in both themes */
  --tag-mod-ink: #FFFFFF;    /* text on moderate (blue) tags and segments */

  /* signals */
  --accent: #C8281C;         /* Bib Red */
  --accent-hover: #A81F15;
  --accent-ink: #FFFFFF;     /* text on accent */
  --zone-vig: #E8A317;       /* Zone Amber, vigorous */
  --zone-vig-ink: #111A2B;   /* text on amber */
  --ok: #1E7A46;             /* "target met" text only */

  --focus: #111A2B;
  --shadow-bib: 0 1px 0 #00000014, 0 10px 24px -12px #0B1F4A66;
  --hatch: #11182714;        /* sample-data hatching stripe */

  /* type */
  --font-display: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
  --font-body: "Barlow", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  --fs-bib: clamp(5.5rem, 22vw, 9.5rem);
  --fs-timer: clamp(4rem, 16vw, 6.5rem);
  --fs-h1: clamp(2.25rem, 6.5vw, 3.75rem);
  --fs-h2: clamp(1.75rem, 4.5vw, 2.5rem);
  --fs-h3: 1.25rem;
  --fs-stat: clamp(2.25rem, 7vw, 3.25rem);
  --fs-body: 1rem;
  --fs-small: 0.875rem;
  --fs-label: 0.75rem;

  /* spacing */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px; --sp-9: 96px;

  /* radii */
  --r-0: 0;
  --r-1: 3px;     /* buttons, inputs, chips, tags */
  --r-2: 6px;     /* panels, plan card */
  --r-bib: 12px;  /* the bib */
  --r-round: 999px; /* pin holes, legend dots only */

  --wrap: 1120px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0F141C; --surface: #171E29; --surface-2: #212A37;
    --fg: #E8ECF2; --fg-muted: #A3ADBD; --line: #2E3847; --line-strong: #E8ECF2;
    --track: #16366F; --track-fill: #5C8FE6; --track-soft: #2C4C85; --track-mid: #3F6BB8;
    --track-ink: #FFFFFF; --lane-line: #8FA9D6;
    --bib-paper: #E9ECE6; --bib-ink: #111A2B; --bib-hole: #16366F; --bib-muted: #4A5363; --tag-mod-ink: #0F141C;
    --accent: #FF5A4A; --accent-hover: #FF7A6C; --accent-ink: #1A0B09;
    --zone-vig: #F5B731; --zone-vig-ink: #111A2B; --ok: #5BD08A;
    --focus: #E8ECF2;
    --shadow-bib: 0 1px 0 #00000040, 0 12px 28px -10px #000000A6;
    --hatch: #FFFFFF14;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0F141C; --surface: #171E29; --surface-2: #212A37;
  --fg: #E8ECF2; --fg-muted: #A3ADBD; --line: #2E3847; --line-strong: #E8ECF2;
  --track: #16366F; --track-fill: #5C8FE6; --track-soft: #2C4C85; --track-mid: #3F6BB8;
  --track-ink: #FFFFFF; --lane-line: #8FA9D6;
  --bib-paper: #E9ECE6; --bib-ink: #111A2B; --bib-hole: #16366F; --bib-muted: #4A5363; --tag-mod-ink: #0F141C;
  --accent: #FF5A4A; --accent-hover: #FF7A6C; --accent-ink: #1A0B09;
  --zone-vig: #F5B731; --zone-vig-ink: #111A2B; --ok: #5BD08A;
  --focus: #E8ECF2;
  --shadow-bib: 0 1px 0 #00000040, 0 12px 28px -10px #000000A6;
  --hatch: #FFFFFF14;
  color-scheme: dark;
}
body { background: var(--bg); color: var(--fg); font-family: var(--font-body); font-size: var(--fs-body); line-height: 1.55; }
```

Inside the hero band, re-scope focus so rings stay visible on blue: `.band { --focus: var(--track-ink); }`. The log panel inside the band is a light surface again, so `.band .panel { --focus: var(--fg); }`.

### 3.3 Fonts

One Google Fonts link (stylesheet only, `display=swap`):

```
https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap
```

| Token | Family | Weights | Used for |
|---|---|---|---|
| `--font-display` | Barlow Condensed | 600, 700, 800 | Bib number (800), H1/H2 (800/700, uppercase), stats, buttons (700, uppercase) |
| `--font-body` | Barlow | 400, 500, 600 | Body, helper text, inputs |
| `--font-mono` | IBM Plex Mono | 500, 600 | Labels (uppercase, `letter-spacing: .08em`), table numbers, timer digits |

All numeric displays: `font-variant-numeric: tabular-nums;`.

### 3.4 Type scale

| Role | Font | Size token | Weight | Line height | Case / tracking |
|---|---|---|---|---|---|
| Bib number | display | `--fs-bib` | 800 | 0.82 | tracking -0.02em |
| Timer digits | mono | `--fs-timer` | 600 | 1 | tabular |
| H1 | display | `--fs-h1` | 800 | 0.95 | uppercase, -0.01em |
| H2 | display | `--fs-h2` | 700 | 1.0 | uppercase |
| H3 | display | `--fs-h3` | 700 | 1.15 | uppercase, 0.02em |
| Stat (evidence, streak tiles) | display | `--fs-stat` | 800 | 0.95 | none |
| Body | body | `--fs-body` | 400 | 1.55 | none |
| Lead (hero sub) | body | 1.125rem | 500 | 1.5 | none |
| Small / helper | body | `--fs-small` | 400 | 1.45 | none |
| Label (section tags, field labels, table heads) | mono | `--fs-label` | 600 | 1.3 | uppercase, 0.08em |
| Button | display | 1.125rem | 700 | 1 | uppercase, 0.04em |

Max text measure: 62ch for paragraphs.

### 3.5 Recurring visual devices

- **Section head:** a full-width 2px `--line-strong` rule, then on the next line a mono label in `--accent` (for example `THE LOG`), then the H2 below it, left-aligned. No numbers, no icons.
- **Results-sheet table:** hairline `--line` rows, mono uppercase column heads, numbers right-aligned in mono tabular.
- **Tags:** 3px radius, mono 11px uppercase. Moderate: `--track-fill` bg, `--tag-mod-ink` text (white in light, near-black in dark, because dark `--track-fill` is a light blue). Vigorous: `--zone-vig` bg, `--zone-vig-ink` text. Sample: transparent bg, 1px dashed `--fg-muted` border, `--fg-muted` text, text `SAMPLE`.
- **Sample hatching:** any element showing sample data gets a subtle diagonal stripe background `repeating-linear-gradient(135deg, var(--hatch) 0 6px, transparent 6px 12px)`.
- **Pin holes:** 10px circles, `--bib-hole` fill with a 2px `--line` ring, in the 4 corners of the bib and of the plan card, inset 14px.

---

## 4. Information architecture and copy

Order on the page (single column of bands; anchors in brackets):

0. Sticky header
1. Sample banner (only while sample data is active)
2. Hero band: This week [#week], containing the bib, the lane and the Log panel [#log]
3. This week's splits [#splits]
4. Consistency grid [#streak]
5. Habit builder [#plan]
6. Exercise snacks and timer [#snacks]
7. The evidence [#evidence]
8. Footer

All copy below is final. No em dashes or en dashes anywhere; ranges use "to".

### 0. Sticky header

- Wordmark (display 800, uppercase): `WEEKLY 150` with the `150` in `--accent`.
- Nav links (desktop, mono labels): `Log` (#log), `Streak` (#streak), `Plan` (#plan), `Snacks` (#snacks), `Evidence` (#evidence).
- Mobile (<640px): nav hidden; show a small accent button `Log a session` that jumps to #log and focuses `#log-activity`.
- Theme button (`#theme-toggle`), text label cycles: `Theme: Auto` / `Theme: Light` / `Theme: Dark`.

### 1. Sample banner

- Label: `SAMPLE WEEK`
- Text: `These sessions and the plan below are made up so you can see how the log works. The first thing you add for real clears them.`
- Button: `Clear sample and start fresh`
- After clearing, live region says: `Sample cleared. Your log starts now.`

### 2. Hero band: This week

- Mono label (on band, `--lane-line`): `THIS WEEK`
- H1: `Bank 150 minutes this week.`
- Lead: `Two brisk walks and a few short sessions add up faster than you think. Log what you did, watch your lane fill, come back tomorrow.`
- **Bib** (see component 5.1). Top sponsor band: `WEEK OF 19 OCT` (Monday of current week, `D MMM` uppercase). Number: credited minutes, zero-padded to 3 digits (`096`), 4 digits if over 999. Under number: `ACTIVE MINUTES` left and `TARGET 150` right. Bottom strip (status line):
  - below target: `54 TO GO`
  - at or over target: `TARGET MET` (plus `+N EXTRA` if over 150)
- **Lane** (component 5.2) with legend: `Moderate 60 min` and `Vigorous 18 min x2 = 36`.
- **Next-step line** under the lane (body, `--track-ink`):
  - below target: `54 minutes to go with 3 days left. That is about 18 minutes a day, or 27 minutes of running in total.`
  - last day (Sunday) below target: `54 minutes to go today. A 27-minute run would do it, so would a long walk.`
  - target met: `Target met. Anything extra still counts: more activity brings more benefit, up to 300 minutes and beyond.`
  - zero logged: `150 minutes to go with 7 days left. One 10-minute walk today is a real start.`
- **Strength line** (small, on band): `Strength days: 1 of 2` followed by two small boxes, filled for each distinct day with a Strength session this week. Helper on hover/title and visible small text below on mobile: `WHO also suggests muscle work on 2 or more days a week.`
- **Last week line** (small): `Last week: 150 of 150. Target met.` or `Last week: 95 of 150.` Hidden if last week has no sessions.

#### Log panel [#log] (white panel on the band, right column on desktop)

- H3: `Log a session`
- Field `Activity` (`#log-activity`, select): `Walk`, `Run`, `Cycle`, `Strength`, `Swim`, `Yoga or stretching`, `Sport`, `Stairs`, `Other`. Default `Walk`.
- Field `Minutes` (`#log-minutes`, number, min 1, max 240, step 1, inputmode numeric). Quick chips below: `5`, `10`, `20`, `30` (set the field).
- Field `How hard?` (radio group, ids `#log-int-mod`, `#log-int-vig`, segmented):
  - `Moderate` with helper `You can talk, but not sing.`
  - `Vigorous` with helper `You can only say a few words before you need a breath.`
- Field `When` (`#log-date`, select): `Today`, `Yesterday`, then weekday names with dates for the 5 days before that (`Mon 19 Oct`). Default `Today`.
- Helper under form: `Vigorous minutes count double toward 150, as in the WHO guideline.`
- Submit button (accent): `Log it`
- Success message (live region, inside the panel): `Logged. 20 vigorous minutes counts as 40 toward this week.` (moderate: `Logged. 20 minutes toward this week.`) If the session date is in last week: `Logged to last week.`
- Error (inline under Minutes, `aria-describedby`): `Enter minutes from 1 to 240.`

### 3. This week's splits [#splits]

- Label: `THE LOG`
- H2: `This week's splits`
- Table columns: `Day`, `Activity`, `Min`, `Effort`, `Counts as`, (action column, header visually hidden `Remove`).
- Row action button text: `Remove` (aria-label `Remove Walk, 20 minutes, Tuesday`).
- After remove: inline toast in the section, `Removed Walk, 20 min.` with button `Undo` (6 seconds).
- Footer row: `Week total` and the credited total right-aligned.
- Empty state: `No sessions yet this week. Log your first one above, even if it was 5 minutes.`

### 4. Consistency grid [#streak]

- Label: `CONSISTENCY`
- H2: `Your last 12 weeks`
- Intro: `One square per day. Darker means more minutes. A flag marks every week you reached 150. Missed days happen; the week is what counts.`
- Three stat tiles in a ruled row:
  - `Week streak` value e.g. `2`, unit `weeks at 150 in a row`
  - `Weeks at 150` value `4`, unit `of the last 12`
  - `Active days` value `14`, unit `in the last 28`
- Legend: `Less`, four swatches, `More`, then a flag swatch and `Hit 150`.
- Empty state (no sessions at all): `Your 12 weeks fill in as you log. Today's square is outlined in red.`
- Encouragement line under tiles, by state:
  - streak 0, this week below target: `Start a streak this week: 150 minutes by Sunday.`
  - streak >= 1, this week below target: `Keep the streak: 54 minutes to go by Sunday.`
  - this week met: `This week is in the bank. Streak now 3.`

### 5. Habit builder [#plan]

- Label: `START SMALL`
- H2: `Pick a trigger you already have.`
- Intro: `Tie a tiny bit of movement to something you do every day anyway. Make it so small you could do it on your worst day. You can always do more.`
- Sentence builder (desktop renders as a sentence with inline fields):
  `After I [________], I will [________] at [________].`
  - Field `After I` (`#plan-after`), placeholder `pour my morning coffee`, chips: `pour my morning coffee`, `park the car`, `close my laptop`, `brush my teeth`
  - Field `I will` (`#plan-will`), placeholder `do 10 squats`, chips: `do 10 squats`, `walk around the block`, `climb the stairs twice`, `hold a 30 second plank`
  - Field `At` (`#plan-where`), placeholder `the kitchen counter`, chips: `the kitchen counter`, `my front door`, `my desk`, `the bottom of the stairs`
  - Field `It takes about` (`#plan-minutes`, number 1 to 30, default 2) with suffix `minutes`
- Button (accent): `Save my plan`. Secondary text button: `Clear`.
- Validation: `Fill in all three blanks to save your plan.`
- **Plan card** (shown once saved):
  - Label: `MY PLAN` (or `SAMPLE PLAN` with hatching while sample)
  - Sentence in display 700, 1.5rem: `After I pour my morning coffee, I will do 10 squats at the kitchen counter.`
  - Row of 7 day boxes (rolling last 7 days, oldest left, mono day initials `M T W T F S S` aligned to actual weekdays), filled when a plan session was logged that day. Caption: `Done 3 of the last 7 days`.
  - Button (accent): `Did it today` (logs a session, see 5.5). After pressing: button replaced by text `Done today. See you tomorrow.` plus text button `Undo`.
  - Text buttons: `Edit plan`, `Delete plan`.
- Empty state (no plan): plan card area shows `No plan yet. Fill in the three blanks and save it here.`

### 6. Exercise snacks [#snacks]

- Label: `EXERCISE SNACKS`
- H2: `Short on time? Take a snack.`
- Intro: `No gym, no kit, no change of clothes. Pick one, press start, and log it when the timer ends.`
- Routine list (each item: name, duration tag, effort tag, moves summary, button `Load timer`):
  1. `Stair climb`, `3 min`, Vigorous. `Climb stairs briskly for 40 seconds, rest 20. Three rounds.`
  2. `Desk reset`, `5 min`, Moderate. `Chair squats, wall push-ups, standing march, calf raises, hip hinge reach. 45 seconds on, 15 off.`
  3. `Kitchen circuit`, `7 min`, Vigorous. `Squats, counter push-ups, reverse lunges, fast feet, glute bridge, plank, step jacks. 40 on, 20 off.`
  4. `Brisk loop`, `10 min`, Moderate. `One easy minute, eight brisk minutes, one easy minute. Out the door and back.`
- Safety helper under list (small): `Go at your own pace. Stop if you feel pain, dizziness or chest discomfort.`
- **Timer panel**:
  - Label: `STOPWATCH`
  - Routine name (H3) e.g. `Kitchen circuit`
  - Current step label (display 700, 1.75rem): `Squats` or `Rest`
  - Digits: `00:40` (counts down the current step)
  - Line: `Next: Counter push-ups` and `Total left 06:20`
  - Step strip: one block per step, done blocks filled.
  - Buttons: `Start` (toggles to `Pause`, then `Resume`), `Skip`, `Reset`
  - Checkbox `#snack-sound`: `Beep at each change`
  - No routine loaded state: `Pick a snack and press Load timer.` Digits show `00:00`, buttons disabled.
  - Finished state: step label `Done.`, line `7 minutes in the bank if you log it.`, accent button `Log 7 min` (logs routine type/intensity, today). After logging: `Logged. Nice work.`
  - Paused with at least 60 seconds done: extra text button `Stop and log 3 min` (whole minutes completed, rounded down).

### 7. The evidence [#evidence]

- Label: `THE EVIDENCE`
- H2: `Why bother, briefly.`
- Intro: `You already know exercise is good for you. Here is how little it takes to matter.`
- Results-sheet list of up to 6 rows. Each row: `stat` (display 800, `--fs-stat`), `claim` (body, max 30 words), `source` (small, `Source: ` + linked label, opens in new tab with `rel="noopener"`).

FACT slots (the engineer receives the real values separately; ship nothing invented):

| Slot | Kind of fact it must hold | Example shape (not real data) |
|---|---|---|
| FACT_1 | Mortality: meeting the WHO 150-minute guideline and lower all-cause mortality risk | stat `X%`, claim about lower risk of early death |
| FACT_2 | Steps: daily step count and mortality, showing benefit starts well below 10,000 steps | stat `N,000`, claim about where benefit begins |
| FACT_3 | Mood: physical activity and lower risk or symptoms of depression or anxiety | stat `X%` |
| FACT_4 | Small doses: short bouts (for example 1 to 2 minute vigorous bursts in daily life, or 10 minute walks) still linked to benefit | stat `N min` |
| FACT_5 | Habit timing: how long habits take to become automatic, or how much implementation intentions ("if/then" plans) raise follow-through | stat `N days` |
| FACT_6 | Weekend warrior: packing the weekly minutes into 1 or 2 days gives similar benefit to spreading them out | stat `1 to 2 days` |

Slot data shape, as a JS array near the top of the script:
```js
const FACTS = [
  { id: "FACT_1", stat: "", claim: "", sourceLabel: "", url: "" },
  /* ... FACT_6 */
];
```
Render rule: a row renders only if `stat`, `claim` and `url` are all non-empty. If fewer than 4 facts render, keep the section anyway. Never ship placeholder text.

### 8. Footer

- Line 1: `Weekly 150 follows the WHO guideline for adults: at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days.` with link text `Read the WHO guideline` to `https://www.who.int/publications/i/item/9789240015128`.
- Line 2: `Your log lives in this browser only. Nothing is sent anywhere.`
- Storage-blocked variant (replaces line 2): `Your browser is blocking storage, so this log resets when you close the page.`
- Line 3: `General information, not medical advice. If you have a heart condition or other health concern, check with a clinician before starting vigorous exercise.`
- Text button: `Clear all my data`. Inline confirm (no `confirm()`): `This removes every session and your plan from this browser. Clear everything?` buttons `Yes, clear it` (accent) and `Keep my data`. After: `All cleared.` (no reseed).

---

## 5. Component specs

Breakpoints: mobile base (designed at 400px), `min-width: 640px` (tablet), `min-width: 960px` (desktop). Wrapper: `.wrap { max-width: var(--wrap); margin-inline: auto; }`. Gutter rule from the contract goes on each full-width band's inner `.wrap`, vertical spacing with `padding-block` only. Section vertical rhythm: `padding-block: var(--sp-8)` desktop, `var(--sp-7)` mobile.

Global interaction states (apply to every control unless overridden):
- **Focus:** `outline: 3px solid var(--focus); outline-offset: 2px;` via `:focus-visible`. Never remove.
- **Hover (buttons):** accent buttons go to `--accent-hover`; outline buttons fill `--surface-2`; text buttons get underline.
- **Active (pressed):** `transform: translateY(1px)` (none under reduced motion).
- **Disabled:** 45% opacity, `cursor: not-allowed`, still in tab order only if it explains itself (timer buttons: use `disabled` attribute).
- Min touch target 44x44px for all buttons, chips and radio segments.

### 5.1 Race bib (hero)

- Desktop: in the left column (7 of 12 cols), width 420px, rotated `-2deg`, `--bib-paper` bg, `--r-bib` radius, `--shadow-bib`. Mobile: full width of wrapper, max 360px, rotated `-1deg`, left-aligned in its column (never centered).
- Structure top to bottom: red sponsor band (height 36px, `--accent` bg, `--accent-ink` mono label `WEEK OF 19 OCT` left and `WEEKLY 150` right); number row (display 800 `--fs-bib`, `--bib-ink`, left-aligned with 24px inset); meta row (`ACTIVE MINUTES` left / `TARGET 150` right, mono label in `--bib-muted`); status strip (2px `--bib-ink` rule above, display 700 1.5rem uppercase: `54 TO GO` or `TARGET MET`).
- Four pin holes (see 3.5).
- States: default as above. Sample: the hatching stripe over the number row plus a `SAMPLE` tag in the status strip right side. Empty (0): number `000`, status `150 TO GO`. Over target: status `TARGET MET +36 EXTRA`.
- Number change animation: count up from old to new value over 400ms with `requestAnimationFrame`. Reduced motion: set instantly.
- Accessibility: the bib is `role="group"` with `aria-label="This week: 96 of 150 active minutes"`; the number itself `aria-hidden="true"`.

### 5.2 Lane progress (the 150 straight)

- A horizontal lane drawn with HTML/CSS or inline SVG, full width of the left column (mobile: full wrapper width). Height 56px. Background transparent on the band; top and bottom lane lines 3px `--lane-line`.
- Scale 0 to 150. Ticks every 10 minutes (8px, 1px `--lane-line`), tall ticks with mono labels at `0`, `30`, `60`, `90`, `120`, and a heavy finish line at `150` (6px wide `--track-ink`, label `150 FINISH`). Below 640px show only the labels `0`, `75` and `150 FINISH` to avoid collisions; ticks unchanged.
- Fill: inner bar 20px tall, vertically centered. Moderate credit segment first in `--track-ink`, vigorous credit segment after it in `--zone-vig`. Widths are `credit / 150` capped at 100% total; if over, segments scale proportionally to fit 100%.
- Runner marker: a small white tag (`--bib-paper`, `--bib-ink` mono 12px, `--r-1`) sitting above the lane at the fill end showing `96`. Clamp so it never overflows the lane edges.
- Overflow: when credit > 150, marker reads `150+` and a mono label right of finish shows `+36`.
- Legend row below lane (on band, small): swatch + `Moderate 60 min`, swatch + `Vigorous 18 min x2 = 36`.
- Accessibility: wrapper `role="meter"`, `aria-valuemin="0"`, `aria-valuemax="150"`, `aria-valuenow` = min(credit,150), `aria-valuetext="96 of 150 minutes, 54 to go"`.
- Transition: segment widths `transition: width 400ms ease-out`; none under reduced motion.
- Sample: lane fill has the hatch overlay.

### 5.3 Log panel

- Desktop: right column (5 of 12), `--surface` bg, `--r-2`, 1px `--line` border, no shadow, padding `--sp-5`. Fields stacked; `Minutes` and `When` sit side by side (2 cols) at >= 960px. Mobile: full width under the lane, same panel, padding `--sp-4`.
- Labels: mono label style above each field. Inputs: 44px tall, `--surface` bg, 1px `--line-strong` border, `--r-1`, body 1rem (16px minimum to stop iOS zoom).
- Intensity segmented control: two radio inputs visually as joined rectangles. Checked moderate: `--track-fill` bg + `--tag-mod-ink` text; checked vigorous: `--zone-vig` bg + `--zone-vig-ink` text. Unchecked: transparent, `--fg`. Helper text under the group swaps to match the checked option.
- Minute chips: outline buttons 44px tall, mono; clicking sets the field and focuses it.
- Submit: full-width accent button, 52px tall.
- States: default; hover/focus per global; error (Minutes outline `--accent`, message below); success (live region text, field values keep activity/intensity, minutes resets to empty, focus returns to Minutes).
- Behaviour on submit:
  1. Parse minutes as integer; reject if not 1 to 240.
  2. If sample is active: remove all sample sessions and the sample plan, set `sampleActive=false`, hide banner, announce `Sample cleared. Your log starts now.` then continue.
  3. Push session, save, re-render bib, lane, splits, grid, plan card.

### 5.4 Splits table

- Desktop: real `<table>`, full wrapper width, max 760px, left-aligned. Columns: Day (`Tue 20`), Activity, Min (right, mono), Effort (tag), Counts as (right, mono, e.g. `40`), Remove (text button). Sorted by date ascending, then createdAt.
- Mobile (<640px): each `<tr>` displays as a 2-line block: line 1 `Tue 20 · Run` left and `40` right (display 700); line 2 `20 min` + effort tag + `Remove` right. Use `display:grid` on rows; keep table semantics with `data-label` if needed.
- Sample rows: hatched background and a `SAMPLE` tag after the activity.
- Row hover (desktop): `--surface-2` bg.
- Undo toast: inline bar under the table, `--surface-2`, mono text, `Undo` text button, auto-hides after 6s (reduced motion: no fade, just hidden).

### 5.5 Consistency grid

- 12 week columns (oldest left, current week right), 7 day rows (Mon top to Sun bottom). Row labels at left in mono: `M`, `W`, `F` only (rows 1, 3, 5) to save space. Column foot: a flag under each week that hit 150 (small inline SVG pennant, `--accent`). Column head: month label (`Aug`, `Sep`, `Oct`) only on the first column of each month.
- Cell size: desktop 28px with 4px gap; mobile 22px with 3px gap (12x22 + 11x3 = 297px + 18px labels fits in 368px). Cells square, `--r-1`.
- Cell levels by daily credit: 0 = `--surface-2` with 1px `--line` border; 1 to 19 = `--track-soft`; 20 to 39 = `--track-mid`; 40+ = `--track-fill`. Future days in current week: transparent with 1px dashed `--line`. Today: 2px `--accent` outline.
- Each cell has `title` like `Tue 14 Oct: 40 min`. The grid container is `role="img"` with an `aria-label` summary: `12-week activity grid. 4 of 12 weeks reached 150. 14 active days in the last 28.`
- Stat tiles: desktop 3 across in one ruled row (vertical 1px `--line` dividers), value display 800 `--fs-stat`, label mono above, unit small below. Mobile: 3 across still (each min-width 0, values shrink via clamp), or 1 column if under 360px.
- Desktop layout: grid left (auto width), tiles and legend right, stacked. Mobile: tiles, then grid, then legend.
- Sample: do not hatch cells (too busy at this size); show the `SAMPLE` tag next to the H2 instead.
- Streak rules:
  - Week = Monday 00:00 to Sunday 23:59 local time.
  - Week credit = moderate minutes + 2 x vigorous minutes (all activity types count, including Strength and plan sessions).
  - A week "hits 150" if credit >= 150.
  - **Week streak** = number of consecutive completed weeks that hit 150, counting back from last week; plus 1 if the current week has already hit 150. The current week never breaks the streak while it is in progress.
  - **Weeks at 150** = count of weeks in the 12 shown that hit 150 (current week included only if hit).
  - **Active days** = distinct dates with credit > 0 among the last 28 days including today.
  - Deliberately no daily streak: a missed day should never read as failure.

### 5.6 Habit builder and plan card

- Desktop (>= 960px): two columns. Left (7 cols): sentence builder. The sentence is set in display 700, 1.75rem; each field is an inline input with only a 2px bottom border `--line-strong`, transparent bg, width sized to placeholder (min 12ch, max 22ch), with its mono label visually hidden but present (`<label class="sr-only">`). Chips for each field appear below the sentence in three labelled rows (`After I`, `I will`, `At`). Minutes field and buttons below. Right (5 cols): plan card.
- Mobile and tablet (< 960px): fields become stacked, each with visible mono label, full-width standard inputs; chips wrap under each field (`flex-wrap`). Plan card below.
- Chips: outline, `--r-1`, body 0.875rem, 44px tall; click fills that field (replace text) and moves focus to the next empty field.
- Plan card: `--surface` bg, 1px `--line-strong` border, `--r-2`, pin holes in the corners, not rotated. Hatched while sample.
- Behaviour:
  - Save requires all three text fields non-empty after trim (max 60 chars each). Minutes 1 to 30, default 2.
  - Saving while sample active: clears all sample data first (same as 5.3 step 2).
  - `Did it today` logs a session: `{ type: "habit", minutes: plan.minutes, intensity: "moderate", note: plan.will, source: "plan", date: today }`. Shown in splits as activity `Plan: do 10 squats`. Only one plan session per day: if one exists for today, show the done state. `Undo` removes today's plan session.
  - Day boxes reflect dates that have a `source: "plan"` session.
  - `Edit plan` fills the builder with saved values and moves focus to `#plan-after`. `Delete plan` removes the plan (keeps logged sessions) with inline confirm `Delete this plan? Your logged sessions stay.` buttons `Delete` / `Keep it`.

### 5.7 Exercise snacks and timer

- Desktop: two columns. Left (7 cols): routine list as a ruled list (not cards): each item is a row with name (H3), tags (`7 MIN`, effort), summary text, and an outline button `Load timer` at the right. Selected routine row gets a 4px `--accent` left bar and `--surface-2` bg. Right (5 cols): timer panel, `position: sticky; top: calc(env(safe-area-inset-top, 0px) + 72px)`.
- Mobile: list, then timer panel. `Load timer` scrolls the timer panel into view (`behavior: "smooth"` unless reduced motion) and moves focus to the `Start` button.
- Timer panel: `--surface`, 1px `--line-strong` border, `--r-2`, padding `--sp-5`. Digits in mono `--fs-timer`. Step strip: flex row of blocks (height 8px, gap 3px, flex 1 each, wraps never; at 7+ steps blocks shrink), done = `--fg`, current = `--accent`, upcoming = `--surface-2`. Rest steps show the label `Rest` in `--fg-muted`.
- Routine data (exact):
  - `stairs`: Stair climb, type `stairs`, vigorous, 3 x [Climb 40s work, Rest 20s rest] = 180s, logs 3 min.
  - `desk`: Desk reset, type `strength`, moderate, for each move in [Chair squats, Wall push-ups, Standing march, Calf raises, Hip hinge reach]: [move 45s, Rest 15s] = 300s, logs 5 min.
  - `kitchen`: Kitchen circuit, type `strength`, vigorous, for each in [Squats, Counter push-ups, Reverse lunges, Fast feet, Glute bridge, Plank, Step jacks]: [move 40s, Rest 20s] = 420s, logs 7 min.
  - `loop`: Brisk loop, type `walk`, moderate, [Easy walk 60s, Brisk walk 480s, Easy walk 60s] = 600s, logs 10 min.
  - Drop the final Rest step of any routine (end on work); total time then shortens slightly, but log minutes stay as listed.
- Timer state machine: `idle` (no routine) > `ready` (loaded) > `running` <> `paused` > `finished`. `Reset` returns to `ready` for the same routine. `Skip` jumps to the next step (from the last step it finishes). Loading another routine while running asks inline: `Switch to Desk reset? Your current timer stops.` with `Switch` / `Keep going`.
- Timing: compute remaining time from `performance.now()` timestamps, update display with `setInterval(…, 250)`; never count ticks. Keeps accuracy when the tab is backgrounded.
- Sound: off by default (`#snack-sound` unchecked, persisted in prefs). When on, create one `AudioContext` on the first user gesture (Start). Beep 880Hz, 120ms on each step change; three beeps at finish. Wrap in try/catch; silently skip if unavailable. Also call `navigator.vibrate?.(150)` on step change when sound is on.
- Screen reader: an `aria-live="polite"` region announces only step changes (`Squats, 40 seconds`) and finish (`Done. 7 minutes.`), never every second.
- Timer state is not persisted across reloads.

### 5.8 Sample banner

- Full-width band directly under the header, `--surface-2` bg with hatch overlay, 1px `--line` bottom border. Inner wrap: mono label `SAMPLE WEEK`, text, then outline button. Desktop: one row (label, text flexing, button right). Mobile: stacked, button full width.
- Hidden via `el.hidden = true` when `sampleActive` is false.

### 5.9 Theme toggle

- Cycles auto > light > dark > auto. Auto removes `data-theme` from `document.documentElement`; light/dark set it. Persist to `w150.theme`. Apply stored value in the first lines of the script.

### 5.10 Sticky header

- Height 56px, `--bg` bg, 1px `--line` bottom border, `position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10`. Add `body::before` fixed band of height `env(safe-area-inset-top, 0px)` painted `--bg` per the contract.
- Nav links: mono label style, `--fg`; hover underline 2px `--accent`; current section not tracked (no scroll spy).
- In-page anchor targets need `scroll-margin-top: 72px`.

### 5.11 Reduced motion (`@media (prefers-reduced-motion: reduce)`)

- No bib count-up, no lane width transitions, no smooth scroll, no button press translate, toasts appear and disappear without fades. The bib keeps its static tilt (not motion).
- Page is complete at rest regardless: no scroll-triggered reveals anywhere.

---

## 6. Data model (localStorage)

All access goes through two helpers:

```js
function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
```

At boot, probe storage (`setItem`/`removeItem` of `w150.probe` in try/catch). If it fails, keep everything in memory, still seed sample data, and show the storage-blocked footer line.

| Key | Shape | Notes |
|---|---|---|
| `w150.meta` | `{ "v": 1, "seeded": true, "sampleActive": true }` | Absent means first visit: seed sample, then write meta. Once `sampleActive` is false it is never reseeded. |
| `w150.sessions` | `Session[]` | All sessions, real and sample. Prune entries older than 120 days on save. |
| `w150.plan` | `Plan \| null` | One plan at a time. |
| `w150.prefs` | `{ "sound": false }` | Timer sound. |
| `w150.theme` | `"auto" \| "light" \| "dark"` | Stored as a JSON string. |

```ts
type Session = {
  id: string;            // "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6)
  date: string;          // "YYYY-MM-DD" in LOCAL time (build from getFullYear/getMonth/getDate, never toISOString)
  type: "walk"|"run"|"cycle"|"strength"|"swim"|"yoga"|"sport"|"stairs"|"other"|"habit";
  minutes: number;       // integer 1 to 240
  intensity: "moderate"|"vigorous";
  source: "log"|"plan"|"snack";
  note?: string;         // plan.will for habit sessions, routine name for snacks
  sample: boolean;
  createdAt: number;     // epoch ms
};

type Plan = {
  after: string; will: string; where: string;  // trimmed, max 60 chars each
  minutes: number;       // 1 to 30
  sample: boolean;
  savedAt: number;
};
```

Derived values (never stored):
- `credit(s) = s.intensity === "vigorous" ? s.minutes * 2 : s.minutes`
- `weekStart(date)` = the Monday on or before date (local).
- Week credit, moderate sum, vigorous sum (raw minutes), strength days (distinct dates with `type` in `strength`), last-week credit.
- Days left this week including today = `7 - dayIndex` where Mon = 0.
- Next-step math: `remaining = max(0, 150 - credit)`; `perDay = ceil(remaining / daysLeft)`; `vigorousEquivalent = ceil(remaining / 2)`.

Display labels for `type`: walk `Walk`, run `Run`, cycle `Cycle`, strength `Strength`, swim `Swim`, yoga `Yoga or stretching`, sport `Sport`, stairs `Stairs`, other `Other`, habit `Plan: {note}`.

### Sample seed

Seed is computed relative to today on first visit. All entries get `sample: true`, `source: "log"`. `wk` is weeks before the current week, `d` is day index (0 = Mon). Intensities: `M` moderate, `V` vigorous.

Previous weeks (fixed):

| wk | Sessions `[d, type, minutes, intensity]` | Credit | Hit 150 |
|---|---|---|---|
| 1 | [0 walk 30 M], [2 run 25 V], [4 strength 20 M], [5 cycle 50 M] | 150 | yes |
| 2 | [1 walk 40 M], [3 strength 20 M], [5 run 30 V], [6 walk 35 M] | 155 | yes |
| 3 | [0 walk 30 M], [3 walk 25 M], [5 cycle 40 M] | 95 | no |
| 4 | [1 run 25 V], [2 strength 20 M], [4 walk 50 M], [6 swim 30 M] | 150 | yes |
| 5 | [2 walk 20 M], [6 walk 45 M] | 65 | no |
| 6 | [0 yoga 30 M], [3 walk 30 M], [5 run 20 V] | 100 | no |
| 7 | [0 walk 30 M], [1 strength 25 M], [3 run 25 V], [5 cycle 60 M] | 165 | yes |
| 8 | [4 walk 25 M] | 25 | no |
| 9 | (none) | 0 | no |
| 10 | [1 walk 20 M], [5 walk 30 M] | 50 | no |
| 11 | [2 sport 45 M] | 45 | no |

Current week (target credit 96, so the page opens at `096`, `54 TO GO`):

| i | Session | Credit |
|---|---|---|
| 0 | walk 25 M | 25 |
| 1 | strength 15 M | 15 |
| 2 | run 18 V | 36 |
| 3 | walk 20 M | 20 |

Assign session `i` to day `Monday + floor(i * (todayIndex + 1) / 4)`, so every sample date is on or before today (on a Monday all four land on Monday).

Expected sample readouts: week streak `2`, weeks at 150 `4` of 12, strength days `1 of 2`, last week `150 of 150. Target met.`

Sample plan: `{ after: "pour my morning coffee", will: "do 10 squats", where: "the kitchen counter", minutes: 2, sample: true }`, with no plan sessions (day boxes empty, caption `Done 0 of the last 7 days`).

Clear sample: remove every session with `sample: true`, set plan to null if `plan.sample`, set `meta.sampleActive = false`, save, re-render. Clear all data: remove all `w150.*` keys except `w150.theme`, then write `meta = { v: 1, seeded: true, sampleActive: false }` so it does not reseed.

---

## 7. Wireframes

### Desktop (1280px viewport, 1120px wrap)

```
+--------------------------------------------------------------------------------+
| WEEKLY 150          Log  Streak  Plan  Snacks  Evidence           [Theme: Auto] |  sticky, --bg
+--------------------------------------------------------------------------------+
| SAMPLE WEEK  These sessions and the plan below are made up...  [Clear sample...]|  hatched --surface-2
+================================================================================+
|////////////////////////// TRACK BLUE BAND, FULL BLEED //////////////////////////|
|  THIS WEEK                                                                      |
|  BANK 150 MINUTES THIS WEEK.                     +---------------------------+  |
|  Two brisk walks and a few short sessions...     | LOG A SESSION             |  |
|                                                  | ACTIVITY                  |  |
|   o+--------------------------------+o           | [ Walk               v ]  |  |
|    |WEEK OF 19 OCT        WEEKLY 150|  (-2deg)   | MINUTES        WHEN       |  |
|    |                                |            | [ 20     ]     [Today  v] |  |
|    |  096                           |            | [5][10][20][30]           |  |
|    |                                |            | HOW HARD?                 |  |
|    |ACTIVE MINUTES        TARGET 150|            | [ Moderate | Vigorous ]   |  |
|    |================================|            | You can talk, but not sing|  |
|   o|54 TO GO                SAMPLE  |o           | [         LOG IT        ] |  |
|    +--------------------------------+            | Vigorous minutes count... |  |
|                                    [96]          +---------------------------+  |
|  ================================================|=======                       |
|  |     |    |    |    |    |    |    |    ||||||||                             |
|  ######################///////////                                  | FINISH |
|  ================================================|=======                       |
|  0         30        60        90       120      150 FINISH                     |
|  [ ] Moderate 60 min   [#] Vigorous 18 min x2 = 36                              |
|  54 minutes to go with 3 days left. That is about 18 minutes a day...           |
|  Strength days: 1 of 2 [x][ ]      Last week: 150 of 150. Target met.           |
|/////////////////////////////////////////////////////////////////////////////////|
+================================================================================+
| ============================================================================== |
| THE LOG                                                                         |
| THIS WEEK'S SPLITS                                                              |
| DAY     ACTIVITY            MIN   EFFORT     COUNTS AS                          |
| Mon 19  Walk  [SAMPLE]       25   MODERATE          25   Remove                 |
| Tue 20  Strength [SAMPLE]    15   MODERATE          15   Remove                 |
| Wed 21  Run [SAMPLE]         18   VIGOROUS          36   Remove                 |
| Thu 22  Walk [SAMPLE]        20   MODERATE          20   Remove                 |
| Week total                                          96                          |
+--------------------------------------------------------------------------------+
| ============================================================================== |
| CONSISTENCY                                                                     |
| YOUR LAST 12 WEEKS  [SAMPLE]                                                    |
|      Aug             Sep                Oct       | WEEK STREAK | WEEKS AT 150 | ACTIVE DAYS |
|  M  [] [] [] [] [] [] [] [] [] [] [] []            |  2          |  4           |  14         |
|     [] [] [] [] [] [] [] [] [] [] [] []            |  weeks in   |  of the last |  in the     |
|  W  [] [] [] [] [] [] [] [] [] [] [] []            |  a row      |  12          |  last 28    |
|     [] [] [] [] [] [] [] [] [] [] [] []            | Keep the streak: 54 minutes to go...      |
|  F  [] [] [] [] [] [] [] [] [] [] [] ..            | Less [][][][] More   > Hit 150            |
|     [] [] [] [] [] [] [] [] [] [] [] ..            |                                           |
|     [] [] [] [] [] [] [] [] [] [] [] ..            |                                           |
|                 >     >     >     >                |                                           |
+--------------------------------------------------------------------------------+
| START SMALL                                                                     |
| PICK A TRIGGER YOU ALREADY HAVE.                                                |
| Tie a tiny bit of movement to something...         o+-----------------------+o  |
|                                                     | SAMPLE PLAN            |   |
| After I _pour my morning coffee_, I will            | After I pour my morning|   |
| _do 10 squats_ at _the kitchen counter_.            | coffee, I will do 10   |   |
| AFTER I  (pour my morning coffee)(park the car)...  | squats at the kitchen  |   |
| I WILL   (do 10 squats)(walk around the block)...   | counter.               |   |
| AT       (the kitchen counter)(my front door)...    | S S M T W T F          |   |
| IT TAKES ABOUT [2] minutes                          | [][][][][][][]         |   |
| [SAVE MY PLAN]  Clear                               | Done 0 of the last 7   |   |
|                                                     | [DID IT TODAY]         |   |
|                                                    o| Edit plan  Delete plan |o  |
+--------------------------------------------------------------------------------+
| EXERCISE SNACKS                                                                 |
| SHORT ON TIME? TAKE A SNACK.                                                    |
| No gym, no kit, no change of clothes...                                         |
| -----------------------------------------------   +---------------------------+ |
| STAIR CLIMB      3 MIN  VIGOROUS    [Load timer]  | STOPWATCH                 | |
| Climb stairs briskly for 40 seconds...            | KITCHEN CIRCUIT           | |
| -----------------------------------------------   | Squats                    | |
|#KITCHEN CIRCUIT  7 MIN  VIGOROUS    [Load timer]  |   00:40                   | |
| Squats, counter push-ups, reverse lunges...       | Next: Counter push-ups    | |
| -----------------------------------------------   | Total left 06:20          | |
| DESK RESET ...                                    | [=][=][-][ ][ ][ ][ ]...  | |
| BRISK LOOP ...                                    | [START] [Skip] [Reset]    | |
| Go at your own pace. Stop if you feel pain...     | [x] Beep at each change   | |
|                                                   +---------------------------+ |
+--------------------------------------------------------------------------------+
| THE EVIDENCE                                                                    |
| WHY BOTHER, BRIEFLY.                                                            |
| -----------------------------------------------------------------------------  |
| FACT_1.stat   FACT_1.claim ...............................  Source: label       |
| -----------------------------------------------------------------------------  |
| FACT_2.stat   FACT_2.claim ...............................  Source: label       |
| ... up to FACT_6                                                               |
+--------------------------------------------------------------------------------+
| Weekly 150 follows the WHO guideline...  Read the WHO guideline                 |
| Your log lives in this browser only. Nothing is sent anywhere.                  |
| General information, not medical advice...                 Clear all my data   |
+--------------------------------------------------------------------------------+
```

### Mobile (400px viewport, 16px gutters, 368px content)

```
+--------------------------------------+
| WEEKLY 150   [Log a session] [Theme] |
+--------------------------------------+
| SAMPLE WEEK                          |
| These sessions and the plan below    |
| are made up so you can see how...    |
| [ Clear sample and start fresh     ] |
+======================================+
|///////////// TRACK BLUE /////////////|
| THIS WEEK                            |
| BANK 150                             |
| MINUTES THIS                         |
| WEEK.                                |
| Two brisk walks and a few short...   |
|  o+------------------------------+o  |
|   |WEEK OF 19 OCT     WEEKLY 150 |   |  (-1deg, left aligned)
|   | 096                          |   |
|   |ACTIVE MINUTES     TARGET 150 |   |
|  o|54 TO GO               SAMPLE |o  |
|   +------------------------------+   |
|                         [96]         |
| ================================     |
| ###########////////     |  FINISH    |
| ================================     |
| 0             75            150      |
| [ ] Moderate 60  [#] Vigorous 18x2   |
| 54 minutes to go with 3 days left... |
| Strength days: 1 of 2 [x][ ]         |
| WHO also suggests muscle work on...  |
| Last week: 150 of 150. Target met.   |
| +----------------------------------+ |
| | LOG A SESSION                    | |
| | ACTIVITY  [ Walk             v ] | |
| | MINUTES   [ 20 ]                 | |
| | [5] [10] [20] [30]               | |
| | WHEN      [ Today            v ] | |
| | HOW HARD? [Moderate|Vigorous]    | |
| | You can talk, but not sing.      | |
| | [            LOG IT            ] | |
| +----------------------------------+ |
|//////////////////////////////////////|
+======================================+
| THE LOG                              |
| THIS WEEK'S SPLITS                   |
| Mon 19 . Walk [SAMPLE]          25   |
| 25 min [MODERATE]          Remove    |
| ------------------------------------ |
| Wed 21 . Run [SAMPLE]           36   |
| 18 min [VIGOROUS]          Remove    |
| Week total                      96   |
+--------------------------------------+
| CONSISTENCY                          |
| YOUR LAST 12 WEEKS                   |
| STREAK | AT 150 | ACTIVE             |
|   2    |   4    |  14                |
| Keep the streak: 54 minutes to go... |
|   Aug       Sep        Oct           |
| M [][][][][][][][][][][][]           |  22px cells, 3px gap
|   [][][][][][][][][][][][]           |
| W ...                                |
|      >  >     >           (flags)    |
| Less [][][][] More  > Hit 150        |
+--------------------------------------+
| START SMALL                          |
| PICK A TRIGGER YOU ALREADY HAVE.     |
| AFTER I                              |
| [ pour my morning coffee         ]   |
| (pour my morning coffee)(park...)    |
| I WILL                               |
| [ do 10 squats                   ]   |
| (do 10 squats)(walk around...)       |
| AT                                   |
| [ the kitchen counter            ]   |
| IT TAKES ABOUT [2] minutes           |
| [ SAVE MY PLAN ]   Clear             |
| o+--------------------------------+o |
|  | SAMPLE PLAN                    |  |
|  | After I pour my morning...     |  |
|  | [][][][][][][]  Done 0 of 7    |  |
|  | [ DID IT TODAY ]               |  |
| o+--------------------------------+o |
+--------------------------------------+
| EXERCISE SNACKS                      |
| SHORT ON TIME? TAKE A SNACK.         |
| STAIR CLIMB  3 MIN VIGOROUS          |
| Climb stairs briskly for...          |
| [ Load timer ]                       |
| ... (3 more)                         |
| +----------------------------------+ |
| | STOPWATCH  Kitchen circuit       | |
| | Squats                           | |
| |  00:40                           | |
| | Next: Counter push-ups           | |
| | [=][=][-][ ][ ][ ][ ][ ][ ]      | |
| | [START] [Skip] [Reset]           | |
| | [x] Beep at each change          | |
| +----------------------------------+ |
+--------------------------------------+
| THE EVIDENCE                         |
| FACT_1.stat                          |
| FACT_1.claim ...                     |
| Source: label                        |
| ... up to FACT_6                     |
+--------------------------------------+
| footer lines, Clear all my data      |
+--------------------------------------+
```

---

## 8. Build checklist

Contract and skeleton
- [ ] File starts with `<title>Weekly 150</title>`, then `<meta name="claude:viewport-fit-sides" content="cover">`, then the Google Fonts `<link>`, then `<style>`, content, `<script>`. No doctype/html/head/body.
- [ ] Only external resource is the one Google Fonts stylesheet. No scripts from CDNs, no images, no fetch.
- [ ] `:root` padding left untouched.
- [ ] Every colour in component CSS is a `var(--token)`; full light block on `:root`, identical dark values in the `prefers-color-scheme` block and the `[data-theme="dark"]` block (including `--tag-mod-ink` and `--bib-muted`).
- [ ] `body` sets `background: var(--bg); color: var(--fg)`.
- [ ] Gutter rule (`max(16px, env(safe-area-inset-*))`) on each band's inner `.wrap`, vertical via `padding-block` only.
- [ ] Sticky header uses `top: env(safe-area-inset-top, 0px)` plus `body::before` fixed band in `--bg`.
- [ ] Show/hide with `el.hidden`, never `style.display`.
- [ ] No `alert`, `confirm`, `prompt`; all confirms are inline. All forms `preventDefault` on submit.

Behaviour
- [ ] Storage helpers wrap every `localStorage` call in try/catch; in-memory fallback works and shows the blocked-storage footer line.
- [ ] First visit seeds the exact sample in section 6; page opens at `096`, `54 TO GO`, week streak 2, weeks at 150 = 4.
- [ ] Sample banner, hatching and `SAMPLE` tags appear only while `sampleActive`.
- [ ] Any real log, plan save, plan `Did it today`, or snack log clears sample data first and announces it.
- [ ] Dates built from local date parts; weeks start Monday.
- [ ] Credit = moderate + 2 x vigorous; lane caps visually at 150 and shows `+N` beyond.
- [ ] Next-step line, strength days and last-week line follow the copy rules in section 4.
- [ ] Remove with 6-second Undo works; totals, bib, lane and grid all re-render.
- [ ] Grid: 12 columns, Mon to Sun rows, levels 0/1 to 19/20 to 39/40+, today outlined, future days dashed, flags under weeks at 150.
- [ ] Plan: save, show card, `Did it today` once per day with Undo, 7-day boxes, edit, inline delete confirm.
- [ ] Timer: timestamp based, Start/Pause/Resume, Skip, Reset, switch-routine inline confirm, finish offers `Log N min`, paused 60s+ offers partial log.
- [ ] Sound off by default; AudioContext created on user gesture only; failures silent.
- [ ] FACT rows render only when stat, claim and url are filled; no placeholders shipped.
- [ ] Theme toggle cycles Auto, Light, Dark and persists.
- [ ] Clear all data uses the inline confirm and does not reseed.

Accessibility and quality
- [ ] Every form control has a stable id and a `<label>` (sr-only where the design hides it).
- [ ] `:focus-visible` ring on everything, re-scoped to white on the blue band.
- [ ] Lane is `role="meter"` with value text; bib has an `aria-label`; grid has a summary `aria-label`.
- [ ] Live regions: log result, sample cleared, timer step changes (not every second).
- [ ] Touch targets at least 44px.
- [ ] `tabular-nums` on all numbers (bib, lane marker, splits, stats, timer).
- [ ] `prefers-reduced-motion`: no count-up, transitions, smooth scroll or press translate.
- [ ] Nothing hidden waiting for scroll observers; page complete at rest.

Responsive and visual QA
- [ ] At 400px: no horizontal scroll (check the grid, the lane labels, the splits rows, the sentence builder and the timer digits).
- [ ] At 400px the hero headline wraps cleanly, the bib fits within 368px, and the log panel follows the lane.
- [ ] Layout is left-aligned throughout; only the bib carries a shadow; no gradients other than the hatch stripe.
- [ ] Check both themes: bib stays paper-white, amber and white lane fills stay visible on the blue band, focus rings visible on band and panels.
- [ ] Search the final file for the em dash (U+2014) and en dash (U+2013) characters: zero matches.
