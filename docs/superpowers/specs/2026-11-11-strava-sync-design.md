# Strava sync: design

Date: 2026-11-11. **Status: shelved by the owner on 2026-11-11, not to be built.** Strava requires a paid Strava subscription to create an API application, and the owner does not want to pay for one. This document is kept as a record in case that changes. It was reviewed once but never approved for building. Companion design: `2026-11-11-story-templates-design.md` (independent of this one, going ahead).

## Why

The owner trains with a Xiaomi Smart Band 9. Mi Fitness already syncs each workout to Strava. Today a workout reaches Weekly 150 only by exporting a GPX file and importing it by hand. The owner wants to finish a run, open Weekly 150 and see that run already in this week, counted toward the 150 minutes, without doing anything.

A direct link to the band is not realistic for a web app (proprietary encrypted Bluetooth protocol, the band bonds to one app, Mi Fitness has no public API, Health Connect is native only). Strava has an official API, so Strava is the bridge.

## What the owner agreed to (from the conversation)

1. Open Weekly 150 and the latest workout from the band is already in this week, with its minutes counted.
2. One time "Connect with Strava". No Strava login again afterwards.
3. New workouts are pulled every time the app is opened. A Sync button pulls on demand.
4. Imported workouts are saved directly, with no review card. If minutes or effort are off, the owner can edit them, or Remove with Undo.
5. Effort is decided like GPX import: heart rate when Strava has it, otherwise speed. Weight training counts as a muscle day, never as aerobic minutes.
6. Every imported workout with a route gets the same detail page as a GPX import (route, pace, charts, splits).
7. Each user connects their own Strava. Data stays separate per account.
8. No full history import. Only from the moment of connecting, plus a few weeks back.
9. On the first connect, everything from the last 28 days is imported automatically, with no checklist. If a workout the owner had already logged by hand shows up a second time, the owner removes the extra one (answered 2026-11-11).

## Goals

- Workouts recorded on the band appear in Weekly 150 with no manual step after the one time connect.
- Imported workouts are normal sessions: every existing rule (`credit()`, strength, light, balance, age guide) applies unchanged.
- Works on the local stack and after deploy.
- No Strava secret or token ever reaches the browser.

## Non-goals

- Talking to the band, Mi Fitness or Health Connect directly.
- Writing anything to Strava (no upload, no edits).
- Importing the whole Strava history.
- Live heart rate.
- Other providers (Garmin, Fitbit).
- Showing one user's Strava data to another user.

## Anti-goals (would make this a failure even if it works)

- A removed imported session coming back on the next sync.
- The same workout counted twice, once from Strava and once from a GPX import of the same run. (A double with a session logged by hand is accepted by the owner, see item 9: such sessions carry no start time or distance to match on.)
- A Strava token, client secret or refresh token in `app/`, in a committed file, or in a response to the browser.
- Aerobic minutes entering through any route other than `credit()`.
- Breaking the shape of the existing `w150.*` values.

## How it works

### Shape of the solution (the builder's main constraint)

**The browser stays the only writer of sessions and tracks.** The Edge Function only talks to Strava and hands raw activity data to the logged-in user's browser. The browser converts it and saves it through the existing store (`addSession`, `saveTrack`). Reasons: effort judging (`judgeEffort`, `GPX.classify`), metric compaction, the track cap, sanitising and the three-way merge all live in the browser already, so nothing is duplicated on the server and no server process races the compare-and-set versions of `user_data`.

Consequence, accepted: a workout is imported when the app is open, not while it is closed. This matches item 3 above.

### Connect

1. A Strava card on the week page (near GPX import) shows the official "Connect with Strava" button.
2. The browser asks the function for an authorize URL. The function builds it with the client id, the redirect URI and a short lived `state` value bound to the user (signed or stored server side, single use).
3. Strava returns to a new app route (for example `/strava/callback`) with `code`, `scope` and `state`. The route requires login (`meta.auth`), so a logged-out return goes through `/login?next=`.
4. The browser posts `code` and `state` to the function. The function checks the state, exchanges the code with the client secret, checks that the granted scope allows reading activities, stores the tokens and returns only the athlete's display name.
5. Scope requested: `activity:read_all` (so private workouts import too). If the athlete unticks it and only `activity:read` is granted, connect still succeeds and private workouts are simply not seen. If no activity scope is granted, connect fails with a plain message.
6. One Strava athlete can be linked to one Weekly 150 account at a time. Linking an athlete that is already linked elsewhere is refused with a plain message.

### Sync

- Triggers: after the app has loaded the user's data, when the tab becomes visible again (no more often than once every 5 minutes), and the Sync button.
- Every sync looks at a rolling window: activities that started in the last 28 days. The browser sends the Strava activity ids it has already handled inside that window. The function refreshes the access token when needed (tokens last 6 hours and the refresh token rotates, always keep the newest), lists the window, drops the handled ids, and for each remaining activity fetches the detail and, when it has GPS, the streams (`time`, `latlng`, `distance`, `altitude`, `heartrate`, `cadence`). It returns them oldest first, at most 20 per call, with a flag when more remain. The browser then calls again; such continuation calls are not held back by the one minute limit below.
- The browser converts and saves each activity and records its id as handled. An id counts as handled when it was imported, skipped as a duplicate, or declined by the user. The handled list (id and start time) is stored with the user's data (a new field with a default in an existing key, so it follows the user across devices). Ids older than the window are dropped from the list, because they are never asked for again.
- A handled id is never imported again, so a session the user removed does not come back.
- The window goes by start time, not by a cursor that only moves forward. So a workout that reaches Strava late (Mi Fitness syncing a day late, a backlog arriving out of order) is still picked up, as long as it started within the last 28 days.
- Two devices that sync at the same moment could both import the same activity. Sessions are de-duplicated by Strava activity id when merging and sanitising.
- After a sync that imported something, the live region announces it (for example "2 workouts imported from Strava.") and the sessions appear in the week table like any other.

### Turning a Strava activity into a session

- **Type** from `sport_type`: Run, TrailRun, VirtualRun to `run`. Walk, Hike to `walk`. Ride and its variants (GravelRide, MountainBikeRide, EBikeRide, EMountainBikeRide, VirtualRide, Velomobile, Handcycle) to `cycle`. Swim to `swim`. WeightTraining to `strength`. Yoga, Pilates to `yoga`. Dance to `dance`. StairStepper to `stairs`. Ball and racket sports (Soccer, Basketball, Tennis, Badminton, Padel, Pickleball, Squash, Racquetball, TableTennis, Volleyball, Cricket, Golf) to `sport`. Everything else to `other`.
- **Date**: the date part of `start_date_local`.
- **Minutes**: `moving_time` in minutes, rounded. Under 1 minute is skipped. Over 240 is saved as 240 (the app's existing limit).
- **With GPS streams**: the streams become the same point list the GPX parser produces, and go through the same analysis, so `metrics`, `track`, splits and classification have the exact shape of a GPX import. This needs one new entry point in `tools/gpx/gpx-lib.js` that analyses points instead of GPX text. The track is stored in `w150.tracks` under the same rules (500 points, 30 most recent tracks).
- **Without GPS** (treadmill, weights, yoga): a session with no track. Effort from the activity's average heart rate against the same thresholds when the age is known, otherwise moderate.
- **Effort** is decided by the existing `judgeEffort` rules: heart rate first, then speed, then the default.
- **Session fields**: `source: 'strava'` and a new optional field holding the Strava activity id. `sanitizeSessions` currently rewrites any unknown source to `'log'`, so it must learn the new source and the new field. Calories from the activity detail, when present, are kept with the track metrics (the story templates can show them).
- **Duplicates**: an activity whose Strava id is already on a session is skipped. An activity that matches a stored track by the existing duplicate rule (same start time, distance within 1 percent) is skipped too, so a run that was already imported from GPX is not counted twice.

### After import

- **Every Strava session gets a Details link**, also the ones without a route (today only sessions with a track have one). For a session without a route the activity page shows the label, date, minutes, effort and "View on Strava", and says plainly that this workout has no route (not the existing "route is no longer stored" text). Calories of a workout without a route are not kept.
- The activity page shows "View on Strava" (exact text, linking to the activity on Strava) for sessions that came from Strava.
- **Edit**: the owner can correct minutes and effort. No edit path exists in the app today (only Remove with Undo), so this design adds a small edit on the activity page. It applies to every session that page can show (Strava and GPX imports), since it would be odd to offer it for one and not the other. Minutes follow the existing limit (1 to 240). The activity type cannot be changed. For a strength session only minutes can be edited, because effort does not affect it. Editing goes through the store like every other change, and the note that the logged effort differs from the judged one keeps working.
- Remove with Undo works as for any session.

### Disconnect

- A Disconnect control in the Strava card. The function revokes access at Strava and deletes the stored tokens.
- The control asks whether to also remove the sessions imported from Strava. Default: keep them.
- If the athlete revokes access from Strava's side, the webhook (below) deletes the tokens, and the next time the app is opened the card shows that Strava is no longer connected.

### Server side

- **Table** for the link: user id, Strava athlete id (unique), access token, refresh token, expiry, granted scope, connect time. Service role only, no client policy at all, like `auth_attempts`. A user's row is removed when the account is removed.
- **Edge Function for the logged-in user** (connect URL, code exchange, status, sync, disconnect). Unlike the two existing functions, it must know who is calling: it verifies the user's access token. The browser needs a second call helper that sends the session token (the existing `callFunction` sends only the anon key). CORS and origin checks follow `_shared/auth.ts`.
- **Webhook function** (public, no JWT): answers Strava's subscription check, and on an athlete deauthorization event deletes that athlete's tokens. Activity events are acknowledged and ignored in this version (the browser pulls on open). It must answer within 2 seconds. Strava's getting started page says webhooks are needed to learn about deauthorization, so this is part of the design, not an extra. It only works on a deployed, public URL. The one time subscription call is a deploy step.
- **Secrets** (Supabase function secrets only): Strava client id, client secret, webhook verify token. A base URL override for Strava lets the smoke tests point the function at a local fake Strava.
- **Who can use it**: a new Strava application only lets its developer's own Strava account connect (10 accounts after the self service upgrade), and Strava's Policy has not been read yet (risk 3). So the function holds an allowlist of Weekly 150 usernames in a secret. The status action tells the browser whether Strava is available for the caller; for everyone else the Strava card is not shown at all. A wildcard value opens it to every account later, without a code change.
- **Limits**: per user, sync at most once a minute on the server. Strava's default quota for an app is 100 read requests per 15 minutes and 1,000 per day. One new activity costs up to 2 requests plus 1 list request per sync.

### Strava's rules that shape the design

- Verified on Strava's pages on 2026-11-11: a user's Strava data may be shown only to that user (this app already works that way). Official brand assets are required: the "Connect with Strava" button, "Powered by Strava" where Strava data is shown, and the exact link text "View on Strava". The app's name must not contain "Strava".
- A new Strava API application starts in single player mode: only the developer's own Strava account can connect. The developer can raise it to 10 athletes from the API settings page. More than 10 needs a review by Strava.
- **Creating a Strava API application requires a Strava subscription** (stated on Strava's getting started page). This is a precondition only the owner can meet.

## Risks and open points

1. **Strava subscription.** Without one, the API application cannot be created and this feature cannot run. The owner decided on 2026-11-11 not to pay for it, which is why this design is shelved.
2. **What Mi Fitness sends to Strava is not verified.** Route and distance should arrive for outdoor runs (the band uses the phone's GPS). Whether heart rate, cadence and calories arrive is unknown. The design handles both cases. Check the owner's real activities early.
3. **Strava's API Policy was not read** (only the API Agreement and the getting started page were). The Agreement sets no limit on how long data may be stored, but a secondary source claims a 7 day cache limit and a ban on using Strava data with AI. Before opening this to anyone but the owner, read the Policy. Until then: keep Strava derived data out of the planned AI assistant.
4. **"Do not replicate Strava functionality"** is in the Agreement with no example. A personal training log that counts weekly minutes is a different product, but the activity detail page overlaps with Strava's. Low risk for personal use.
5. **Track cap.** With automatic import, 30 stored routes cover roughly the last one or two months. Older sessions keep their minutes but lose the route, as today. Raising the cap or refetching a route on demand is left for later.
6. **Not deployed yet.** The webhook cannot be tested until there is a public URL. Everything else runs on the local stack with the owner's real Strava account (Strava allows a localhost callback for development, to be confirmed when the application is created).

## How it is checked

- Unit tests: activity to session mapping (types, minutes limits, date), streams to points, duplicate rules, the handled list (removed session stays away, late upload inside the window is imported, old ids are dropped), de-duplication by Strava id on merge, sanitising of the new source and field, the edit of minutes and effort.
- Parser test for the new points entry point in `tools/gpx/gpx-lib.test.js` (the documented pass counts in `CLAUDE.md` and `docs/PROGRESS.md` change and must be updated).
- Database tests: the new table is unreadable and unwritable for anon and authenticated roles.
- Smoke tests against the local stack with a fake Strava: connect, sync, token refresh, disconnect, a call without a valid user token, a state value that is wrong or reused, and a check that no token appears in any response.
- The usual project checks (`npm test`, `npm run db:test`, `npm run test:smoke`, `npm run app:build:local`, secret grep, browser check at 375px and desktop, light and dark).
- One real run: record on the band, let it reach Strava, open the app, see the session.

## Left to the builder

- Function names, action names, table and column names, and whether one function handles all user actions.
- How `state` is made tamper proof.
- Where exactly the handled list lives (it must be a new field with a default in an existing server key).
- The name of the new session field and the new parser entry point.
- The exact wording of messages, following the app's plain style, and the layout of the Strava card within the existing tokens and the 400px rule.

## Calls made by the designer, not by the owner

- The browser converts and saves; the server never writes sessions.
- A rolling 28 day window with a list of handled ids (instead of a cursor), so late uploads are not lost; at most 20 activities per call; 5 minute throttle on tab focus; 1 minute server limit.
- An allowlist of usernames decides who sees the Strava card.
- Every Strava session gets a Details link; the minutes and effort edit applies to GPX imports too; type is not editable.
- `activity:read_all` scope.
- Over 240 minutes is saved as 240.
- The type mapping table above.
- Disconnect keeps imported sessions by default.
- Activity webhook events are ignored in this version.
