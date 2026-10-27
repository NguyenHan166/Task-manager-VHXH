"""Check the Phase 00 contract and fixed fixture without external packages."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path


root = Path(__file__).parent
repo = root.parents[2]
spec = json.loads((root / "openapi.v1.json").read_text(encoding="utf-8"))
fixture = json.loads((root / "kpi-fixture.v1.json").read_text(encoding="utf-8"))

assert spec["openapi"] == "3.0.3"
assert spec["info"]["version"] == "1.0.0"
assert spec["servers"][0]["url"] == "/api"
schemas = spec["components"]["schemas"]
operations = []
for path, methods in spec["paths"].items():
    for method, operation in methods.items():
        assert method in {"get", "post", "patch", "delete"}, (path, method)
        assert operation["x-release-phase"] in {"P0", "P1"}
        assert "200" in operation["responses"] or "201" in operation["responses"]
        ids = set(re.findall(r"\{([^}]+)\}", path))
        declared = {p["name"] for p in operation.get("parameters", []) if p["in"] == "path"}
        assert ids == declared, (path, method, ids, declared)
        if "requestBody" in operation:
            request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
            name = request_schema["$ref"].split("/")[-1]
            assert schemas[name]["additionalProperties"] is False, (path, method)
        success = operation["responses"].get("200", operation["responses"].get("201"))
        if path != "/reports/tasks/export":
            assert "data" in success["content"]["application/json"]["schema"]["properties"], (path, method)
        operations.append(operation["operationId"])

assert len(operations) == len(set(operations)), "Duplicate operationId"

def refs(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref":
                yield value
            else:
                yield from refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from refs(item)


for target in refs(spec):
    assert target.startswith("#/components/schemas/"), target
    assert target.split("/")[-1] in schemas, target

expected_paths = {
    "/auth/login", "/auth/refresh", "/auth/logout", "/auth/logout-all", "/auth/me",
    "/users", "/users/{id}", "/tasks", "/tasks/{id}",
    "/tasks/{id}/submissions", "/tasks/{id}/approve", "/tasks/{id}/return",
    "/tasks/{id}/adjust", "/tasks/{id}/deadline-requests/{requestId}/decision",
    "/tasks/{id}/assignee-requests/{requestId}/decision", "/dashboard/stats",
    "/reports/kpi", "/reports/tasks/export", "/backup", "/files/upload-url",
    "/files/complete", "/notifications", "/settings", "/audit-logs",
}
assert expected_paths <= set(spec["paths"]), expected_paths - set(spec["paths"])
assert spec["paths"]["/tasks/{id}/deadline-requests/{requestId}/decision"]["post"]["x-release-phase"] == "P1"
assert spec["paths"]["/tasks/{id}/assignee-requests/{requestId}/decision"]["post"]["x-release-phase"] == "P1"
assert "CREATED_AT" in spec["paths"]["/tasks"]["get"]["parameters"][-2]["schema"]["enum"]
assert any(p["name"] == "isOverdue" for p in spec["paths"]["/tasks"]["get"]["parameters"])

clock = datetime.fromisoformat(fixture["clock"].replace("Z", "+00:00"))


def metrics(tasks):
    official = [t for t in tasks if t["type"] == "OFFICIAL"]
    active = [t for t in official if t["status"] not in {"DRAFT", "CANCELLED"}]
    result = {
        "totalOfficialCount": len(official),
        "totalActivePublished": len(active),
        "todoCount": sum(t["status"] == "TODO" for t in active),
        "inProgressCount": sum(t["status"] == "IN_PROGRESS" for t in active),
        "inReviewCount": sum(t["status"] == "IN_REVIEW" for t in active),
        "doneCount": sum(t["status"] == "DONE" for t in active),
        "overdueCount": sum(t["status"] in {"TODO", "IN_PROGRESS", "IN_REVIEW"} and t["dueAt"] is not None and datetime.fromisoformat(t["dueAt"].replace("Z", "+00:00")) < clock for t in active),
        "completedOnTimeCount": sum(t["status"] == "DONE" and t["completedAt"] is not None and t["completionDueAtSnapshot"] is not None and t["completedAt"] <= t["completionDueAtSnapshot"] for t in active),
        "draftCount": sum(t["status"] == "DRAFT" for t in official),
        "cancelledCount": sum(t["status"] == "CANCELLED" for t in official),
    }
    return result


tasks = fixture["tasks"]
assert len(tasks) == 17 and len({t["alias"] for t in tasks}) == 17
assert metrics(tasks[:9]) == fixture["expected"]["initial_t01_t09"]
assert metrics(tasks) == fixture["expected"]["extended_t01_t17"]
assert fixture["recurrence"]["instance"]["tasks"] == ["t14", "t15", "t16", "t17"]
assert fixture["clock"] == "2026-10-27T09:00:00.000Z"

for name in ("SCOPE.md", "PERMISSIONS.md", "API_CONTRACT.md", "DATA_MODEL.md", "OPERATIONS.md", "backend.env.example"):
    assert (root / name).is_file(), name
for doc in list(root.glob("*.md")) + [root.parent / "PHASE_00_CONTRACT.md", root.parent / "TASK_TRACKER.md"]:
    for target in re.findall(r"\]\(([^)]+)\)", doc.read_text(encoding="utf-8")):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        path = (doc.parent / target.split("#", 1)[0]).resolve()
        assert path.exists(), (doc.name, target)
tracker = (root.parent / "TASK_TRACKER.md").read_text(encoding="utf-8")
for number in range(1, 6):
    assert f"- [x] BE-00-{number:02d}" in tracker
env = (root / "backend.env.example").read_text(encoding="utf-8")
for key in ("DATABASE_URL", "ACCESS_TOKEN_SIGNING_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_KEY"):
    assert re.search(rf"^{key}=$", env, re.MULTILINE), key

frontend_contract = (repo / "Frontend/src/shared/data-contract.ts").read_text(encoding="utf-8")
shell = (repo / "Frontend/src/components/layout/AppShell.tsx").read_text(encoding="utf-8")
assert "isOverdue?: boolean" in frontend_contract
assert '"CREATED_AT"' in frontend_contract
assert "Dữ liệu mẫu · Tính năng P1" in shell
assert "Các thao tác việc nhóm/cá nhân" in shell

print(f"PASS: {len(operations)} unique OpenAPI operations, {len(schemas)} schemas, refs/path params/envelopes")
print("PASS: fixed-clock KPI 7/11 and P1 ACL fixture structure")
print("PASS: Phase 00 artifacts, FE query alignment, P1 UI labels and empty secret keys")
