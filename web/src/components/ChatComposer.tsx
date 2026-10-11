import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { brand } from '../brand/brand'
import { IconButton } from './Button'
import { cx } from './cx'

// america.gov's pill-shaped question box. Three looks:
//  - "hero":   big, dark outline, the home page's main input
//  - "inline": the in-chat box (dark outline, smaller)
//  - "dock":   floats at the bottom of marketing pages, soft shadow, no outline
//
// The placeholder is drawn as an overlay so it can fade when the hero
// carousel changes the example question. With `submitEmpty`, pressing send
// on an empty box asks the example (as on america.gov's home page).

export type ComposerLabels = {
  label: string
  send: string
  sending: string
  attach: string
  voice: string
  stopVoice: string
  listening: string
}

const defaultLabels: ComposerLabels = {
  label: 'Your message',
  send: 'Send',
  sending: 'Sending',
  attach: 'Attach a document',
  voice: 'Use your voice',
  stopVoice: 'Stop listening',
  listening: 'Listening…',
}

export function ChatComposer({
  variant = 'inline',
  placeholder = variant === 'hero' ? brand.composerPlaceholder : 'Ask anything…',
  value,
  onValueChange,
  onSubmit,
  onAttach,
  onVoice,
  listening,
  busy,
  disabled,
  submitEmpty,
  labels = defaultLabels,
  autoFocus,
  className,
}: {
  variant?: 'hero' | 'inline' | 'dock'
  placeholder?: string
  value?: string
  onValueChange?: (v: string) => void
  onSubmit?: (text: string) => void
  onAttach?: (files: File[]) => void
  onVoice?: () => void
  listening?: boolean
  busy?: boolean
  disabled?: boolean
  submitEmpty?: string
  labels?: ComposerLabels
  autoFocus?: boolean
  className?: string
}) {
  const [own, setOwn] = useState('')
  const text = value ?? own
  const setText = (v: string) => (onValueChange ? onValueChange(v) : setOwn(v))
  const ref = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const id = useId()
  const hasText = text.trim().length > 0
  const canSend = (hasText || Boolean(submitEmpty)) && !disabled && !busy

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  // Grow with the text, including text set from outside (voice input).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    onSubmit?.(hasText ? text.trim() : submitEmpty!)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  const shownPlaceholder = listening ? labels.listening : placeholder

  return (
    <form
      onSubmit={submit}
      className={cx(
        'relative flex w-full items-end gap-1 bg-background-primary text-left transition-shadow duration-200',
        variant === 'hero' && 'min-h-20 rounded-40 border-2 border-primary py-3.5 pr-3.5 pl-7 shadow-elevation-1 max-mobile:min-h-16 max-mobile:py-2 max-mobile:pr-2 max-mobile:pl-5',
        variant === 'inline' && 'min-h-[4.25rem] rounded-40 border-2 border-primary py-3 pr-3 pl-7 max-mobile:pl-5',
        variant === 'dock' && 'min-h-14 rounded-32 py-2 pr-2 pl-5 shadow-elevation-1 ring-1 ring-border-quaternary',
        'focus-within:shadow-[var(--shadow-elevation-1),0_0_0_4px_var(--color-background-secondary)]',
        className,
      )}
    >
      <label className="sr-only" htmlFor={id}>
        {labels.label}
      </label>
      <div className="relative min-w-0 flex-1 self-center">
        {!hasText && (
          <span
            key={shownPlaceholder}
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-0 animate-[placeholder-in_.5s_var(--ease-out-quint)] truncate tracking-tight text-secondary',
              variant === 'hero' ? 'py-2 text-[1.1875rem] leading-snug max-mobile:text-base max-mobile:leading-[1.6]' : 'py-1.5 text-base leading-normal',
            )}
          >
            {shownPlaceholder}
          </span>
        )}
        <textarea
          id={id}
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          aria-placeholder={shownPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className={cx(
            'relative block w-full resize-none bg-transparent tracking-tight text-primary caret-primary outline-none',
            variant === 'hero' ? 'py-2 text-[1.1875rem] leading-snug max-mobile:text-base max-mobile:leading-[1.6]' : 'py-1.5 text-base leading-normal',
          )}
        />
      </div>
      <div className="flex items-center gap-1 self-center">
        {onAttach && (
          <>
            <IconButton
              icon="paperclip"
              label={labels.attach}
              variant="ghost"
              onClick={() => file.current?.click()}
              className={cx(variant === 'hero' && 'max-mobile:hidden')}
            />
            <input
              ref={file}
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length) onAttach(files)
              }}
            />
          </>
        )}
        {onVoice && (
          <IconButton
            icon="mic"
            label={listening ? labels.stopVoice : labels.voice}
            aria-pressed={listening}
            variant="ghost"
            onClick={onVoice}
            className={cx(
              variant === 'hero' && 'max-mobile:hidden',
              listening && 'bg-blue-600/10 text-blue-600 hover:bg-blue-600/15 [&_svg]:animate-[mic-pulse_1.4s_ease-in-out_infinite]',
            )}
          />
        )}
        <IconButton
          type="submit"
          icon={busy ? 'spinner' : 'arrow-right'}
          label={busy ? labels.sending : labels.send}
          variant={canSend || busy ? 'primary' : 'secondary'}
          size={variant === 'dock' ? 'md' : 'lg'}
          disabled={!canSend}
          className={cx(!canSend && !busy && 'disabled:text-tertiary', busy && 'disabled:bg-blue-700 disabled:text-white')}
        />
      </div>
    </form>
  )
}

// Floating bottom bar used on marketing pages ("Ask anything…").
export function AskDock({
  onSubmit,
  placeholder,
  labels,
  visible = true,
}: {
  onSubmit?: (text: string) => void
  placeholder?: string
  labels?: ComposerLabels
  visible?: boolean
}) {
  return (
    <div
      className={cx(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pt-10 pb-[calc(20px+env(safe-area-inset-bottom))] transition-[opacity,translate] duration-500 ease-out-quint',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
      )}
    >
      <div className={cx('w-full max-w-[28rem]', visible && 'pointer-events-auto')} inert={!visible}>
        <ChatComposer variant="dock" onSubmit={onSubmit} placeholder={placeholder} labels={labels} />
      </div>
    </div>
  )
}
