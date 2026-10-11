import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Link } from '../site/router'
import { request } from './api'
import { useAuth } from './auth'
import {
  AccountShell,
  docNames,
  ErrorNotice,
  errorText,
  fieldClass,
  linkClass,
  RequireAccount,
  safeUrl,
} from './pages'

type Answers = Record<string, string | number | boolean | null | undefined>
type Question = {
  id: string
  label: string
  kind: 'number' | 'boolean' | 'county' | 'immigration'
  min?: number
  max?: number
}
const questions: Question[] = [
  {
    id: 'californiaResident',
    label: 'Do you currently live in California?',
    kind: 'boolean',
  },
  { id: 'county', label: 'County', kind: 'county' },
  {
    id: 'size',
    label: 'People who live and buy or prepare food together',
    kind: 'number',
    min: 1,
    max: 20,
  },
  {
    id: 'monthlyIncome',
    label: 'Their total monthly income before taxes ($)',
    kind: 'number',
    min: 0,
    max: 100000,
  },
  {
    id: 'adultAge',
    label: 'Age of the adult applying',
    kind: 'number',
    min: 14,
    max: 120,
  },
  {
    id: 'childrenUnder18',
    label: 'Children under 18 in the household',
    kind: 'number',
    min: 0,
    max: 15,
  },
  {
    id: 'childrenUnder5',
    label: 'Children under five',
    kind: 'number',
    min: 0,
    max: 20,
  },
  {
    id: 'pregnant',
    label: 'Is anyone in the household pregnant?',
    kind: 'boolean',
  },
  {
    id: 'immigrationStatus',
    label: 'Immigration category (optional)',
    kind: 'immigration',
  },
  {
    id: 'childrenAreCitizens',
    label: 'Are the children who need benefits US citizens? (optional)',
    kind: 'boolean',
  },
  {
    id: 'needsEnergyBillHelp',
    label: 'Do you need help paying a home energy bill?',
    kind: 'boolean',
  },
  {
    id: 'needsDailyLivingHelp',
    label:
      'Does anyone need help with daily activities to live safely at home?',
    kind: 'boolean',
  },
  {
    id: 'needsChildCare',
    label: 'Do you need help paying for child care?',
    kind: 'boolean',
  },
]
const extraQuestions: Question[] = [
  {
    id: 'breastfeedingInfantUnder12Months',
    label: 'Is anyone breastfeeding a baby under one year old?',
    kind: 'boolean',
  },
  {
    id: 'pregnancyEndedWithin6Months',
    label:
      'Has anyone given birth or had a pregnancy end within the past six months?',
    kind: 'boolean',
  },
  {
    id: 'wicFamilySize',
    label: 'Family size for WIC, including expected births',
    kind: 'number',
    min: 1,
    max: 30,
  },
  {
    id: 'wicMonthlyIncome',
    label: 'That WIC family’s monthly income before taxes ($)',
    kind: 'number',
    min: 0,
    max: 1000000,
  },
  {
    id: 'wicIncomeEligibleViaProgram',
    label:
      'Does the WIC applicant currently receive Medi-Cal, CalFresh, CalWORKs, or FDPIR?',
    kind: 'boolean',
  },
  {
    id: 'pgeCustomer',
    label:
      'Does PG&E supply your home’s gas or electricity, including through a landlord?',
    kind: 'boolean',
  },
  {
    id: 'pgeElectricCustomer',
    label: 'Does PG&E supply your home’s electricity?',
    kind: 'boolean',
  },
  {
    id: 'pgeBillInName',
    label: 'Is the PG&E bill, or landlord’s energy bill, in your name?',
    kind: 'boolean',
  },
  {
    id: 'pgePrimaryResidence',
    label: 'Is this the home where you live?',
    kind: 'boolean',
  },
  {
    id: 'claimedAsDependentByNonSpouse',
    label: 'Can someone other than your spouse claim you as a tax dependent?',
    kind: 'boolean',
  },
  {
    id: 'sharesMeterWithAnotherHome',
    label: 'Does your utility meter also serve another home?',
    kind: 'boolean',
  },
  {
    id: 'allResidentsCount',
    label: 'Everyone living at the address, including roommates',
    kind: 'number',
    min: 1,
    max: 40,
  },
  {
    id: 'allResidentsAnnualIncome',
    label:
      'Everyone’s combined yearly income, including taxable and nontaxable sources ($)',
    kind: 'number',
    min: 0,
    max: 12000000,
  },
  {
    id: 'careQualifyingProgram',
    label:
      'Does anyone at this address currently receive a CARE qualifying program, such as CalFresh, Medi-Cal, WIC, SSI, or LIHEAP?',
    kind: 'boolean',
  },
  {
    id: 'lifelineHouseholdSize',
    label: 'People sharing income and living expenses for LifeLine',
    kind: 'number',
    min: 1,
    max: 30,
  },
  {
    id: 'lifelineAnnualIncome',
    label: 'That LifeLine household’s total yearly income before taxes ($)',
    kind: 'number',
    min: 0,
    max: 12000000,
  },
  {
    id: 'lifelineQualifyingProgram',
    label:
      'Does anyone in that LifeLine household currently receive a qualifying program, such as Medi-Cal, CalFresh, SSI, or WIC?',
    kind: 'boolean',
  },
  {
    id: 'householdHasLifeline',
    label:
      'Does anyone in that same household already have a LifeLine discount?',
    kind: 'boolean',
  },
]
export function ScreeningPage() {
  return (
    <RequireAccount>
      <ScreeningForm />
    </RequireAccount>
  )
}
function ScreeningForm() {
  const { getToken } = useAuth()
  const [answers, setAnswers] = useState<Answers>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setAnswers(await request<Answers>(getToken, '/api/me/screening'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [getToken])
  useEffect(() => {
    void load()
  }, [load])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setSaved(false)
    setError('')
    const form = new FormData(event.currentTarget)
    // A blank answer stays unknown; null explicitly clears a previously saved answer.
    const screeningAnswers: Answers = {}
    for (const q of [...questions, ...extraQuestions]) {
      const value = form.get(q.id)
      if (value === null) continue
      if (value === '') {
        screeningAnswers[q.id] = null
        continue
      }
      screeningAnswers[q.id] =
        q.kind === 'number'
          ? Number(value)
          : q.kind === 'boolean'
            ? value === 'true'
            : String(value)
    }
    try {
      await request(getToken, '/api/me/profile', {
        method: 'POST',
        body: JSON.stringify({ screeningAnswers }),
      })
      setAnswers(await request<Answers>(getToken, '/api/me/screening'))
      setSaved(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  function question(q: Question) {
    const value = answers[q.id]
    const options =
      q.kind === 'boolean'
        ? [
            ['true', 'Yes'],
            ['false', 'No'],
          ]
        : q.kind === 'county'
          ? [
              ['los_angeles', 'Los Angeles County'],
              ['san_francisco', 'San Francisco County'],
            ]
          : [
              ['citizen', 'US citizen'],
              ['green_card', 'Green card holder'],
              ['humanitarian', 'Humanitarian status'],
              ['undocumented', 'Undocumented'],
              ['unknown', 'Prefer not to say / unsure'],
            ]
    return (
      <label key={`${q.id}-${String(value)}`} className="block type-body-m">
        {q.label}
        {q.kind === 'number' ? (
          <input
            name={q.id}
            type="number"
            min={q.min}
            max={q.max}
            step={q.id.toLowerCase().includes('income') ? '0.01' : '1'}
            defaultValue={typeof value === 'number' ? value : ''}
            className={fieldClass}
          />
        ) : (
          <select
            name={q.id}
            defaultValue={value == null ? '' : String(value)}
            className={fieldClass}
          >
            <option value="">Not answered</option>
            {options.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
      </label>
    )
  }
  return (
    <AccountShell
      title="Tell us about your household."
      intro="Answer what you can to check possible programs. You can skip any question. These answers do not submit an application or confirm eligibility."
    >
      <Link className={linkClass} href="/account">
        Back to your account
      </Link>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {saved && (
        <p role="status" className="mt-6 rounded-12 bg-green-50 p-4">
          Answers saved.{' '}
          <Link href="/account" className={linkClass}>
            See your updated program matches
          </Link>
          .
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-6">
          Loading saved answers…
        </p>
      ) : (
        <form className="mt-8 max-w-[44rem] space-y-6" onSubmit={save}>
          {questions.map(question)}
          <details className="rounded-16 border border-border-tertiary p-5">
            <summary className="cursor-pointer font-medium focus-ring">
              More questions for WIC, energy discounts, and LifeLine
            </summary>
            <p className="mt-4 type-body-s text-secondary">
              Current benefit participation means benefits you already receive.
              A possible match or pending application does not count. If you are
              unsure, leave the answer blank.
            </p>
            <div className="mt-6 space-y-6">{extraQuestions.map(question)}</div>
          </details>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Saving answers…' : 'Save household answers'}
          </Button>
        </form>
      )}
    </AccountShell>
  )
}

type AccountDocument = {
  id: string
  docType: string
  fileName: string
  sizeBytes: number
  status: string
  createdAt: string
}
export function DocumentsPage() {
  return (
    <RequireAccount>
      <DocumentsContent />
    </RequireAccount>
  )
}
function DocumentsContent() {
  const { getToken } = useAuth()
  const [docs, setDocs] = useState<AccountDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [download, setDownload] = useState<{ id: string; url: string } | null>(
    null,
  )
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDocs(await request<AccountDocument[]>(getToken, '/api/me/documents'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [getToken])
  useEffect(() => {
    void load()
  }, [load])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const file = values.get('file')
    if (!(file instanceof File) || !file.size) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Choose a file smaller than 10 MB.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(getToken, '/api/me/documents', {
        method: 'POST',
        body: values,
      })
      form.reset()
      await load()
      setNotice(
        'Document uploaded to your account. It has not been sent to the county.',
      )
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function prepareDownload(id: string) {
    setBusy(true)
    setError('')
    setDownload(null)
    try {
      const result = await request<{ url: string }>(
        getToken,
        `/api/me/documents/${encodeURIComponent(id)}/download`,
      )
      const url = safeUrl(result.url)
      if (!url) throw new Error('Could not open this document. Try again.')
      setDownload({ id, url })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!deleteId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(
        getToken,
        `/api/me/documents/${encodeURIComponent(deleteId)}`,
        { method: 'DELETE' },
      )
      setDeleteId(null)
      setDownload(null)
      await load()
      setNotice('Document deleted from your account.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AccountShell
      title="Your documents."
      intro="Keep a copy of the documents for your application checklist. Uploading here does not submit documents to an agency."
    >
      <Link className={linkClass} href="/account">
        Back to your account
      </Link>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {notice && (
        <p role="status" className="mt-5 rounded-12 bg-green-50 p-4">
          {notice}
        </p>
      )}
      <div className="mt-8 grid grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] gap-12 max-[850px]:grid-cols-1">
        <section>
          <h2 className="type-feature-heading">Saved documents</h2>
          {loading && (
            <p role="status" className="mt-5">
              Loading documents…
            </p>
          )}
          {!loading && docs.length === 0 && (
            <p className="mt-5 type-body-m text-secondary">
              No documents uploaded yet. Add a clear photo or PDF when you are
              ready.
            </p>
          )}
          <ul className="mt-4 divide-y divide-border-tertiary">
            {docs.map((d) => (
              <li key={d.id} className="py-5">
                <h3 className="type-heading-s">
                  {docNames[d.docType] || d.docType}
                </h3>
                <p className="mt-2 type-body-s text-secondary">
                  {d.status.replaceAll('_', ' ')} · Uploaded{' '}
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-2 break-words type-body-s text-secondary">
                  {d.fileName} · {Math.max(1, Math.round(d.sizeBytes / 1024))}{' '}
                  KB
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {download?.id === d.id ? (
                    <a
                      href={download.url}
                      target="_blank"
                      rel="noreferrer"
                      className={linkClass}
                    >
                      Open document (link expires in 10 minutes)
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void prepareDownload(d.id)}
                    >
                      View document
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDeleteId(d.id)}
                  >
                    Delete
                  </Button>
                </div>
                {deleteId === d.id && (
                  <div className="mt-4 rounded-12 bg-amber-50 p-4">
                    <p>
                      Delete this document from your account? It will also be
                      removed from your saved checklists. Copies already
                      provided to an agency are separate.
                    </p>
                    <div className="mt-4 flex gap-3">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        Confirm delete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setDeleteId(null)}
                      >
                        Keep document
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        <aside className="self-start rounded-24 bg-blue-50 p-6">
          <h2 className="type-heading-s">Upload a document</h2>
          <form onSubmit={upload} className="mt-5 space-y-5">
            <label className="block type-body-s">
              Document type
              <select name="docType" className={fieldClass}>
                {Object.entries(docNames).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block type-body-s">
              File
              <input
                type="file"
                name="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="mt-3 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
              />
              <span className="mt-2 block text-secondary">
                PDF, JPG, PNG, or WebP. Up to 10 MB.
              </span>
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Upload document'}
            </Button>
          </form>
        </aside>
      </div>
    </AccountShell>
  )
}
