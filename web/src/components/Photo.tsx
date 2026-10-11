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
