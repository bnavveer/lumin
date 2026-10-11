// The API-only development entry uses the same routes as production, without Dial.
import 'dotenv/config';
process.env.DIAL_ENABLED = 'false';
await import('./main.js');
