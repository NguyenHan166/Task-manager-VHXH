import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository, isMockMode } from "../../shared/repository";
import type { Notification, Task, TaskParticipant } from "../../shared/data-contract";
import { canSeeTask } from "../../shared/data-contract";
import {
  Breadcrumb,
  PageHeader,
  Button,
  ConfirmDialog,
  UserAvatar,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  MessageSquare,
  Users,
  BellRing,
  Lock,
} from "lucide-react";

export function NotificationsPage() {
  const { currentUser, users } = useSession();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggeringReminder, setIsTriggeringReminder] = useState(false);

  // Limited Team Invite Modal
  const [inviteModalData, setInviteModalData] = useState<{
    notification: Notification;
    task: Task;
    participant: TaskParticipant;
  } | null>(null);
  const [isRespondingInvite, setIsRespondingInvite] = useState(false);

  const loadNotifications = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const notifs = await workspaceRepository.getNotifications(currentUser.id);
      setNotifications(notifs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const unsub = workspaceRepository.subscribe(loadNotifications);
    return unsub;
  }, [currentUser]);

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    await workspaceRepository.markAllNotificationsAsRead(currentUser.id);
    showToast("Đã đánh dấu tất cả thông báo là đã đọc", "success");
  };

  const handleMarkRead = async (id: string) => {
    await workspaceRepository.markNotificationAsRead(id);
  };

  // Trigger Mock Reminders Demo
  const handleTriggerMockReminders = async () => {
    if (!currentUser) return;
    setIsTriggeringReminder(true);
    try {
      const res = await workspaceRepository.triggerMockReminders(currentUser.id);
      if (res.createdCount > 0) {
        showToast(
          `Đã chạy nhắc hạn mẫu: Tạo ${res.createdCount} thông báo mới (Mô phỏng scheduler 24h/quá hạn)`,
          "success"
        );
      } else {
        showToast(
          "Không có thông báo mới: Tất cả công việc đến hạn đã được nhắc trước đó (chống trùng lặp).",
          "info"
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    } finally {
      setIsTriggeringReminder(false);
    }
  };

  // Open Notification target
  const handleOpenNotification = async (n: Notification) => {
    await handleMarkRead(n.id);

    if (!isMockMode && !n.entityId) {
      showToast("Thông báo đã được đọc nhưng không còn công việc có thể mở theo quyền hiện tại.", "warning");
      return;
    }

    if (n.entityType === "CHAT") {
      navigate(`/chat?roomId=${n.entityId}`);
      return;
    }

    if (n.entityType === "TASK") {
      if (!isMockMode) {
        navigate(`/tasks/${n.entityId}`);
        return;
      }
      // If TEAM_INVITED, open limited invitation card
      if (n.type === "TEAM_INVITED") {
        try {
          const [foundTask, parts] = await Promise.all([
            workspaceRepository.getTaskById(n.entityId),
            workspaceRepository.getParticipants(n.entityId),
          ]);
          if (!foundTask) {
            showToast("Nhiệm vụ này không còn tồn tại.", "error");
            return;
          }
          const part = parts.find((p) => p.userId === currentUser?.id);
          if (!part) {
            showToast("Bạn không có trong danh sách lời mời của nhiệm vụ này.", "error");
            return;
          }

          // If already accepted, go to task
          if (part.invitationStatus === "ACCEPTED") {
            navigate(`/tasks/${n.entityId}`);
            return;
          }

          // Open limited modal
          setInviteModalData({ notification: n, task: foundTask, participant: part });
          return;
        } catch {
          showToast("Không thể tải thông tin lời mời.", "error");
          return;
        }
      }

      // Check access permission for standard task notifications
      try {
        const [foundTask, parts] = await Promise.all([
          workspaceRepository.getTaskById(n.entityId),
          workspaceRepository.getParticipants(n.entityId),
        ]);
        if (!foundTask || !currentUser) {
          showToast("Không tìm thấy nhiệm vụ tương ứng.", "error");
          return;
        }

        const canView = canSeeTask(foundTask, currentUser, parts);
        if (!canView) {
          showToast(
            "Không có quyền truy cập hoặc thực thể đã bị thay đổi quyền riêng tư.",
            "warning"
          );
          return;
        }

        navigate(`/tasks/${n.entityId}`);
      } catch {
        showToast("Không thể kiểm tra quyền truy cập công việc.", "error");
      }
    }
  };

  // Respond to Team Invitation from limited modal
  const handleDecisionInvite = async (decision: "ACCEPTED" | "DECLINED") => {
    if (!currentUser || !inviteModalData) return;
    setIsRespondingInvite(true);
    try {
      await workspaceRepository.respondInvitation(
        inviteModalData.participant.id,
        decision,
        currentUser.id
      );
      await workspaceRepository.markNotificationAsRead(inviteModalData.notification.id);

      showToast(
        decision === "ACCEPTED"
          ? "Đã đồng ý tham gia công việc nhóm thành công"
          : "Đã từ chối lời mời tham gia",
        "success"
      );

      const targetTaskId = inviteModalData.task.id;
      setInviteModalData(null);

      if (decision === "ACCEPTED") {
        navigate(`/tasks/${targetTaskId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast(msg, "error");
    } finally {
      setIsRespondingInvite(false);
    }
  };

  const filteredNotifs =
    filter === "UNREAD"
      ? notifications.filter((n) => !n.readAt)
      : notifications;

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        <Breadcrumb items={[{ label: "Thông báo" }]} />

        <PageHeader
          title="Thông báo của bạn"
          subtitle="Nhật ký các sự kiện liên quan đến công việc được giao, kết quả duyệt, lời mời và tin nhắn."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {isMockMode && <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerMockReminders}
                isLoading={isTriggeringReminder}
                className="gap-1.5 text-brand-700 border-brand-300 hover:bg-brand-50"
                title="Mô phỏng scheduler quét hạn 24h & quá hạn"
              >
                <BellRing className="w-3.5 h-3.5 text-brand-700" /> Chạy nhắc hạn mẫu (Demo)
              </Button>}

              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Đánh dấu tất cả đã đọc
              </Button>
            </div>
          }
        />

        {/* Scheduler Disclaimer */}
        {isMockMode && <div className="p-3 bg-slate-50 border border-border/80 rounded-lg text-xs text-text-secondary flex items-start gap-2">
          <Clock className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Mô phỏng nhắc hạn:</strong> Nút "Chạy nhắc hạn mẫu" quét các mốc 24 giờ trước hạn và quá hạn theo <code>dueAt</code>. Hệ thống ngăn chặn việc gửi trùng lặp cho cùng người và nhiệm vụ. Đây là mô phỏng scheduler, không chạy cron ngầm trong trình duyệt.
          </div>
        </div>}

        {/* Filter tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-btn text-xs font-semibold transition-colors ${
              filter === "ALL"
                ? "bg-brand-50 text-brand-700"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Tất cả ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("UNREAD")}
            className={`px-3 py-1.5 rounded-btn text-xs font-semibold transition-colors ${
              filter === "UNREAD"
                ? "bg-brand-50 text-brand-700"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Chưa đọc ({notifications.filter((n) => !n.readAt).length})
          </button>
        </div>

        {/* Notification List */}
        {filteredNotifs.length === 0 && !isLoading ? (
          <EmptyState
            title="Không có thông báo mới"
            description="Tất cả thông báo đã được xem. Khi có cập nhật mới về nhiệm vụ hoặc tin nhắn, bạn sẽ nhận được thông báo tại đây."
            icon={<Bell className="w-8 h-8 text-slate-400" />}
          />
        ) : (
          <div className="space-y-2.5">
            {filteredNotifs.map((n) => {
              const isUnread = !n.readAt;
              const isInvite = n.type === "TEAM_INVITED";
              const isChat = n.entityType === "CHAT";

              return (
                <div
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  className={`p-4 rounded-card border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                    isUnread
                      ? "bg-brand-50/40 border-brand-200/80 shadow-xs hover:bg-brand-50/60"
                      : "bg-surface border-border hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        isUnread ? "bg-brand-700 ring-4 ring-brand-100" : "bg-transparent"
                      }`}
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text-primary">
                          {n.title}
                        </span>
                        {isInvite && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Users className="w-3 h-3" /> Lời mời việc nhóm
                          </span>
                        )}
                        {isChat && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Tin nhắn
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-text-secondary leading-relaxed">
                        {n.body}
                      </div>

                      <div
                        className="text-[11px] text-text-muted flex items-center gap-1 pt-1"
                        title={formatDateTimeVN(n.createdAt)}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeVN(n.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isInvite ? (
                      <Button
                        variant="primary"
                        size="sm"
                        className="h-8 px-3 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNotification(n);
                        }}
                      >
                        <Users className="w-3 h-3" /> Xem lời mời
                      </Button>
                    ) : isChat ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 text-purple-700 border-purple-200 hover:bg-purple-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNotification(n);
                        }}
                      >
                        Mở chat <MessageSquare className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNotification(n);
                        }}
                      >
                        Xem việc <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Thẻ lời mời giới hạn thông tin (TEAM_INVITED) */}
        {inviteModalData && (
          <ConfirmDialog
            isOpen={!!inviteModalData}
            onClose={() => setInviteModalData(null)}
            title="Lời mời tham gia công việc nhóm"
            confirmText="Đồng ý tham gia"
            cancelText="Từ chối"
            isLoading={isRespondingInvite}
            onConfirm={() => handleDecisionInvite("ACCEPTED")}
            onCancel={() => handleDecisionInvite("DECLINED")}
          >
            <div className="space-y-4 pt-1 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 leading-relaxed flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Thẻ lời mời giới hạn thông tin:</strong> Bạn chưa chính thức vào danh sách thành viên thực hiện. Chưa chấp nhận thì không thể xem toàn bộ chi tiết, tài liệu và trao đổi của nhiệm vụ.
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-border rounded space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="text-text-muted">Mã nhiệm vụ:</span>
                  <span className="font-mono font-bold text-text-primary bg-white px-2 py-0.5 rounded border border-border/60">
                    {inviteModalData.task.code}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-text-muted">Tên công việc:</div>
                  <div className="font-semibold text-sm text-text-primary">
                    {inviteModalData.task.title}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-t border-border/60">
                  <span className="text-text-muted">Người mời:</span>
                  <div className="flex items-center gap-1.5 font-medium text-text-primary">
                    <UserAvatar
                      name={
                        users.find((u) => u.id === inviteModalData.task.createdById)?.displayName ||
                        "N/A"
                      }
                      size="sm"
                    />
                    <span>
                      {users.find((u) => u.id === inviteModalData.task.createdById)?.displayName ||
                        inviteModalData.task.createdById}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-t border-border/60">
                  <span className="text-text-muted">Vai trò được giao:</span>
                  <span className="font-semibold text-brand-700">
                    {inviteModalData.participant.role === "COLLABORATOR"
                      ? "Người phối hợp thực hiện"
                      : "Người theo dõi"}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-text-muted italic text-center">
                Bấm "Đồng ý tham gia" để xác nhận và mở trang chi tiết nhiệm vụ, hoặc "Từ chối" để hủy lời mời.
              </p>
            </div>
          </ConfirmDialog>
        )}
      </div>
    </AppShell>
  );
}
