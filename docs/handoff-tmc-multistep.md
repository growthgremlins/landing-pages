Plan (don't build yet) a new TMCleansedrive landing page that live-tests our multi-step quote form, then the GHL webhook wiring. Enter plan mode, explore first, ask me before assuming.

## Repo
`C:\Users\GOOGLE AD LANDING PAGES` — git, remote `growthgremlins/landing-pages`, push to `main` auto-deploys each page folder as its own Netlify site. Read `CLAUDE.md`, `LANDING-PAGE-ENGINE.md`, `NEW-CLIENT-SOP.md` first. Single-file pages: inline CSS/JS, ES5-style, no build step. Commit only when I ask. There are uncommitted changes from a previous session (m4-OFFER, tmc-OFFER, m4-OFFER-SANDBOX, docs) — leave them alone unless I say otherwise.

## What to build
New folder under `landing-pages-TMC/`, named for the multi-step test (propose a name, e.g. `tmc-MULTISTEP`), assembled from three sources:

1. **Page layout = Crystal Ride's live page**, exactly: https://mobile.crystalrideautodetailing.com/ — Crystal is NOT a folder in this repo. Fetch the live page, and check `landing-pages-SMILKY/smilky-MOBILE`, which references crystalride and may be a clone of the same template. Swap all Crystal branding/copy/area for TMC (Melbourne / Brevard County FL; brand teal `#3ab6c8`, see `tmc-OFFER` and `tmc-MOBILE` for assets and copy).
2. **The form = the multi-step wizard** in `landing-pages-M4/m4-OFFER-SANDBOX/index.html` (`#quote-wizard`, `wz-` prefix, "Guided" lane). It replaces Crystal's GHL iframe form. Port its markup, CSS and JS, rebranded M4 red `#dc2626` → TMC's palette. Key behaviours to keep: 4 steps (Service radio → Year/Make/Model with auto-advance + datalist + 1960–next-year check → condition checkboxes, Skip when none → contact with live phone formatting), SVG chevron step bar with done/current/upcoming states, Enter = Next, a hidden `vehicle` composed from the three inputs so the payload stays one fixed shape.
3. **Packages = Attention to Detail's photo + price package cards** from https://mobiledetailing.attentiontodetailva.com/ (source: `landing-pages-ATTENTION/attention-MOBILE`), with TMC's prices/images, and Attention's desktop-optimisation approach — study how that page handles desktop layout and apply it.

## Tracking (TMC)
Ads `AW-16828382025`. Existing offer conversion label `AW-16828382025/snVmCOKhvvscEMn2stg-` — ask whether this test gets its own conversion action. CallRail co `770300860`. Clarity: `tmc-OFFER` loads `woobhn6bum` (Attention's project) AND `w77vu7kpdz` (M4's) — flag it; don't copy either without asking. Never invent IDs (CLAUDE.md rule 1).

## Transport — do NOT copy the sandbox's
The sandbox deliberately has `GHL_WEBHOOK_URL = null`, console.log instead of POST, and the OLD transport. Use the fixed transport already in `tmc-OFFER/index.html`: `text/plain` JSON POST (no CORS preflight), `keepalive`, 4s never-strand timeout, redirect on TypeError, `lf_hp_x7` honeypot that never fires a conversion, `transaction_id` + gclid/gbraid/wbraid/utm carried to `./thank-you.html`, enhanced-conversion `user_data` via sessionStorage. Thank-you page must fire the conversion with `transaction_id`.

## Phase 2 — webhook into GHL (plan only, after the page)
TMC GHL location `of37lqYVOipUqwhcJayM`; current inbound webhook `https://services.leadconnectorhq.com/hooks/of37lqYVOipUqwhcJayM/webhook-trigger/55d65c6e-18a2-4a46-af8e-d212df67ff08`. The wizard posts new keys (service_type, vehicle_size, conditions, water_power, entry_lane…) — GHL builds mapping tokens from a captured sample, so plan re-capturing it and mapping each key to a contact field. Open question from before: confirm GHL parses a `text/plain` body. The `ghl-mcp` tools can read contacts to verify a test lead landed.

## Deliverable
A plan: folder name, source-by-source what gets copied vs rebuilt, the payload key list, tracking IDs needed from me, Netlify site setup, and a verification checklist (local preview, real submit, gclid in URL, one conversion per tid, lead visible in GHL). List the questions you need me to answer.
