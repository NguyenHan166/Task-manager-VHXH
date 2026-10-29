import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { httpRepository, isMockMode, workspaceRepository } from "../../shared/repository";
import { formatDateTimeVN } from "../../shared/datetime";
import { validateSelectedFile, setSessionFile } from "../files/file-session-store";
import {
  Breadcrumb,
  Button,
  Card,
  CardContent,
  Input,
  PageHeader,
  Textarea,
  UserAvatar,
  useToast,
} from "../../components/ui";
import type { Project, Task, TaskPriority } from "../../shared/data-contract";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  FileText,
  Paperclip,
  PlusCircle,
  Trash2,
  Users,
} from "lucide-react";

const FILE_ACCEPT = ".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.gif";
const FILE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const MAX_ATTACHMENTS = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function fileForUpload(file: File): File {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = FILE_MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error(`Định dạng tệp .${extension || "?"} chưa được hỗ trợ.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`Tệp “${file.name}” vượt quá 20 MB.`);
  return file.type === mimeType ? file : new File([file], file.name, { type: mimeType });
}

function fileSizeLabel(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskCreatePage() {
  const { currentUser, isLeader, users } = useSession();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverable, setDeliverable] = useState("Hoàn thành công việc được giao.");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [primaryAssigneeId, setPrimaryAssigneeId] = useState("");
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [dueType, setDueType] = useState<"preset" | "custom">("preset");
  const [dueHours, setDueHours] = useState("48");
  const [customDueAt, setCustomDueAt] = useState(() =>
    new Date(Date.now() + 48 * 3_600_000).toISOString().slice(0, 16),
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipients = useMemo(
    () => users.filter((user) => user.role === "STAFF" && user.status !== "LOCKED"),
    [users],
  );

  useEffect(() => {
    let live = true;
    void workspaceRepository.getProjects().then((items) => {
      if (live) setProjects(items.filter((project) => project.status === "ACTIVE"));
    }).catch((loadError: unknown) => {
      if (live) showToast(loadError instanceof Error ? loadError.message : "Không tải được danh sách dự án.", "error");
    });
    return () => { live = false; };
  }, [showToast]);

  const calculateDueAt = (): string => {
    if (dueType === "custom") return new Date(customDueAt).toISOString();
    return new Date(Date.now() + (Number(dueHours) || 48) * 3_600_000).toISOString();
  };

  const toggleCollaborator = (userId: string) => {
    setCollaboratorIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const selectAttachments = (selected: FileList | null) => {
    if (!selected) return;
    const next = [...attachments];
    for (const file of Array.from(selected)) {
      if (next.some((item) => item.name === file.name && item.size === file.size)) continue;
      const validation = validateSelectedFile(file);
      if (!validation.valid) {
        setError(validation.error ?? `Tệp “${file.name}” không hợp lệ.`);
        continue;
      }
      try {
        fileForUpload(file);
      } catch (validationError) {
        setError(validationError instanceof Error ? validationError.message : "Tệp không hợp lệ.");
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`Mỗi công việc đính kèm tối đa ${MAX_ATTACHMENTS} tệp.`);
        break;
      }
      next.push(file);
    }
    setAttachments(next);
    if (selected.length && next.length === attachments.length + selected.length) setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadAttachments = async (task: Task) => {
    for (const file of attachments) {
      const normalized = fileForUpload(file);
      if (isMockMode) {
        const uploaded = await workspaceRepository.uploadMockFile({
          originalName: normalized.name,
          mimeType: normalized.type,
          sizeBytes: normalized.size,
        }, currentUser!.id);
        setSessionFile(uploaded.id, normalized);
        await workspaceRepository.createFileLink(uploaded.id, "TASK", task.id);
      } else {
        await httpRepository.uploadFile(normalized, "TASK", task.id);
      }
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    const dueAt = calculateDueAt();
    if (!title.trim()) return setError("Nhập tiêu đề công việc.");
    if (!primaryAssigneeId) return setError("Chọn ít nhất một người nhận việc.");
    if (!deliverable.trim()) return setError("Nhập kết quả cần bàn giao.");
    if (!Number.isFinite(new Date(dueAt).getTime()) || new Date(dueAt).getTime() <= Date.now()) {
      return setError("Thời hạn hoàn thành phải ở tương lai.");
    }

    setIsLoading(true);
    setError(null);
    let created: Task | null = null;
    let failedStep = "tạo công việc";
    try {
      const assigneeIds = [primaryAssigneeId, ...collaboratorIds.filter((id) => id !== primaryAssigneeId)];
      if (isMockMode) {
        created = await workspaceRepository.createTask({
          type: "OFFICIAL",
          title: title.trim(),
          description: description.trim(),
          deliverable: deliverable.trim(),
          priority,
          primaryAssigneeId,
          collaboratorIds: assigneeIds.slice(1),
          watcherIds: [],
          dueAt,
          projectId: projectId || null,
          parentTaskId: null,
          isDraft: true,
        }, currentUser.id);
      } else {
        created = await httpRepository.createAssignment({
          title: title.trim(),
          description: description.trim(),
          deliverable: deliverable.trim(),
          priority,
          assigneeIds,
          dueAt,
          projectId: projectId || null,
        });
      }

      failedStep = "tải tệp đính kèm";
      await uploadAttachments(created);
      failedStep = "phát hành công việc";
      await workspaceRepository.publishTask(created.id, currentUser.id);
      showToast(
        `Đã giao công việc ${created.code} cho ${assigneeIds.length} người.`,
        "success",
      );
      navigate(`/tasks/${created.id}`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Không thể lưu công việc.";
      setError(message);
      if (created) {
        if (failedStep !== "phát hành công việc") {
          try {
            await workspaceRepository.cancelTask(created.id, currentUser.id);
            showToast(`Chưa giao được công việc ${created.code}: lỗi ở bước ${failedStep}. Bản tạm đã được xóa; bạn có thể sửa lỗi rồi giao lại.`, "error");
            return;
          } catch {
            // Check the persisted state below before deciding whether cleanup failed.
          }
        }

        const persisted = await workspaceRepository.getTaskById(created.id).catch(() => null);
        if (persisted?.status && persisted.status !== "DRAFT" && persisted.status !== "CANCELLED") {
          showToast(`Đã giao công việc ${persisted.code} cho người nhận.`, "success");
          navigate(`/tasks/${created.id}`);
        } else if (persisted?.status === "DRAFT") {
          try {
            await workspaceRepository.cancelTask(created.id, currentUser.id);
            showToast(`Chưa giao được công việc ${created.code}: lỗi ở bước ${failedStep}. Bản tạm đã được xóa; bạn có thể sửa lỗi rồi giao lại.`, "error");
          } catch {
            const remaining = await workspaceRepository.getTaskById(created.id).catch(() => null);
            if (!remaining) {
              showToast(`Chưa giao được công việc ${created.code}: lỗi ở bước ${failedStep}. Bản tạm đã được xóa; bạn có thể giao lại.`, "error");
            } else {
              setError(`${message} Chưa thể xóa bản tạm của công việc ${created.code}; hãy kiểm tra kết nối rồi thử lại.`);
              showToast(`Chưa giao được công việc ${created.code}; chưa xóa được bản tạm.`, "error");
            }
          }
        } else {
          showToast(`Chưa xác nhận được trạng thái giao công việc ${created.code}: lỗi ở bước ${failedStep}. Kiểm tra danh sách công việc trước khi giao lại.`, "error");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLeader) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-text-primary">Chỉ Trưởng phòng hoặc Phó phòng mới có thể giao việc</h1>
          <p className="mt-2 text-sm text-text-secondary">Bạn vẫn xem và thực hiện được các công việc đã giao cho mình.</p>
          <Link to="/tasks" className="mt-5 inline-flex text-sm font-semibold text-brand-700 hover:underline">Quay lại danh sách công việc</Link>
        </div>
      </AppShell>
    );
  }

  const primaryAssignee = recipients.find((user) => user.id === primaryAssigneeId);
  const collaborators = recipients.filter((user) => collaboratorIds.includes(user.id) && user.id !== primaryAssigneeId);
  const selectedProject = projects.find((project) => project.id === projectId);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumb items={[{ label: "Công việc", href: "/tasks" }, { label: "Giao việc" }]} />
        <PageHeader
          title="Giao việc"
          subtitle="Chọn một hoặc nhiều người cùng thực hiện; tệp đính kèm sẽ sẵn sàng cho họ sau khi phát hành."
          actions={<Link to="/tasks"><Button variant="outline" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Quay lại</Button></Link>}
        />

        <Card>
          <CardContent className="space-y-6 p-5 sm:p-7">
            {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

            <Input label="Tên công việc" placeholder="Ví dụ: Chuẩn bị báo cáo quý" required value={title} onChange={(event) => setTitle(event.target.value)} />
            <Textarea label="Nội dung công việc" placeholder="Mô tả yêu cầu và thông tin cần biết…" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Người nhận việc <span className="text-danger">*</span></h2>
                <p className="mt-1 text-xs text-text-muted">Người phụ trách chính và những người cùng thực hiện đều xem được tệp của công việc.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-text-primary">
                  Người phụ trách chính
                  <select required value={primaryAssigneeId} onChange={(event) => setPrimaryAssigneeId(event.target.value)} className="h-10 w-full rounded-btn border border-border bg-white px-3 text-sm font-normal text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700">
                    <option value="">Chọn người phụ trách</option>
                    {recipients.map((user) => <option key={user.id} value={user.id}>{user.displayName} — {user.jobTitle}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-text-primary">
                  Dự án liên quan <span className="font-normal text-text-muted">(không bắt buộc)</span>
                  <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-btn border border-border bg-white px-3 text-sm font-normal text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700">
                    <option value="">Không thuộc dự án cụ thể</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-2 border border-border bg-slate-50/60 p-3 sm:grid-cols-2">
                {recipients.filter((user) => user.id !== primaryAssigneeId).map((user) => {
                  const checked = collaboratorIds.includes(user.id);
                  return (
                    <label key={user.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${checked ? "border-brand-300 bg-brand-50" : "border-transparent bg-white hover:border-border"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCollaborator(user.id)} className="h-4 w-4 accent-brand-700" />
                      <UserAvatar name={user.displayName} size="sm" />
                      <span className="min-w-0 flex-1 truncate"><span className="block font-medium text-text-primary">{user.displayName}</span><span className="block truncate text-xs text-text-muted">{user.jobTitle}</span></span>
                      {checked && <Check className="h-4 w-4 text-brand-700" />}
                    </label>
                  );
                })}
                {recipients.length === 0 && <div className="p-3 text-sm text-text-muted">Không có cán bộ đang hoạt động trong danh sách.</div>}
              </div>
              {collaborators.length > 0 && <div className="flex items-start gap-2 text-xs text-brand-800"><Users className="mt-0.5 h-4 w-4 shrink-0" /><span>{collaborators.length} người cùng thực hiện: {collaborators.map((user) => user.displayName).join(", ")}</span></div>}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-text-primary">
                Mức độ ưu tiên
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-10 w-full rounded-btn border border-border bg-white px-3 text-sm font-normal text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700">
                  <option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn cấp</option>
                </select>
              </label>
              <div className="space-y-1.5 text-xs font-semibold text-text-primary">
                <div className="flex items-center justify-between gap-2">
                  <span>Thời hạn hoàn thành <span className="text-danger">*</span></span>
                  <div className="flex gap-2 font-normal text-brand-700">
                    <button type="button" onClick={() => setDueType("preset")} className={dueType === "preset" ? "font-semibold" : "text-text-muted"}>Khoảng thời gian</button>
                    <button type="button" onClick={() => setDueType("custom")} className={dueType === "custom" ? "font-semibold" : "text-text-muted"}>Chọn ngày giờ</button>
                  </div>
                </div>
                {dueType === "preset" ? (
                  <select value={dueHours} onChange={(event) => setDueHours(event.target.value)} className="h-10 w-full rounded-btn border border-border bg-white px-3 text-sm font-normal text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700">
                    <option value="8">Trong 8 giờ</option><option value="24">Trong 1 ngày</option><option value="48">Trong 2 ngày</option><option value="72">Trong 3 ngày</option><option value="120">Trong 5 ngày</option><option value="168">Trong 1 tuần</option>
                  </select>
                ) : <Input type="datetime-local" value={customDueAt} onChange={(event) => setCustomDueAt(event.target.value)} required />}
              </div>
            </div>

            <Input label="Kết quả cần bàn giao" required placeholder="Ví dụ: Báo cáo và số liệu đã đối chiếu" value={deliverable} onChange={(event) => setDeliverable(event.target.value)} />

            <section className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Paperclip className="h-4 w-4" /> Tệp đính kèm <span className="font-normal text-text-muted">(tùy chọn)</span></h2>
                  <p className="mt-1 text-xs text-text-muted">PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) hoặc ảnh; tối đa 20 tệp, 20 MB mỗi tệp. PDF và ảnh xem trực tiếp trong ứng dụng.</p>
                </div>
                <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(event) => selectAttachments(event.target.files)} />
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={isLoading || attachments.length >= MAX_ATTACHMENTS} onClick={() => fileInputRef.current?.click()}><PlusCircle className="h-4 w-4" /> Chọn tệp</Button>
              </div>
              {attachments.length > 0 ? (
                <ul className="divide-y divide-border rounded-lg border border-border bg-slate-50/50">
                  {attachments.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 px-3 py-2.5 text-sm"><FileText className="h-4 w-4 shrink-0 text-brand-700" /><span className="min-w-0 flex-1 truncate text-text-primary">{file.name}</span><span className="shrink-0 text-xs text-text-muted">{fileSizeLabel(file.size)}</span><button type="button" aria-label={`Bỏ tệp ${file.name}`} disabled={isLoading} onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></li>)}
                </ul>
              ) : <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-text-muted">Chưa chọn tệp nào.</p>}
            </section>

            <div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
              <Link to="/tasks"><Button variant="outline" type="button">Hủy</Button></Link>
              <Button variant="primary" type="button" disabled={isLoading || !recipients.length} isLoading={isLoading} onClick={() => void handleSave()} className="gap-2"><CalendarClock className="h-4 w-4" /> Giao việc</Button>
            </div>
            {primaryAssignee && <div className="rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-900"><strong>{primaryAssignee.displayName}</strong>{collaborators.length ? ` và ${collaborators.length} người cùng làm` : ""} sẽ nhận công việc{selectedProject ? ` trong dự án ${selectedProject.name}` : ""}{` trước ${formatDateTimeVN(calculateDueAt())}.`}</div>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
