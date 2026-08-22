# Landing Page Engine — Operating Manifest

> **Purpose of this file:** paste-in context for a fresh Claude session. It describes what this
> workspace is, how a page is actually built and deployed, the standing conventions, and the
> repeatable SOP for onboarding a new client. Written 2026-08-22 from the live repo state.

---

## 1. What this workspace is

A single git repo (`c:\Users\GOOGLE AD LANDING PAGES`, branch `main`) holding **paid-traffic landing
pages for car-detailing / window-tinting businesses**. Each page exists to convert Google Ads (and
some Meta) clicks into GoHighLevel leads and tracked phone calls.

- **13 client folders**, ~35 individual page folders.
- **No build step. No framework. No package.json. No node_modules.** Every page is one
  self-contained `index.html` with all CSS in a single inline `<style>` block and all JS in inline
  `<script>` blocks at the end of `<body>`.
- Colors are **hard-coded hex** in the older lineage (no CSS variables). The newer `-TINTING`
  lineage does use a `:root` design-token system — see §4.
- Preview by opening `index.html` directly over `file://` in Chrome.

### Folder naming

```
landing-pages-<CLIENT>/           e.g. landing-pages-M4, landing-pages-OAK CITY
  <client>-MOBILE/                the mobile-detailing LP (the most common page type)
  <client>-CAR DETAILING/         shop-based detailing variant
  <client>-TINTING/               window tint LP (different template lineage)
  <client>-CERAMIC COATING/
  <client>-INTERIOR/
  <client>-MOBILE-V2/             A/B or redesign variants
```

Naming is inconsistent across older clients (`CARDETAILING`, `CAR.DETAILING`, `CAR DETAILING`) —
don't "fix" existing folder names, they map to live Netlify sites.

Within one client, `-MOBILE` and `-CAR DETAILING` historically share **identical CSS/structure** and
differ only in hero copy and the Clarity ID — so a style edit usually applies to both verbatim.

### Contents of a page folder

| File | Role |
|---|---|
| `index.html` | The entire landing page — markup + inline CSS + inline JS. ~70–80 KB. |
| `thank-you.html` | Post-submit page. **This is where the Google Ads conversion fires.** |
| `privacy-policy.html` / `terms-of-service.html` | Required for Google Ads policy compliance. |
| `netlify.toml` | Security headers + cache-control. Identical across 33/35 folders — copy verbatim. |
| `_redirects` | Netlify redirects. Usually empty; kept so the file exists. |
| `*.webp` | All imagery. Role-named in newer builds (`hero-*`, `pkg-*`, `svc-*`, `contact-bg`). |

---

## 2. Infrastructure

```
 local edit  ──►  git commit  ──►  git push origin main  ──►  Netlify auto-deploy
                                                              (one Netlify site per PAGE folder,
                                                               each with its own custom domain)
```

- **Hosting: Netlify**, wired to this repo. A push to `main` triggers auto-deploy for every site.
  (Verified deliberately in commit `f8b45b7` "Test: verify push triggers Netlify auto-deploy".)
- **Each page folder is its own Netlify site** with its own publish directory and domain — that's
  why every folder carries a duplicate `netlify.toml` and `_redirects`.
- `netlify.toml` sets: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`; HTML = `max-age=0, must-revalidate`;
  all static assets (webp/jpg/png/svg/webm/woff2/woff/ttf/css/js) = `max-age=31536000, immutable`.
- **CRM / forms: GoHighLevel (LeadConnector).** Forms are cross-origin iframes, not native HTML.
- **Call tracking: CallRail** (`swap.js`, per-company script) — does dynamic number swapping.
- **Ads: Google Ads (gtag `AW-…`)** primary. Some clients also have Clarity, Meta Pixel, GA4, GTM.
- Git history is small and intentional (~31 commits since the June 2026 import) — one commit per
  logical change, imperative subject line, no branches. Work happens directly on `main`.

---

## 3. Third-party integration stack (the part that actually matters)

### 3.1 GoHighLevel forms

Every page embeds the **same main form twice** (hero + contact section) plus **one form per package**
inside a modal:

```html
<iframe
  data-src="https://api.leadconnectorhq.com/widget/form/<FORM_ID>"
  data-layout-iframe-id="inline-<FORM_ID>"        <!-- and "-contact" suffix on the 2nd copy -->
  data-height="717"
></iframe>
<script src="https://link.msgsndr.com/js/form_embed.js"></script>   <!-- injected by deferred loader -->
```

Package modals use a JS map with a deliberate fallback:

```js
var pkgFormUrls = {
  basic:   'https://api.leadconnectorhq.com/widget/form/…',
  full:    'https://api.leadconnectorhq.com/widget/form/…',
  premium: 'https://api.leadconnectorhq.com/widget/form/…'
};
function openBookingModal(pkg) { …src = pkgFormUrls[pkg] || pkgFormUrls.full; … }
```

Note `data-src` not `src` — forms are lazy-loaded (see §3.4).

### 3.2 LeadConnector chat widget

```html
<script src="https://widgets.leadconnectorhq.com/loader.js"
        data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
        data-widget-id="<WIDGET_ID>" data-source="WEB_USER"></script>
```

Placed at the end of `<head>`. Per-client, sometimes removed on request (Oak City had it removed).

### 3.3 Tracking

- **CallRail** — `//cdn.callrail.com/companies/<COMPANY_ID>/<KEY>/12/swap.js`, loaded **async in
  `<head>`** (or before `</body>` on some clients). Loads eagerly on purpose: it must swap the
  displayed phone number before the user can read it.
- **Google Ads gtag** — the "khrome pattern": the **stub + `gtag('config', …)` runs eagerly in
  `<head>`** so events queue, but the actual `gtag.js` is injected by the deferred loader. On
  `thank-you.html` gtag loads **eagerly** — the conversion moment can't wait.
- **Microsoft Clarity** — same stub-eager / script-deferred pattern.
- **Meta Pixel / GA4 / GTM** — only on clients who have them. Otherwise left as **commented
  placeholders** in `<head>` documenting exactly what's missing.

### 3.4 The deferred loader (end of `<body>`)

Keeps ~1.3 MB of third-party requests out of the critical path. Fires on the **first** of:
`pointerdown` / `touchstart` / `scroll` / `keydown` / `mousemove`, or **6 s after `window.load`**.

It then: swaps every `iframe[data-src]` → `src`, loads `form_embed.js`, loads `gtag.js`, loads
Clarity. CallRail is deliberately excluded (must be eager).

### 3.5 The conversion chain — the single most common failure

```
user submits GHL form (inside iframe)
   └─► GHL redirects to /thank-you.html   ← configured IN GOHIGHLEVEL, not in this repo
          └─► thank-you.html fires gtag('event','conversion', {send_to:'AW-XXXX/LABEL', value:1.0})
```

**Two ways this silently breaks, and both recur constantly:**

1. The GHL form isn't configured to redirect to `/thank-you.html` at all → zero conversions.
2. The redirect navigates the **iframe** instead of the **top window** → the conversion fires in a
   cross-origin iframe context Google Ads may not attribute.

Neither is fixable from the repo. Every build ends with this as an open item requiring a **live
submit test**. Also: a page with **no `thank-you.html` records zero conversions** — that's the
current state of `m4-CAR DETAILING`, left deliberately.

---

## 4. Template lineages (the family tree)

There are **two distinct templates**, and mixing them up causes real damage.

### Lineage A — the detailing template (hard-coded hex, no tokens)

```
ONE DETAIL  ──(canonical design reference: hero + section-eyebrow pattern)
     │
attention-MOBILE  ──(the "compact/modern" rebuild)
     │
khrome-MOBILE  ◄── CURRENT GOLD MASTER for mobile detailing pages
     ├─► oakcity-MOBILE   (rebuilt 2026-07-17)
     └─► m4-MOBILE        (rebuilt 2026-07-31)

highticket-MOBILE  ◄── cloned from attention-MOBILE, NOT khrome (user's explicit call, 2026-08-19)
```

**ONE DETAIL** is the canonical design reference for: image-free hero with a bordered `.trust-badge`
strip, CSS `.hero-rating` star line, `.hero-tagline` response-time pill, `.hero-scroll` cue, and the
reusable `.section-eyebrow` pill above every section heading.

### Lineage B — the tinting template (token-based, different animal)

`attention-TINTING` uses a real `:root` token system (`--red #dc2626`, `--font-display` Oswald
italic, `--font-numeral` Bebas Neue, tier accents). Its services section is **coverage packages**
(`.tsvc` cards) plus a `.tint-info` strip (shade scale / state tint law / add-ons), **not** the
`.pkg-card` system from Lineage A. `ESP-TINTING` is the port target for this design.

**Do not port `.tsvc` CSS into a Lineage-A page or vice versa without a full read of both.**

### Section order (Lineage A mobile, current)

`header` → `hero` → `#quote-form` → services tabs → packages → guarantee → reviews → FAQ → contact

Desktop ≥1280px reflows via `.hero-form-wrap` (form moves *inside* the hero as a CSS grid overlay)
and `.pkg-reviews-group > .reviews-section { order:-1 }` (reviews rise below the hero).

Also present: `.sticky-cta` phone bar that slides in after `scrollY > 200` (hidden ≥1280px), a
package accordion (`.pkg-expanded` / Learn More), and a **static hand-coded reviews carousel**
(`.rv-*`) — 9 verbatim Google review cards. The live ReputationHub widget was removed everywhere;
**reviews do not auto-update — you edit the `.rv-card`s by hand.**

---

## 5. SOP — onboarding a NEW client

This is the sequence actually followed for Oak City, M4, and High Ticket.

### Step 0 — Intake (what the user supplies, and what to ask for if missing)

| Needed | Notes |
|---|---|
| Business name, city, service area | Service-area town list feeds hero, meta description, contact block. |
| Phone number | Display format + `tel:+1…`. This becomes the CallRail-swapped number. |
| Brand color(s) | If none, the template red `#dc2626` stays. |
| Logo file | Check transparency + whether it needs inverting — see §6. |
| Packages + prices + durations | Which one is FEATURED / "MOST BOOKED". |
| Real photos | Almost never supplied up front → stock placeholders are used. |
| GHL form IDs (main + one per package) | From the GHL sub-account. |
| CallRail company ID + key | |
| Google Ads `AW-…` + conversion label | Label often arrives later. |
| Clarity / Meta / GA4 IDs | Optional; omit as commented placeholders if absent. |
| Google reviews dump + Place ID | Place ID rarely available → review link falls back to a plain Google search URL. |

### Step 1 — Clone the master

```
cp -r landing-pages-KHROME/khrome-MOBILE  "landing-pages-<NEW>/<new>-MOBILE"
```

Default to **khrome-MOBILE** for a mobile detailing LP unless the user names a different source.
Then delete inherited junk immediately — old builds carried 16–19 MB of unreferenced images
(a 16 MB `DSC09715.webp` recurred three times). Target folder size is **~500–700 KB**.

### Step 2 — Rebrand

1. **Color remap** — global find/replace on the hex ladder:
   `#dc2626` (accent) → `#b91c1c` (dark) → `#fee2e2` / `#fecaca` (tints) → `rgba(220,38,38,…)` (glow).
   Every brand kit in memory records its own mapping.
2. **Copy** — title, meta description, hero headline, service-area lists, trust wording
   (CERTIFIED · LICENSED vs INSURED — differs per client), FAQ, legal pages.
3. **Phone** — display string + every `tel:` href + sticky CTA + thank-you page.
4. **Logo + favicon** — same asset usually serves both. Check the invert gotcha (§6).
5. **Packages** — names, prices, durations, includes, which card is featured, offer badge text
   (price-led: "DETAIL PACKAGES STARTING AT $199").
6. **Reviews** — replace the 9 `.rv-card`s with verbatim real reviews; set the summary rating and
   count.

### Step 3 — Wire the integrations

Main GHL form ID (×2 embeds) · 3 package form IDs + modal fallback key · CallRail company script ·
gtag `AW-…` in the head stub **and** the deferred loader **and** `thank-you.html` · conversion
`send_to` label on `thank-you.html` · Clarity/Meta/GA4 or commented placeholders · chat widget ID.

### Step 4 — Images

Role-rename everything (`hero-768.webp` / `hero-1080.webp` / `pkg-*.webp` / `svc-*.webp` /
`contact-bg.webp`) so a later real-photo swap is a **drop-in file replace with zero HTML edits**.
Resize with PIL / LANCZOS q65. **Verify actual source dimensions before setting `aspect-ratio`** (§6).

### Step 5 — Verify

Checklist run every build:

- [ ] `<meta name="viewport">` includes `maximum-scale=1.0` (§6)
- [ ] `.svc-card-img` / `.pkg-img` have `height:auto` and a ratio matching the source (§6)
- [ ] No placeholder IDs left (`AW-XXXXXXX`, `G-XXXXXXXXXX`, `<META_PIXEL_ID>`) except deliberate commented ones
- [ ] `thank-you.html` exists, is `noindex,nofollow`, and carries the conversion snippet
- [ ] Legal pages reachable from the footer strip
- [ ] No horizontal overflow: `document.documentElement.scrollWidth === clientWidth`
- [ ] Folder size sane; no unreferenced images

### Step 6 — Commit, push, hand off open items

Commit with an imperative subject (`Rebuild M4 mobile LP on the Khrome template`), push to `main`,
Netlify auto-deploys. Then **state the open items explicitly** — they're almost always the same:
GHL redirect-to-thank-you + top-window navigation (needs a live submit test), missing tracking IDs,
Google Place ID, real photos, confirm the GMB star rating, Netlify site + domain setup.

---

## 6. Standing gotchas (all learned the hard way — do not rediscover)

**iOS zoom.** Every page's viewport must be
`width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`.
Without `maximum-scale=1.0`, iOS Safari auto-zooms when a user taps a field inside the cross-origin
GHL iframe — the parent page can't set those inputs' font-size, so the viewport cap is the only lever.

**Square images on mobile.** If an `<img>` carries `width="640" height="360"` attributes and the CSS
rule has **no `height` declaration**, the presentational `height:360px` survives as a *definite*
height, which makes `aspect-ratio` inert → the card renders square on a phone (and looks fine on
desktop by luck). **Fix: add `height:auto`.** Pages whose tags have no width/height attrs are
unaffected — the attributes are the trigger.

**Container ratio must match the source's native ratio** or the photo crops/zooms. 16:9 sources
(640×360) → `16/9`; 4:3 sources (400×300) → `4/3`. Oak City's `.pkg-img` is **intentionally** `4/3`
over 16:9 sources (user wanted the taller look) — don't "fix" it.

**The `.accent` class.** It's `color:#fff` (correct over the hero photo) but is reused in section
titles where it goes invisible on a light background. Re-scope:
`.section-title .accent { color:#dc2626; text-shadow:none; }`.
Rule of thumb: keep the hero and the photo-backed contact section dark; only light-theme the content
sections between them.

**Logo inversion is per-client and bidirectional.**
ESP's logo is black-on-transparent → invisible on the dark header → needs
`filter: brightness(0) invert(1);`. Oak City's is black-on-**opaque-white** → already reads as a
clean badge → inverting flattens it to a blank disc. **Always check the alpha channel first.**

**Headless screenshot artifacts.** Chrome enforces a **~484px minimum window width** —
`--window-size=390,…` still lays out at 484px, so a 390-wide PNG *clips* the right side. That
clipping is an artifact, not real overflow. Render at ≥500px, and verify overflow by comparing
`scrollWidth` vs `clientWidth` instead. To capture a full long page, copy the html **into the same
folder** (so relative `./*.webp` paths resolve) and inject
`<style>.hero{height:auto!important;min-height:0!important}</style>` before rendering tall.
For interactive checks: Chrome `--headless=new --remote-debugging-port=9222` driven over CDP
(`Page.captureScreenshot` with `captureBeyondViewport` + element `clip`;
`Runtime.evaluate("openBookingModal('full')")` to open modals).

**Known cosmetic quirk, left alone:** `.rv-track` has 4px left padding so `scrollLeft` rests at 4 and
`prev.disabled = scrollLeft <= 2` never fires — the prev arrow looks enabled at rest. Byte-identical
across pages; kept for consistency.

**Don't harvest IDs from un-rebranded sibling folders.** e.g. `oakcity-TINTING` and
`oakcity-CERAMIC COATING` are still unmodified "Jalens Attention to Detail" copies — their form and
tracking IDs belong to a different business.

---

## 7. How Claude is involved — the actual working pattern

The user is the operator: they hold the client relationships, the GHL sub-accounts, the ad accounts,
and all the IDs. Claude is the implementer that edits HTML and reasons about the tracking chain.

### What the user typically says → what it means

| Typical instruction | Standard execution |
|---|---|
| "Rebuild the X mobile LP on the Khrome template" | Clone khrome-MOBILE, port brand/tracking/forms/packages/FAQ, delete inherited junk, keep the newer UX. |
| "Add a new client — mobile + tinting + ceramic pages" | Full §5 SOP, once per page type; tinting comes from Lineage B. |
| "Replace the widget code with this one" *(+ pasted snippet)* | Locate the existing embed, swap only the changed attribute, report which files carried it. |
| "Swap the CallRail embed to the new company tracker" | Replace `swap.js` URL across every page in that client folder. |
| "Add the conversion to the thank-you page" | Insert the `send_to` event snippet after the eager base tag; flag the GHL-side redirect requirement. |
| "Reorder to hero → packages → form" | Move sections + adjust the desktop reflow wrappers. |
| "Remove the chat widget" | Delete the loader tag (Oak City precedent). |
| "Make it faster / fix the Lighthouse score" | Deferred loader, preload the LCP hero, dns-prefetch, lazy contact iframe, resize webp. Tracking stays eager — **the user chooses attribution accuracy over Lighthouse.** |
| "Fix \<visual bug\>" | Almost always one of §6. Check that list first. |
| "Update the prices / packages / reviews" | Hand-edit the `.pkg-card`s and `.rv-card`s; nothing is dynamic. |

### Standing expectations

- **Work directly on `main`.** Small, single-purpose commits, imperative subject lines. Only commit
  or push when asked.
- **Report scope precisely** — which files changed, what was left untouched, and offer the adjacent
  page (the tinting sibling, the CAR DETAILING twin) rather than silently touching it.
- **Never invent an ID.** A missing tracking/form ID becomes a commented placeholder in `<head>`
  naming exactly what's absent, and gets surfaced as an open item.
- **Never "fix" a number to match a photo.** The page phone is the CallRail-swapped line; the number
  on the van in the hero photo is a different real line. Same for booking-page numbers.
- **Surface open items at the end of every build**, especially the GHL redirect (§3.5).
- **Brand facts get written to memory** as `<client>-brand-kit.md`, so later sessions don't re-ask
  for colors, phone, form IDs, or package pricing.

### Memory files that already exist

`landing-page-conventions` (the shared doctrine) · `esp-brand-kit` · `oak-city-brand-kit` ·
`m4-brand-kit` · `high-ticket-brand-kit` · `khrome-mobile-revival`.
A new client should get a matching `<client>-brand-kit.md` at the end of the build.

---

## 8. Known open items across the estate (as of 2026-08-22)

- **GHL forms must redirect to `/thank-you.html` navigating the TOP window** — outstanding and
  untested on Khrome, Oak City, M4, and High Ticket. Until it's live-tested, conversion counts are
  not trustworthy.
- `m4-CAR DETAILING` is still the old template with **no `thank-you.html` → zero Ads conversions**
  (user chose to leave it).
- No client has supplied a **Google Place ID**, so every "Write a Review" button is a plain Google
  search URL.
- Most pages still run **shared stock photography** under role-based filenames, awaiting real photos.
- `landing-pages-HIGH TICKET/` is **untracked in git** — built 2026-08-19, never committed.
- `attention-TINTING` FAQ + meta description still reference dyed + nano-ceramic film, which is no
  longer sold (only Carbon and Ceramic).
