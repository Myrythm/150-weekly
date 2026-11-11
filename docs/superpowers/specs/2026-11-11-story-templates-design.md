# Run story templates: design

Date: 2026-11-11. Status: reviewed, waiting for the owner's approval. This feature works with the GPX imports the app already has. The Strava sync that was discussed alongside it is shelved (`2026-11-11-strava-sync-design.md`), so GPX imports are the only source of runs.

Visual reference: `2026-11-11-story-templates-mockup.html` in this folder. It is the last mockup the owner approved (six templates, colour, opacity, number picker). It is an HTML and CSS sketch, not production code. Open it in a browser; it is a page fragment, so it shows unstyled page chrome but the six stories and all controls work. One difference from this document: the mockup still offers Calories, which this version leaves out (see Stats).

## Why

After a run the owner wants to post it as an Instagram story: their own photo with good looking stats on top, in the Weekly 150 style, without designing anything. Just upload a picture.

## What the owner agreed to (from the conversation)

1. A story sized template for runs. The owner only uploads a photo.
2. The stats must look good.
3. Several templates to choose from, and some of them animated, not only static.
4. The six templates in the mockup, all approved: A Race bib, B Clean, F Poster (static); C Splits, D Route trace, E Week lap (animated).
5. The colour can be changed (the blue in the mockup is only the default).
6. The opacity of the colour layer can be set by hand.
7. The owner can choose which numbers are shown. A recommended set is filled in from the start.
8. Confirmed as proposed: the feature starts from the activity detail page; the flow is pick template, pick colour, upload photo, preview, download; the photo never leaves the device; runs only for now; no direct posting to Instagram.

## Goals

- From a run's detail page to a finished story file in under a minute, with the defaults already looking right.
- Six templates in the Weekly 150 identity (race bib, track band, results sheet numbers, Barlow Condensed, IBM Plex Mono).
- What the preview shows is exactly what is exported.
- Static templates export an image. Animated templates export a short video that Instagram accepts from the phone's gallery or share sheet.
- Works on a phone at 400px with no horizontal scroll.

## Non-goals

- Posting to Instagram from the app (there is no web route for it).
- Activities other than runs (walk, cycle, swim come later).
- Free placement of text, custom fonts, stickers, music.
- Uploading or storing the photo on the server.
- Other export sizes than 9:16.

## Anti-goals

- The photo, or anything derived from it, leaving the device.
- An export that differs from the preview (cut off text, missing font, wrong colour).
- Unreadable text because of the chosen colour or opacity with no way back to a readable default.
- A video file that Instagram rejects, handed over without warning.
- Numbers on the story that differ from the numbers on the activity page.

## How it works

### Entry

- A "Share story" control on the activity page (`ActivityPage.vue`), in the header block next to the title. It shows for sessions of type `run` that still have their stored activity record (the record the activity page draws its stats, route and splits from). So every story has a route and a distance.
- Not in this version: runs logged by hand (they have no activity page link today) and imported runs whose route is no longer stored (older than the 30 most recent imports). They get no "Share story" control.
- It opens a story page for that session (its own route, login required like the activity page), with a way back to the activity.

### The story page

Top: the live preview at 9:16. Below: the controls, in this order.

1. **Template**: the six templates, each marked static or animated.
2. **Photo**: upload from the device, then drag to reposition and zoom to fit. "No photo" uses the chosen colour as the whole background.
3. **Colour**: seven presets (blue, red, green, purple, black, yellow, paper white) and a free colour picker. Default: the app's track blue.
4. **Opacity**: a slider from 0 to 100 percent in steps of 5, default 100. It sets the opacity of the colour layer of the template: the bib card in A, the dark gradient in B, the track band in C, the colour wash in D and E, the background in F. Where a layer becomes see-through in A and C, the photo behind it is blurred so numbers stay readable.
5. **Main number**: distance, time or pace. Default: distance.
6. **Small numbers**: up to 4 of distance, time, pace, average heart rate, best km, max heart rate, climb, cadence. Default (the recommended set): time, pace, average heart rate. The current main number cannot also be a small number. "Back to recommended" restores main number and small numbers.
7. **Export**: one control to create the file, then Share and Download.

Rules for the controls:

- A number the activity has no data for cannot be picked for that activity (for example no heart rate in a Mi Fitness GPX file). If a recommended number is missing, the next available one from the list takes its place, in list order.
- Text colour on the colour layer switches between white and the app's dark ink by the luminance of the chosen colour, and the highlight colour (fastest km, today's part of the week) switches between amber and red the same way, as in the mockup.
- Template, colour, opacity, main number and small numbers are remembered per user (a new field with a default in an existing server key, so it follows the account). The photo is never remembered.

### Template content

All templates carry the wordmark "WEEKLY 150", the activity label and date, the main number and the small numbers. In addition:

| Template | Kind | Extra content | Needs |
|---|---|---|---|
| A Race bib | static | Paper bib card, progress bar "N of T min this week" | nothing (the bar needs a week target) |
| B Clean | static | Small route outline in a corner | nothing |
| C Splits | animated | One lane per km, bar length by pace, fastest km highlighted | at least 2 full km splits with a pace |
| D Route trace | animated | Route drawn start to finish with a moving dot, main number counts up | nothing |
| E Week lap | animated | Oval track filling toward the weekly target, this run's part highlighted, counter from minutes before to minutes after, seven day row | week target |
| F Poster | static | Full colour background, photo in a frame, small route outline | nothing |

- A template whose needed data is missing is shown as unavailable with a short reason (for example a 1.5 km run has no lanes for C). An optional part that lacks data is simply left out (the week bar in A).
- **Week numbers** (A and E) are for the week of the run, not the current week: credited minutes in that week before this session, this session's credited minutes, and the target from the age guide. They use the same rules as the week page (`credit()`, `weekCredit`, the guide for the user's age). With no age or no weekly target (under 5), E is unavailable and A hides its bar. A light effort run credits 0 minutes, so E shows "+0" for it; that is correct and stays.
- **Stats** come from the same stored metrics the activity page shows, formatted the same way.
  - **Time** is moving time, the same value the activity page calls "Moving time" and the one pace is based on. It is not the logged minutes. The week counter in E is a different thing (credited minutes) and is labelled as minutes of the week.
  - **Calories are not offered in this version.** A GPX file carries none, the app does not store body weight, and an estimate would be a number the activity page does not show. The only planned source was Strava, which is shelved.
  - **The owner's own files**: a Mi Fitness GPX export holds position and time only (no heart rate, elevation or cadence). For those runs the pickable numbers are distance, time, pace and best km, and the recommended set becomes time, pace, best km by the replacement rule above. Heart rate, climb and cadence appear for files that carry them (for example a Garmin export).
  - A file with a route but no timestamps has no time and no pace. If the chosen main number has no data, the main number falls back to distance, which every story has.
- **C with many km**: one lane per km up to 10 km. Above 10 km the lanes become 5 km blocks (the splits sheet already uses 5 km blocks for cycling), so the template never shows more than 10 lanes for runs up to 50 km.
- Text on the templates is English, like the rest of the app.

### Rendering and export

- One renderer draws a template onto a 1080x1920 canvas from the template id, the options, the run's data and a time value. The preview is that same canvas scaled down, so preview and export cannot drift apart. Static templates ignore the time value.
- Fonts must be loaded before the first draw (Barlow Condensed 600, 700, 800 and IBM Plex Mono 500 are already loaded by `app/index.html`).
- The photo is decoded with its EXIF orientation applied, scaled down before drawing, and released when the page is left.
- Safe area: nothing important above y 250 or below y 1580 of 1920, where Instagram draws its own interface.
- **Animated templates**: about 5 seconds at 30 frames per second. The motion finishes in about 3 seconds and the final state holds for the rest, so the last frame is the same as a static version. The preview loops. With reduced motion requested by the system, the preview shows the final state and plays only on request.
- **Static export**: a PNG.
- **Animated export**, in this order:
  1. Frame by frame H.264 encoding with WebCodecs into an MP4 (a muxing library is needed; Mediabunny, MPL-2.0, is the current maintained option and is loaded only when a video is exported).
  2. If that is not supported or produces no output, real time recording of the canvas into MP4 where the browser can do it.
  3. If neither gives an MP4, say so plainly and offer the image of the final state instead. Never hand over a WebM as if it would work on Instagram.
- **Delivery**: creating the file and sharing it are two separate taps (the share sheet needs a fresh tap, a long render before it breaks that). After the file is ready: Share when the device can share files, and Download always. On iPhone a downloaded file goes to Files, not Photos, so the page says where it went.

### Privacy

The photo is read and drawn in the browser only. No upload, no server storage, no analytics on it. Only the chosen settings (template, colour, opacity, numbers) are saved with the account.

## Project rules that apply, and one stated exception

- Controls use the existing tokens in all three theme blocks, have stable ids, visible focus, and work at 400px.
- All text reaches the page through `{{ }}` or `textContent`. Canvas text comes from the same stored values.
- **Exception to "colours only as tokens"**: the colours drawn on the exported story (the seven presets, the free colour, the amber and red highlights, white and ink text) are content of the export, not interface theme. They do not change with light or dark mode. They live in one place in the story code, not scattered.
- The canvas has a text alternative that states the template and the numbers shown.

## Risks and open points

1. **Video on real phones is not verified.** Whether the WebCodecs MP4 (silent, no audio track) is accepted by Instagram, and whether iPhone Safari encodes 1080x1920 H.264 reliably, could not be confirmed from documentation (Meta's help pages gave no specifications; old WebKit bug reports exist).
   - **Order of work**: build the export path first as a small spike (one moving test pattern, 5 seconds, 1080x1920, exported as MP4). The static templates (A, B, F) and the image export do not depend on it and can be built at the same time.
   - **Who tests**: the owner, on their own phone (Android, so Chrome on Android is the tested browser), by creating the file and posting it to an Instagram story. iPhone stays untested. Passing means: the file is created, Instagram accepts it, it plays for its full length, and it is sharp.
   - **Reaching the spike from a phone**: WebCodecs only works on a secure page (HTTPS or localhost), and the app is not deployed. The spike therefore has to be a small page on an HTTPS address the phone can open (a hosted test page or a tunnel to the dev server), not the dev server's LAN address.
   - **If it fails on a platform**: that platform gets the still image of the final state for animated templates, with a plain message, as in the fallback list above. The animated templates still ship for platforms where it passes. An iPhone test is wanted but does not block shipping for the owner's own phone.
2. **Share sheet target.** Whether Instagram Stories appears directly in the share sheet for a shared file is not verified. Download is the dependable path.
3. **Blur under see-through layers** costs performance on canvas, mostly in the video export on older phones. If it is too slow, the fallback is no blur below a set opacity, with the text getting a soft shadow instead.
4. **A new dependency** (the muxing library) enters the app. It is loaded on demand so the main bundle does not grow.

## How it is checked

- Unit tests for everything that is not pixels: which numbers are available and recommended for a given activity, the replacement rule, the 4 number limit, text and highlight colour for a given colour, week numbers for the run's week, template availability, the animation timeline at given times, lane rules for C.
- The renderer takes its drawing context as an argument so tests can record the drawing calls (the test environment has no real canvas).
- Browser check on the local server: every template with and without a photo, each colour preset, opacity at 0, 50 and 100, main number changed to time and to pace, 4 small numbers, a run with no heart rate, a run with no route, 375px and desktop, light and dark for the controls, reduced motion.
- Export check on real devices: PNG and MP4 created on Android Chrome and iPhone Safari, both posted to an Instagram story, text sharp, nothing cut off, nothing under Instagram's interface.
- The usual project checks (`npm test`, `npm run app:build:local`, secret and dash greps).

## Left to the builder

- Route path and component split, and where the saved settings live (a new field with a default in an existing server key).
- Exact layout numbers for each template on the 1080x1920 canvas, matching the mockup's proportions.
- Easing and timing details of each animation within the 3 second budget.
- Bitrate and codec level for the video, the scale-down size for photos, and the opacity below which blur is dropped if needed.
- Wording of labels and messages in the app's plain style.

## Calls made by the designer, not by the owner

- 9:16 only (the owner saw 9:18 in the mockup and did not ask for it).
- A separate story page instead of a dialog.
- At most 4 small numbers.
- Settings saved with the account; the photo never saved.
- Week numbers are for the run's week.
- About 5 seconds, 30 frames per second, final state held at the end.
- Missing data makes a template unavailable instead of drawing it half empty.
- Above 10 km, template C uses 5 km blocks.
- Stories only for runs with a stored activity record; hand logged runs are left out of this version.
- Time on the story is moving time.
- Calories left out of this version (no data source, never estimated), although the mockup showed them.
- If the video export fails on a platform, that platform gets the still image; static templates do not wait for the video spike.
- If no MP4 can be made, offer the still image instead of a WebM.
