// Explicit, audited attribution correction. Never overwrites original identities.
// npm run correct:vote -- <admin> <vote-id> <a|b> <replacement.json> <reason>
import { readFileSync } from 'node:fs';
import { createPlatform } from '../server/app.mjs';
import { config, limits } from '../server/config.mjs';

const [name, voteId, side, replacementFile, ...words] = process.argv.slice(2);
if (!name || !voteId || !['a', 'b'].includes(side) || !replacementFile || !words.length) throw new Error('Usage: correct-vote.mjs <admin> <vote-id> <a|b> <replacement.json> <reason>');
const platform = createPlatform({ config: { ...config, capture: false }, limits });
try {
  const admin = platform.db.prepare('SELECT id, name, role FROM users WHERE name = ?').get(name);
  if (admin?.role !== 'admin') throw new Error('An existing administrator is required');
  const result = platform.arena.correctVote(admin, voteId, side, JSON.parse(readFileSync(replacementFile, 'utf8')), words.join(' '));
  console.log(JSON.stringify(result));
} finally { await platform.close(); }
