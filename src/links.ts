import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

const sign = (hid: string, exp: number): string =>
  createHmac('sha256', env('PACKET_LINK_SECRET')).update(`${hid}.${exp}`).digest('base64url');

export function packetToken(hid: string, ttlSec = DEFAULT_TTL_SEC, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + ttlSec;
  return `${exp}.${sign(hid, exp)}`;
}

export function verifyPacketToken(hid: string, token: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expStr = token.slice(0, dot);
  if (!/^\d{1,12}$/.test(expStr)) return false;
  const exp = Number(expStr);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(hid, exp));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  return exp >= nowSec;
}

export function packetUrl(hid: string): string {
  return `${env('PUBLIC_BASE_URL')}/p/${hid}?t=${packetToken(hid)}`;
}
