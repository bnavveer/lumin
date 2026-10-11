import 'dotenv/config';

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

export const optionalEnv = (name: string): string | undefined => process.env[name] || undefined;
