import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

type ApiError = { code: string; message: string };
type ApiReply = {
  status: number;
  data: unknown;
  error: ApiError | undefined;
  cookie: string | undefined;
};
type User = {
  id: string;
  email: string;
  role: 'MANAGER' | 'DEPUTY_MANAGER' | 'STAFF';
  status: 'ACTIVE' | 'LOCKED';
};
type AuthSession = { accessToken: string; user: User };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type CreatedUser = { user: User; temporaryPassword?: string };
type PasswordReset = { temporaryPassword: string; message: string };

const baseUrl = new URL(
  process.env.AUTH_CHECK_BASE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? '3000'}/api`,
);
if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error('Auth checks can only target a localhost API.');
}

const demoPassword = process.env.DEMO_SEED_PASSWORD ?? '';
if (!demoPassword) throw new Error('DEMO_SEED_PASSWORD is required.');
const signingKey = process.env.ACCESS_TOKEN_SIGNING_KEY ?? '';
if (!signingKey) throw new Error('ACCESS_TOKEN_SIGNING_KEY is required.');

function expiredAccessToken(): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000002',
    iss: 'office-workspace',
    aud: 'office-workspace-web',
    iat: now - 120,
    exp: now - 60,
  })}`;
  const signature = createHmac('sha256', signingKey)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

async function request(
  method: string,
  path: string,
  options: { token?: string; cookie?: string; body?: unknown } = {},
): Promise<ApiReply> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(
    new URL(path.replace(/^\//, ''), `${baseUrl.href.replace(/\/$/, '')}/`),
    {
      method,
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    },
  );
  const bodyText = await response.text();
  let payload: { data?: unknown; error?: ApiError } = {};
  try {
    payload = bodyText ? (JSON.parse(bodyText) as typeof payload) : {};
  } catch {
    payload = {};
  }
  const setCookie =
    response.headers.getSetCookie?.()[0] ??
    response.headers.get('set-cookie') ??
    undefined;
  return {
    status: response.status,
    data: payload.data,
    error: payload.error,
    cookie: setCookie?.split(';', 1)[0],
  };
}

function expectStatus(reply: ApiReply, status: number, label: string): void {
  assert.equal(reply.status, status, label);
}

function data<T>(reply: ApiReply, label: string): T {
  assert.notEqual(reply.data, undefined, label);
  return reply.data as T;
}

function token(reply: ApiReply, label: string): string {
  return data<AuthSession>(reply, label).accessToken;
}

function cookie(reply: ApiReply, label: string): string {
  assert.ok(reply.cookie?.startsWith('refreshToken='), label);
  return reply.cookie!;
}

async function login(
  email: string,
  password: string,
): Promise<{ token: string; cookie: string; user: User }> {
  const reply = await request('POST', '/auth/login', {
    body: { email, password },
  });
  expectStatus(reply, 200, 'login succeeds');
  return {
    token: token(reply, 'login returns an access token'),
    cookie: cookie(reply, 'login sets the refresh cookie'),
    user: data<AuthSession>(reply, 'login returns a user').user,
  };
}

async function createUser(
  managerToken: string,
  email: string,
  role: User['role'],
  initialPassword?: string,
): Promise<CreatedUser> {
  const reply = await request('POST', '/users', {
    token: managerToken,
    body: {
      displayName: `Phase 02 ${role}`,
      email,
      role,
      jobTitle: 'Security check',
      ...(initialPassword ? { initialPassword } : {}),
    },
  });
  expectStatus(reply, 201, 'manager creates a user');
  return data<CreatedUser>(reply, 'user creation returns safe user data');
}

async function main(): Promise<void> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const managerEmail = 'an.nv@example.invalid';
  const deputyEmail = 'vu.lt@example.invalid';
  const staffEmail = 'binh.tt@example.invalid';
  const manager = await login(managerEmail, demoPassword);
  const deputy = await login(deputyEmail, demoPassword);
  const staff = await login(staffEmail, demoPassword);
  assert.equal(manager.user.role, 'MANAGER', 'fixture manager role');
  assert.equal(deputy.user.role, 'DEPUTY_MANAGER', 'fixture deputy role');
  assert.equal(staff.user.role, 'STAFF', 'fixture staff role');
  expectStatus(
    await request('GET', '/auth/me', { token: expiredAccessToken() }),
    401,
    'expired access token is rejected',
  );
  const profileUpdate = await request('PATCH', '/auth/me', {
    token: staff.token,
    body: { displayName: `Staff profile ${nonce}` },
  });
  expectStatus(
    profileUpdate,
    200,
    'staff can update their own allowed profile fields',
  );
  const profile = data<Record<string, unknown>>(
    profileUpdate,
    'self profile update returns a user DTO',
  );
  assert.ok(
    !('sessionId' in profile) && !('passwordHash' in profile),
    'self profile omits session and password data',
  );
  const selfRoleChange = await request('PATCH', '/auth/me', {
    token: staff.token,
    body: { role: 'MANAGER' },
  });
  expectStatus(selfRoleChange, 400, 'staff cannot change their own role');

  const unknownLogin = await request('POST', '/auth/login', {
    body: {
      email: `missing-${nonce}@example.invalid`,
      password: 'incorrect-password',
    },
  });
  const wrongPasswordLogin = await request('POST', '/auth/login', {
    body: { email: managerEmail, password: 'incorrect-password' },
  });
  expectStatus(unknownLogin, 401, 'unknown account is unauthenticated');
  expectStatus(wrongPasswordLogin, 401, 'wrong password is unauthenticated');
  assert.equal(
    unknownLogin.error?.message,
    wrongPasswordLogin.error?.message,
    'unknown and incorrect credentials share one message',
  );
  assert.equal(unknownLogin.cookie, undefined, 'failed login sets no cookie');
  assert.equal(
    wrongPasswordLogin.cookie,
    undefined,
    'wrong password sets no cookie',
  );

  const loginLimit = Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE ?? '5');
  const limitedEmail = `rate-limit-${nonce}@example.invalid`;
  for (let attempt = 0; attempt < loginLimit; attempt += 1) {
    expectStatus(
      await request('POST', '/auth/login', {
        body: { email: limitedEmail, password: 'incorrect-password' },
      }),
      401,
      `login attempt ${attempt + 1} is allowed within the configured limit`,
    );
  }
  const rateLimited = await request('POST', '/auth/login', {
    body: { email: limitedEmail, password: 'incorrect-password' },
  });
  expectStatus(rateLimited, 429, 'login limit blocks the next attempt');
  assert.equal(
    rateLimited.error?.code,
    'RATE_LIMITED',
    'rate-limit response uses the public error contract',
  );

  const workflowUser = await createUser(
    manager.token,
    `phase02-workflow-${nonce}@example.invalid`,
    'STAFF',
  );
  assert.ok(
    workflowUser.temporaryPassword,
    'generated initial password returned once',
  );
  assert.ok(
    !('passwordHash' in workflowUser.user),
    'password hash is not exposed',
  );
  const workflowInitialPassword = workflowUser.temporaryPassword!;
  const workflowLogin = await login(
    workflowUser.user.email,
    workflowInitialPassword,
  );

  const sessionsUser = await createUser(
    manager.token,
    `phase02-sessions-${nonce}@example.invalid`,
    'STAFF',
  );
  assert.ok(
    sessionsUser.temporaryPassword,
    'session user receives a generated password',
  );
  const sessionsPassword = sessionsUser.temporaryPassword!;

  const managerList = await request(
    'GET',
    '/users?page=1&pageSize=100&status=ACTIVE',
    {
      token: manager.token,
    },
  );
  expectStatus(
    managerList,
    200,
    'manager can list active and administrative user data',
  );
  const managerUsers = data<Page<User>>(
    managerList,
    'manager user list is paginated',
  );
  assert.ok(
    managerUsers.items.some((user) => 'status' in user),
    'manager receives status',
  );
  assert.ok(
    managerUsers.items.every(
      (user) => !('passwordHash' in user) && !('sessions' in user),
    ),
    'manager DTO omits credentials and sessions',
  );

  for (const [label, auth] of [
    ['deputy', deputy],
    ['staff', staff],
  ] as const) {
    const list = await request('GET', '/users?page=1&pageSize=100', {
      token: auth.token,
    });
    expectStatus(list, 200, `${label} can read the active directory`);
    const page = data<Page<Record<string, unknown>>>(
      list,
      `${label} directory is paginated`,
    );
    assert.ok(
      page.items.every(
        (user) =>
          !('status' in user) &&
          !('role' in user) &&
          !('lastLoginAt' in user) &&
          !('passwordHash' in user),
      ),
      `${label} receives the public directory projection`,
    );
    if (label === 'staff') {
      const lockedQuery = await request(
        'GET',
        '/users?status=LOCKED&page=1&pageSize=10',
        { token: auth.token },
      );
      expectStatus(lockedQuery, 404, 'staff cannot enumerate locked accounts');
    }

    const createDenied = await request('POST', '/users', {
      token: auth.token,
      body: {
        displayName: 'Denied',
        email: `phase02-denied-${label}-${nonce}@example.invalid`,
        role: 'STAFF',
        jobTitle: 'Denied',
      },
    });
    expectStatus(createDenied, 403, `${label} cannot create accounts`);
    if (label === 'staff') {
      const patchDenied = await request(
        'PATCH',
        `/users/${workflowUser.user.id}`,
        { token: auth.token, body: { displayName: 'Denied' } },
      );
      expectStatus(patchDenied, 403, 'staff cannot update accounts');
      const resetDenied = await request(
        'POST',
        `/users/${workflowUser.user.id}/reset-password`,
        { token: auth.token, body: {} },
      );
      expectStatus(resetDenied, 403, 'staff cannot reset passwords');
    }
  }

  const workloadSelf = await request(
    'GET',
    `/users/${staff.user.id}/workload`,
    { token: staff.token },
  );
  expectStatus(workloadSelf, 200, 'staff can view own workload');
  const workloadOther = await request(
    'GET',
    `/users/${workflowUser.user.id}/workload`,
    { token: staff.token },
  );
  expectStatus(workloadOther, 403, 'staff cannot view another user workload');
  const deputyWorkload = await request(
    'GET',
    `/users/${staff.user.id}/workload`,
    { token: deputy.token },
  );
  expectStatus(deputyWorkload, 200, 'deputy can inspect user workload');
  const managerWorkload = await request(
    'GET',
    `/users/${staff.user.id}/workload`,
    { token: manager.token },
  );
  expectStatus(managerWorkload, 200, 'manager can inspect user workload');
  expectStatus(
    await request(
      'GET',
      `/users/${staff.user.id}/workload?fromDate=2026-02-02T00:00:00.000Z&toDate=2026-02-01T00:00:00.000Z`,
      { token: manager.token },
    ),
    400,
    'workload rejects an inverted date range',
  );

  const oldWorkflowAuth = workflowLogin;
  const reset = await request(
    'POST',
    `/users/${workflowUser.user.id}/reset-password`,
    { token: manager.token, body: {} },
  );
  expectStatus(reset, 200, 'manager resets a password');
  const resetResult = data<PasswordReset>(
    reset,
    'password reset returns a one-time password',
  );
  const oldAccessAfterReset = await request('GET', '/auth/me', {
    token: oldWorkflowAuth.token,
  });
  expectStatus(
    oldAccessAfterReset,
    401,
    'password reset revokes access sessions',
  );
  const oldRefreshAfterReset = await request('POST', '/auth/refresh', {
    cookie: oldWorkflowAuth.cookie,
  });
  expectStatus(
    oldRefreshAfterReset,
    401,
    'password reset revokes refresh sessions',
  );
  const oldPasswordLogin = await request('POST', '/auth/login', {
    body: { email: workflowUser.user.email, password: workflowInitialPassword },
  });
  expectStatus(oldPasswordLogin, 401, 'old password stops working after reset');
  const workflowAfterReset = await login(
    workflowUser.user.email,
    resetResult.temporaryPassword,
  );

  const locked = await request('PATCH', `/users/${workflowUser.user.id}`, {
    token: manager.token,
    body: { status: 'LOCKED' },
  });
  expectStatus(locked, 200, 'manager locks an account');
  const lockedAccess = await request('GET', '/auth/me', {
    token: workflowAfterReset.token,
  });
  expectStatus(
    lockedAccess,
    401,
    'locked account cannot use an existing access token',
  );
  const lockedLogin = await request('POST', '/auth/login', {
    body: {
      email: workflowUser.user.email,
      password: resetResult.temporaryPassword,
    },
  });
  expectStatus(lockedLogin, 401, 'locked account cannot log in');
  assert.equal(lockedLogin.cookie, undefined, 'locked login sets no cookie');
  assert.equal(
    lockedLogin.error?.message,
    unknownLogin.error?.message,
    'locked and unknown accounts share one login message',
  );
  for (const [label, auth] of [
    ['deputy', deputy],
    ['staff', staff],
  ] as const) {
    expectStatus(
      await request('GET', `/users/${workflowUser.user.id}`, {
        token: auth.token,
      }),
      404,
      `${label} cannot discover a locked account by ID`,
    );
  }

  const unlocked = await request('PATCH', `/users/${workflowUser.user.id}`, {
    token: manager.token,
    body: { status: 'ACTIVE' },
  });
  expectStatus(unlocked, 200, 'manager unlocks an account');
  const roleChange = await request('PATCH', `/users/${workflowUser.user.id}`, {
    token: manager.token,
    body: { role: 'DEPUTY_MANAGER' },
  });
  expectStatus(roleChange, 200, 'manager changes a user role');
  const staleRoleAccess = await request('GET', '/auth/me', {
    token: workflowAfterReset.token,
  });
  expectStatus(
    staleRoleAccess,
    401,
    'role change revokes the existing access token',
  );
  const deputyUserLogin = await login(
    workflowUser.user.email,
    resetResult.temporaryPassword,
  );
  assert.equal(
    deputyUserLogin.user.role,
    'DEPUTY_MANAGER',
    'new login sees the new role',
  );
  const deputyAdminDenied = await request('POST', '/users', {
    token: deputyUserLogin.token,
    body: {
      displayName: 'Denied',
      email: `phase02-deputy-denied-${nonce}@example.invalid`,
      role: 'STAFF',
      jobTitle: 'Denied',
    },
  });
  expectStatus(
    deputyAdminDenied,
    403,
    'changed Deputy role cannot use manager-only endpoints',
  );
  const roleRestored = await request(
    'PATCH',
    `/users/${workflowUser.user.id}`,
    {
      token: manager.token,
      body: { role: 'STAFF' },
    },
  );
  expectStatus(roleRestored, 200, 'manager restores the staff role');

  const firstSession = await login(sessionsUser.user.email, sessionsPassword);
  const logout = await request('POST', '/auth/logout', {
    token: firstSession.token,
    cookie: firstSession.cookie,
  });
  expectStatus(logout, 200, 'logout revokes the current session');
  const accessAfterLogout = await request('GET', '/auth/me', {
    token: firstSession.token,
  });
  expectStatus(accessAfterLogout, 401, 'logged-out access token is rejected');
  const refreshAfterLogout = await request('POST', '/auth/refresh', {
    cookie: firstSession.cookie,
  });
  expectStatus(refreshAfterLogout, 401, 'refresh after logout is rejected');

  const rotatingSession = await login(
    sessionsUser.user.email,
    sessionsPassword,
  );
  const rotated = await request('POST', '/auth/refresh', {
    cookie: rotatingSession.cookie,
  });
  expectStatus(rotated, 200, 'refresh rotates a valid token');
  const rotatedCookie = cookie(rotated, 'rotation sets a replacement cookie');
  assert.notEqual(
    rotatedCookie,
    rotatingSession.cookie,
    'refresh cookie rotates',
  );
  const replay = await request('POST', '/auth/refresh', {
    cookie: rotatingSession.cookie,
  });
  expectStatus(replay, 401, 'rotated refresh token cannot be reused');
  const nextRotation = await request('POST', '/auth/refresh', {
    cookie: rotatedCookie,
  });
  expectStatus(
    nextRotation,
    200,
    'the replacement refresh token remains valid',
  );

  const sessionA = await login(sessionsUser.user.email, sessionsPassword);
  const sessionB = await login(sessionsUser.user.email, sessionsPassword);
  const logoutAll = await request('POST', '/auth/logout-all', {
    token: sessionA.token,
    cookie: sessionA.cookie,
  });
  expectStatus(logoutAll, 200, 'logout-all revokes every session');
  for (const [label, session] of [
    ['first', sessionA],
    ['second', sessionB],
  ] as const) {
    expectStatus(
      await request('GET', '/auth/me', { token: session.token }),
      401,
      `${label} access token is revoked by logout-all`,
    );
    expectStatus(
      await request('POST', '/auth/refresh', { cookie: session.cookie }),
      401,
      `${label} refresh token is revoked by logout-all`,
    );
  }

  const concurrentRefreshSession = await login(
    sessionsUser.user.email,
    sessionsPassword,
  );
  const [refreshA, refreshB] = await Promise.all([
    request('POST', '/auth/refresh', {
      cookie: concurrentRefreshSession.cookie,
    }),
    request('POST', '/auth/refresh', {
      cookie: concurrentRefreshSession.cookie,
    }),
  ]);
  assert.deepEqual(
    [refreshA.status, refreshB.status].sort(),
    [200, 401],
    'only one concurrent refresh request can rotate a token',
  );

  const selfLock = await request('PATCH', `/users/${manager.user.id}`, {
    token: manager.token,
    body: { status: 'LOCKED' },
  });
  expectStatus(selfLock, 409, 'manager cannot lock their own account');

  const managerBPassword = `Phase02-${nonce}-manager-password`;
  const managerB = await createUser(
    manager.token,
    `phase02-manager-${nonce}@example.invalid`,
    'MANAGER',
    managerBPassword,
  );
  assert.equal(
    managerB.temporaryPassword,
    undefined,
    'a caller-supplied initial password is not echoed back',
  );
  const [lockManagerB, demoteManagerA] = await Promise.all([
    request('PATCH', `/users/${managerB.user.id}`, {
      token: manager.token,
      body: { status: 'LOCKED' },
    }),
    request('PATCH', `/users/${manager.user.id}`, {
      token: manager.token,
      body: { role: 'STAFF' },
    }),
  ]);
  assert.ok(
    [200, 401, 403, 409].includes(lockManagerB.status),
    'concurrent lock request has a defined response',
  );
  assert.ok(
    [200, 401, 403, 409].includes(demoteManagerA.status),
    'concurrent demotion request has a defined response',
  );
  const managerAfterConcurrency = await login(managerEmail, demoPassword);
  const activeManagers = await request(
    'GET',
    '/users?status=ACTIVE&role=MANAGER&page=1&pageSize=100',
    { token: managerAfterConcurrency.token },
  );
  expectStatus(
    activeManagers,
    200,
    'active manager list is queryable after concurrency',
  );
  const activeManagerPage = data<Page<Record<string, unknown>>>(
    activeManagers,
    'active manager count is paginated',
  );
  assert.equal(
    activeManagerPage.total,
    1,
    'concurrent changes preserve the final ACTIVE Manager',
  );

  const survivingManager = activeManagerPage.items[0]!;
  const survivingManagerId = String(survivingManager.id);
  const survivingManagerEmail = String(survivingManager.email);
  const survivingManagerPassword =
    survivingManagerId === manager.user.id ? demoPassword : managerBPassword;
  const survivingManagerAuth = await login(
    survivingManagerEmail,
    survivingManagerPassword,
  );
  const passwordChangeUser = await createUser(
    survivingManagerAuth.token,
    `phase02-password-change-${nonce}@example.invalid`,
    'STAFF',
  );
  const passwordChangeInitialPassword = passwordChangeUser.temporaryPassword!;
  const passwordChangeSession = await login(
    passwordChangeUser.user.email,
    passwordChangeInitialPassword,
  );
  const changedPassword = `Changed-${nonce}-password`;
  expectStatus(
    await request('POST', '/auth/change-password', {
      token: passwordChangeSession.token,
      body: {
        currentPassword: passwordChangeInitialPassword,
        newPassword: changedPassword,
      },
    }),
    200,
    'user can change their password',
  );
  expectStatus(
    await request('GET', '/auth/me', { token: passwordChangeSession.token }),
    401,
    'password change revokes the current session',
  );
  expectStatus(
    await request('POST', '/auth/login', {
      body: {
        email: passwordChangeUser.user.email,
        password: passwordChangeInitialPassword,
      },
    }),
    401,
    'old password fails after an own-password change',
  );
  const changedPasswordLogin = await login(
    passwordChangeUser.user.email,
    changedPassword,
  );
  assert.ok(changedPasswordLogin.token, 'new password can log in');

  process.stdout.write(
    'PASS Phase 02 auth/session/RBAC/user management security matrix (localhost only).\n',
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  process.stderr.write(`FAIL Phase 02 auth security matrix: ${message}\n`);
  process.exitCode = 1;
});
