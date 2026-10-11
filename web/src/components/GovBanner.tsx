import { useState } from 'react'
import { brand } from '../brand/brand'
import { Icon } from './icons'
import { Sheet } from './Sheet'

// Thin strip at the very top. On america.gov it reads "An official website
// of the United States government"; here the text comes from brand.banner
// (see the note in brand.ts).
export function GovBanner() {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="About this website" className="w-full bg-page-top">
      <div className="mx-auto flex min-h-10 max-w-site items-center justify-center px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="group flex cursor-pointer items-center gap-1 rounded-full focus-ring"
        >
          <span className="type-label-s text-secondary transition-colors group-hover:text-primary">
            {brand.banner.short}
          </span>
          <Icon name="info" size={16} className="text-tertiary transition-colors group-hover:text-primary" />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={brand.banner.title}>
        <BannerDetails />
      </Sheet>
    </section>
  )
}

export function BannerDetails() {
  return (
    <ul className="divide-y divide-border-tertiary">
      {brand.banner.items.map((item) => (
        <li key={item.title} className="py-6 first:pt-0 last:pb-0">
          <Icon name={item.icon} size={24} className="mb-2" />
          <p className="type-body-m">{item.title}</p>
          <p className="type-body-m text-secondary">{item.body}</p>
        </li>
      ))}
    </ul>
  )
}
