// Every name and claim that would change in a rebrand lives here.
//
// The site is not a government site, so the top banner must NOT say
// "An official website of the United States government". A non-.gov site
// that collects personal information while claiming to be official looks
// like phishing, and pretending to be a federal agency can be a crime.
// Keep `banner` honest until this runs on a real government domain.
export const brand = {
  name: 'America.gov',
  region: 'California',
  heroTitle: 'Hello, California',
  heroSubtitle: 'Tell us about your household. We’ll find every benefit you qualify for and apply for you.',
  composerPlaceholder: 'Try “I’m a single mom in Fresno”',
  banner: {
    short: 'Prototype. Not an official government website.',
    title: 'About this website',
    items: [
      {
        icon: 'building',
        title: 'This is not a .gov website',
        body: 'This is a prototype. Official government websites end in .gov or ca.gov.',
      },
      {
        icon: 'lock',
        title: 'Your information',
        body: 'Only share sensitive information, like your Social Security number, on official, secure websites (https://).',
      },
    ],
  },
  help: {
    phone: '211',
    label: 'Call or text 211 for free local help',
  },
} as const

export type BannerIcon = (typeof brand.banner.items)[number]['icon']
