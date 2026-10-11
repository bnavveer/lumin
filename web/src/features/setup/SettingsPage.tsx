import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Logo } from '../../components/Logo'
import { AutopilotFields, ErrorNote, ProgramFields, Section } from './SettingsFields'
import { Connections, InviteForm, TeamList } from './TeamAndConnections'
import { errorMessage, setupApi } from './setupApi'
import type { Org, OrgSettings } from './types'

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [draft, setDraft] = useState<OrgSettings | null>(null)
  const [role, setRole] = useState<'admin' | 'caseworker' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [teamKey, setTeamKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setupApi
      .getOrg()
      .then(async (o) => {
        if (cancelled) return
        setOrg(o)
        setDraft(o.settings)
        // The team endpoint is admin-only, so a 403 tells us this user is a caseworker.
        try {
          await setupApi.team()
          if (!cancelled) setRole('admin')
        } catch {
          if (!cancelled) setRole('caseworker')
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => { cancelled = true }
  }, [])

  const isAdmin = role === 'admin'
  const dirty = !!org && !!draft && JSON.stringify(org.settings) !== JSON.stringify(draft)

  async function save() {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const o = await setupApi.saveSettings(draft)
      setOrg(o)
      setDraft(o.settings)
      setSaved(true)
    } catch (e) {
      setSaveError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-grey-50">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo showRegion={false} />
        <a href="#/staff" className="rounded-8 type-body-s text-secondary underline underline-offset-[3px] focus-ring">Back to dashboard</a>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 pb-20 sm:px-8">
        <div>
          <h1 className="type-page-heading">Settings</h1>
          <p className="mt-1 type-body-m text-secondary">{org ? `${org.name}${org.aidPhone ? ` · ${org.aidPhone}` : ''}` : 'Loading…'}</p>
          {role === 'caseworker' && <p className="mt-3 rounded-12 bg-amber-50 px-4 py-3 type-body-s text-amber-700">You’re a caseworker, so settings are read-only. Ask a clinic admin to change them.</p>}
        </div>
        <ErrorNote message={error} />
        {draft && (
          <>
            <Section title="Autopilot" intro="What Aid does on its own, and when it stays quiet.">
              <AutopilotFields value={draft} onChange={setDraft} disabled={!isAdmin} />
            </Section>
            <Section title="Programs" intro="Aid screens patients for these programs.">
              <ProgramFields value={draft} onChange={setDraft} disabled={!isAdmin} />
            </Section>
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-24 border border-border-tertiary bg-background-primary p-3 shadow-elevation-1">
              <Button onClick={save} disabled={!isAdmin || !dirty || saving || draft.programs.length === 0}>{saving ? 'Saving…' : 'Save changes'}</Button>
              {dirty && <Button variant="ghost" onClick={() => setDraft(org?.settings ?? draft)}>Discard</Button>}
              <span role="status" className="type-body-s text-green-600">{saved && !dirty ? 'Saved' : ''}</span>
              <ErrorNote message={saveError} />
            </div>
            <Section title="Team" intro="People who can sign in to this workspace.">
              <div className="space-y-8">
                <TeamList enabled={isAdmin} refreshKey={teamKey} />
                {isAdmin && <InviteForm onInvited={() => setTeamKey((k) => k + 1)} />}
              </div>
            </Section>
            <Section title="Connections" intro="Live status of the services Aid depends on.">
              <Connections />
            </Section>
          </>
        )}
      </main>
    </div>
  )
}
