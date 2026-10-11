// SMS templates (English source; translated on demand) and the agent system prompt.
import type { Household } from '../contracts.js';
import type { ConversationState, Lang } from './state.js';

export const SMS_LIMIT = 320;

export const LANG_NAME: Record<Lang, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese (Simplified)', vi: 'Vietnamese', tl: 'Tagalog',
};

export const T = {
  consentAsk: (clinic: string): string =>
    `Hi! This is Lumin, the benefits helper from ${clinic}. Reply YES to let Lumin help with your benefits, contact offices for you, and use AI services to read the documents you send. Msg&data rates may apply. Reply STOP to opt out.`,
  consentStillNeeded: (): string =>
    'Lumin needs your OK first. Reply YES to let Lumin help with your benefits, contact offices for you, and use AI services to read the documents you send, or STOP to opt out.',
  consentThanks: (): string =>
    "Thanks! You're all set. A few quick questions so I can see what you qualify for: how many people live with you, your household's monthly income before taxes, your county, kids under 18, and your citizenship or immigration status?",
  consentThanksScreened: (): string =>
    "Thanks! You're all set. Text me anytime: STATUS for your case, DOCS for your papers, or send a photo of a document. Reply HELP for more.",
  optOut: (): string =>
    'Lumin: You are unsubscribed and will get no more messages. Reply START to resubscribe.',
  optIn: (): string =>
    'Lumin: You are subscribed again. Reply HELP for help or STOP to opt out.',
  help: (): string =>
    'Lumin help: STATUS = your case, DOCS = your papers, HUMAN = a caseworker, RENEW = renewal, LANG ES = Español. Send a photo of any document. Msg&data rates may apply. Reply STOP to opt out.',
  human: (clinic: string): string =>
    `Your request for help is saved for ${clinic}. I cannot promise a response time. For urgent benefits help, contact your county office or 211.`,
  langSet: (): string => 'Okay! I will text you in English from now on.',
  photoGot: (): string => 'Got it! Reading your document now. I will text you what I found.',
  photoFailed: (): string => 'Sorry, I could not save that photo. Please try again, or send it as a clear JPG or PDF.',
  noPending: (): string => 'There is nothing waiting for your OK right now. Text STATUS to see your case.',
  declined: (what: string): string => `No problem, I will hold off on: ${what}. Text me when you are ready.`,
  interviewConfirmed: (): string => 'Great, your interview is confirmed. The county may call from an unknown number, so please pick up. Good luck!',
  rescheduleAsk: (): string => 'Want me to call the county to reschedule your interview? Reply YES or NO.',
  renewAsk: (): string => 'Want to review your saved information and the official renewal steps? You will complete and sign with the county. Reply YES or NO.',
  approvalAsk: (description: string): string => `${description} Reply YES to go ahead or NO to wait.`,
  fallback: (): string => 'Sorry, I had trouble with that. Text HELP for options, or HUMAN to reach a caseworker.',
} as const;

const MONEY = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function systemPrompt(opts: {
  clinic: string; state: ConversationState; household?: Household; screened: boolean; today: string;
}): string {
  const h = opts.household;
  const profile = h && opts.screened
    ? `Household: ${h.size} people, ${MONEY(h.monthlyIncome)}/mo, county ${h.county}, ${h.childrenUnder18} kids under 18, status ${h.immigrationStatus}.`
    : 'Household not screened yet. Collect: household size, monthly gross income, county (Los Angeles or San Francisco), kids under 18, pregnant?, adult age, immigration status, kids citizens?. Ask only for what is missing, at most 2 questions per text. Never assume missing answers. Only call update_household with answers the person explicitly provided.';
  return [
    `You are Lumin, a warm benefits caseworker texting for ${opts.clinic}. Today is ${opts.today}.`,
    `Write in ${LANG_NAME[opts.state.language]} unless the person writes in another language, then match theirs.`,
    `Keep each reply under ${SMS_LIMIT} characters, plain text, no markdown, 6th-grade reading level.`,
    'Never promise approval. Never ask for SSNs, passwords, or bank numbers by text. Never invent facts: use tools.',
    'You can NOT submit, call, fill forms, or share documents yourself. To do any of those, call propose_action; the person must reply YES.',
    'Current application capability: prepare a review and link to the official agency application. Automated filling is a demo only. YES approves assistance, not a legal signature. Never say an application was filled, signed, filed, a call was placed, or documents were shared without a tool result proving that exact action. The person signs and submits on the official site.',
    'Benefits questions: use answer_question. Places near them: find_local_resources. Case questions: get_status. Papers: vault_status.',
    'If a screened person wants to apply, call propose_action (submit_application, with programs) right away; missing papers can follow.',
    'If they are upset, in crisis, or ask for a person, call escalate_to_human.',
    profile,
  ].join('\n');
}

/** Split a long reply into SMS-sized parts at sentence boundaries (max 3 parts). */
export function splitSms(text: string, limit = SMS_LIMIT): string[] {
  const clean = text.replace(/\*\*|__|`/g, '').replace(/\n{2,}/g, '\n').trim();
  if (clean.length <= limit) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [clean];
  const parts: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > limit && cur) { parts.push(cur.trim()); cur = ''; }
    cur += s.length > limit ? s.slice(0, limit - 1) + '…' : s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.slice(0, 3);
}

/** Hand-written Spanish for compliance-critical templates (no LLM round trip, exact wording). */
export function spanishSeeds(clinic: string): Array<[string, string]> {
  return [
    [T.optOut(), 'Lumin: Ya no está suscrito y no recibirá más mensajes. Responda START para volver a suscribirse.'],
    [T.optIn(), 'Lumin: Está suscrito de nuevo. Responda AYUDA para ayuda o ALTO para cancelar.'],
    [T.help(), 'Ayuda de Lumin: ESTADO = su caso, DOCS = sus papeles, HUMANO = un trabajador de casos, RENOVAR = renovación, LANG EN = English. Mande foto de cualquier documento. Pueden aplicar tarifas de mensajes y datos. Responda ALTO para cancelar.'],
    [T.consentAsk(clinic), `¡Hola! Soy Lumin, el asistente de beneficios de ${clinic}. Responda SI para que Lumin le ayude con sus beneficios, contacte oficinas por usted y use servicios de IA para leer los documentos que envíe. Pueden aplicar tarifas de mensajes y datos. Responda ALTO para cancelar.`],
    [T.consentStillNeeded(), 'Lumin necesita su permiso primero. Responda SI para que Lumin le ayude con sus beneficios, contacte oficinas y use servicios de IA para leer sus documentos, o ALTO para cancelar.'],
    [T.human(clinic), `Su solicitud de ayuda está guardada para ${clinic}. No puedo prometer cuándo responderán. Para ayuda urgente con beneficios, contacte a su condado o al 211.`],
    [T.photoGot(), '¡Recibido! Estoy leyendo su documento. Le escribiré lo que encontré.'],
    [T.interviewConfirmed(), 'Perfecto, su entrevista está confirmada. El condado puede llamar de un número desconocido, por favor conteste. ¡Suerte!'],
    [T.rescheduleAsk(), '¿Quiere que llame al condado para cambiar la fecha de su entrevista? Responda SI o NO.'],
    [T.consentThanks(), '¡Gracias! Ya está listo. Unas preguntas rápidas para ver para qué califica: ¿cuántas personas viven con usted, cuánto ganan al mes antes de impuestos, en qué condado viven, cuántos niños menores de 18 y cuál es su estatus migratorio?'],
    [T.consentThanksScreened(), '¡Gracias! Ya está listo. Escríbame cuando quiera: ESTADO para su caso, DOCS para sus papeles, o mande foto de un documento. Responda AYUDA para más.'],
    [T.noPending(), 'No hay nada esperando su permiso ahora. Escriba ESTADO para ver su caso.'],
  ];
}
