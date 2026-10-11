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

**Lumin uses a California palette** (changed Oct 11, 2026, so the site no longer reads as america.gov). The token names in `theme.css` stay `blue-*` so classes keep working, but the values are Pacific blue-greens: ink `#0e2129`, primary `#0b4a5e`, hover `#073847`, links `#0b6e86`, highlights `#0f7a93`. Accent: **poppy** `#f2741f`, the state flower, used sparingly (photo progress, active walkthrough scene, the statement's arrow chip). Atmospheric washes: fog `#e6f0f2`, sand `#f7ead6`, sage `#d3dfcb`, blush `#f8cdb5`. The table below is the original america.gov reference.


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

## The site

`web/src/site/` copies america.gov's pages and what they do, using our own words, photos and drawings:

| Page | What it does |
|---|---|
| `/` | Hero card with rotating California photos. The box shows an example question for each photo; pressing send on an empty box asks it. Then a statement that sharpens as you scroll, four feature rows, and the "More coming soon" collage. |
| `/chat` | The conversation with the agent (`/api/chat`). Thumbs up/down and copy on every answer, one-tap replies when the agent asks about county, household size and so on, "Something went wrong. Try again" on errors, a notice while we wait for the YES text (it polls for replies that arrive by text). Voice uses the browser's speech recognition. The paperclip explains that documents go by text for now. |
| `/how-it-works`, `/privacy`, `/coming-soon` | Same layout as america.gov. Their videos are replaced by animated tiles built from our components (`media.tsx`, `pages/ComingSoon.tsx`), each with a pause button. |
| `/about`, `/faq`, `/privacy-policy`, `/terms` | About, FAQ accordion with "Ask anything else", and plain-language drafts of the policy and terms. |

- Menu, gov-banner pop-up, page transitions (View Transitions API), the docked "Ask anything…" box and the big serif footer work as on america.gov.
- English and Spanish: footer language menu, `?lang=es`, or the browser language. Copy lives in `web/src/site/copy.ts`; keep every claim true to what the service does.
- "Submit feedback" posts to `/api/feedback` (`src/feedbackApi.ts`), which only logs it. Like america.gov, it warns if the text looks like it has a phone number, email or SSN.
- Source badges on the home page show real marks where a public-domain copy is on Wikimedia Commons, rendered to small WebP files in `web/public/marks/`: the Great Seal of California (`File:Seal_of_California.svg`), the Los Angeles County seal, the San Francisco seal, the CPUC seal, the CDPH logo and the CalFresh logo (for CDSS). There is no public-domain DHCS logo or 211 helpline logo, so those stay typographic. **Legal note:** commercial use of the Great Seal is a misdemeanor under California Government Code §402, counties restrict their seals, and seals can imply endorsement. Get clearance before launch, or set `USE_REAL_MARKS = false` in `web/src/site/media.tsx` to go back to typographic badges.
- The California flag is the official Bear Flag (`web/public/ca-flag.svg`, public domain, from Wikimedia Commons `File:Flag_of_California.svg`). The U.S. flag in the logo is still the simplified 16×9 version for small sizes.

## Before this goes public

1. **Don't claim to be the government.** america.gov's banner says "An official website of the United States government". Our banner says "Prototype. Not an official government website." Keep it that way unless this runs on a real .gov domain. A non-government site that collects people's information while looking like an official one looks like phishing, and pretending to be a federal agency can be illegal.
2. **The name "America.gov" belongs to GSA.** Fine for a mockup. A public site needs its own name. Change `brand.name` in `brand.ts` and everything updates.
3. **Don't copy their photos, agency seals, or font files.** We use our own California photos (see above), and source chips use a generic building icon instead of real seals.


## Lumin identity

The product name is **Lumin**. Use a text-only Newsreader wordmark across the website, with no sun symbol. The browser favicon uses the California flag from `web/public/ca-flag.svg`, with ICO and Apple-touch PNG equivalents. Keep the navy/white palette, Newsreader headings and Inter body text. Footer branding is compact with grouped links. Describe saved answers, private documents and application preparation as available; assisted official form filling remains in development.
