// Browser-safe wire contract shared by the chat API and frontend. No runtime imports.
export type Channel = 'sms' | 'voice' | 'web';
export type IntakeStatus = 'collecting' | 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'superseded';
export type ApplicationProgram = 'calfresh' | 'medi_cal' | 'calworks' | 'general_relief' | 'cfap' | 'section8'
  | 'pge_care' | 'pge_fera' | 'wic' | 'california_lifeline' | 'liheap' | 'ihss' | 'child_care';
export interface ApplicationMatch {
  program: ApplicationProgram;
  name: string;
  status: 'likely' | 'needs_info' | 'not_eligible';
  reason: string;
  missingFields: string[];
  followUpQuestions: string[];
  applicationUrl: string;
  nextStep: string;
  sourceUrl: string;
  rulesCheckedAt: string;
  rulesValidThrough: string | null;
  coverage: 'screening' | 'referral';
}
export interface ApplicationScreening {
  preliminary: true;
  asOf: string;
  notice: string;
  matches: ApplicationMatch[];
}
export interface ServerMessage {
  channel: Channel | 'system'; role: 'user' | 'assistant'; content: string; at: string;
}
export interface WebView {
  sessionId: string;
  status: IntakeStatus;
  linked: boolean;
  missing: string[];
  messages: ServerMessage[];
  screening: ApplicationScreening;
}
export interface PublicChannelConfig { phone: string | null }
