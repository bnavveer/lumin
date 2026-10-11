import { Fragment, type ReactNode } from 'react'
import { TextLink } from '../../components/Button'

// The agent writes short paragraphs, sometimes with lists, **bold** and
// links. This renders that subset as React nodes, so nothing the model
// writes is ever injected as HTML.

const inline = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|tel:|mailto:)[^)\s]+\)|https?:\/\/[^\s)]+[^\s).,;:!?]|\b1-\d{3}-\d{3}-\d{4}\b|(?<![\d,.$])\b211\b(?![\d,])|(?<![@\w.])(?:www\.)?[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:gov|com|org)\b(?:\/[^\s).,;:!?]*)?)/gi

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(inline)) {
    const tok = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    if (tok.startsWith('**')) out.push(<strong key={at}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!
      out.push(
        <TextLink key={at} href={href} external={href.startsWith('http')}>
          {label}
        </TextLink>,
      )
    } else if (tok.startsWith('http'))
      out.push(
        <TextLink key={at} href={tok} external>
          {tok.replace(/^https?:\/\/(www\.)?/, '')}
        </TextLink>,
      )
    else if (/[a-z]/i.test(tok))
      out.push(
        <TextLink key={at} href={`https://${tok}`} external>
          {tok}
        </TextLink>,
      )
    else
      out.push(
        <TextLink key={at} href={`tel:${tok.replace(/-/g, '')}`}>
          {tok}
        </TextLink>,
      )
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] }

function parse(src: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of src.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    let cur: Block | null = null
    for (const line of lines) {
      const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
      const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
      const heading = /^#{1,6}\s+(.*)$/.exec(line)
      if (ul || ol) {
        const kind = ul ? 'ul' : 'ol'
        if (!cur || cur.kind !== kind) blocks.push((cur = { kind, items: [] }))
        cur.items.push((ul ?? ol)![1])
      } else {
        const text = heading ? `**${heading[1]}**` : line
        if (!cur || cur.kind !== 'p') blocks.push((cur = { kind: 'p', lines: [] }))
        cur.lines.push(text)
      }
    }
  }
  return blocks
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((b, i) => {
        if (b.kind === 'p')
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderInline(l)}
                </Fragment>
              ))}
            </p>
          )
        const List = b.kind
        return (
          <List key={i} className={List === 'ol' ? 'mt-3 list-decimal space-y-1.5 pl-5' : undefined}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </List>
        )
      })}
    </>
  )
}
