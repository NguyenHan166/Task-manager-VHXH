import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createServer as createViteServer } from "vite";

const frontendRoot = process.cwd();
const serverRoot = resolve(frontendRoot, "../Server");
const serverRequire = createRequire(resolve(serverRoot, "package.json"));
const serverEnv = serverRequire("dotenv").parse(readFileSync(resolve(serverRoot, ".env")));
const fixture = JSON.parse(readFileSync(resolve(frontendRoot, "../docs/backend-plan/phase-00/kpi-fixture.v1.json"), "utf8"));
const usersByAlias = new Map(fixture.users.map((user) => [user.alias, user]));
const databaseUrl = process.env.DATABASE_URL || serverEnv.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Phase 08 checks require a localhost DATABASE_URL.");
}
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (process.env.CI !== "true" && !databaseName.startsWith("office_workspace_phase08_verify")) {
  throw new Error("Use a disposable office_workspace_phase08_verify* database; the normal local database is refused.");
}
const demoPassword = process.env.DEMO_SEED_PASSWORD || serverEnv.DEMO_SEED_PASSWORD;
if (!demoPassword) throw new Error("DEMO_SEED_PASSWORD is required.");

const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function freePort() {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
  return port;
}

const openapi = JSON.parse(readFileSync(resolve(frontendRoot, "../docs/backend-plan/phase-00/openapi.v1.json"), "utf8"));
const contractOperations = [
  ["post", "/auth/login"], ["post", "/auth/refresh"], ["post", "/auth/logout"], ["get", "/auth/me"],
  ["get", "/dashboard/stats"], ["get", "/tasks"], ["post", "/tasks"], ["get", "/tasks/{id}"],
  ["post", "/tasks/{id}/publish"], ["post", "/tasks/{id}/start"], ["post", "/tasks/{id}/progress"],
  ["get", "/tasks/{id}/submissions"], ["post", "/tasks/{id}/submissions"], ["post", "/tasks/{id}/approve"],
  ["post", "/tasks/{id}/return"], ["get", "/tasks/{id}/events"], ["get", "/tasks/{id}/comments"],
  ["get", "/notifications"], ["get", "/notifications/unread-count"], ["get", "/files"],
  ["post", "/files/upload-url"], ["post", "/files/complete"], ["get", "/reports/kpi"],
  ["get", "/reports/tasks"], ["get", "/reports/tasks/export"], ["get", "/users"],
  ["get", "/users/{id}/workload"], ["get", "/settings"], ["patch", "/settings"], ["get", "/audit-logs"],
];
let assertionCount = 0;
for (const [method, path] of contractOperations) {
  assert.ok(openapi.paths[path]?.[method], `OpenAPI defines ${method.toUpperCase()} ${path}`);
  assertionCount += 1;
}
for (const [schema, fields] of [
  ["CreateTaskInput", ["type", "title", "deliverable", "dueAt"]],
  ["SubmitTaskInput", ["summary", "fileIds"]],
  ["ApprovalInput", ["submissionId"]],
  ["ReturnInput", ["submissionId", "reason"]],
]) {
  const properties = openapi.components.schemas[schema]?.properties ?? {};
  for (const field of fields) {
    assert.ok(properties[field], `${schema} defines ${field}`);
    assertionCount += 1;
  }
}

let apiProcess;
let vite;
let httpRepository;
let apiClient;
let ApiError;
let apiPort;
let baseUrl;
let auditBefore;
let changedSettings = false;

function check(condition, label) {
  assert.ok(condition, label);
  assertionCount += 1;
}

async function startApi() {
  apiProcess = spawn(process.execPath, [resolve(serverRoot, "dist/main.js")], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ...serverEnv,
      APP_ENV: "local",
      DATABASE_URL: databaseUrl,
      PORT: String(apiPort),
      SYSTEM_CLOCK_OVERRIDE: "2026-10-27T09:00:00.000Z",
      REMINDER_INTERVAL_MINUTES: "1440",
      BACKUP_SCHEDULE_UTC: "23:59",
      BACKUP_LOCAL_DIR: resolve(serverRoot, ".phase08-acceptance-backups/fe-contract"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let recentOutput = "";
  apiProcess.stdout.on("data", (chunk) => { recentOutput = `${recentOutput}${chunk}`.slice(-4000); });
  apiProcess.stderr.on("data", (chunk) => { recentOutput = `${recentOutput}${chunk}`.slice(-4000); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error(`Disposable API exited before readiness (${apiProcess.exitCode}): ${recentOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.ok) return;
    } catch { /* The API is still starting. */ }
    await delay(150);
  }
  throw new Error("The disposable API did not become ready in time.");
}

async function stopApi() {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill.exe", ["/PID", String(apiProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    apiProcess.kill("SIGTERM");
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.exitCode !== null || apiProcess.signalCode !== null) return;
    await delay(100);
  }
  throw new Error("The disposable API did not stop cleanly.");
}

async function login(alias) {
  const userFixture = usersByAlias.get(alias);
  assert.ok(userFixture, `Fixture user ${alias} exists`);
  const session = await apiClient.login(userFixture.email, demoPassword);
  httpRepository.setIdentity(session.user);
  return session;
}

async function expectApiError(action, code, status, label) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  check(caught instanceof ApiError, `${label} becomes an ApiError (received ${caught?.constructor?.name ?? "no error"})`);
  check(caught.code === code && caught.status === status, `${label} maps ${status} ${code} (received ${caught.code ?? "no code"} ${caught.status ?? "no status"})`);
}

async function runConcurrentScenario(loadSessions, dueAt) {
  await stopApi();
  await startApi(); // Reset the in-memory rate-limit window after fixture setup.
  const routes = [
    ["dashboard", "dashboard/stats?scope=STAFF"],
    ["tasks", "tasks?scope=OWNED&type=OFFICIAL&page=1&pageSize=10"],
    ["notifications", "notifications?limit=100"],
  ];
  const requestLatencies = [];
  const concurrencyStarted = Date.now();
  const results = await Promise.all(loadSessions.flatMap(({ token }) => routes.map(async ([label, path]) => {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    requestLatencies.push(performance.now() - started);
    assert.equal(response.status, 200, `12-user ${label} request returns 200: ${body?.error?.code ?? ""}`);
    assert.ok(body?.data, `12-user ${label} response uses API data envelope`);
    return { label, body };
  })));
  requestLatencies.sort((a, b) => a - b);
  const p95Index = Math.ceil(requestLatencies.length * 0.95) - 1;
  const p95Ms = Math.round(requestLatencies[p95Index] ?? 0);
  const taskResponses = results.filter((result) => result.label === "tasks");
  check(results.length === 36, "12 user sessions issued 36 concurrent reads");
  check(taskResponses.every((result) => result.body.data.items.length === 1), "Each concurrent staff user sees only their assigned task");
  check(Date.now() - concurrencyStarted < 30000, "12-user initial-load burst completes within 30 seconds");
  await stopApi();
  await startApi(); // Rebind the same FE adapter to a fresh rate-limit window for the journey.
  return p95Ms;
}

async function run() {
  apiPort = await freePort();
  baseUrl = `http://127.0.0.1:${apiPort}/api`;
  process.env.VITE_API_BASE_URL = baseUrl;
  process.env.VITE_DATA_MODE = "api";
  process.env.TZ = "Asia/Ho_Chi_Minh";
  await startApi();
  vite = await createViteServer({
    configFile: resolve(frontendRoot, "vite.config.ts"),
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
  });
  const clientModule = await vite.ssrLoadModule("/src/shared/api-client.ts");
  const repositoryModule = await vite.ssrLoadModule("/src/shared/http-repository.ts");
  apiClient = clientModule.apiClient;
  ApiError = clientModule.ApiError;
  httpRepository = new repositoryModule.HttpRepository();
  check(clientModule.isMockMode === false, "FE adapter is in API mode");

  // Set up twelve distinct staff accounts and assigned tasks through the real FE adapter.
  await login("u01");
  const loadPassword = "Phase08-Load-Check-2030!";
  const loadUsers = [];
  const loadSessions = [];
  const loadDueAt = "2030-01-15T02:00:00.000Z";
  for (let index = 1; index <= 12; index += 1) {
    const email = `phase08-load-${Date.now()}-${index}@example.invalid`;
    const created = await httpRepository.createUser({
      email,
      displayName: `Phase 08 Load ${index}`,
      jobTitle: "Acceptance workload",
      role: "STAFF",
      initialPassword: loadPassword,
    }, "phase08-manager");
    loadUsers.push(created);
  }
  for (const user of loadUsers) {
    const task = await httpRepository.createTask({
      type: "OFFICIAL",
      title: `Phase 08 load task ${user.email}`,
      description: "Twelve-user concurrent read scenario",
      deliverable: "Dashboard and assigned task list",
      priority: "NORMAL",
      primaryAssigneeId: user.id,
      collaboratorIds: [],
      watcherIds: [],
      dueAt: loadDueAt,
      projectId: null,
      parentTaskId: null,
      isDraft: false,
    }, "phase08-manager");
    check(task.status === "TODO", "Load task is published");
  }
  for (const user of loadUsers) {
    const session = await apiClient.login(user.email, loadPassword);
    loadSessions.push({ user, token: session.accessToken });
  }
  const concurrentP95 = await runConcurrentScenario(loadSessions, loadDueAt);

  const deputy = await login("u06");
  check(deputy.user.role === "DEPUTY_MANAGER", "Deputy fixture has the expected role");
  const staffA = await login("u02");
  const dueAt = new Date("2030-01-15T09:00:00+07:00").toISOString();
  check(dueAt === "2030-01-15T02:00:00.000Z", "Vietnam local deadline serializes to UTC");

  await login("u06");
  const task = await httpRepository.createTask({
    type: "OFFICIAL",
    title: `Phase 08 FE journey ${Date.now()}`,
    description: "Contract and cross-screen state acceptance",
    deliverable: "Approved result",
    priority: "NORMAL",
    primaryAssigneeId: staffA.user.id,
    collaboratorIds: [],
    watcherIds: [],
    dueAt,
    projectId: null,
    parentTaskId: null,
    isDraft: false,
  }, deputy.user.id);
  check(task.status === "TODO", "Giao việc publishes the created draft before reporting success");
  check(task.dueAt === dueAt, "FE create DTO preserves the UTC due instant");

  const comment = await httpRepository.addComment(task.id, "Trao đổi có tệp đính kèm", deputy.user.id);
  const commentFile = new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=", "base64")], "phase08-comment.png", { type: "image/png" });
  let uploadedCommentFile;
  try {
    uploadedCommentFile = await httpRepository.uploadFile(commentFile, "COMMENT", comment.id);
    const commentLinks = await httpRepository.getFileLinks("COMMENT", comment.id);
    check(commentLinks.some((link) => link.fileId === uploadedCommentFile.id), "FE adapter uploads and lists COMMENT attachment links");
  } finally {
    if (uploadedCommentFile) await httpRepository.deleteFile(uploadedCommentFile.id, deputy.user.id).catch(() => undefined);
  }

  await login("u03");
  await expectApiError(() => httpRepository.getTaskDetail(task.id), "NOT_FOUND", 404, "Staff B reads Staff A task");
  const staffBTasks = await httpRepository.queryTasks({ scope: "OWNED", type: "OFFICIAL", page: 1, pageSize: 100 });
  check(!staffBTasks.items.some((item) => item.id === task.id), "Staff B task list excludes Staff A record");
  await login("u02");
  const staffATasks = await httpRepository.queryTasks({ scope: "OWNED", type: "OFFICIAL", page: 1, pageSize: 100 });
  check(staffATasks.items.some((item) => item.id === task.id), "Staff A task list includes assigned task");
  await httpRepository.startTask(task.id, staffA.user.id);
  await httpRepository.updateTaskProgress(task.id, { progressPercent: 65, isBlocked: false }, staffA.user.id);
  const firstSubmission = await httpRepository.addSubmission(task.id, {
    summary: "Kết quả lần đầu",
    details: "Nộp qua HttpRepository",
    fileIds: [],
  }, staffA.user.id);
  check(firstSubmission.status === "PENDING", "Staff submission enters pending review");

  await login("u06");
  await httpRepository.decideApproval(firstSubmission.id, "RETURNED", "Bổ sung căn cứ nghiệm thu", deputy.user.id);
  const returnedTask = await httpRepository.getTaskById(task.id);
  check(returnedTask?.status === "IN_PROGRESS", "Deputy return moves the task back to work");

  await login("u02");
  const finalSubmission = await httpRepository.addSubmission(task.id, {
    summary: "Kết quả đã bổ sung",
    details: "Bản nộp cuối",
    fileIds: [],
  }, staffA.user.id);
  await login("u01");
  const approved = await httpRepository.decideApproval(finalSubmission.id, "APPROVED", null, "");
  check(approved.decision === "APPROVED", "Manager approval is committed");

  const detail = await httpRepository.getTaskDetail(task.id);
  check(detail.task?.status === "DONE", "Task detail shows the approved state");
  const events = await httpRepository.getEvents(task.id);
  const eventKinds = new Set(events.map((event) => event.kind));
  for (const kind of ["PUBLISHED", "STARTED", "PROGRESS_UPDATED", "SUBMITTED", "RETURNED", "APPROVED"]) {
    check(eventKinds.has(kind), `Task history contains ${kind}`);
  }
  const submissions = await httpRepository.getSubmissions(task.id);
  check(submissions.length === 2, "Submission history retains both review rounds");
  const approvals = await httpRepository.getApprovals(task.id);
  check(approvals.some((approval) => approval.decision === "RETURNED") && approvals.some((approval) => approval.decision === "APPROVED"), "Approval history retains return and approval");

  const managerTasks = await httpRepository.getReportTasks({ type: "OFFICIAL", status: "DONE", page: 1, pageSize: 100 });
  check(managerTasks.items.some((item) => item.id === task.id), "Manager report reflects approved task");
  const kpi = await httpRepository.getKpiReport({ type: "OFFICIAL" });
  check(Number(kpi.summary?.doneCount ?? 0) >= 3, "KPI reflects the completed task");
  const departmentDashboard = await httpRepository.getDashboardStats("DEPT");
  check(typeof departmentDashboard.totalOfficialCount === "number", "Department dashboard returns official KPI counts");

  await login("u02");
  const staffDashboard = await httpRepository.getDashboardStats("STAFF");
  check(typeof staffDashboard.totalAssigned === "number", "Staff dashboard returns personal KPI counts");
  const notifications = await httpRepository.getNotifications(staffA.user.id);
  check(notifications.some((item) => item.entityId === task.id), "Staff notification links to the completed task");
  const unreadBefore = await httpRepository.getUnreadNotificationCount();
  check(unreadBefore >= 0, "Unread notification count is readable");
  const unreadNotice = notifications.find((item) => item.entityId === task.id && !item.readAt);
  if (unreadNotice) await httpRepository.markNotificationAsRead(unreadNotice.id);
  check(await httpRepository.getUnreadNotificationCount() <= unreadBefore, "Read-one updates unread count");

  const manager = await login("u01");
  await expectApiError(
    () => httpRepository.updateUser(manager.user.id, { role: "STAFF" }, manager.user.id),
    "CONFLICT",
    409,
    "Last active Manager cannot be demoted",
  );
  const originalSettings = await httpRepository.getSettings();
  auditBefore = originalSettings;
  await httpRepository.updateSettings({ workspaceName: `Phase 08 ${Date.now()}` });
  changedSettings = true;
  const auditRows = await httpRepository.getAuditLogs({ page: 1, pageSize: 100 });
  check(auditRows.some((row) => row.kind === "SETTINGS_UPDATED"), "Manager settings mutation appears in system audit");
  await expectApiError(
    () => httpRepository.updateSettings({ defaultDueHour: 99 }),
    "VALIDATION",
    400,
    "Invalid settings DTO",
  );

  process.stdout.write(`PASS Phase 08 FE/API contract and journey (${assertionCount} assertions); concurrentUsers=12, requests=36, p95=${concurrentP95}ms\n`);
}

apiPort = await freePort();
baseUrl = `http://127.0.0.1:${apiPort}/api`;
process.env.VITE_API_BASE_URL = baseUrl;
process.env.VITE_DATA_MODE = "api";
process.env.TZ = "Asia/Ho_Chi_Minh";
try {
  await run();
} catch (error) {
  process.stderr.write(`FAIL Phase 08 FE/API acceptance: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (changedSettings && auditBefore) {
    try {
      await httpRepository.updateSettings({ workspaceName: auditBefore.workspaceName });
    } catch (error) {
      process.stderr.write(`SETTINGS_RESTORE_FAILED ${error instanceof Error ? error.message : "Unknown error"}\n`);
      process.exitCode = 1;
    }
  }
  try { await stopApi(); } catch (error) {
    process.stderr.write(`API_STOP_FAILED ${error instanceof Error ? error.message : "Unknown error"}\n`);
    process.exitCode = 1;
  }
  if (vite) await vite.close();
}
