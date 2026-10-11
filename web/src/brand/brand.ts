// Every name and claim that would change in a rebrand lives here.
// Aid is a B2B SaaS prototype for clinics and health plans. It is not a government site.
export const brand = {
  name: 'Aid',
  region: 'California',
  heroTitle: 'Your AI caseworker that gets patients enrolled and keeps them covered.',
  heroSubtitle: 'Aid texts your patients, screens them for 6 California programs, collects documents by photo, files the applications and makes the phone calls.',
  composerPlaceholder: 'Try “I’m a single mom in Fresno”',
  banner: {
    short: 'Hackathon prototype · demo data',
    title: 'About this website',
    items: [
      {
        icon: 'building',
        title: 'Aid is a software company, not a government agency',
        body: 'Aid sells software to clinics, health plans and nonprofits. This is a hackathon prototype running on demo data.',
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
