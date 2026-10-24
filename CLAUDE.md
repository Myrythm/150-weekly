# Weekly 150

Single-file exercise habit app (`weekly-150.html`), published as a private claude.ai Artifact at https://claude.ai/artifact/BLA3m85d4r3qry7wFm4UTa.

Start every session by reading `docs/PROGRESS.md` (status, features, storage, open items, how to verify and publish). Code-level notes for every change are in `docs/implementation-log.md`; hosting rules are in `docs/page-contract.md`.

Rules for this project:
- Obey `docs/page-contract.md` (no html/head/body tags, CSP: no external images or fetch, colours only as tokens in all three theme blocks, 400px with no horizontal scroll, localStorage only through try/catch helpers).
- `credit()` is the only route for aerobic minutes. Keep localStorage keys `w150.*` backward compatible.
- `tools/gpx/gpx-lib.js` is pasted verbatim inside the page. Change both copies together and keep `node tools/gpx/gpx-lib.test.js` at 50 passed.
- Verify with `bash tools/build-preview.sh` and the `weekly150-preview` server before publishing. Publish to the same artifact URL (read it first in a new conversation).
- Delegate to sub-agents by assessed difficulty: difficult to Opus, moderate to Sonnet, low to Haiku. One agent at a time on `weekly-150.html`.
- No em dashes or en dashes anywhere. Reply to the user in Indonesian.
- After a change, append to `docs/implementation-log.md` and update `docs/PROGRESS.md`.

<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Require login before any data can be recorded; each user's data must be stored separately on the server.
<!-- end claude-reflect -->
