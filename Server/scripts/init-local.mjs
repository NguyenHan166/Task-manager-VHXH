import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, '.env');
if (existsSync(target)) {
  console.log('Server/.env already exists; left it unchanged.');
  process.exit(0);
}

const password = randomBytes(24).toString('hex');
const signingKey = randomBytes(48).toString('hex');
const demoPassword = randomBytes(12).toString('hex');
const databaseUrl = `postgresql://office_workspace:${password}@127.0.0.1:5433/office_workspace?schema=public`;
const template = readFileSync(join(root, '.env.example'), 'utf8');
const env = template
  .replace(/^DATABASE_URL=$/m, `DATABASE_URL=${databaseUrl}`)
  .replace(/^LOCAL_POSTGRES_PASSWORD=$/m, `LOCAL_POSTGRES_PASSWORD=${password}`)
  .replace(
    /^ACCESS_TOKEN_SIGNING_KEY=$/m,
    `ACCESS_TOKEN_SIGNING_KEY=${signingKey}`,
  )
  .replace(/^DEMO_SEED_PASSWORD=$/m, `DEMO_SEED_PASSWORD=${demoPassword}`);
writeFileSync(target, env, { mode: 0o600, flag: 'wx' });
console.log('Created Server/.env with local-only random credentials.');
