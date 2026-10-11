# Branding: america.gov style, for California

Pulled from america.gov's live site on October 11, 2026 (stylesheet `base-html.CLkSFh1-.css`, homepage, /how-it-works, /about, /faq, /chat). The site is built with Astro + Tailwind v4. Screenshots and the favicon/OG image are in [`reference/america-gov/`](reference/america-gov/), for reference only.

All tokens are in [`web/src/brand/theme.css`](../web/src/brand/theme.css). Names and banner text are in [`web/src/brand/brand.ts`](../web/src/brand/brand.ts).

## Look and feel

- White page with lots of empty space. Very large serif headlines, small gray sans body text.
- One accent color: deep navy `#002664` for the main button. Everything else is navy ink at different opacities.
- Large, soft corners (32–48px on cards, full pills on buttons and inputs).
- Cards are flat gray (navy at 5%) with no border. Floating things (sheets, the docked input) get one soft shadow: `0 10px 40px #010e2414`.
- Pop-ups blur the page behind them.
- The chat input is the main element on the page: a pill with a 2px dark outline.

## Color

| Token | Hex | Used for |
|---|---|---|
| blue-900 | `#000c1f` | All text ("ink") |
| blue-800 | `#00163b` | Primary button hover |
| blue-700 | `#002664` | Primary button ("Menu", send) |
| blue-600 | `#004ac3` | Focus, upload highlight |
| blue-500 | `#0066c5` | Links |
| blue-50 | `#f1f5fb` | Light tint |
| text secondary / tertiary / disabled | ink at 65% / 45% / 15% | Gray text |
| background tertiary | blue-700 at 5% | Cards, user chat bubble |
| background secondary | blue-700 at 10% | Hover on cards |
| borders | ink at 85% / 45% / 10% / 5% | |
| page-top | `#f2f3f4` | Top banner strip |
| red-600 | `#d80007` | Errors |
| green-600 | `#007f26` | Success |
| flag red / flag blue | `#e64133` / `#1d49bb` | Flag in the logo |

## Type

| Role | america.gov | We use (free) |
|---|---|---|
| Headlines (serif) | Rhymes Text / Rhymes Display | Newsreader (variable, opsz 72) |
| Body (sans) | Helvetica Now Text / Display | Inter (variable) |

Rhymes and Helvetica Now need paid licenses, so we don't copy their font files. If you buy them, change `--font-serif` and `--font-sans` in `theme.css`.

- Headlines: weight 400, line height 1, tight letter spacing (america.gov −0.05em; −0.035em with Newsreader). Page heading `clamp(3rem, 8.4vw, 6rem)`, section heading `clamp(2.5rem, 5.6vw, 4rem)`.
- Body: 16–18px, letter spacing −0.03em, line height 1.5.
- Labels: 12px gray (banner, captions).

## Spacing, corners, motion

- Corners: 4, 8, 12, 16, 24, 32, 40, 48, 64px, plus full pills.
- Max page width 87rem (1392px). Gutter 16px on mobile, 48px on desktop. Mobile breakpoint 768px.
- Easing: `cubic-bezier(.22, 1, .36, 1)` (out-quint) for buttons, `cubic-bezier(.32, .72, 0, 1)` for sheets. Buttons shrink to 98% when pressed.
- Focus ring: 2px white then 2px ink (`0 0 0 2px #fff, 0 0 0 4px #000c1f`).

## California changes

- Hero says "Hello, California". A **California** chip with the bear flag sits next to the logo.
- Sample content uses California programs and agencies (CalFresh, Medi-Cal, CalWORKs, CARE, Covered California, BenefitsCal, county offices, 211).
- County picker lists all 58 counties.

## Photos

17 photos of well-known California places, in `web/public/photos/`, each in 1600px and 800px WebP plus a 1600px JPEG. They all have a film-camera look: faded blacks, warm highlights, cool shadows, a red glow around bright areas, grain and darker corners. The script is `web/scripts/vintage.py`. To add a photo, put the original in a folder by itself, run `python3 -I web/scripts/vintage.py <that folder> web/public/photos`, and add an entry to `web/src/data/photos.ts`.

- Sources: Wikimedia Commons, the Library of Congress (Carol M. Highsmith), the National Park Service and the USDA. Every license was checked through the Commons API. All are public domain, CC0 or CC BY 2.0.
- **CC BY 2.0 photos need a credit near where they're shown:** Yosemite, Santa Monica Pier, poppies, redwoods and Napa. `<PhotoCredit>` prints it.
- **Hollywood Sign:** the photo is free to use, but the sign is a trademark, and commercial use needs a license from the Hollywood Chamber of Commerce. It's in the library, but not in the hero or the program cards.
- Left out: a Ferry Building market crowd shot with faces you can recognize.

## Before this goes public

1. **Don't claim to be the government.** america.gov's banner says "An official website of the United States government". Our banner says "Prototype. Not an official government website." Keep it that way unless this runs on a real .gov domain. A non-government site that collects people's information while looking like an official one looks like phishing, and pretending to be a federal agency can be illegal.
2. **The name "America.gov" belongs to GSA.** Fine for a mockup. A public site needs its own name. Change `brand.name` in `brand.ts` and everything updates.
3. **Don't copy their photos, agency seals, or font files.** We use our own California photos (see above), and source chips use a generic building icon instead of real seals.
