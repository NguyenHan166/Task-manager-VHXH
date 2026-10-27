"""Materialize the fixed-clock Phase 00 KPI/ACL fixture."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


CLOCK = datetime(2026, 10, 27, 9, 0, 0, tzinfo=timezone.utc)


def at(hours: int) -> str:
    return (CLOCK + timedelta(hours=hours)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def task(alias, code, kind, status, creator, assignee, due_hours, *, completed_hours=None, project=None, priority="NORMAL", progress=0, blocked=False):
    return {
        "alias": alias,
        "code": code,
        "type": kind,
        "status": status,
        "createdBy": creator,
        "primaryAssignee": assignee,
        "project": project,
        "priority": priority,
        "progressPercent": progress,
        "isBlocked": blocked,
        "createdAt": at(-144),
        "assignedAt": None if status == "DRAFT" else at(-120),
        "dueAt": None if due_hours is None else at(due_hours),
        "completedAt": None if completed_hours is None else at(completed_hours),
        "completionDueAtSnapshot": None if completed_hours is None or due_hours is None else at(due_hours),
    }


tasks = [
    task("t01", "CV-2026-0001", "OFFICIAL", "IN_PROGRESS", "u01", "u02", 24, project="p01", priority="HIGH", progress=60),
    task("t02", "CV-2026-0002", "OFFICIAL", "IN_REVIEW", "u01", "u03", 48, project="p02", priority="HIGH", progress=100),
    task("t03", "CV-2026-0003", "OFFICIAL", "TODO", "u01", "u04", 120, project="p01"),
    task("t04", "CV-2026-0004", "OFFICIAL", "IN_PROGRESS", "u01", "u05", -24, priority="URGENT", progress=75, blocked=True),
    task("t05", "CV-2026-0005", "OFFICIAL", "DONE", "u01", "u02", -72, completed_hours=-96, project="p01", progress=100),
    task("t06", "CV-2026-0006", "OFFICIAL", "DONE", "u01", "u03", -72, completed_hours=-48, progress=100),
    task("t07", "CV-2026-0007", "OFFICIAL", "DRAFT", "u01", "u04", 168),
    task("t08", "CV-2026-0008", "OFFICIAL", "CANCELLED", "u01", "u05", -48, progress=20),
    task("t09", "CV-2026-0009", "OFFICIAL", "TODO", "u01", "u02", 8, priority="URGENT"),
    task("t10", "NH-2026-0001", "TEAM", "IN_PROGRESS", "u02", "u02", 72, project="p02", progress=40),
    task("t11", "NH-2026-0002", "TEAM", "TODO", "u03", "u03", 144),
    task("t12", "CN-2026-0001", "PERSONAL", "TODO", "u02", "u02", 30),
    task("t13", "CN-2026-0002", "PERSONAL", "DONE", "u03", "u03", -24, completed_hours=-30, progress=100),
    task("t14", "CV-2026-0010", "OFFICIAL", "IN_REVIEW", "u01", "u02", 48, priority="HIGH", progress=100),
    task("t15", "CV-2026-0011", "OFFICIAL", "TODO", "u01", "u03", 48, priority="HIGH"),
    task("t16", "CV-2026-0012", "OFFICIAL", "TODO", "u01", "u04", 48, priority="HIGH"),
    task("t17", "CV-2026-0013", "OFFICIAL", "TODO", "u01", "u05", 48, priority="HIGH"),
]

fixture = {
    "version": 1,
    "clock": at(0),
    "timezone": "Asia/Ho_Chi_Minh",
    "idPolicy": "Aliases are stable fixture keys. Server seed resolves aliases to DB-generated UUIDs and upserts by email/code/periodKey; API never exposes aliases.",
    "users": [
        {"alias": "u01", "role": "MANAGER", "status": "ACTIVE", "email": "an.nv@example.invalid"},
        {"alias": "u06", "role": "DEPUTY_MANAGER", "status": "ACTIVE", "email": "vu.lt@example.invalid"},
        {"alias": "u02", "role": "STAFF", "status": "ACTIVE", "email": "binh.tt@example.invalid"},
        {"alias": "u03", "role": "STAFF", "status": "ACTIVE", "email": "chau.lm@example.invalid"},
        {"alias": "u04", "role": "STAFF", "status": "ACTIVE", "email": "dung.pq@example.invalid"},
        {"alias": "u05", "role": "STAFF", "status": "ACTIVE", "email": "ha.vt@example.invalid"},
    ],
    "projects": [{"alias": "p01", "owner": "u01"}, {"alias": "p02", "owner": "u01"}],
    "tasks": tasks,
    "participants": [
        {"task": "t01", "user": "u03", "role": "COLLABORATOR", "invitationStatus": "ACCEPTED"},
        {"task": "t02", "user": "u02", "role": "COLLABORATOR", "invitationStatus": "ACCEPTED"},
        {"task": "t04", "user": "u04", "role": "WATCHER", "invitationStatus": "ACCEPTED"},
        {"task": "t10", "user": "u03", "role": "COLLABORATOR", "invitationStatus": "ACCEPTED"},
        {"task": "t10", "user": "u05", "role": "COLLABORATOR", "invitationStatus": "PENDING"},
        {"task": "t11", "user": "u04", "role": "COLLABORATOR", "invitationStatus": "DECLINED"},
    ],
    "submissions": [
        {"alias": "s01", "task": "t02", "by": "u03", "at": at(-4), "status": "PENDING"},
        {"alias": "s02", "task": "t05", "by": "u02", "at": at(-112), "status": "RETURNED"},
        {"alias": "s03", "task": "t05", "by": "u02", "at": at(-100), "status": "APPROVED"},
        {"alias": "s04", "task": "t06", "by": "u03", "at": at(-50), "status": "APPROVED"},
        {"alias": "s05", "task": "t14", "by": "u02", "at": at(-2), "status": "PENDING"},
    ],
    "approvals": [
        {"alias": "a01", "task": "t05", "submission": "s02", "by": "u01", "decision": "RETURNED", "at": at(-110)},
        {"alias": "a02", "task": "t05", "submission": "s03", "by": "u01", "decision": "APPROVED", "at": at(-96), "dueAtSnapshot": at(-72)},
        {"alias": "a03", "task": "t06", "submission": "s04", "by": "u01", "decision": "APPROVED", "at": at(-48), "dueAtSnapshot": at(-72)},
    ],
    "files": [{"alias": "f01", "owner": "u02", "status": "READY", "linkedTo": {"type": "SUBMISSION", "alias": "s03"}}, {"alias": "f02", "owner": "u03", "status": "READY", "linkedTo": {"type": "SUBMISSION", "alias": "s01"}}],
    "recurrence": {"phase": "P1", "rules": [{"alias": "rr01", "frequency": "MONTHLY", "scope": "CUSTOM", "assignees": ["u02", "u03"], "dueAfterHours": 120}, {"alias": "rr02", "frequency": "WEEKLY", "scope": "ALL", "assignees": ["u02", "u03", "u04", "u05"], "dueAfterHours": 48}], "instance": {"alias": "ri01", "rule": "rr02", "periodKey": "2026-W44", "tasks": ["t14", "t15", "t16", "t17"]}},
    "expected": {
        "initial_t01_t09": {"totalOfficialCount": 9, "totalActivePublished": 7, "todoCount": 2, "inProgressCount": 2, "inReviewCount": 1, "doneCount": 2, "overdueCount": 1, "completedOnTimeCount": 1, "draftCount": 1, "cancelledCount": 1},
        "extended_t01_t17": {"totalOfficialCount": 13, "totalActivePublished": 11, "todoCount": 5, "inProgressCount": 2, "inReviewCount": 2, "doneCount": 2, "overdueCount": 1, "completedOnTimeCount": 1, "draftCount": 1, "cancelledCount": 1},
        "workload_extended": {"u02": {"primaryCount": 4, "doneCount": 1, "doneOnTimeCount": 1, "collabCount": 1}, "u03": {"primaryCount": 3, "doneCount": 1, "doneOnTimeCount": 0, "collabCount": 2}, "u04": {"primaryCount": 2, "watchingCount": 1}, "u05": {"primaryCount": 2, "overdueCount": 1}},
        "acl": ["u02 sees t12; u03/u01/u06 do not", "u05 sees only limited invitation projection for t10 before ACCEPTED", "u04 cannot see t11 after DECLINED", "u04 cannot see t07 before publish", "u01/u06 see all published OFFICIAL but not t12/t13 by default"],
    },
}

out = Path(__file__).with_name("kpi-fixture.v1.json")
out.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {out} with {len(tasks)} tasks at {at(0)}")
