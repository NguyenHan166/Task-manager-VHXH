import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (
  process.env.APP_ENV !== 'local' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname)
) {
  throw new Error(
    'db:clean only accepts APP_ENV=local with a localhost database',
  );
}
if (process.argv[2] !== '--confirm') {
  throw new Error(
    'This deletes the local database. Run: npm run db:clean -- --confirm',
  );
}
const prisma = join(root, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(
  process.execPath,
  [prisma, 'migrate', 'reset', '--force', '--skip-seed'],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  },
);
process.exitCode = result.status ?? 1;
