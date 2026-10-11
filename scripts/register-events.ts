import 'dotenv/config';
import { registerEvents, EVENTS_HASH } from '../src/keewano.js';

if (!process.env.KEEWANO_SDK_KEY) {
  console.log('KEEWANO_SDK_KEY is missing; set it in .env to register events');
  process.exit(0);
}
// 202 = registered, 200 = already registered, 409 = a different list already uses this hash
console.log('register status', await registerEvents(), `(hash ${EVENTS_HASH})`);
