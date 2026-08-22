# CLAUDE.md

**Read [LANDING-PAGE-ENGINE.md](LANDING-PAGE-ENGINE.md) before doing substantive work in this repo.**
It is the operating manifest: infrastructure, template lineages, the conversion chain, the new-client
SOP, and the standing gotchas.

## The 60-second version

Paid-traffic landing pages for car-detailing / window-tinting clients. Each page is **one
self-contained `index.html`** — inline `<style>`, inline `<script>`, hard-coded hex colors.
**No build step, no framework, no package manager.** Preview over `file://` in Chrome.

`landing-pages-<CLIENT>/<client>-<PAGETYPE>/` → each page folder is its own **Netlify site**.
Push to `main` auto-deploys everything. Work directly on `main`; commit only when asked.

Leads go to **GoHighLevel** (cross-origin iframe forms), calls to **CallRail**, conversions to
**Google Ads** — fired on `thank-you.html`, *not* on submit.

## Hard rules

1. **Never invent a tracking or form ID.** A missing one becomes a commented placeholder in `<head>`
   naming what's absent, and is reported as an open item.
2. **Viewport must be** `width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`
   on every page — without `maximum-scale=1.0` iOS zooms on the GHL iframe fields.
3. **`.svc-card-img` / `.pkg-img` need `height:auto`**, and the container `aspect-ratio` must match
   the source image's native ratio. Check real `.webp` dimensions before copying a ratio.
4. **Check a logo's alpha channel before inverting it.** Black-on-transparent needs
   `filter: brightness(0) invert(1)` on the dark header; black-on-opaque-white must NOT be inverted.
5. **Tracking loads eagerly by design** (CallRail, and the gtag/Clarity stubs). Do not "optimize" it
   into the deferred loader — attribution accuracy beats the Lighthouse score here.
6. **Don't fix a page's phone number to match a photo.** The page number is the CallRail-swapped
   line; the number on the van/booking page is a different real line.
7. **Two template lineages exist** — the detailing pages (hard-coded hex) and the `-TINTING` pages
   (`:root` design tokens). Don't port CSS between them without reading both.
8. **Report scope precisely.** Say which files changed and which sibling pages you deliberately left
   alone; offer them rather than touching them.
9. **End every build by surfacing open items** — above all: the GHL forms must redirect to
   `/thank-you.html` navigating the TOP window, or the Google Ads conversion never lands.
