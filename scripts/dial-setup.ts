// One-time: point the Dial number's inbound voice agent at Aid's intake script.
//   npx tsx scripts/dial-setup.ts
import 'dotenv/config';
import { INBOUND_CALL_INSTRUCTION } from '../src/agent.js';
import { setInboundInstruction } from '../src/dial.js';

await setInboundInstruction(INBOUND_CALL_INSTRUCTION);
console.log('Inbound call instruction set on', process.env.DIAL_FROM_NUMBER || process.env.DIAL_FROM_NUMBER_ID);
