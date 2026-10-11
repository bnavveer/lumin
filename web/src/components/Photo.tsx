import type { PhotoInfo } from '../data/photos'
import { cx } from './cx'

// Film-look photos from /public/photos (made by scripts/vintage.py).
export function Photo({
  photo,
  sizes = '(max-width: 768px) 100vw, 50vw',
  className,
  priority,
}: {
  photo: PhotoInfo
  sizes?: string
  className?: string
  priority?: boolean
}) {
  const base = `/photos/${photo.id}`
  return (
    <picture>
      <source type="image/webp" srcSet={`${base}-800.webp 800w, ${base}-1600.webp 1600w`} sizes={sizes} />
      <img
        src={`${base}-1600.jpg`}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cx('h-full w-full object-cover', className)}
      />
    </picture>
  )
}

export function PhotoCredit({ photo, className }: { photo: PhotoInfo; className?: string }) {
  return (
    <p className={cx('type-label-s leading-normal text-tertiary', className)}>
      {photo.subject}. Photo:{' '}
      <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        {photo.author}
      </a>
      ,{' '}
      {photo.licenseUrl ? (
        <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          {photo.license}
        </a>
      ) : (
        photo.license
      )}
      . Film look added.
      {photo.restricted && <span className="mt-1 block text-amber-700">{photo.restricted}</span>}
    </p>
  )
}
