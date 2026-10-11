import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { brand } from '../brand/brand'
import { IconButton } from './Button'
import { cx } from './cx'

// america.gov's pill-shaped question box. Three looks:
//  - "hero":   big, dark outline, the home page's main input
//  - "inline": the in-chat box (dark outline, smaller)
//  - "dock":   floats at the bottom of marketing pages, soft shadow, no outline
export function ChatComposer({
  variant = 'inline',
  placeholder = variant === 'hero' ? brand.composerPlaceholder : 'Ask anything…',
  onSubmit,
  onAttach,
  onVoice,
  disabled,
  className,
}: {
  variant?: 'hero' | 'inline' | 'dock'
  placeholder?: string
  onSubmit?: (text: string) => void
  onAttach?: () => void
  onVoice?: () => void
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0 && !disabled

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    onSubmit?.(text.trim())
    setText('')
    if (ref.current) ref.current.style.height = ''
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  return (
    <form
      onSubmit={submit}
      className={cx(
        'flex w-full items-end gap-1 bg-background-primary transition-shadow duration-200',
        variant === 'hero' && 'min-h-20 rounded-40 border-2 border-primary py-3.5 pr-3.5 pl-7 shadow-elevation-1 max-mobile:min-h-16 max-mobile:py-2 max-mobile:pr-2 max-mobile:pl-5',
        variant === 'inline' && 'min-h-[4.25rem] rounded-40 border-2 border-primary py-3 pr-3 pl-7',
        variant === 'dock' && 'min-h-14 rounded-32 py-2 pr-2 pl-5 shadow-elevation-1 ring-1 ring-border-quaternary',
        'focus-within:shadow-[var(--shadow-elevation-1),0_0_0_4px_var(--color-background-secondary)]',
        className,
      )}
    >
      <label className="sr-only" htmlFor={`composer-${variant}`}>
        Your message
      </label>
      <textarea
        id={`composer-${variant}`}
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
        }}
        onKeyDown={onKeyDown}
        className={cx(
          'min-w-0 flex-1 resize-none self-center bg-transparent tracking-tight text-primary outline-none placeholder:text-secondary',
          variant === 'hero' ? 'py-2 text-[1.3125rem] leading-snug max-mobile:text-base' : 'py-1.5 text-base leading-normal',
        )}
      />
      <div className="flex items-center gap-1 self-center">
        {/* On phones the hero box keeps only the send button so the hint fits */}
        <IconButton icon="paperclip" label="Attach a document" variant="ghost" onClick={onAttach} className={cx(variant === 'hero' && 'max-mobile:hidden')} />
        <IconButton icon="mic" label="Talk instead of typing" variant="ghost" onClick={onVoice} className={cx(variant === 'hero' && 'max-mobile:hidden')} />
        <IconButton
          type="submit"
          icon="arrow-right"
          label="Send"
          variant={canSend || variant === 'hero' ? 'primary' : 'secondary'}
          size={variant === 'dock' ? 'md' : 'lg'}
          disabled={!canSend && variant !== 'hero'}
          className={cx(!canSend && variant !== 'hero' && 'disabled:text-tertiary')}
        />
      </div>
    </form>
  )
}

// Floating bottom bar used on marketing pages ("Ask anything…").
export function AskDock({ onSubmit }: { onSubmit?: (text: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-white via-white/80 to-transparent px-4 pt-10 pb-[calc(20px+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto w-full max-w-[28rem]">
        <ChatComposer variant="dock" onSubmit={onSubmit} />
      </div>
    </div>
  )
}
