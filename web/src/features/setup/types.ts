export type Program = 'calfresh' | 'medi_cal' | 'calworks' | 'general_relief' | 'cfap' | 'section8'
export type County = 'los_angeles' | 'san_francisco'
export type Role = 'caseworker' | 'admin'
export type NudgeKey = 'interview_nudge' | 'docs_nudge' | 'submit' | 'waitlist_check' | 'renewal_start'

export interface OrgSettings {
  autopilot: {
    enabled: boolean
    quietHours: { start: string; end: string }
    nudges: Record<NudgeKey, boolean>
  }
  programs: Program[]
  escalateAfterNoAnswers: number
}

export interface Org {
  id: string
  name: string
  county: County
  aidPhone: string | null
  settings: OrgSettings
}

export interface TeamMember {
  userId: string
  email: string | null
  role: string
  status: 'active' | 'invited'
}

export interface SetupCheck {
  key: string
  label: string
  ok: boolean
  detail: string
}

export const PROGRAM_OPTIONS: { value: Program; label: string; description: string }[] = [
  { value: 'calfresh', label: 'CalFresh', description: 'Food assistance (SNAP)' },
  { value: 'medi_cal', label: 'Medi-Cal', description: 'Health coverage' },
  { value: 'calworks', label: 'CalWORKs', description: 'Cash aid for families' },
  { value: 'general_relief', label: 'General Relief', description: 'County cash aid for adults' },
  { value: 'cfap', label: 'CFAP', description: 'Food help for some immigrants' },
  { value: 'section8', label: 'Section 8', description: 'Housing vouchers' },
]

export const NUDGE_OPTIONS: { key: NudgeKey; label: string; description: string }[] = [
  { key: 'interview_nudge', label: 'Interview reminders', description: 'Text patients before their county interview and help them reschedule.' },
  { key: 'docs_nudge', label: 'Missing document nudges', description: 'Ask for the paystub, ID or lease still needed to finish an application.' },
  { key: 'submit', label: 'Submit applications', description: 'File the application as soon as the packet is signed and complete.' },
  { key: 'waitlist_check', label: 'Waitlist checks', description: 'Call to see whether a closed waitlist has opened.' },
  { key: 'renewal_start', label: 'Renewal outreach', description: 'Start the renewal before coverage lapses.' },
]

export const DEFAULT_SETTINGS: OrgSettings = {
  autopilot: {
    enabled: true,
    quietHours: { start: '20:00', end: '08:00' },
    nudges: { interview_nudge: true, docs_nudge: true, submit: true, waitlist_check: true, renewal_start: true },
  },
  programs: ['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8'],
  escalateAfterNoAnswers: 3,
}
