import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import {
  Breadcrumb,
  Button,
  EmptyState,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from "../../components/ui";
import { useSession } from "../auth/SessionContext";
import { taskService } from "./task-service";
import type { Page, Task } from "../../shared/data-contract";
import { formatDateTimeVN } from "../../shared/datetime";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Search,
} from "lucide-react";

const PAGE_SIZE = 12;

export function ArchivedTasksPage() {
  const { currentUser, users } = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<Page<Task>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const next = await taskService.queryTasks(
          {
            archived: true,
            search: search.trim() || undefined,
            page,
            pageSize: PAGE_SIZE,
            sortBy: "UPDATED_AT",
            sortDirection: "DESC",
          },
          currentUser,
        );
        if (live) setResult(next);
      } catch (loadError) {
        if (live) setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách lưu trữ.");
      } finally {
        if (live) setIsLoading(false);
      }
    }, search ? 220 : 0);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [currentUser, page, retryCount, search]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 pb-8">
        <Breadcrumb
          items={[
            { label: "Tất cả công việc", href: "/tasks" },
            { label: "Lưu trữ" },
          ]}
        />

        <PageHeader
          title="Công việc đã lưu trữ"
          subtitle="Tra cứu các công việc chính thức đã được duyệt hoàn thành và chuyển vào lưu trữ."
          badge={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
              <Archive className="h-3.5 w-3.5" /> {result.total} công việc
            </span>
          }
        />

        <section className="flex flex-col gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-brand-100">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Kho lưu trữ của phòng</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">
                Chỉ Trưởng phòng có quyền xem. Công việc được lưu trữ vẫn giữ nguyên kết quả duyệt, lịch sử xử lý và tệp đính kèm; chúng không còn xuất hiện trong danh sách Tất cả công việc.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-60">
            <div className="rounded-xl border border-white bg-white/85 px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-text-muted">
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" /> Đã duyệt
              </div>
              <div className="mt-1 text-lg font-semibold leading-none text-text-primary">
                {result.total}
              </div>
            </div>
            <div className="rounded-xl border border-white bg-white/85 px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-700" /> Đang xem
              </div>
              <div className="mt-1 text-lg font-semibold leading-none text-text-primary">
                {result.items.length}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Danh sách lưu trữ</h2>
              <p className="mt-0.5 text-xs text-text-muted">Sắp xếp theo thời điểm lưu trữ gần nhất</p>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo mã, tên hoặc nội dung công việc"
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-text-primary outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                aria-label="Tìm công việc đã lưu trữ"
              />
            </label>
          </div>

          <div className="min-h-64 p-3 sm:p-5">
            {isLoading ? (
              <div className="space-y-3" aria-label="Đang tải lưu trữ">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-32 animate-pulse rounded-xl border border-border/60 bg-slate-50"
                  />
                ))}
              </div>
            ) : error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800"
              >
                <div className="font-semibold">Không tải được danh sách lưu trữ</div>
                <p className="mt-1">{error}</p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => setRetryCount((value) => value + 1)}
                >
                  Thử tải lại
                </Button>
              </div>
            ) : result.items.length === 0 ? (
              <EmptyState
                icon={<Archive className="h-6 w-6" />}
                title={search.trim() ? "Không tìm thấy công việc phù hợp" : "Chưa có công việc được lưu trữ"}
                description={
                  search.trim()
                    ? "Thử tìm bằng mã công việc hoặc một từ khóa khác."
                    : "Khi Trưởng phòng lưu trữ công việc đã duyệt hoàn thành, công việc sẽ xuất hiện tại đây."
                }
                className="my-7"
              />
            ) : (
              <div className="space-y-3">
                {result.items.map((task) => {
                  const assignee = users.find((user) => user.id === task.primaryAssigneeId);
                  return (
                    <article
                      key={task.id}
                      className="rounded-xl border border-border/70 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold tracking-wide text-brand-800">
                              {task.code}
                            </span>
                            <StatusBadge status={task.status} />
                            <PriorityBadge priority={task.priority} />
                          </div>
                          <h3 className="text-base font-semibold leading-6 text-text-primary">{task.title}</h3>
                          {task.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">
                              {task.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted">
                            <span>
                              Người thực hiện: <strong className="font-medium text-text-secondary">{assignee?.displayName || "Chưa xác định"}</strong>
                            </span>
                            {task.completedAt && (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                Hoàn thành {formatDateTimeVN(task.completedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary sm:min-w-44 sm:justify-end">
                          <Clock3 className="h-4 w-4 text-brand-700" />
                          <span>
                            <span className="block text-[10px] text-text-muted">Ngày lưu trữ</span>
                            <strong className="font-semibold text-text-primary">
                              {formatDateTimeVN(task.archivedAt)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {!isLoading && !error && result.total > 0 && (
            <footer className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>
                Hiển thị <strong>{result.items.length}</strong> trong <strong>{result.total}</strong> công việc
              </span>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span>Trang {page} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Trang trước"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Trang sau"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </AppShell>
  );
}
