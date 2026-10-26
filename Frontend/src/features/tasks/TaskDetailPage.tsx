import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import { canSeeTask } from "../../shared/data-contract";
import type {
  Task,
  User,
  Project,
  TaskParticipant,
  TaskEvent,
  TaskComment,
  TaskSubmission,
  TaskApproval,
  TaskDeadlineRequest,
  TaskAssigneeRequest,
  FileObject,
  TaskPriority,
} from "../../shared/data-contract";
import { ForbiddenPage } from "../auth/ForbiddenPage";
import { validateSelectedFile, setSessionFile } from "../files/file-session-store";
import {
  Breadcrumb,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatusBadge,
  PriorityBadge,
  TaskTypeBadge,
  OverdueBadge,
  BlockedBadge,
  UserAvatar,
  TimelineItem,
  ConfirmDialog,
  Input,
  Textarea,
  Select,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import { isTaskOverdue, isTaskDueSoon } from "./task-selectors";
import {
  Calendar,
  Clock,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Send,
  Upload,
  FileText,
  AlertOctagon,
  Play,
  TrendingUp,
  FileCheck,
  Ban,
  MessageSquare,
  Activity,
  Paperclip,
  Settings,
  UserCheck,
  FileQuestion,
  GitFork,
  Users,
  AlertTriangle,
  CornerDownRight,
} from "lucide-react";

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, isManager } = useSession();
  const { showToast } = useToast();

  // Data states
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [approvals, setApprovals] = useState<TaskApproval[]>([]);
  const [deadlineRequests, setDeadlineRequests] = useState<TaskDeadlineRequest[]>([]);
  const [assigneeRequests, setAssigneeRequests] = useState<TaskAssigneeRequest[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);

  // Subtasks & Hierarchy state
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [grandParentTask, setGrandParentTask] = useState<Task | null>(null);

  // Subtask modal state
  const [showAddSubtaskModal, setShowAddSubtaskModal] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [subtaskDueTime, setSubtaskDueTime] = useState("17:30");
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>("NORMAL");
  const [subtaskDeliverable, setSubtaskDeliverable] = useState("");

  // Convert TEAM to OFFICIAL modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertAssigneeId, setConvertAssigneeId] = useState("");
  const [convertDueDate, setConvertDueDate] = useState("");
  const [convertDueTime, setConvertDueTime] = useState("17:30");
  const [convertPriority, setConvertPriority] = useState<TaskPriority>("NORMAL");

  // Tab state (5 Tabs: activity, subtasks, comments, submissions, files)
  const [activeTab, setActiveTab] = useState<"activity" | "subtasks" | "comments" | "submissions" | "files">("activity");

  // Comment input state
  const [commentBody, setCommentBody] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Modal Dialogs state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressInput, setProgressInput] = useState(0);
  const [isBlockedInput, setIsBlockedInput] = useState(false);
  const [blockedReasonInput, setBlockedReasonInput] = useState("");

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState("");

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveReason, setApproveReason] = useState("");

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [proposedDueDate, setProposedDueDate] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showPublishModal, setShowPublishModal] = useState(false);

  const [showManagerEditModal, setShowManagerEditModal] = useState(false);
  const [editDueAt, setEditDueAt] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("NORMAL");
  const [managerEditReason, setManagerEditReason] = useState("");

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const [showAssigneeRequestModal, setShowAssigneeRequestModal] = useState(false);
  const [proposedAssigneeId, setProposedAssigneeId] = useState("");
  const [assigneeRequestReason, setAssigneeRequestReason] = useState("");

  const [activeDecideDeadline, setActiveDecideDeadline] = useState<{
    req: TaskDeadlineRequest;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decideDeadlineReason, setDecideDeadlineReason] = useState("");

  const [activeDecideAssignee, setActiveDecideAssignee] = useState<{
    req: TaskAssigneeRequest;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decideAssigneeReason, setDecideAssigneeReason] = useState("");

  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSizeMb, setUploadFileSizeMb] = useState("1.5");

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const loadAllTaskData = async () => {
    if (!id || !currentUser) return;
    setIsLoading(true);
    setIsForbidden(false);
    try {
      const [
        foundTask,
        parts,
        allUsers,
        allEvents,
        taskComments,
        taskSubs,
        taskApps,
        taskDeadlines,
        taskAssignees,
        allFiles,
        allLinks,
      ] = await Promise.all([
        mockRepository.getTaskById(id),
        mockRepository.getParticipants(id),
        mockRepository.getUsers(),
        mockRepository.getEvents(id),
        mockRepository.getComments(id),
        mockRepository.getSubmissions(id),
        mockRepository.getApprovals(id),
        mockRepository.getDeadlineRequests(id),
        mockRepository.getAssigneeRequests(id),
        mockRepository.getFiles(),
        mockRepository.getFileLinks(),
      ]);

      if (!foundTask) {
        setTask(null);
        return;
      }

      // Check permission strictly (allow view if permitted or if pending invitation)
      const isInvitedPending = parts.some(
        (p) => p.userId === currentUser.id && p.invitationStatus === "PENDING"
      );
      const canView = canSeeTask(foundTask, currentUser, parts) || isInvitedPending;
      if (!canView) {
        setIsForbidden(true);
        return;
      }

      setTask(foundTask);
      setProgressInput(foundTask.progressPercent);
      setIsBlockedInput(foundTask.isBlocked);
      setBlockedReasonInput(foundTask.blockedReason || "");
      setParticipants(parts);
      setUsers(allUsers);
      setEvents(allEvents);
      setComments(taskComments);
      setSubmissions(taskSubs);
      setApprovals(taskApps);
      setDeadlineRequests(taskDeadlines);
      setAssigneeRequests(taskAssignees);

      // Load subtasks and hierarchy
      const allTasks = await mockRepository.getTasks();
      const mySubtasks = allTasks.filter((t) => t.parentTaskId === foundTask.id);
      setSubtasks(mySubtasks);

      let pTask: Task | null = null;
      let gpTask: Task | null = null;
      if (foundTask.parentTaskId) {
        const foundParent = allTasks.find((t) => t.id === foundTask.parentTaskId);
        if (foundParent) {
          pTask = foundParent;
          if (foundParent.parentTaskId) {
            const foundGrandParent = allTasks.find((t) => t.id === foundParent.parentTaskId);
            if (foundGrandParent) {
              gpTask = foundGrandParent;
            }
          }
        }
      }
      setParentTask(pTask);
      setGrandParentTask(gpTask);

      if (foundTask.projectId) {
        const p = await mockRepository.getProjectById(foundTask.projectId);
        setProject(p);
      } else {
        setProject(null);
      }

      // Filter files linked to this task or its submissions
      const subIds = new Set(taskSubs.map((s) => s.id));
      const relevantLinks = allLinks.filter(
        (l) =>
          (l.entityType === "TASK" && l.entityId === id) ||
          (l.entityType === "SUBMISSION" && subIds.has(l.entityId))
      );
      const linkedFileIds = new Set(relevantLinks.map((l) => l.fileId));
      setFiles(allFiles.filter((f) => linkedFileIds.has(f.id)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllTaskData();
    const unsub = mockRepository.subscribe(loadAllTaskData);
    return unsub;
  }, [id, currentUser]);

  // Action 1: Send Comment
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !currentUser || !commentBody.trim()) return;

    setIsSendingComment(true);
    try {
      await mockRepository.addComment(task.id, commentBody.trim(), currentUser.id);
      setCommentBody("");
      showToast("Đã gửi bình luận.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi gửi bình luận", "error");
    } finally {
      setIsSendingComment(false);
    }
  };

  // Action 2: Start task (TODO -> IN_PROGRESS)
  const handleStartTask = async () => {
    if (!task || !currentUser) return;
    setIsSubmittingAction(true);
    try {
      await mockRepository.startTask(task.id, currentUser.id);
      showToast("Đã bắt đầu thực hiện công việc.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi cập nhật", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 3: Publish DRAFT task to TODO
  const handlePublishTask = async () => {
    if (!task || !currentUser) return;
    setIsSubmittingAction(true);
    try {
      await mockRepository.publishTask(task.id, currentUser.id);
      setShowPublishModal(false);
      showToast(`Đã phát hành và giao việc thành công: ${task.code}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi phát hành", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 4: Update Progress & Blocked flag
  const handleUpdateProgress = async () => {
    if (!task || !currentUser) return;
    if (isBlockedInput && !blockedReasonInput.trim()) {
      showToast("Bắt buộc nhập lý do khi báo vướng mắc.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.updateTaskProgress(
        task.id,
        {
          progressPercent: progressInput,
          isBlocked: isBlockedInput,
          blockedReason: isBlockedInput ? blockedReasonInput.trim() : null,
        },
        currentUser.id
      );
      setShowProgressModal(false);
      showToast("Đã cập nhật tiến độ công việc.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi cập nhật tiến độ", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 5: Submit Deliverable (IN_PROGRESS -> IN_REVIEW)
  const handleSubmitDeliverable = async () => {
    if (!task || !currentUser) return;
    if (!submissionSummary.trim()) {
      showToast("Vui lòng nhập tóm tắt báo cáo kết quả nộp.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.addSubmission(
        task.id,
        { summary: submissionSummary.trim(), fileIds: [] },
        currentUser.id
      );
      setShowSubmitModal(false);
      setSubmissionSummary("");
      showToast("Đã nộp báo cáo kết quả. Công việc chuyển sang Chờ duyệt (IN_REVIEW).", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi nộp kết quả", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 6: Approve (IN_REVIEW -> DONE)
  const handleApprove = async () => {
    if (!task || !currentUser || submissions.length === 0) return;
    setIsSubmittingAction(true);
    try {
      const latestSub = submissions[0];
      await mockRepository.decideApproval(
        latestSub.id,
        "APPROVED",
        approveReason.trim() || null,
        currentUser.id
      );
      setShowApproveModal(false);
      setApproveReason("");
      showToast("Đã phê duyệt hoàn thành công việc (DONE).", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi phê duyệt", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 7: Return (IN_REVIEW -> IN_PROGRESS)
  const handleReturn = async () => {
    if (!task || !currentUser || submissions.length === 0) return;
    if (!returnReason.trim()) {
      showToast("Vui lòng nhập lý do trả lại kết quả.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      const latestSub = submissions[0];
      await mockRepository.decideApproval(
        latestSub.id,
        "RETURNED",
        returnReason.trim(),
        currentUser.id
      );
      setShowReturnModal(false);
      setReturnReason("");
      showToast("Đã trả lại báo cáo để bổ sung. Công việc chuyển về Đang làm (IN_PROGRESS).", "warning");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi trả lại", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 8: Request Deadline Extension
  const handleRequestDeadline = async () => {
    if (!task || !currentUser) return;
    if (!proposedDueDate) {
      showToast("Vui lòng chọn thời hạn đề xuất mới.", "error");
      return;
    }
    if (task.dueAt && new Date(proposedDueDate).getTime() <= new Date(task.dueAt).getTime()) {
      showToast("Thời hạn đề xuất phải lớn hơn hạn hiện tại.", "error");
      return;
    }
    if (!deadlineReason.trim()) {
      showToast("Vui lòng nhập lý do đề xuất gia hạn.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.createDeadlineRequest(
        task.id,
        {
          proposedDueAt: new Date(proposedDueDate).toISOString(),
          reason: deadlineReason.trim(),
        },
        currentUser.id
      );
      setShowDeadlineModal(false);
      setDeadlineReason("");
      showToast("Đã gửi đề nghị gia hạn thời hạn tới Trưởng phòng.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi gửi đề nghị", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 9: Manager Edit Task Details (dueAt, assignee, priority with reason)
  const handleManagerUpdateTask = async () => {
    if (!task || !currentUser) return;
    if (!managerEditReason.trim()) {
      showToast("Bắt buộc nhập lý do điều chỉnh thông tin nhiệm vụ.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.managerUpdateTaskDetails(
        task.id,
        {
          dueAt: editDueAt ? new Date(editDueAt).toISOString() : task.dueAt,
          primaryAssigneeId: editAssigneeId || task.primaryAssigneeId,
          priority: editPriority,
        },
        managerEditReason.trim(),
        currentUser.id
      );
      setShowManagerEditModal(false);
      setManagerEditReason("");
      showToast("Đã điều chỉnh thông tin nhiệm vụ thành công.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi điều chỉnh nhiệm vụ", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 10: Cancel Task (requires reason)
  const handleCancelTask = async () => {
    if (!task || !currentUser) return;
    if (!cancelReason.trim()) {
      showToast("Bắt buộc nhập lý do hủy nhiệm vụ.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.cancelTask(task.id, cancelReason.trim(), currentUser.id);
      setShowCancelModal(false);
      setCancelReason("");
      showToast("Đã hủy nhiệm vụ thành công.", "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi hủy công việc", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 11: Reopen DONE task (requires reason)
  const handleReopenTask = async () => {
    if (!task || !currentUser) return;
    if (!reopenReason.trim()) {
      showToast("Bắt buộc nhập lý do mở lại công việc.", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.reopenTask(task.id, reopenReason.trim(), currentUser.id);
      setShowReopenModal(false);
      setReopenReason("");
      showToast("Đã mở lại công việc hoàn thành.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi mở lại công việc", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 12: Propose Assignee Change (Staff)
  const handleCreateAssigneeRequest = async () => {
    if (!task || !currentUser) return;
    if (!proposedAssigneeId || proposedAssigneeId === task.primaryAssigneeId) {
      showToast("Vui lòng chọn người đề xuất khác với người đang chủ trì", "error");
      return;
    }
    if (!assigneeRequestReason.trim()) {
      showToast("Bắt buộc nhập lý do đề nghị chuyển người chủ trì", "error");
      return;
    }
    setIsSubmittingAction(true);
    try {
      await mockRepository.createAssigneeRequest(
        task.id,
        {
          proposedAssigneeId,
          reason: assigneeRequestReason.trim(),
        },
        currentUser.id
      );
      setShowAssigneeRequestModal(false);
      setAssigneeRequestReason("");
      showToast("Đã gửi đề nghị chuyển chủ trì tới Trưởng phòng.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi gửi đề nghị", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 13: Manager decides deadline request
  const handleExecuteDecideDeadline = async () => {
    if (!activeDecideDeadline || !currentUser) return;
    setIsSubmittingAction(true);
    try {
      await mockRepository.decideDeadlineRequest(
        activeDecideDeadline.req.id,
        {
          decision: activeDecideDeadline.decision,
          reason: decideDeadlineReason.trim() || null,
        },
        currentUser.id
      );
      showToast(
        activeDecideDeadline.decision === "APPROVED"
          ? "Đã chấp thuận đề xuất gia hạn thời hạn"
          : "Đã từ chối đề xuất gia hạn",
        activeDecideDeadline.decision === "APPROVED" ? "success" : "warning"
      );
      setActiveDecideDeadline(null);
      setDecideDeadlineReason("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi xử lý gia hạn", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 14: Manager decides assignee request
  const handleExecuteDecideAssignee = async () => {
    if (!activeDecideAssignee || !currentUser) return;
    setIsSubmittingAction(true);
    try {
      await mockRepository.decideAssigneeRequest(
        activeDecideAssignee.req.id,
        {
          decision: activeDecideAssignee.decision,
          reason: decideAssigneeReason.trim() || null,
        },
        currentUser.id
      );
      showToast(
        activeDecideAssignee.decision === "APPROVED"
          ? "Đã chấp thuận chuyển người chủ trì"
          : "Đã từ chối chuyển chủ trì",
        activeDecideAssignee.decision === "APPROVED" ? "success" : "warning"
      );
      setActiveDecideAssignee(null);
      setDecideAssigneeReason("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi xử lý chuyển chủ trì", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action 15: Upload Mock File
  const handleUploadMockFile = async () => {
    if (!task || !currentUser) return;
    const fileName = selectedUploadFile ? selectedUploadFile.name : uploadFileName.trim();
    if (!fileName) {
      showToast("Vui lòng chọn hoặc nhập tên tệp tài liệu.", "error");
      return;
    }
    if (parseFloat(uploadFileSizeMb) > 20) {
      showToast("Dung lượng tệp vượt quá giới hạn cấu hình 20 MB", "error");
      return;
    }
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const allowedExts = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png"];
    if (!allowedExts.includes(ext)) {
      showToast("Định dạng tệp không được hỗ trợ. Chỉ chấp nhận: PDF, Word, Excel, PowerPoint, JPG, PNG", "error");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const sizeBytes = selectedUploadFile
        ? selectedUploadFile.size
        : Math.round(parseFloat(uploadFileSizeMb || "1") * 1024 * 1024);
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      const mimeType = selectedUploadFile?.type || mimeMap[ext] || "application/octet-stream";

      const uploaded = await mockRepository.uploadMockFile(
        { originalName: fileName, mimeType, sizeBytes },
        currentUser.id
      );

      if (selectedUploadFile) {
        setSessionFile(uploaded.id, selectedUploadFile);
      }

      await mockRepository.createFileLink(uploaded.id, "TASK", task.id);

      setShowFileUploadModal(false);
      setUploadFileName("");
      setSelectedUploadFile(null);
      showToast(`Đã lưu metadata tệp đính kèm: ${uploaded.originalName}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi tải tệp", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Subtask deadline warning
  const subtaskDueAtIso = useMemo(() => {
    if (!subtaskDueDate) return null;
    return new Date(`${subtaskDueDate}T${subtaskDueTime || "17:30"}:00+07:00`).toISOString();
  }, [subtaskDueDate, subtaskDueTime]);

  const isSubtaskDueAfterParent = useMemo(() => {
    if (!subtaskDueAtIso || !task?.dueAt) return false;
    return new Date(subtaskDueAtIso).getTime() > new Date(task.dueAt).getTime();
  }, [subtaskDueAtIso, task?.dueAt]);

  const isAtMaxLevel = !!grandParentTask;

  // Handle Team invitation response
  const handleRespondInvite = async (decision: "ACCEPTED" | "DECLINED") => {
    const invite = participants.find(
      (p) => p.userId === currentUser?.id && p.invitationStatus === "PENDING"
    );
    if (!currentUser || !invite) return;
    try {
      setIsSubmittingAction(true);
      await mockRepository.respondInvitation(invite.id, decision, currentUser.id);
      showToast(
        decision === "ACCEPTED"
          ? "Đã đồng ý tham gia công việc nhóm thành công"
          : "Đã từ chối lời mời tham gia",
        "success"
      );
      await loadAllTaskData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Complete TEAM task (no manager review required)
  const handleCompleteTeamTask = async () => {
    if (!currentUser || !task) return;
    try {
      setIsSubmittingAction(true);
      await mockRepository.changeTaskStatus(
        task.id,
        "DONE",
        currentUser.id,
        "Người tạo/chủ trì xác nhận hoàn tất công việc nhóm"
      );
      showToast(`Đã hoàn tất công việc nhóm [${task.code}]`, "success");
      await loadAllTaskData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Convert TEAM to OFFICIAL
  const handleConvertTeamToOfficial = async () => {
    if (!currentUser || !task) return;
    if (!convertAssigneeId) {
      showToast("Vui lòng chọn người chủ trì", "error");
      return;
    }
    let dueAt = task.dueAt || new Date(Date.now() + 72 * 3600000).toISOString();
    if (convertDueDate) {
      dueAt = new Date(`${convertDueDate}T${convertDueTime || "17:30"}:00+07:00`).toISOString();
    }

    try {
      setIsSubmittingAction(true);
      const converted = await mockRepository.convertTeamToOfficial(
        task.id,
        {
          primaryAssigneeId: convertAssigneeId,
          dueAt,
          priority: convertPriority,
        },
        currentUser.id
      );
      showToast(
        `Đã chuyển đổi việc nhóm thành nhiệm vụ chính thức [${converted.code}] thành công!`,
        "success"
      );
      setShowConvertModal(false);
      await loadAllTaskData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chuyển đổi thất bại";
      showToast(msg, "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Create Subtask
  const handleCreateSubtask = async () => {
    if (!currentUser || !task) return;
    if (!subtaskTitle.trim()) {
      showToast("Vui lòng nhập tên việc con", "error");
      return;
    }
    if (!subtaskAssigneeId) {
      showToast("Vui lòng chọn người thực hiện", "error");
      return;
    }

    try {
      setIsSubmittingAction(true);
      const newSub = await mockRepository.createSubtask(
        task.id,
        {
          title: subtaskTitle.trim(),
          primaryAssigneeId: subtaskAssigneeId,
          dueAt: subtaskDueAtIso,
          priority: subtaskPriority,
          deliverable: subtaskDeliverable.trim(),
        },
        currentUser.id
      );
      showToast(`Đã tạo việc con [${newSub.code}] thành công`, "success");
      setShowAddSubtaskModal(false);
      setSubtaskTitle("");
      setSubtaskDeliverable("");
      setSubtaskDueDate("");
      await loadAllTaskData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo việc con";
      showToast(msg, "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 403 Forbidden state
  if (isForbidden) {
    return (
      <ForbiddenPage
        message="Nhiệm vụ này là việc cá nhân riêng tư của người khác, bản nháp bạn không được giao, hoặc bạn chưa chấp nhận lời mời tham gia."
        resourceName={`Nhiệm vụ ID ${id}`}
        backUrl="/tasks"
      />
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-16 w-full bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-96 bg-slate-200 rounded animate-pulse" />
            <div className="lg:col-span-4 h-96 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>
      </AppShell>
    );
  }

  // 404 Not Found state
  if (!task) {
    return (
      <AppShell>
        <div className="text-center py-20 space-y-4 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-text-muted">
            <FileText className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">404 — Không tìm thấy công việc</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Mã định danh công việc không tồn tại trong kho dữ liệu mock hoặc đã bị xóa.
          </p>
          <div className="pt-2">
            <Link to="/tasks">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Về danh sách công việc
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const overdue = isTaskOverdue(task);
  const dueSoon = isTaskDueSoon(task);
  const creator = users.find((u) => u.id === task.createdById);
  const assignee = users.find((u) => u.id === task.primaryAssigneeId);

  // Permission conditions for action buttons
  const isAssignee = task.primaryAssigneeId === currentUser?.id;
  const isCreator = task.createdById === currentUser?.id;
  const canActAsAssignee = isAssignee || isManager;
  const myInvite = participants.find(
    (p) => p.userId === currentUser?.id && p.invitationStatus === "PENDING"
  );

  const pendingDeadline = deadlineRequests.find((r) => r.status === "PENDING");
  const pendingAssignee = assigneeRequests.find((r) => r.status === "PENDING");

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: isManager ? "Tất cả công việc" : "Công việc của tôi", href: "/tasks" },
            { label: `${task.code} — ${task.title}` },
          ]}
        />

        {/* Pending Team Invitation Response Banner */}
        {myInvite && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-scale-up">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-sm text-text-primary">
                  Lời mời tham gia công việc nhóm
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Bạn nhận được lời mời tham gia phối hợp nhiệm vụ này với vai trò{" "}
                  <strong className="text-text-primary">
                    {myInvite.role === "COLLABORATOR" ? "Người phối hợp" : "Người theo dõi"}
                  </strong>
                  . Vui lòng phản hồi để chính thức vào danh sách thành viên thực hiện.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isSubmittingAction}
                className="text-danger-700 hover:bg-danger-50 border-danger-300"
                onClick={() => handleRespondInvite("DECLINED")}
              >
                Từ chối
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmittingAction}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleRespondInvite("ACCEPTED")}
              >
                Đồng ý tham gia
              </Button>
            </div>
          </div>
        )}

        {/* Page Header with Status & Action Buttons */}
        <div className="bg-surface p-5 rounded-card border border-border shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm bg-slate-100 px-2.5 py-1 rounded text-text-primary">
                  {task.code}
                </span>
                <TaskTypeBadge type={task.type} />
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {overdue && <OverdueBadge />}
                {!overdue && dueSoon && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Sắp đến hạn
                  </span>
                )}
                {task.isBlocked && <BlockedBadge reason={task.blockedReason} />}
              </div>

              {parentTask && (
                <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-slate-100 px-2.5 py-1 rounded w-fit">
                  <CornerDownRight className="w-3.5 h-3.5 text-text-muted" />
                  <span>Trực thuộc việc cha:</span>
                  <Link
                    to={`/tasks/${parentTask.id}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {parentTask.code} — {parentTask.title}
                  </Link>
                </div>
              )}

              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                {task.title}
              </h1>

              <div className="text-xs text-text-muted flex items-center gap-3 flex-wrap">
                <span>Tạo bởi: <strong>{creator?.displayName || "—"}</strong></span>
                <span>•</span>
                <span>Cập nhật lần cuối: {formatRelativeVN(task.updatedAt)}</span>
                {project && (
                  <>
                    <span>•</span>
                    <span className="text-brand-700 font-medium">Dự án: {project.name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Contextual Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* DRAFT: Publish and Assign (Manager or Creator) */}
              {task.status === "DRAFT" && (isManager || isCreator) && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowPublishModal(true)}
                  className="gap-1.5 bg-brand-700 hover:bg-brand-800 text-white"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Phát hành & Giao việc
                </Button>
              )}

              {/* TODO: Start task */}
              {task.status === "TODO" && canActAsAssignee && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartTask}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Bắt đầu thực hiện
                </Button>
              )}

              {/* IN_PROGRESS: Update progress (Primary Assignee only) */}
              {task.status === "IN_PROGRESS" && isAssignee && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProgressModal(true)}
                  className="gap-1.5 text-brand-700 border-brand-300 hover:bg-brand-50"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-brand-700" /> Cập nhật tiến độ
                </Button>
              )}

              {/* IN_PROGRESS: Submit deliverable (Primary Assignee only for OFFICIAL) */}
              {task.status === "IN_PROGRESS" && isAssignee && task.type === "OFFICIAL" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowSubmitModal(true)}
                  className="gap-1.5 bg-purple-700 hover:bg-purple-800 text-white"
                >
                  <FileCheck className="w-3.5 h-3.5" /> Nộp báo cáo kết quả
                </Button>
              )}

              {/* TEAM: Confirm Done directly without Manager review */}
              {task.type === "TEAM" && task.status === "IN_PROGRESS" && (isAssignee || isCreator) && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCompleteTeamTask}
                  disabled={isSubmittingAction}
                  className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Xác nhận hoàn tất (DONE)
                </Button>
              )}

              {/* TEAM: Convert to OFFICIAL (Manager only) */}
              {task.type === "TEAM" && task.status !== "CANCELLED" && isManager && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConvertAssigneeId(task.primaryAssigneeId || currentUser?.id || "u02");
                    setConvertDueDate(task.dueAt ? task.dueAt.slice(0, 10) : "");
                    setConvertPriority(task.priority);
                    setShowConvertModal(true);
                  }}
                  className="gap-1.5 bg-blue-700 hover:bg-blue-800 text-white"
                >
                  <GitFork className="w-3.5 h-3.5" /> Chuyển thành OFFICIAL
                </Button>
              )}

              {/* IN_PROGRESS: Propose Assignee Change (Primary Assignee only) */}
              {task.status === "IN_PROGRESS" && isAssignee && task.type === "OFFICIAL" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProposedAssigneeId("");
                    setAssigneeRequestReason("");
                    setShowAssigneeRequestModal(true);
                  }}
                  className="gap-1.5 text-blue-800 border-blue-200 hover:bg-blue-50"
                >
                  <UserCheck className="w-3.5 h-3.5 text-blue-700" /> Đề nghị đổi chủ trì
                </Button>
              )}

              {/* IN_REVIEW: Approve (Manager only) */}
              {task.status === "IN_REVIEW" && isManager && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowApproveModal(true)}
                  className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt kết quả
                </Button>
              )}

              {/* IN_REVIEW: Return (Manager only) */}
              {task.status === "IN_REVIEW" && isManager && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReturnModal(true)}
                  className="gap-1.5 text-amber-800 border-amber-300 hover:bg-amber-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Trả lại yêu cầu bổ sung
                </Button>
              )}

              {/* Request Deadline Extension (Assignee when active) */}
              {task.status !== "DONE" && task.status !== "CANCELLED" && task.status !== "DRAFT" && isAssignee && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProposedDueDate(
                      task.dueAt
                        ? new Date(new Date(task.dueAt).getTime() + 72 * 3600000).toISOString().slice(0, 16)
                        : ""
                    );
                    setShowDeadlineModal(true);
                  }}
                  className="gap-1.5 text-text-secondary"
                >
                  <Clock className="w-3.5 h-3.5 text-text-muted" /> Xin gia hạn
                </Button>
              )}

              {/* Manager Edit Task Details (Manager only for active OFFICIAL tasks) */}
              {task.status !== "DONE" && task.status !== "CANCELLED" && isManager && task.type === "OFFICIAL" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditDueAt(task.dueAt ? task.dueAt.slice(0, 16) : "");
                    setEditAssigneeId(task.primaryAssigneeId || "");
                    setEditPriority(task.priority);
                    setManagerEditReason("");
                    setShowManagerEditModal(true);
                  }}
                  className="gap-1.5 text-text-secondary hover:text-brand-800"
                >
                  <Settings className="w-3.5 h-3.5 text-text-muted" /> Điều chỉnh nhiệm vụ
                </Button>
              )}

              {/* Reopen DONE task (Manager only) */}
              {task.status === "DONE" && isManager && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReopenReason("");
                    setShowReopenModal(true);
                  }}
                  className="gap-1.5 text-amber-800 border-amber-300 hover:bg-amber-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Mở lại công việc
                </Button>
              )}

              {/* Cancel task (Manager or Creator for non-official) */}
              {task.status !== "DONE" && task.status !== "CANCELLED" && (isManager || (isCreator && task.type !== "OFFICIAL")) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCancelReason("");
                    setShowCancelModal(true);
                  }}
                  className="gap-1.5 text-danger border-red-200 hover:bg-red-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Hủy việc
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* DRAFT Warning Banner */}
        {task.status === "DRAFT" && (
          <div className="p-4 bg-slate-100 border border-slate-300 rounded-card flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileQuestion className="w-5 h-5 text-slate-600 shrink-0" />
              <div className="text-xs text-text-primary">
                <strong>Bản nháp nhiệm vụ:</strong> Công việc này chưa được chính thức phát hành. Người được gán chưa nhận được thông báo thực hiện.
              </div>
            </div>
            {isManager && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowPublishModal(true)}
                className="gap-1.5 bg-brand-700 hover:bg-brand-800 text-white shrink-0 text-xs py-1 h-8"
              >
                Giao việc ngay
              </Button>
            )}
          </div>
        )}

        {/* Pending Deadline Request Banner */}
        {pendingDeadline && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-900">
                  Đề nghị gia hạn thời hạn đến: {formatDateTimeVN(pendingDeadline.proposedDueAt)}
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  Lý do đề xuất: "{pendingDeadline.reason}"
                </div>
              </div>
            </div>
            {isManager ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveDecideDeadline({ req: pendingDeadline, decision: "REJECTED" });
                    setDecideDeadlineReason("");
                  }}
                  className="text-danger border-red-200 hover:bg-red-50 text-xs py-1 h-8"
                >
                  Từ chối
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setActiveDecideDeadline({ req: pendingDeadline, decision: "APPROVED" });
                    setDecideDeadlineReason("");
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs py-1 h-8"
                >
                  Chấp thuận gia hạn
                </Button>
              </div>
            ) : (
              <span className="text-[11px] text-amber-700 font-medium italic">
                (Đang chờ Trưởng phòng xem xét)
              </span>
            )}
          </div>
        )}

        {/* Pending Assignee Request Banner */}
        {pendingAssignee && (
          <div className="p-4 bg-blue-50 border border-blue-300 rounded-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-blue-900">
                  Đề nghị chuyển chủ trì sang: {users.find((u) => u.id === pendingAssignee.proposedAssigneeId)?.displayName || "—"}
                </div>
                <div className="text-[11px] text-blue-800 mt-0.5">
                  Lý do đề xuất: "{pendingAssignee.reason}"
                </div>
              </div>
            </div>
            {isManager ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveDecideAssignee({ req: pendingAssignee, decision: "REJECTED" });
                    setDecideAssigneeReason("");
                  }}
                  className="text-danger border-red-200 hover:bg-red-50 text-xs py-1 h-8"
                >
                  Từ chối
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setActiveDecideAssignee({ req: pendingAssignee, decision: "APPROVED" });
                    setDecideAssigneeReason("");
                  }}
                  className="bg-blue-700 hover:bg-blue-800 text-white text-xs py-1 h-8"
                >
                  Duyệt chuyển giao
                </Button>
              </div>
            ) : (
              <span className="text-[11px] text-blue-700 font-medium italic">
                (Đang chờ Trưởng phòng xem xét)
              </span>
            )}
          </div>
        )}

        {/* Main 2-Column Section (8 cols / 4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 cols): Info, Deliverable & 4 Organized Tabs */}
          <div className="lg:col-span-8 space-y-6">
            {/* Nội dung thực hiện & Sản phẩm yêu cầu */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Nội dung & Yêu cầu kết quả</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs sm:text-sm leading-relaxed text-text-primary">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                    Mô tả công việc:
                  </div>
                  <p className="whitespace-pre-line text-text-secondary">
                    {task.description || "Chưa có mô tả chi tiết."}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 border border-border rounded-btn space-y-1">
                  <div className="text-xs font-semibold text-brand-800 uppercase tracking-wider">
                    Sản phẩm / Báo cáo cần bàn giao:
                  </div>
                  <p className="text-text-primary font-medium">
                    {task.deliverable || "Chưa quy định cụ thể sản phẩm bàn giao."}
                  </p>
                </div>

                {task.isBlocked && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-btn flex items-start gap-2.5 text-xs text-danger">
                    <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Đang gặp vướng mắc:</strong> {task.blockedReason || "Chưa nêu rõ lý do."}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4 Tabs: Hoạt động, Bình luận, Kết quả nộp & duyệt, Tệp đính kèm */}
            <Card>
              <div className="border-b border-border flex items-center px-4 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab("activity")}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeTab === "activity"
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Hoạt động ({events.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeTab === "comments"
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Bình luận ({comments.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("subtasks")}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeTab === "subtasks"
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <GitFork className="w-3.5 h-3.5" />
                  Việc con ({subtasks.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("submissions")}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeTab === "submissions"
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5 text-purple-700" />
                  Kết quả nộp & duyệt ({submissions.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("files")}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeTab === "files"
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Tệp đính kèm ({files.length})
                </button>
              </div>

              <CardContent className="p-4 sm:p-5">
                {/* TAB 1: Hoạt động (Audit Events) */}
                {activeTab === "activity" && (
                  <div className="space-y-4">
                    {events.length === 0 ? (
                      <div className="text-center py-6 text-text-muted text-xs">
                        Chưa có sự kiện nào được ghi nhận.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {events.map((evt, idx) => {
                          const actor = users.find((u) => u.id === evt.actorId);
                          return (
                            <TimelineItem
                              key={evt.id}
                              event={evt}
                              actor={actor}
                              isLast={idx === events.length - 1}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Việc con (Subtasks) */}
                {activeTab === "subtasks" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-xs text-text-secondary">
                        Công việc con trực thuộc nhiệm vụ này ({subtasks.length} việc)
                        {isAtMaxLevel && (
                          <span className="ml-2 text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-semibold border border-amber-200">
                            (Đã đạt mức tối đa 2 cấp việc con)
                          </span>
                        )}
                      </div>

                      {task.status !== "DONE" && task.status !== "CANCELLED" && !isAtMaxLevel && (isAssignee || isManager || isCreator) && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setSubtaskAssigneeId(task.primaryAssigneeId || currentUser?.id || "u02");
                            setSubtaskDueDate(task.dueAt ? task.dueAt.slice(0, 10) : "");
                            setSubtaskPriority(task.priority);
                            setShowAddSubtaskModal(true);
                          }}
                        >
                          <GitFork className="w-3.5 h-3.5" /> Thêm việc con
                        </Button>
                      )}
                    </div>

                    {subtasks.length === 0 ? (
                      <div className="text-center py-10 space-y-3 bg-slate-50/50 rounded-lg border border-border/60">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-text-muted">
                          <GitFork className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-text-primary">Chưa có việc con nào</div>
                          <p className="text-xs text-text-muted max-w-sm mx-auto">
                            Chia nhỏ nhiệm vụ thành các bước thực hiện độc lập, phân công người làm và thời hạn riêng.
                          </p>
                        </div>
                        {!isAtMaxLevel && task.status !== "DONE" && task.status !== "CANCELLED" && (isAssignee || isManager || isCreator) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSubtaskAssigneeId(task.primaryAssigneeId || currentUser?.id || "u02");
                              setSubtaskDueDate(task.dueAt ? task.dueAt.slice(0, 10) : "");
                              setSubtaskPriority(task.priority);
                              setShowAddSubtaskModal(true);
                            }}
                          >
                            Tạo việc con đầu tiên
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60 border border-border/80 rounded-lg overflow-hidden bg-surface">
                        {subtasks.map((sub) => {
                          const subAssignee = users.find((u) => u.id === sub.primaryAssigneeId);
                          const isSubOverdue = isTaskOverdue(sub);
                          const isPastParent =
                            task.dueAt &&
                            sub.dueAt &&
                            new Date(sub.dueAt).getTime() > new Date(task.dueAt).getTime();

                          return (
                            <div
                              key={sub.id}
                              className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-text-primary bg-slate-100 px-2 py-0.5 rounded">
                                    {sub.code}
                                  </span>
                                  <Link
                                    to={`/tasks/${sub.id}`}
                                    className="font-semibold text-sm text-text-primary hover:text-brand-700 hover:underline truncate"
                                  >
                                    {sub.title}
                                  </Link>
                                  <StatusBadge status={sub.status} />
                                  <PriorityBadge priority={sub.priority} />
                                  {isSubOverdue && <OverdueBadge />}
                                  {isPastParent && (
                                    <span
                                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1"
                                      title="Hạn việc con muộn hơn hạn việc cha"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Vượt hạn việc cha
                                    </span>
                                  )}
                                </div>
                                {sub.deliverable && (
                                  <div className="text-xs text-text-muted italic line-clamp-1">
                                    Đầu ra: {sub.deliverable}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-4 shrink-0 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <UserAvatar name={subAssignee?.displayName || "N/A"} size="sm" />
                                  <span className="text-text-secondary">
                                    {subAssignee?.displayName || "—"}
                                  </span>
                                </div>

                                <div className="text-text-muted text-right">
                                  {sub.dueAt ? formatDateTimeVN(sub.dueAt) : "Không có hạn"}
                                </div>

                                <Link
                                  to={`/tasks/${sub.id}`}
                                  className="text-brand-700 hover:underline font-semibold text-xs ml-2"
                                >
                                  Chi tiết →
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: Bình luận */}
                {activeTab === "comments" && (
                  <div className="space-y-5">
                    <form onSubmit={handleSendComment} className="space-y-2">
                      <Textarea
                        placeholder="Thêm trao đổi, ý kiến phối hợp hoặc ghi chú tiến độ..."
                        rows={2}
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        required
                      />
                      <div className="flex justify-end">
                        <Button
                          variant="primary"
                          size="sm"
                          type="submit"
                          isLoading={isSendingComment}
                          className="gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Gửi trao đổi
                        </Button>
                      </div>
                    </form>

                    {comments.length === 0 ? (
                      <div className="text-center py-6 text-text-muted text-xs border-t border-border">
                        Chưa có bình luận trao đổi nào trên công việc này.
                      </div>
                    ) : (
                      <div className="space-y-3 pt-3 border-t border-border">
                        {comments.map((c) => {
                          const author = users.find((u) => u.id === c.authorId);
                          return (
                            <div
                              key={c.id}
                              className="p-3 bg-slate-50 border border-border rounded-btn space-y-1 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <UserAvatar name={author?.displayName || "—"} size="sm" />
                                  <span className="font-semibold text-text-primary">
                                    {author?.displayName || "Người dùng"}
                                  </span>
                                  <span className="text-[10px] text-text-muted">({author?.jobTitle})</span>
                                </div>
                                <span className="text-[10px] text-text-muted">
                                  {formatRelativeVN(c.createdAt)}
                                </span>
                              </div>
                              <p className="text-text-secondary pl-7 whitespace-pre-wrap">{c.body}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Kết quả nộp & Quyết định duyệt */}
                {activeTab === "submissions" && (
                  <div className="space-y-4">
                    {submissions.length === 0 ? (
                      <div className="text-center py-8 text-text-muted text-xs">
                        Chưa có báo cáo kết quả nào được nộp cho công việc này.
                      </div>
                    ) : (
                      submissions.map((sub, idx) => {
                        const app = approvals.find((a) => a.submissionId === sub.id);
                        const submitter = users.find((u) => u.id === sub.submittedById);
                        const decider = app ? users.find((u) => u.id === app.decidedById) : null;
                        const subNumber = submissions.length - idx;

                        return (
                          <div
                            key={sub.id}
                            className="p-4 rounded-btn border border-border bg-slate-50/50 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                  Đợt nộp #{subNumber}
                                </span>
                                <span className="text-xs text-text-secondary">
                                  Bởi <strong>{submitter?.displayName || "Chuyên viên"}</strong>
                                </span>
                              </div>
                              <span className="text-[11px] text-text-muted">
                                {formatDateTimeVN(sub.submittedAt)}
                              </span>
                            </div>

                            <div className="text-xs bg-white p-3 rounded border border-border/80 text-text-primary whitespace-pre-wrap leading-relaxed">
                              {sub.summary}
                            </div>

                            {/* Approval Decision if exists */}
                            {app ? (
                              <div
                                className={`p-3 rounded-btn border text-xs space-y-1 ${
                                  app.decision === "APPROVED"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                    : "bg-amber-50 border-amber-200 text-amber-900"
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <div className="flex items-center gap-1.5">
                                    {app.decision === "APPROVED" ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <RotateCcw className="w-4 h-4 text-amber-600" />
                                    )}
                                    <span>
                                      {app.decision === "APPROVED" ? "ĐÃ PHÊ DUYỆT HOÀN THÀNH" : "ĐÃ TRẢ LẠI YÊU CẦU BỔ SUNG"}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-normal text-text-muted">
                                    {formatDateTimeVN(app.decidedAt)}
                                  </span>
                                </div>
                                <div className="text-[11px]">
                                  Người quyết định: <strong>{decider?.displayName || "Trưởng phòng"}</strong>
                                </div>
                                {app.reason && (
                                  <div className="text-xs pt-1 border-t border-border/60">
                                    <strong>Ý kiến phản hồi:</strong> {app.reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-purple-700 font-medium flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> Đang chờ Trưởng phòng xem xét duyệt kết quả.
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB 4: Tệp đính kèm (Files) */}
                {activeTab === "files" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">
                        Tài liệu, báo cáo đính kèm theo nhiệm vụ ({files.length} tệp)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFileUploadModal(true)}
                        className="gap-1.5 text-xs"
                      >
                        <Upload className="w-3.5 h-3.5" /> Đính kèm tệp mẫu
                      </Button>
                    </div>

                    {files.length === 0 ? (
                      <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-btn">
                        Chưa có tệp đính kèm nào.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {files.map((file) => {
                          const uploader = users.find((u) => u.id === file.uploadedById);
                          const sizeKb = Math.round(file.sizeBytes / 1024);
                          return (
                            <div key={file.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-text-primary truncate">
                                    {file.originalName}
                                  </div>
                                  <div className="text-[11px] text-text-muted">
                                    {sizeKb} KB • Tải lên bởi {uploader?.displayName} • {formatRelativeVN(file.createdAt)}
                                  </div>
                                </div>
                              </div>

                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono shrink-0">
                                MOCK LOCAL
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (4 cols): Phụ trách, Hạn, Tiến độ */}
          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Thông tin điều hành</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {/* Assignee */}
                <div>
                  <div className="text-text-muted font-medium mb-1.5">Người chủ trì chính:</div>
                  <div className="p-2.5 rounded-btn bg-slate-50 border border-border flex items-center gap-2.5">
                    <UserAvatar name={assignee?.displayName || "—"} size="sm" />
                    <div>
                      <div className="font-bold text-text-primary">{assignee?.displayName || "Chưa giao"}</div>
                      <div className="text-[11px] text-text-muted">{assignee?.jobTitle}</div>
                    </div>
                  </div>
                </div>

                {/* Due Date */}
                <div>
                  <div className="text-text-muted font-medium mb-1.5">Hạn hoàn thành:</div>
                  <div className="p-2.5 rounded-btn bg-slate-50 border border-border flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-brand-700 shrink-0" />
                    <div>
                      <div className={`font-semibold ${overdue ? "text-danger" : "text-text-primary"}`}>
                        {formatDateTimeVN(task.dueAt)}
                      </div>
                      <div className="text-[11px] text-text-muted">{formatRelativeVN(task.dueAt)}</div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-text-muted font-medium mb-1.5">
                    <span>Tiến độ thực hiện:</span>
                    <span className="font-mono font-bold text-text-primary">{task.progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        task.isBlocked ? "bg-amber-500" : "bg-brand-700"
                      }`}
                      style={{ width: `${task.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Participants */}
                <div>
                  <div className="text-text-muted font-medium mb-1.5">
                    Người phối hợp & Theo dõi ({participants.length}):
                  </div>
                  {participants.length === 0 ? (
                    <div className="text-text-muted italic py-1">Không có người phối hợp thêm.</div>
                  ) : (
                    <div className="space-y-2">
                      {participants.map((p) => {
                        const u = users.find((user) => user.id === p.userId);
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2 rounded bg-slate-50 border border-border/80"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <UserAvatar name={u?.displayName || "—"} size="sm" />
                              <div className="min-w-0">
                                <div className="font-semibold text-text-primary truncate">{u?.displayName}</div>
                                <div className="text-[10px] text-text-muted">
                                  {p.role === "COLLABORATOR" ? "Phối hợp" : "Theo dõi"}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                p.invitationStatus === "ACCEPTED"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {p.invitationStatus === "ACCEPTED" ? "Đã nhận" : "Chờ xác nhận"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* --- MODAL 1: CẬP NHẬT TIẾN ĐỘ & VƯỚNG MẮC (ASSIGNEE) --- */}
        <ConfirmDialog
          isOpen={showProgressModal}
          title="Cập nhật tiến độ & Tình trạng"
          description="Người chủ trì cập nhật phần trăm hoàn thành và thông báo vướng mắc nếu phát sinh."
          confirmLabel="Lưu tiến độ"
          isLoading={isSubmittingAction}
          onConfirm={handleUpdateProgress}
          onCancel={() => setShowProgressModal(false)}
        >
          <div className="space-y-4 pt-2 text-xs">
            <div>
              <div className="flex justify-between font-semibold text-text-primary mb-1">
                <span>Tiến độ hoàn thành:</span>
                <span className="font-mono text-brand-700 font-bold">{progressInput}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressInput}
                onChange={(e) => setProgressInput(parseInt(e.target.value, 10))}
                className="w-full accent-brand-700"
              />
            </div>

            <div className="p-3 rounded-btn border border-border bg-slate-50 space-y-2">
              <label className="flex items-center gap-2 font-semibold text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBlockedInput}
                  onChange={(e) => setIsBlockedInput(e.target.checked)}
                  className="rounded text-brand-700 focus:ring-brand-700"
                />
                <span className="text-danger flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" /> Báo cáo công việc đang gặp vướng mắc
                </span>
              </label>

              {isBlockedInput && (
                <Textarea
                  placeholder="Ghi rõ lý do vướng mắc, đơn vị phối hợp liên quan hoặc vật tư thiết bị đang chờ..."
                  rows={2}
                  required
                  value={blockedReasonInput}
                  onChange={(e) => setBlockedReasonInput(e.target.value)}
                />
              )}
            </div>
          </div>
        </ConfirmDialog>

        {/* --- MODAL 2: NỘP BÁO CÁO KẾT QUẢ (ASSIGNEE) --- */}
        <ConfirmDialog
          isOpen={showSubmitModal}
          title="Nộp báo cáo kết quả công việc"
          description="Công việc sẽ chuyển sang trạng thái CHỜ DUYỆT (IN_REVIEW) và gửi thông báo tới Trưởng phòng."
          confirmLabel="Nộp duyệt kết quả"
          variant="primary"
          isLoading={isSubmittingAction}
          onConfirm={handleSubmitDeliverable}
          onCancel={() => setShowSubmitModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Textarea
              label="Tóm tắt kết quả hoàn thành *"
              placeholder="Mô tả cụ thể kết quả đã đạt được, số liệu hoặc đường link tài liệu sản phẩm..."
              rows={4}
              required
              value={submissionSummary}
              onChange={(e) => setSubmissionSummary(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 3: PHÊ DUYỆT KẾT QUẢ (MANAGER) --- */}
        <ConfirmDialog
          isOpen={showApproveModal}
          title="Phê duyệt hoàn thành công việc"
          description="Ghi nhận công việc đạt trạng thái HOÀN THÀNH (DONE), tính vào chỉ số hoàn thành đúng hạn của đơn vị."
          confirmLabel="Duyệt hoàn thành"
          variant="primary"
          isLoading={isSubmittingAction}
          onConfirm={handleApprove}
          onCancel={() => setShowApproveModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Input
              label="Ý kiến đánh giá (Tùy chọn)"
              placeholder="Ghi nhận hoàn thành tốt..."
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 4: TRẢ LẠI KẾT QUẢ (MANAGER) --- */}
        <ConfirmDialog
          isOpen={showReturnModal}
          title="Trả lại báo cáo yêu cầu bổ sung"
          description="Công việc sẽ quay trở về trạng thái ĐANG LÀM (IN_PROGRESS) để chuyên viên chỉnh sửa, bổ sung."
          confirmLabel="Xác nhận trả lại"
          variant="danger"
          isLoading={isSubmittingAction}
          onConfirm={handleReturn}
          onCancel={() => setShowReturnModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Textarea
              label="Lý do trả lại & Yêu cầu bổ sung *"
              placeholder="Nêu rõ điểm chưa đạt hoặc tài liệu cần bổ sung..."
              rows={3}
              required
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 5: XIN GIA HẠN THỜI HẠN (ASSIGNEE) --- */}
        <ConfirmDialog
          isOpen={showDeadlineModal}
          title="Đề nghị gia hạn thời hạn nhiệm vụ"
          description="Đề nghị sẽ được gửi tới Trưởng phòng xem xét chấp thuận hoặc từ chối."
          confirmLabel="Gửi đề nghị gia hạn"
          isLoading={isSubmittingAction}
          onConfirm={handleRequestDeadline}
          onCancel={() => setShowDeadlineModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="block font-semibold text-text-primary mb-1">Thời hạn đề xuất mới *</label>
              <input
                type="datetime-local"
                value={proposedDueDate}
                onChange={(e) => setProposedDueDate(e.target.value)}
                className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <Textarea
              label="Lý do xin gia hạn *"
              placeholder="Giải trình nguyên nhân cần thêm thời gian..."
              rows={2}
              required
              value={deadlineReason}
              onChange={(e) => setDeadlineReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 6: PHÁT HÀNH BẢN NHÁP (MANAGER) --- */}
        <ConfirmDialog
          isOpen={showPublishModal}
          title="Phát hành và chính thức giao nhiệm vụ"
          description="Chuyển trạng thái từ DRAFT sang TODO, kích hoạt hạn hoàn thành và gửi thông báo giao việc đến người chủ trì."
          confirmLabel="Phát hành giao việc"
          variant="primary"
          isLoading={isSubmittingAction}
          onConfirm={handlePublishTask}
          onCancel={() => setShowPublishModal(false)}
        >
          <div className="space-y-2 pt-2 text-xs">
            <div className="p-3 bg-slate-50 border border-border rounded space-y-1.5">
              <div>Người nhận nhiệm vụ: <strong>{assignee?.displayName || "Chưa chọn người nhận"}</strong></div>
              <div>Hạn hoàn thành: <strong>{formatDateTimeVN(task.dueAt)}</strong></div>
            </div>
          </div>
        </ConfirmDialog>

        {/* --- MODAL 7: ĐIỀU CHỈNH NHIỆM VỤ (MANAGER) --- */}
        <ConfirmDialog
          isOpen={showManagerEditModal}
          title="Điều chỉnh thông tin nhiệm vụ sau khi giao"
          description="Trưởng phòng có quyền đổi hạn, đổi chủ trì hoặc mức độ ưu tiên. Bắt buộc nhập lý do điều chỉnh để lưu vết."
          confirmLabel="Lưu điều chỉnh"
          variant="primary"
          isLoading={isSubmittingAction}
          onConfirm={handleManagerUpdateTask}
          onCancel={() => setShowManagerEditModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="block font-semibold text-text-primary mb-1">Thời hạn hoàn thành mới</label>
              <input
                type="datetime-local"
                value={editDueAt}
                onChange={(e) => setEditDueAt(e.target.value)}
                className="w-full h-10 px-3 rounded-btn bg-surface border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>

            <Select
              label="Người chủ trì mới"
              value={editAssigneeId}
              onChange={(e) => setEditAssigneeId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.jobTitle})
                </option>
              ))}
            </Select>

            <Select
              label="Mức độ ưu tiên"
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
            >
              <option value="LOW">Thấp (Low)</option>
              <option value="NORMAL">Bình thường (Normal)</option>
              <option value="HIGH">Cao (High)</option>
              <option value="URGENT">Khẩn cấp (Urgent)</option>
            </Select>

            <Textarea
              label="Lý do điều chỉnh thông tin nhiệm vụ *"
              placeholder="Giải trình lý do điều chỉnh hạn hoặc phân công lại..."
              rows={2}
              required
              value={managerEditReason}
              onChange={(e) => setManagerEditReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 8: ĐỀ NGHỊ ĐỔI CHỦ TRÌ (STAFF) --- */}
        <ConfirmDialog
          isOpen={showAssigneeRequestModal}
          title="Đề nghị chuyển giao người chủ trì nhiệm vụ"
          description="Đề xuất của bạn sẽ được gửi tới Trưởng phòng xem xét chấp thuận."
          confirmLabel="Gửi đề xuất"
          isLoading={isSubmittingAction}
          onConfirm={handleCreateAssigneeRequest}
          onCancel={() => setShowAssigneeRequestModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Select
              label="Đề xuất chuyển giao cho chuyên viên *"
              value={proposedAssigneeId}
              onChange={(e) => setProposedAssigneeId(e.target.value)}
            >
              <option value="">-- Chọn đồng nghiệp thay thế --</option>
              {users
                .filter((u) => u.id !== task.primaryAssigneeId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.jobTitle})
                  </option>
                ))}
            </Select>

            <Textarea
              label="Lý do đề nghị chuyển người *"
              placeholder="Nêu lý do khối lượng công việc, chuyên môn hoặc tình trạng sức khỏe..."
              rows={2}
              required
              value={assigneeRequestReason}
              onChange={(e) => setAssigneeRequestReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 9: MỞ LẠI VIỆC HOÀN THÀNH (MANAGER) --- */}
        <ConfirmDialog
          isOpen={showReopenModal}
          title="Mở lại nhiệm vụ đã hoàn thành"
          description="Công việc sẽ quay trở về trạng thái ĐANG LÀM (IN_PROGRESS). Toàn bộ lịch sử duyệt trước đó vẫn được bảo toàn nguyên vẹn."
          confirmLabel="Xác nhận mở lại"
          variant="primary"
          isLoading={isSubmittingAction}
          onConfirm={handleReopenTask}
          onCancel={() => setShowReopenModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Textarea
              label="Lý do mở lại công việc *"
              placeholder="Nêu rõ yêu cầu kiểm tra lại hoặc phát sinh công việc mới..."
              rows={2}
              required
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 10: HỦY NHIỆM VỤ (MANAGER / CREATOR) --- */}
        <ConfirmDialog
          isOpen={showCancelModal}
          title="Xác nhận hủy nhiệm vụ này?"
          description="Công việc sẽ chuyển sang trạng thái ĐÃ HỦY (CANCELLED) và giữ nguyên toàn bộ lịch sử sự kiện."
          confirmLabel="Xác nhận hủy"
          variant="danger"
          isLoading={isSubmittingAction}
          onConfirm={handleCancelTask}
          onCancel={() => setShowCancelModal(false)}
        >
          <div className="space-y-3 pt-2 text-xs">
            <Textarea
              label="Lý do hủy nhiệm vụ *"
              placeholder="Nêu rõ căn cứ chỉ đạo hủy hoặc thay đổi kế hoạch..."
              rows={2}
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 11: DECIDE DEADLINE REQUEST (MANAGER) --- */}
        {activeDecideDeadline && (
          <ConfirmDialog
            isOpen={!!activeDecideDeadline}
            title={activeDecideDeadline.decision === "APPROVED" ? "Chấp thuận gia hạn thời hạn" : "Từ chối đề xuất gia hạn"}
            description="Đưa ra quyết định và ghi nhận lý do thông báo đến chuyên viên."
            confirmLabel={activeDecideDeadline.decision === "APPROVED" ? "Xác nhận gia hạn" : "Xác nhận từ chối"}
            variant={activeDecideDeadline.decision === "APPROVED" ? "primary" : "danger"}
            isLoading={isSubmittingAction}
            onConfirm={handleExecuteDecideDeadline}
            onCancel={() => setActiveDecideDeadline(null)}
          >
            <div className="space-y-3 pt-2 text-xs">
              <div className="p-2.5 bg-slate-50 border border-border rounded">
                <div>Thời hạn mới đề xuất: <strong>{formatDateTimeVN(activeDecideDeadline.req.proposedDueAt)}</strong></div>
                <div>Lý do của chuyên viên: <em>"{activeDecideDeadline.req.reason}"</em></div>
              </div>
              <Textarea
                label="Ý kiến phản hồi / Lý do quyết định"
                placeholder="Nhập nội dung phản hồi gửi đến chuyên viên..."
                rows={2}
                value={decideDeadlineReason}
                onChange={(e) => setDecideDeadlineReason(e.target.value)}
              />
            </div>
          </ConfirmDialog>
        )}

        {/* --- MODAL 12: DECIDE ASSIGNEE REQUEST (MANAGER) --- */}
        {activeDecideAssignee && (
          <ConfirmDialog
            isOpen={!!activeDecideAssignee}
            title={activeDecideAssignee.decision === "APPROVED" ? "Chấp thuận chuyển đổi chủ trì" : "Từ chối chuyển chủ trì"}
            description="Chuyển quyền phân công chủ trì cho chuyên viên đề xuất hoặc bác bỏ yêu cầu."
            confirmLabel={activeDecideAssignee.decision === "APPROVED" ? "Duyệt chuyển giao" : "Xác nhận từ chối"}
            variant={activeDecideAssignee.decision === "APPROVED" ? "primary" : "danger"}
            isLoading={isSubmittingAction}
            onConfirm={handleExecuteDecideAssignee}
            onCancel={() => setActiveDecideAssignee(null)}
          >
            <div className="space-y-3 pt-2 text-xs">
              <div className="p-2.5 bg-slate-50 border border-border rounded">
                <div>Lý do đề xuất: <em>"{activeDecideAssignee.req.reason}"</em></div>
              </div>
              <Textarea
                label="Ý kiến phản hồi (Tùy chọn)"
                placeholder="Nhập ý kiến giao việc..."
                rows={2}
                value={decideAssigneeReason}
                onChange={(e) => setDecideAssigneeReason(e.target.value)}
              />
            </div>
          </ConfirmDialog>
        )}

        {/* --- MODAL 13: TẢI LÊN TỆP MẪU MOCK --- */}
        <ConfirmDialog
          isOpen={showFileUploadModal}
          title="Tải lên tệp đính kèm nhiệm vụ"
          description="Tệp mẫu; chức năng lưu tệp sẽ kết nối R2 ở backend."
          confirmLabel="Lưu tệp đính kèm"
          isLoading={isSubmittingAction}
          onConfirm={handleUploadMockFile}
          onCancel={() => {
            setShowFileUploadModal(false);
            setSelectedUploadFile(null);
          }}
        >
          <div className="space-y-3 pt-2 text-xs">
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 leading-relaxed text-[11px]">
              Giới hạn <strong>20 MB</strong>. Hỗ trợ: PDF, Word (DOC/DOCX), Excel (XLS/XLSX), PowerPoint (PPT/PPTX), Hình ảnh (JPG/PNG).
            </div>

            <div className="space-y-1">
              <label className="font-bold text-text-secondary">Chọn tệp từ thiết bị (Tùy chọn)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const v = validateSelectedFile(f);
                  if (!v.valid) {
                    showToast(v.error || "Tệp không hợp lệ", "error");
                    return;
                  }
                  setSelectedUploadFile(f);
                  setUploadFileName(f.name);
                  setUploadFileSizeMb((f.size / (1024 * 1024)).toFixed(2));
                }}
                className="w-full text-xs text-text-secondary file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer border border-border rounded p-1"
              />
            </div>

            <Input
              label="Tên tệp tin đính kèm *"
              placeholder="Ví dụ: phu-luc-so-lieu.pdf hoặc bao-cao.docx"
              required
              value={uploadFileName}
              onChange={(e) => setUploadFileName(e.target.value)}
            />

            <Input
              label="Dung lượng mô phỏng (MB)"
              type="number"
              step="0.5"
              min="0.1"
              max="20"
              value={uploadFileSizeMb}
              onChange={(e) => setUploadFileSizeMb(e.target.value)}
              disabled={!!selectedUploadFile}
            />
          </div>
        </ConfirmDialog>

        {/* --- MODAL 14: CONVERT TEAM TASK TO OFFICIAL (MANAGER ONLY) --- */}
        <ConfirmDialog
          isOpen={showConvertModal}
          title="Chuyển thành nhiệm vụ chính thức (OFFICIAL)"
          description="Nhiệm vụ nhóm sẽ được chuyển sang loại OFFICIAL với mã công việc mới (CV-...). Hệ thống sẽ lưu vết mã cũ trong nhật ký và gửi thông báo cho người chủ trì."
          confirmText="Chuyển sang OFFICIAL"
          cancelText="Hủy"
          isLoading={isSubmittingAction}
          onConfirm={handleConvertTeamToOfficial}
          onClose={() => setShowConvertModal(false)}
        >
          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">
                Người chủ trì mới <span className="text-danger-600">*</span>
              </label>
              <Select
                value={convertAssigneeId}
                onChange={(e) => setConvertAssigneeId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên"})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Hạn hoàn thành (Ngày)</label>
                <Input
                  type="date"
                  value={convertDueDate}
                  onChange={(e) => setConvertDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Giờ (HH:mm)</label>
                <Input
                  type="time"
                  value={convertDueTime}
                  onChange={(e) => setConvertDueTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
              <Select
                value={convertPriority}
                onChange={(e) => setConvertPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">Thấp (LOW)</option>
                <option value="NORMAL">Bình thường (NORMAL)</option>
                <option value="HIGH">Cao (HIGH)</option>
                <option value="URGENT">Khẩn cấp (URGENT)</option>
              </Select>
            </div>
          </div>
        </ConfirmDialog>

        {/* --- MODAL 15: THÊM VIỆC CON (SUBTASK) --- */}
        <ConfirmDialog
          isOpen={showAddSubtaskModal}
          title={`Thêm việc con cho [${task.code}]`}
          description="Tạo công việc con trực thuộc để phân công chi tiết. Hệ thống hỗ trợ tối đa 2 cấp việc con."
          confirmText="Tạo việc con"
          cancelText="Hủy"
          isLoading={isSubmittingAction}
          onConfirm={handleCreateSubtask}
          onClose={() => setShowAddSubtaskModal(false)}
        >
          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">
                Tiêu đề việc con <span className="text-danger-600">*</span>
              </label>
              <Input
                placeholder="VD: Thu thập số liệu, Thiết kế mẫu biểu..."
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">
                  Người thực hiện <span className="text-danger-600">*</span>
                </label>
                <Select
                  value={subtaskAssigneeId}
                  onChange={(e) => setSubtaskAssigneeId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Mức độ ưu tiên</label>
                <Select
                  value={subtaskPriority}
                  onChange={(e) => setSubtaskPriority(e.target.value as TaskPriority)}
                >
                  <option value="LOW">Thấp (LOW)</option>
                  <option value="NORMAL">Bình thường (NORMAL)</option>
                  <option value="HIGH">Cao (HIGH)</option>
                  <option value="URGENT">Khẩn cấp (URGENT)</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Hạn hoàn thành</label>
                <Input
                  type="date"
                  value={subtaskDueDate}
                  onChange={(e) => setSubtaskDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">Giờ (HH:mm)</label>
                <Input
                  type="time"
                  value={subtaskDueTime}
                  onChange={(e) => setSubtaskDueTime(e.target.value)}
                />
              </div>
            </div>

            {/* Warning if subtask due date exceeds parent due date */}
            {isSubtaskDueAfterParent && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Cảnh báo hạn công việc:</strong> Thời hạn việc con (
                  {subtaskDueAtIso ? formatDateTimeVN(subtaskDueAtIso) : ""}) muộn hơn thời hạn nhiệm vụ cha (
                  {task.dueAt ? formatDateTimeVN(task.dueAt) : ""}). Vui lòng cân nhắc điều chỉnh để tránh trễ hạn nhiệm vụ tổng thể.
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-bold text-text-secondary">Đầu ra / Kết quả yêu cầu</label>
              <Input
                placeholder="VD: Bảng số liệu hoàn chỉnh, tệp word tổng hợp..."
                value={subtaskDeliverable}
                onChange={(e) => setSubtaskDeliverable(e.target.value)}
              />
            </div>
          </div>
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
