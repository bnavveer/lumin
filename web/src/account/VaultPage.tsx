import { useMemo, useRef, useState, type DragEvent } from 'react'
import { brand } from '../brand/brand'
import { cx } from '../components/cx'
import { Icon, type IconName } from '../components/icons'
import { Link } from '../site/router'
import { makeApi, type AccountDocument } from './api'
import { useAuth } from './auth'
import { authPrimary, authQuiet } from './AuthLayout'
import { AccountPage, ErrorState, RequireAuth, Skeleton, timeAgo, useAsync, useToast } from './ui'

// /account/documents: the person's private document vault, styled like the
// vault on the home page. Upload by dropping a file or choosing one; download
// opens a short-lived private link; delete asks first.

const types: { value: string; label: string; icon: IconName; hint: string }[] = [
  { value: 'id', label: 'Photo ID', icon: 'user', hint: 'Driver license, state ID or passport' },
  { value: 'paystub', label: 'Pay stub', icon: 'document', hint: 'From the last 30 days' },
  { value: 'lease', label: 'Lease or rent', icon: 'home', hint: 'Lease, rent receipt or mortgage' },
  { value: 'ssn_card', label: 'Social Security card', icon: 'shield', hint: 'Only if the county asks for it' },
  { value: 'birth_cert', label: 'Birth certificate', icon: 'document', hint: 'For you or a child' },
  { value: 'immigration', label: 'Immigration document', icon: 'globe', hint: 'Green card, visa or other papers' },
  { value: 'other', label: 'Other', icon: 'paperclip', hint: 'Letters from the county, bills' },
]
const typeOf = (v: string) => types.find((t) => t.value === v) ?? types[types.length - 1]
const OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX = 10 * 1024 * 1024
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function VaultPage() {
  return (
    <RequireAuth>
      <Vault />
    </RequireAuth>
  )
}

function Vault() {
  const { getToken } = useAuth()
  const toast = useToast()
  const api = useMemo(() => makeApi(getToken), [getToken])
  const docs = useAsync(() => api.documents(), [api])
  const [docType, setDocType] = useState('id')
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  function pick(f: File | undefined) {
    setProblem(null)
    if (!f) return
    if (!OK.includes(f.type)) return setProblem('Choose a PDF, JPG, PNG or WebP file.')
    if (f.size > MAX) return setProblem('Choose a file smaller than 10 MB.')
    setFile(f)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    pick(e.dataTransfer.files[0])
  }

  async function upload() {
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      await api.uploadAccountDocument(file, docType)
      setFile(null)
      docs.reload()
      toast(`${typeOf(docType).label} saved to your documents.`, 'success')
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not upload the document.')
    } finally {
      setBusy(false)
    }
  }
  async function open(d: AccountDocument) {
    try {
      const { url } = await api.downloadDocument(d.id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open the document.')
    }
  }
  async function remove(d: AccountDocument) {
    try {
      await api.deleteDocument(d.id)
      setConfirming(null)
      docs.reload()
      toast('Document deleted.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the document.')
    }
  }

  const list = docs.data ?? []
  return (
    <AccountPage wide>
      <div className="mx-auto max-w-[60rem] pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-4 type-body-s text-secondary hover:text-primary focus-ring">
          <Icon name="arrow-left" size={15} />
          Back to your dashboard
        </Link>

        <section className="relative mt-5 overflow-hidden rounded-[2.5rem] bg-[linear-gradient(180deg,#031319_0%,#052430_55%,#0b4a5e_100%)] px-10 pt-10 pb-10 text-white max-mobile:rounded-[2rem] max-mobile:px-5 max-mobile:pt-7 max-mobile:pb-6">
          <Stars />
          <div className="relative flex items-start justify-between gap-6 max-[720px]:flex-col">
            <div className="max-w-[30rem]">
              <h1 className="font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.02] tracking-[-0.035em] [font-variation-settings:'opsz'_72]">Your documents.</h1>
              <p className="mt-3 type-body-m text-white/75">
                Pay stubs, IDs and letters, kept privately for your applications. Only you can see them. Uploading here doesn’t send anything to an agency.
              </p>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 type-body-s ring-1 ring-white/20 backdrop-blur-md">
              <Icon name="lock" size={15} />
              {docs.loading && !docs.data ? 'Loading…' : `${list.length} saved`}
            </span>
          </div>

          {/* Upload */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cx(
              'relative mt-8 rounded-[1.75rem] bg-white p-5 text-primary transition-shadow duration-200 max-mobile:p-4',
              over && 'shadow-[0_0_0_4px_#f2741f]',
            )}
          >
            <p className="type-body-s font-medium">What are you adding?</p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Document type">
              {types.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={docType === t.value}
                  onClick={() => setDocType(t.value)}
                  className={cx(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 type-body-s transition-colors focus-ring',
                    docType === t.value ? 'border-blue-700 bg-blue-50 font-medium' : 'border-[#0e212926] hover:border-[#0e212966]',
                  )}
                >
                  <Icon name={t.icon} size={15} />
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 type-label-s text-tertiary">{typeOf(docType).hint}</p>

            <button
              type="button"
              onClick={() => input.current?.click()}
              className={cx(
                'mt-4 flex w-full cursor-pointer flex-col items-center gap-2 rounded-24 border-2 border-dashed px-6 py-8 text-center transition-colors focus-ring',
                over ? 'border-poppy bg-poppy-50' : file ? 'border-blue-600/50 bg-blue-50' : 'border-[#0e212926] bg-[#f6f8f9] hover:border-[#0e212966]',
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-white text-blue-700 shadow-soft-sm">
                <Icon name={file ? 'check' : 'paperclip'} size={19} />
              </span>
              {file ? (
                <>
                  <span className="type-body-m font-medium [overflow-wrap:anywhere]">{file.name}</span>
                  <span className="type-body-s text-secondary">{size(file.size)}. Choose a different file</span>
                </>
              ) : (
                <>
                  <span className="type-body-m font-medium">Drop a photo or PDF here, or choose a file</span>
                  <span className="type-body-s text-secondary">PDF, JPG, PNG or WebP, up to 10 MB. A clear photo from your phone works.</span>
                </>
              )}
            </button>
            <input
              ref={input}
              type="file"
              accept={OK.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {problem && (
              <p role="alert" className="mt-3 flex gap-2 type-body-s text-red-600">
                <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={!file || busy} onClick={() => void upload()} className={cx(authPrimary, 'h-12 !w-auto px-8 text-[0.9375rem]')}>
                {busy ? 'Uploading…' : 'Save document'}
              </button>
            </div>
          </div>
        </section>

        {/* List */}
        <section aria-labelledby="saved-title" className="mt-8">
          <h2 id="saved-title" className="type-card-title">Saved documents</h2>
          {docs.loading && !docs.data && <div className="mt-4 grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
          {docs.error && !docs.data && <div className="mt-4"><ErrorState message={docs.error} onRetry={docs.reload} /></div>}
          {docs.data && list.length === 0 && (
            <p className="mt-3 type-body-m text-secondary">
              Nothing here yet. Start with a photo ID and a recent pay stub. {brand.name} will tell you if an application needs anything else.
            </p>
          )}
          {list.length > 0 && (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {list.map((d) => {
                const t = typeOf(d.docType)
                return (
                  <li key={d.id} className="flex items-center gap-4 rounded-[1.5rem] bg-white p-4 ring-1 ring-[#0e21291a]">
                    <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#f0f5f6] text-blue-700 shadow-[inset_0_0_0_1px_#0e21291a]">
                      <Icon name={t.icon} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="type-body-s font-medium">{t.label}</p>
                      <p className="truncate type-label-s leading-normal text-secondary">{d.fileName}</p>
                      <p className="type-label-s leading-normal text-tertiary">
                        {size(d.sizeBytes)}, added {timeAgo(d.createdAt)}
                      </p>
                    </div>
                    {confirming === d.id ? (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => void remove(d)} className="h-9 cursor-pointer rounded-full bg-red-600 px-3.5 type-body-s font-medium text-white focus-ring">
                          Delete
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className={cx(authQuiet, 'h-9 w-auto px-3.5 text-[0.875rem]')}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => void open(d)} aria-label={`Open ${t.label}`} className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-background-tertiary focus-ring">
                          <Icon name="external" size={16} />
                        </button>
                        <button type="button" onClick={() => setConfirming(d.id)} aria-label={`Delete ${t.label}`} className="flex size-9 cursor-pointer items-center justify-center rounded-full text-secondary hover:bg-[#fdf2f3] hover:text-red-600 focus-ring">
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </AccountPage>
  )
}

const stars = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 61.3 + (i % 7) * 9) % 100, s: i % 9 === 0 ? 2 : 1, d: (i % 5) * 0.8 }))
function Stars() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animation: `twinkle 3.2s ease-in-out ${s.d}s infinite` }} />
      ))}
    </div>
  )
}
