# SOP — onboarding a new client, end to end

Written 2026-09-09. This is the **operational** SOP: accounts, infrastructure,
third-party configuration, verification, handoff.

**It does not repeat the build.** `LANDING-PAGE-ENGINE.md` §5 already covers
cloning the master, rebranding, and image work, and §6 covers the CSS gotchas.
This file covers everything §5 leaves as "handed off as an open item" — which is
precisely the part that keeps failing, and the part a client actually pays for.

Read both. §5 builds the page; this builds the business around it.

---

## 0. The shape of the job

```
INTAKE ──► ACCOUNTS ──► BUILD ──► WIRE ──► VERIFY ──► LAUNCH ──► HANDOFF
 §1         §2          §3       §4       §5         §6         §7
```

Phases 2 and 4 happen **outside this repo** — in GoHighLevel, Google Ads,
CallRail, and Netlify. Nothing in the HTML can fix a mistake made there, and
nothing in the HTML will reveal one. That asymmetry is the reason this document
exists.

**The single failure that matters.** A landing page whose form does not redirect
to `/thank-you.html` in the **top** window records zero conversions forever, while
looking perfect and while leads still arrive in GoHighLevel. The client sees
leads, Google Ads sees nothing, the campaign cannot optimise, and nobody notices
for months. Today, 13 of the 35 page folders in this repo have no `thank-you.html`
at all, two carry a literal `REPLACE_CALL_CONVERSION` label in production, and a
client audited this week had a 404 where its thank-you page should be. §5 exists
to stop this.

---

## 1. Intake

Collect before starting. Anything missing becomes a **commented placeholder in
`<head>` naming exactly what is absent**, and is reported as an open item — never
invented.

| # | Needed | Who supplies it | Where it comes from / notes |
|---|---|---|---|
| 1 | Business name, city, service-area list | Client | Goes in copy, legal pages, and schema |
| 2 | Public phone number | Client | **The number to display.** If CallRail is used this becomes the swap target, not the destination |
| 3 | Brand colour(s) | Client | If none, template red `#dc2626` stays |
| 4 | Logo file | Client | Ask for transparent PNG **and** note the background — see §3 |
| 5 | Packages: names, prices, durations, what's included, which is featured | Client | Also the **slugs**, they drive the form map — see §4 |
| 6 | Real photos | Client | Almost never supplied up front; stock placeholders ship, real photos drop in later |
| 7 | Google reviews text + star rating + count | Us, from their GMB | Hand-copied into the carousel; nothing auto-updates |
| 8 | Google Place ID | Us | Rarely available; review link falls back to a plain Google search URL |
| 9 | GoHighLevel form IDs — main + one per package | **Us, in GHL** | §2.1 |
| 10 | Google Ads `AW-` id + conversion label | **Us, in Google Ads** | §2.2. The label does not exist until you create the conversion action |
| 11 | CallRail company id + key | **Us, in CallRail** | §2.3 |
| 12 | Clarity / Meta / GA4 ids | Client, usually | Optional. Commented placeholder if absent |
| 13 | Domain, and who controls DNS | Client | §2.4. Get registrar access or a named contact **before** launch day |

Rows 9–11 are ours to create, not the client's to provide. Waiting on the client
for them is the most common reason a launch slips.

---

## 2. Accounts and infrastructure

### 2.1 GoHighLevel

- [ ] Sub-account exists for this client, and is **registered wherever our tooling
      reads the client list** — an unregistered sub-account cannot be audited or
      automated later.
- [ ] Build the **main lead form**. Note its 24-character id.
- [ ] Build **one form per package**. Note each id and which package slug it maps to.
- [ ] On every form, set **on submit → redirect to URL →
      `https://<domain>/thank-you.html`**, and set it to open in the
      **parent / top window**.
- [ ] Note the chat-widget id if the client wants one. Only one page in the whole
      estate currently has a chat widget, so the master clone gives you none by
      default — this is an addition, not a default.

The redirect setting is the whole ballgame. Set it when you create the form, not
at the end, or it will be forgotten.

### 2.2 Google Ads

- [ ] Account exists under the manager account, named for the client.
- [ ] Note the **`AW-` id**.
- [ ] Create a **website conversion action** for the lead form. Google issues a
      label; the `send_to` value is `AW-XXXXXXXXX/LABEL`.
- [ ] If CallRail is in use, plan the call conversion import too.
- [ ] Never write a label that Google has not issued. Two thank-you pages in this
      repo went live carrying `AW-16828382025/REPLACE_CALL_CONVERSION` and have
      counted nothing since.

### 2.3 CallRail

- [ ] Create the company; note the **company id** (9 digits) and **key** (20 hex).
- [ ] Configure the swap so the tracking number replaces the client's displayed
      number. Confirm which number is the real destination before you do — if the
      client's systems disagree about their own phone number, stop and get it
      settled.
- [ ] Set the pool size to the campaign's expected concurrency.

Some clients run without CallRail; two whole client folders here have none. That
is a decision, not an oversight — but for a service business, calls usually
outnumber form fills, and skipping CallRail means measuring the smaller half.

### 2.4 Netlify site and domain

This is the step §5 never wrote down. One Netlify site **per page folder**, not
per client.

- [ ] Create a site from the `landing-pages` repo.
- [ ] Set the **base directory** to the page folder, e.g. `landing-pages-<CLIENT>/<client>-MOBILE`.
- [ ] Publish directory is that same folder; there is no build command.
- [ ] Add the custom domain. Convention is a service subdomain on the client's own
      root, e.g. `mobile.<clientdomain>.com`.
- [ ] Point DNS. Either the client adds a record at their registrar, or the domain
      moves onto Netlify DNS. Confirm HTTPS is issued before announcing the URL.
- [ ] Confirm auto-deploy: a push to `main` should publish. Do not skip this
      check — a site whose base directory is wrong builds green and serves the
      wrong folder.

---

## 3. Build

Follow `LANDING-PAGE-ENGINE.md` §5 steps 1–4. **Four things about the master
clone are not in that document and will ship a bug if you miss them.**

1. **`khrome-MOBILE/_redirects` contains a live 301 for someone else's domain** —
   `mobilecar.tintelligentdetailing.com`. Cloning the gold master hands your new
   client Tintelligent's redirect rule. Empty this file immediately after cloning.
   Six other page folders have inherited it.

2. **`khrome-MOBILE` carries Khrome's Meta Pixel**, `fbq('init','1457672995898350')`.
   It rides into every clone and will send your new client's traffic to Khrome's
   pixel. Remove it, or replace it with the new client's id.

3. **`khrome-MOBILE` has no `privacy-policy.html` and no `terms-of-service.html`.**
   Google Ads policy requires them. Cloning the master therefore starts you
   non-compliant. Take those two pages from `landing-pages-ATTENTION/attention-CERAMIC COATING/`
   or `attention-TINTING/`, then edit the business name, address, and jurisdiction
   inside them — that edit is easy to skip and leaves another client's name in the
   legal text.

4. **The package modal falls back to `pkgFormUrls.full`.** If this client's package
   slugs do not include one literally named `full`, that fallback is dead and an
   unmatched package opens nothing. Either name a slug `full` or change the
   fallback.

**For a tinting page**, clone from `landing-pages-ATTENTION/attention-TINTING/`
instead. Two differences from the detailing lineage: rebranding is a `:root`
**token edit**, not a hex find/replace; and that folder uses plain `src=` on its
forms, so it has **no deferred loader** and is not pre-cleaned of junk images.
Never port CSS between the two lineages without reading both in full.

---

## 4. Wire the integrations

Each ID has more than one home. Missing the second home is a silent failure.

| Integration | Every place it must appear |
|---|---|
| Main GHL form | Hero embed **and** contact embed. Second embed's iframe id takes a `-contact` suffix |
| Package forms | The `pkgFormUrls` map, keyed by this client's slugs, plus a working fallback |
| CallRail | One script in `<head>`, loaded **eagerly**. Never move it into the deferred loader — it must swap the number before a visitor can read it |
| Google Ads `AW-` | The head stub, the deferred loader, **and** `thank-you.html`. All three the same id |
| Conversion `send_to` | `thank-you.html` only, exactly once |
| Clarity | Head stub eager, script deferred |
| Meta / GA4 | If supplied. Otherwise a commented placeholder naming what is absent |

**Check that `index.html` and `thank-you.html` carry the same `AW-` account.**
One client in this repo has different accounts on the two pages, across two page
types. Whether that was deliberate has never been established — which is the
problem.

**Every page fires exactly one conversion event.** Two older thank-you pages fire
three and four. There is a commit in this repo whose entire purpose was undoing
that.

---

## 5. Verify

Run all of it. Tick nothing you did not actually observe.

**On the built page**

- [ ] Viewport is `width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`
      on **every** page. Without `maximum-scale=1.0`, iOS zooms when a user taps a
      field inside the GoHighLevel iframe.
- [ ] `.svc-card-img` / `.pkg-img` have `height:auto`, and each container's
      `aspect-ratio` matches the real dimensions of the source `.webp`.
- [ ] No placeholder ids left: `AW-XXXXXXX`, `G-XXXXXXXXXX`, `<META_PIXEL_ID>`,
      `REPLACE_*`, `TODO_CONVERSION` — except deliberate commented ones.
- [ ] `thank-you.html` exists, is `noindex, nofollow`, and carries the conversion snippet.
- [ ] Legal pages exist, name **this** client, and are reachable from the footer.
- [ ] No horizontal overflow: `document.documentElement.scrollWidth === clientWidth`.
      Judge this by the numbers, not a screenshot — Chrome enforces a ~484px
      minimum window width, so a 390px capture clips the right edge as an artifact.
- [ ] `_redirects` does not name another client's domain.
- [ ] Folder is roughly 500–700 KB with no unreferenced images.
- [ ] Logo inversion is correct: black-on-transparent needs
      `filter: brightness(0) invert(1)`; black-on-opaque-white must **not** be
      inverted or it flattens to a blank disc. Check the alpha channel first.

**On the live site — the part that cannot be skipped**

- [ ] The domain resolves over HTTPS and serves the right folder.
- [ ] **Submit the form for real, on a real phone.** Confirm the browser lands on
      `/thank-you.html` and that the **address bar** shows it. If only the iframe
      changed, the redirect is set to the wrong target and the conversion will not
      attribute.
- [ ] The lead arrived in GoHighLevel.
- [ ] The conversion appeared in Google Ads. Allow for reporting lag, but do not
      close the task until someone has seen it.
- [ ] Call the CallRail number and confirm it rings the client and logs the call.

A build is not finished when the page looks right. It is finished when a test
lead has travelled the whole chain and been seen at the far end.

---

## 6. Launch

- [ ] Commit with an imperative subject; push to `main`; Netlify auto-deploys.
- [ ] Confirm the deploy published and the live page matches the local one.
- [ ] Only then point ad spend at it.

---

## 7. Handoff

- [ ] Write `<client>-brand-kit.md` to memory: colours and the exact hex mapping,
      logo file and its invert verdict, phone and `tel:` format, packages with
      slugs and prices, all form ids, `AW-` id and label, CallRail company and key,
      Netlify site and domain, and a note about which sibling folders are **not**
      safe to harvest ids from.
- [ ] State the open items explicitly to whoever owns the client. They are almost
      always the same list: real photos, the Google Place ID, confirming the GMB
      star rating, and any tracking id the client has not yet supplied.
- [ ] Report scope precisely — which files changed, and which sibling pages you
      deliberately left alone. Offer the sibling rather than touching it.

---

## 8. The failure modes, in the order they actually occur

1. **The form redirect was never set, or navigates the iframe.** Leads arrive;
   conversions do not. Invisible from the repo. Caught only by §5's live submit.
2. **No `thank-you.html`.** Thirteen page folders here. Zero conversions by
   construction.
3. **A label that Google never issued.** `REPLACE_CALL_CONVERSION` is live in two
   places right now.
4. **Inherited junk from the clone** — another client's redirect, another client's
   pixel, another client's name in the legal pages, 16 MB of unreferenced images.
5. **Tracking "optimised" into the deferred loader.** CallRail must swap the number
   before the visitor reads it, and the conversion tag on the thank-you page cannot
   wait for `window.load`. Attribution beats the Lighthouse score.
6. **A number changed to match a photo.** The page number is the CallRail-swapped
   line. The number on the van in the hero image is a different real line. Leave
   both alone.

---

## 9. When a client does not fit this SOP

Not every client is on this engine. Colombian Detailing is a hand-built static
site outside this repo, on a Netlify-managed git remote, with its own CSS system,
its own conventions, and a Content-Security-Policy that will silently block any
third-party script added without widening it. Its SOP lives with the site, at
`Lovable Websites\COLOMBIAN\COLOMBIAN-SOP.md`.

If a client is not in `landing-pages`, write them their own SOP next to their
code and link it here. Do not assume the rules in this file apply to them — §5's
verification list, in particular, checks for classes and files that other
lineages do not have.
