import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, httpRepository, isMockMode } from "../../shared/repository";
import type { FileObject, FileLink, Task, TaskSubmission, Id } from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  ConfirmDialog,
  Input,
  Select,
  UserAvatar,
  DataTable,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  setSessionFile,
  getSessionFileUrl,
  validateSelectedFile,
  formatFileSize,
  getFileCategoryIcon,
} from "./file-session-store";
import { downloadFile } from "./file-download";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  Upload,
  Trash2,
  Eye,
  ExternalLink,
  ShieldAlert,
  Search,
  Cloud,
  CheckCircle2,
} from "lucide-react";

export function FilesPage() {
  const { currentUser, isLeader, users } = useSession();
  const { showToast } = useToast();

  const [files, setFiles] = useState<FileObject[]>([]);
  const [links, setLinks] = useState<FileLink[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<"ALL" | "TASK" | "SUBMISSION">("ALL");

  // Upload Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mockFileName, setMockFileName] = useState("");
  const [mockFileSizeMb, setMockFileSizeMb] = useState("1.5");
  const [linkTaskId, setLinkTaskId] = useState<Id>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview Modal
  const [previewFile, setPreviewFile] = useState<FileObject | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<Id | null>(null);

  // Delete/Unlink Modal
  const [deletingFile, setDeletingFile] = useState<FileObject | null>(null);

  const loadAllFiles = async () => {
    setIsLoading(true);
    try {
      const [allFiles, allLinks, allTasks, allSubs] = await Promise.all([
        workspaceRepository.getFiles(),
        workspaceRepository.getFileLinks(),
        workspaceRepository.getTasks(),
        workspaceRepository.getSubmissions(),
      ]);
      setFiles(allFiles);
      setLinks(allLinks);
      setTasks(allTasks);
      setSubmissions(allSubs);
    } catch {
      showToast("Không thể tải danh sách tệp đính kèm", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllFiles();
    const unsub = workspaceRepository.subscribe(loadAllFiles);
    return unsub;
  }, []);

  const handleDownloadFile = async (file: FileObject) => {
    try {
      setDownloadingFileId(file.id);
      await downloadFile(file);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải tệp", "error");
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleSelectRealFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const validation = validateSelectedFile(f);
    if (!validation.valid) {
      showToast(validation.error || "Tệp không hợp lệ", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(f);
    setMockFileName(f.name);
    setMockFileSizeMb((f.size / (1024 * 1024)).toFixed(2));
  };

  const handleExecuteUpload = async () => {
    if (!currentUser) return;
    if (!isMockMode && (!selectedFile || !linkTaskId)) {
      showToast("API yêu cầu chọn tệp thật và công việc cần đính kèm.", "error");
      return;
    }
    const fileName = selectedFile ? selectedFile.name : mockFileName.trim();
    if (!fileName) {
      showToast("Vui lòng chọn hoặc nhập tên tệp đính kèm", "error");
      return;
    }

    try {
      setIsUploading(true);
      let sizeBytes = selectedFile ? selectedFile.size : Math.round(parseFloat(mockFileSizeMb || "1.0") * 1024 * 1024);
      let mimeType = selectedFile ? selectedFile.type : "application/octet-stream";

      if (!selectedFile) {
        const ext = fileName.split(".").pop()?.toLowerCase();
        if (ext === "pdf") mimeType = "application/pdf";
        else if (ext === "docx" || ext === "doc") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === "xlsx" || ext === "xls") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      }

      const uploaded = isMockMode
        ? await workspaceRepository.uploadMockFile({ originalName: fileName, mimeType, sizeBytes }, currentUser.id)
        : await httpRepository.uploadFile(selectedFile!, "TASK", linkTaskId);

      // If user provided a real File object in browser, cache Object URL for session preview
      if (selectedFile && isMockMode) {
        setSessionFile(uploaded.id, selectedFile);
      }

      // Link to selected task if any
      if (linkTaskId && isMockMode) {
        await workspaceRepository.createFileLink(uploaded.id, "TASK", linkTaskId);
      }

      showToast(`Đã lưu metadata tệp [${uploaded.originalName}] thành công`, "success");
      setIsUploadOpen(false);
      setSelectedFile(null);
      setMockFileName("");
      setLinkTaskId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tải lên thất bại";
      showToast(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!currentUser || !deletingFile) return;
    try {
      await workspaceRepository.deleteFile(deletingFile.id, currentUser.id);
      showToast(`Đã xóa tệp [${deletingFile.originalName}]`, "success");
      setDeletingFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể xóa tệp";
      showToast(msg, "error");
    }
  };

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = f.originalName.toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
        if (!matchesName) return false;
      }

      // Filter by linked entity
      if (entityFilter !== "ALL") {
        const fileLinks = links.filter((l) => l.fileId === f.id);
        const hasEntityType = fileLinks.some((l) => l.entityType === entityFilter);
        if (!hasEntityType) return false;
      }

      return true;
    });
  }, [files, links, searchQuery, entityFilter]);

  const renderFileIcon = (fileName: string) => {
    const cat = getFileCategoryIcon(fileName);
    switch (cat) {
      case "pdf":
        return <FileText className="w-5 h-5 text-red-600 shrink-0" />;
      case "word":
        return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
      case "excel":
        return <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />;
      case "powerpoint":
        return <FileText className="w-5 h-5 text-orange-600 shrink-0" />;
      case "image":
        return <FileImage className="w-5 h-5 text-purple-600 shrink-0" />;
      default:
        return <FileCode className="w-5 h-5 text-slate-500 shrink-0" />;
    }
  };

  const columns = [
    {
      key: "id",
      header: "Mã tệp",
      width: "90px",
      render: (f: FileObject) => (
        <span className="font-mono text-xs font-bold text-text-muted bg-slate-100 px-2 py-0.5 rounded">
          {f.id}
        </span>
      ),
    },
    {
      key: "originalName",
      header: "Tên tệp tin & Định dạng",
      render: (f: FileObject) => (
        <div className="flex items-center gap-2.5">
          {renderFileIcon(f.originalName)}
          <div className="space-y-0.5 min-w-0">
            <div className="font-semibold text-xs text-text-primary hover:text-brand-700 truncate max-w-xs">
              {f.originalName}
            </div>
            <div className="text-[11px] text-text-muted">
              {f.mimeType || "application/octet-stream"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "sizeBytes",
      header: "Dung lượng",
      width: "110px",
      render: (f: FileObject) => (
        <span className="text-xs font-medium text-text-secondary">
          {formatFileSize(f.sizeBytes)}
        </span>
      ),
    },
    {
      key: "uploadedBy",
      header: "Người tải lên",
      width: "170px",
      render: (f: FileObject) => {
        const uploader = users.find((u) => u.id === f.uploadedById);
        return (
          <div className="flex items-center gap-2 text-xs">
            <UserAvatar name={uploader?.displayName || "N/A"} size="sm" />
            <span className="text-text-primary truncate">{uploader?.displayName || f.uploadedById}</span>
          </div>
        );
      },
    },
    {
      key: "linkedEntity",
      header: "Đối tượng liên kết",
      render: (f: FileObject) => {
        const fLinks = links.filter((l) => l.fileId === f.id);
        if (fLinks.length === 0) {
          return <span className="text-xs text-text-muted italic">Chưa liên kết</span>;
        }

        return (
          <div className="space-y-1 text-xs">
            {fLinks.map((l) => {
              if (l.entityType === "SUBMISSION") {
                const sub = submissions.find((s) => s.id === l.entityId);
                const linkedTask = sub ? tasks.find((t) => t.id === sub.taskId) : null;
                return (
                  <div key={l.id} className="flex items-center gap-1.5 text-purple-700">
                    <span className="font-semibold">Nộp kết quả ({l.entityId}):</span>
                    {linkedTask ? (
                      <Link
                        to={`/tasks/${linkedTask.id}`}
                        className="hover:underline flex items-center gap-0.5 font-medium"
                      >
                        {linkedTask.code}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span>{l.entityId}</span>
                    )}
                  </div>
                );
              }

              if (l.entityType === "TASK") {
                const linkedTask = tasks.find((t) => t.id === l.entityId);
                return (
                  <div key={l.id} className="flex items-center gap-1.5 text-brand-700">
                    <span className="font-semibold">Nhiệm vụ:</span>
                    {linkedTask ? (
                      <Link
                        to={`/tasks/${linkedTask.id}`}
                        className="hover:underline flex items-center gap-0.5 font-medium"
                      >
                        {linkedTask.code}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span>{l.entityId}</span>
                    )}
                  </div>
                );
              }

              return (
                <div key={l.id} className="text-text-muted">
                  {l.entityType}: {l.entityId}
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "Thời gian tải",
      width: "130px",
      render: (f: FileObject) => (
        <span className="text-xs text-text-secondary" title={formatDateTimeVN(f.createdAt)}>
          {formatRelativeVN(f.createdAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "110px",
      render: (f: FileObject) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          {f.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Thao tác",
      width: "110px",
      render: (f: FileObject) => {
        const canDelete = currentUser?.id === f.uploadedById || isLeader;
        return (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPreviewFile(f)}
              title="Xem thông tin chi tiết / Xem thử"
              className="p-1.5 text-text-muted hover:text-brand-700 rounded hover:bg-slate-100 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {canDelete && (
              <button
                onClick={() => setDeletingFile(f)}
                title="Gỡ / Xóa tệp"
                className="p-1.5 text-text-muted hover:text-danger-600 rounded hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Tài liệu & Tệp đính kèm" }]} />

        <PageHeader
          title="Kho tài liệu & Tệp đính kèm (Files)"
          subtitle="Quản lý metadata tài liệu báo cáo, phụ lục số liệu và tệp đính kèm giao nộp theo từng công việc phòng ban."
          badge={
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5" /> Tệp mẫu; chức năng lưu tệp sẽ kết nối R2 ở backend
            </span>
          }
          actions={
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsUploadOpen(true)}
            >
              <Upload className="w-3.5 h-3.5" /> Tải lên tệp mới
            </Button>
          }
        />

        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-card border border-border shadow-xs">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
            <Input
              placeholder="Tìm theo tên tệp hoặc mã tệp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary font-medium">Lọc theo nguồn:</span>
            <Select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as "ALL" | "TASK" | "SUBMISSION")}
              className="h-9 text-xs w-48"
            >
              <option value="ALL">Tất cả nguồn liên kết</option>
              <option value="TASK">Đính kèm Nhiệm vụ (TASK)</option>
              <option value="SUBMISSION">Báo cáo nộp (SUBMISSION)</option>
            </Select>
          </div>
        </div>

        {filteredFiles.length === 0 && !isLoading ? (
          <EmptyState
            title="Không tìm thấy tệp đính kèm"
            description="Chưa có tệp tin nào phù hợp với bộ lọc tìm kiếm hiện tại."
            icon={<FileText className="w-8 h-8 text-slate-400" />}
            action={
              <Button variant="primary" size="sm" onClick={() => setIsUploadOpen(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Tải lên tệp mẫu đầu tiên
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop View (>= 768px) */}
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                data={filteredFiles}
                keyExtractor={(f) => f.id}
                isLoading={isLoading}
              />
            </div>

            {/* Mobile View (< 768px) */}
            <div className="block md:hidden space-y-3">
              {filteredFiles.map((f) => {
                const uploader = users.find((u) => u.id === f.uploadedById);
                const fLinks = links.filter((l) => l.fileId === f.id);
                const canDelete = isLeader || f.uploadedById === currentUser?.id;

                return (
                  <div
                    key={f.id}
                    className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-2.5"
                  >
                    {/* Top: Icon, Filename, Size */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderFileIcon(f.originalName)}
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-text-primary truncate">
                            {f.originalName}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {f.mimeType || "application/octet-stream"}
                          </div>
                        </div>
                      </div>

                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-text-secondary shrink-0">
                        {formatFileSize(f.sizeBytes)}
                      </span>
                    </div>

                    {/* Metadata: Uploader & Links */}
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted text-[11px]">Người tải lên:</span>
                        <div className="flex items-center gap-1.5 font-medium text-text-primary">
                          <UserAvatar name={uploader?.displayName || "N/A"} size="sm" />
                          <span>{uploader?.displayName || f.uploadedById}</span>
                        </div>
                      </div>

                      {fLinks.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/70">
                          <span className="text-text-muted text-[11px] block mb-1">Liên kết với:</span>
                          <div className="space-y-1">
                            {fLinks.map((l) => {
                              if (l.entityType === "SUBMISSION") {
                                const sub = submissions.find((s) => s.id === l.entityId);
                                const linkedTask = sub ? tasks.find((t) => t.id === sub.taskId) : null;
                                return (
                                  <div key={l.id} className="flex items-center gap-1.5 text-purple-700 text-[11px]">
                                    <span className="font-semibold">Nộp kết quả:</span>
                                    {linkedTask ? (
                                      <Link
                                        to={`/tasks/${linkedTask.id}`}
                                        className="hover:underline flex items-center gap-0.5 font-medium"
                                      >
                                        {linkedTask.code}
                                        <ExternalLink className="w-3 h-3" />
                                      </Link>
                                    ) : (
                                      <span>{l.entityId}</span>
                                    )}
                                  </div>
                                );
                              }

                              if (l.entityType === "TASK") {
                                const linkedTask = tasks.find((t) => t.id === l.entityId);
                                return (
                                  <div key={l.id} className="flex items-center gap-1.5 text-brand-700 text-[11px]">
                                    <span className="font-semibold">Nhiệm vụ:</span>
                                    {linkedTask ? (
                                      <Link
                                        to={`/tasks/${linkedTask.id}`}
                                        className="hover:underline flex items-center gap-0.5 font-medium"
                                      >
                                        {linkedTask.code}
                                        <ExternalLink className="w-3 h-3" />
                                      </Link>
                                    ) : (
                                      <span>{l.entityId}</span>
                                    )}
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/70">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewFile(f)}
                          className="h-7 px-2.5 text-xs gap-1 text-brand-700 hover:bg-brand-50"
                        >
                          <Eye className="w-3.5 h-3.5" /> Xem trước
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={downloadingFileId === f.id}
                          onClick={() => void handleDownloadFile(f)}
                          className="h-7 px-2 text-xs gap-1 text-text-muted hover:text-text-primary"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {downloadingFileId === f.id ? "Đang tải…" : "Tải về"}
                        </Button>
                      </div>

                      {canDelete && (
                        <button
                          onClick={() => setDeletingFile(f)}
                          className="p-1.5 text-text-muted hover:text-danger-600 rounded hover:bg-red-50 transition-colors"
                          title="Xóa tệp tin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Modal Tải lên tệp mới */}
        <ConfirmDialog
          isOpen={isUploadOpen}
          onClose={() => {
            setIsUploadOpen(false);
            setSelectedFile(null);
          }}
          onConfirm={handleExecuteUpload}
          isLoading={isUploading}
          title="Tải lên tệp đính kèm mô phỏng"
          confirmText="Lưu tệp đính kèm"
          cancelText="Hủy"
        >
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 leading-relaxed space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-blue-700" />
                Mô phỏng lưu trữ Metadata
              </div>
              <p className="text-[11px] text-blue-800">
                Giới hạn tối đa <strong>20 MB</strong>. Định dạng hỗ trợ: PDF, Word (DOC/DOCX), Excel (XLS/XLSX), PowerPoint (PPT/PPTX), Hình ảnh (JPG/PNG).
              </p>
            </div>

            {/* Real File Input */}
            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">Chọn tệp từ máy tính (Tùy chọn)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                onChange={handleSelectRealFile}
                className="w-full text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer border border-border rounded p-1"
              />
              {selectedFile && (
                <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đã nhận tệp: {selectedFile.name} ({formatFileSize(selectedFile.size)}) — Có thể xem thử trong phiên hiện tại.
                </div>
              )}
            </div>

            {/* Mock File Name */}
            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">
                Tên tệp tin <span className="text-danger-600">*</span>
              </label>
              <Input
                placeholder="VD: Bao-cao-so-lieu.pdf hoặc Ke-hoach-thang.docx"
                value={mockFileName}
                onChange={(e) => setMockFileName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Dung lượng mô phỏng (MB)</label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="20"
                  value={mockFileSizeMb}
                  onChange={(e) => setMockFileSizeMb(e.target.value)}
                  disabled={!!selectedFile}
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Liên kết tới Nhiệm vụ (Tùy chọn)</label>
                <Select
                  value={linkTaskId}
                  onChange={(e) => setLinkTaskId(e.target.value)}
                >
                  <option value="">-- Không liên kết trực tiếp --</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.title.slice(0, 30)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </ConfirmDialog>

        {/* Modal Xem thông tin chi tiết / Xem thử tệp */}
        {previewFile && (
          <ConfirmDialog
            isOpen={!!previewFile}
            onClose={() => setPreviewFile(null)}
            onConfirm={() => setPreviewFile(null)}
            title={`Thông tin tệp: ${previewFile.originalName}`}
            confirmText="Đóng"
            cancelText=""
          >
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 bg-slate-50 border border-border rounded space-y-2">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Mã tệp:</span>
                  <span className="font-mono font-bold text-text-primary">{previewFile.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Tên tệp gốc:</span>
                  <span className="font-medium text-text-primary">{previewFile.originalName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Loại MIME:</span>
                  <span className="text-text-secondary">{previewFile.mimeType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Dung lượng:</span>
                  <span className="font-semibold text-text-primary">{formatFileSize(previewFile.sizeBytes)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-text-muted">Trạng thái lưu trữ:</span>
                  <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{previewFile.status}</span>
                </div>
                {isMockMode && <div className="flex justify-between py-1">
                  <span className="text-text-muted">Cloud Object Key:</span>
                  <span className="text-text-muted italic">null (Môi trường phát triển cục bộ)</span>
                </div>}
              </div>

              {/* In-Session Object URL Preview if available */}
              {!isMockMode ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">Tệp được tải qua liên kết có chữ ký từ kho lưu trữ riêng.</p>
                  <Button
                    variant="primary"
                    disabled={downloadingFileId === previewFile.id}
                    onClick={() => void handleDownloadFile(previewFile)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> {downloadingFileId === previewFile.id ? "Đang tải…" : "Tải tệp"}
                  </Button>
                </div>
              ) : getSessionFileUrl(previewFile.id) ? (
                <div className="space-y-2">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 leading-relaxed">
                    <strong>Đang có bản xem thử trong phiên:</strong> Tệp được chọn từ máy trong phiên làm việc này. Bạn có thể mở xem trực tiếp bên dưới.
                  </div>
                  <div className="flex justify-center">
                    <a
                      href={getSessionFileUrl(previewFile.id)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded text-xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Mở xem thử tệp trong tab mới
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 leading-relaxed space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    Tệp mẫu dữ liệu mock
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Tệp này được khởi tạo từ seed metadata mẫu hoặc qua các phiên trước. Để xem thử trực tiếp nội dung nhị phân (bytes), hãy chọn tệp từ máy tính trong phiên hiện tại. Khi kết nối backend, hệ thống sẽ tải thông qua presigned URL Cloudflare R2.
                  </p>
                </div>
              )}
            </div>
          </ConfirmDialog>
        )}

        {/* Modal Xóa tệp */}
        {deletingFile && (
          <ConfirmDialog
            isOpen={!!deletingFile}
            onClose={() => setDeletingFile(null)}
            onConfirm={handleDeleteFile}
            variant="danger"
            title="Xác nhận gỡ tệp đính kèm"
            description={`Bạn có chắc muốn xóa tệp [${deletingFile.originalName}] khỏi hệ thống? Các liên kết đính kèm vào nhiệm vụ liên quan cũng sẽ được gỡ bỏ.`}
            confirmText="Xóa tệp"
            cancelText="Giữ lại"
          />
        )}
      </div>
    </AppShell>
  );
}
