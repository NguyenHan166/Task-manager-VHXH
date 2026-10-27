type Environment = 'local' | 'staging' | 'production';

export function validateEnv(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      String(value ?? '').trim(),
    ]),
  );
  const errors: string[] = [];
  const appEnv = env.APP_ENV as Environment;
  if (!['local', 'staging', 'production'].includes(appEnv)) {
    errors.push('APP_ENV must be local, staging, or production');
  }
  if (env.BUSINESS_TIMEZONE !== 'Asia/Ho_Chi_Minh') {
    errors.push('BUSINESS_TIMEZONE must be Asia/Ho_Chi_Minh');
  }
  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    if (
      !['postgresql:', 'postgres:'].includes(databaseUrl.protocol) ||
      !databaseUrl.hostname ||
      !databaseUrl.username ||
      !databaseUrl.password
    ) {
      errors.push('DATABASE_URL must be a PostgreSQL URL with credentials');
    }
  } catch {
    errors.push('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (
    !env.ACCESS_TOKEN_SIGNING_KEY ||
    env.ACCESS_TOKEN_SIGNING_KEY.length < 32
  ) {
    errors.push('ACCESS_TOKEN_SIGNING_KEY must be at least 32 characters');
  }
  const origins =
    env.FRONTEND_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [];
  if (
    !origins.length ||
    origins.some((origin) => !/^https?:\/\/[^/*]+$/.test(origin))
  ) {
    errors.push('FRONTEND_ORIGINS must contain explicit HTTP(S) origins');
  }
  const numbers: Array<[string, number, number]> = [
    ['PORT', 1, 65535],
    ['ACCESS_TOKEN_TTL_SECONDS', 60, 3600],
    ['REFRESH_TOKEN_TTL_DAYS', 1, 30],
    ['LOGIN_RATE_LIMIT_PER_MINUTE', 1, 1000],
    ['R2_SIGNED_URL_TTL_SECONDS', 60, 3600],
    ['MAX_FILE_SIZE_MB', 1, 1024],
    ['FILE_REMOVED_RETENTION_DAYS', 1, 3650],
    ['REMINDER_INTERVAL_MINUTES', 1, 1440],
    ['REMINDER_BEFORE_HOURS', 1, 720],
    ['BACKUP_RETENTION_DAYS', 1, 3650],
  ];
  for (const [key, min, max] of numbers) {
    const value = Number(env[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${key} must be an integer between ${min} and ${max}`);
    }
  }
  if (env.ACCESS_TOKEN_TTL_SECONDS !== '900') {
    errors.push('ACCESS_TOKEN_TTL_SECONDS must be 900 (15 minutes)');
  }
  if (env.REFRESH_TOKEN_TTL_DAYS !== '7') {
    errors.push('REFRESH_TOKEN_TTL_DAYS must be 7');
  }
  for (const key of [
    'REFRESH_COOKIE_SECURE',
    'REFRESH_COOKIE_HTTP_ONLY',
    'REAL_DATA_APPROVED',
  ]) {
    if (!['true', 'false'].includes(env[key]))
      errors.push(`${key} must be true or false`);
  }
  if (env.REFRESH_COOKIE_HTTP_ONLY !== 'true') {
    errors.push('REFRESH_COOKIE_HTTP_ONLY must be true');
  }
  if (appEnv !== 'local' && env.REFRESH_COOKIE_SECURE !== 'true') {
    errors.push('REFRESH_COOKIE_SECURE must be true outside local');
  }
  if (env.REFRESH_COOKIE_SAME_SITE !== 'Lax') {
    errors.push('REFRESH_COOKIE_SAME_SITE must be Lax');
  }
  const r2Keys = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_FILE_BUCKET',
  ];
  const suppliedR2 = r2Keys.filter((key) => Boolean(env[key]));
  if (suppliedR2.length > 0 && suppliedR2.length < r2Keys.length) {
    errors.push('R2 configuration must provide all R2_* keys together');
  }
  if (appEnv !== 'local' && suppliedR2.length !== r2Keys.length) {
    errors.push('R2 configuration is required outside local');
  }
  if (
    appEnv === 'production' &&
    (!env.BACKUP_BUCKET || !env.BACKUP_ENCRYPTION_KEY)
  ) {
    errors.push(
      'BACKUP_BUCKET and BACKUP_ENCRYPTION_KEY are required in production',
    );
  }
  if (errors.length)
    throw new Error(`Invalid backend configuration: ${errors.join('; ')}`);
  return raw;
}
