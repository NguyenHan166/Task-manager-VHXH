import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { workspaceRepository } from "../../shared/repository";
import { joinChatRoom } from "../../shared/realtime";
import type {
  ChatRoom,
  ChatRoomMember,
  ChatMessage,
  Id,
} from "../../shared/data-contract";
import {
  Breadcrumb,
  Button,
  ConfirmDialog,
  Input,
  UserAvatar,
  EmptyState,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN, formatRelativeVN } from "../../shared/datetime";
import {
  MessageSquare,
  Users,
  Send,
  PlusCircle,
  Search,
  MessagesSquare,
  User as UserIcon,
  Paperclip,
} from "lucide-react";

export function ChatPage() {
  const { currentUser, users } = useSession();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [allMembers, setAllMembers] = useState<ChatRoomMember[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Message input
  const [inputText, setInputText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Search inside active room
  const [roomSearchQuery, setRoomSearchQuery] = useState("");

  // New Conversation Modal
  const [isNewRoomOpen, setIsNewRoomOpen] = useState(false);
  const [newRoomType, setNewRoomType] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [newDirectUserId, setNewDirectUserId] = useState<Id>("u02");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<Id[]>([]);

  const loadChatData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const myRooms = await workspaceRepository.getChatRooms(currentUser.id);
      setRooms(myRooms);

      // Load all members and messages for user's rooms
      const membersPromises = myRooms.map((r) => workspaceRepository.getChatMembers(r.id));
      const messagesPromises = myRooms.map((r) => workspaceRepository.getChatMessages(r.id));

      const [membersNested, messagesNested] = await Promise.all([
        Promise.all(membersPromises),
        Promise.all(messagesPromises),
      ]);

      const flatMembers = membersNested.flat();
      const flatMessages = messagesNested.flat();

      setAllMembers(flatMembers);
      setAllMessages(flatMessages);

      // Handle URL param or default active room
      const paramRoomId = searchParams.get("roomId");
      if (paramRoomId && myRooms.some((r) => r.id === paramRoomId)) {
        setActiveRoomId(paramRoomId);
      } else if (!activeRoomId && myRooms.length > 0) {
        setActiveRoomId(myRooms[0].id);
      } else if (activeRoomId && !myRooms.some((r) => r.id === activeRoomId)) {
        setActiveRoomId(myRooms.length > 0 ? myRooms[0].id : null);
      }
    } catch {
      showToast("Không thể tải danh sách cuộc trò chuyện", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChatData();
    const unsub = workspaceRepository.subscribe(loadChatData);
    return unsub;
  }, [currentUser]);

  // When active room changes, mark as read
  useEffect(() => {
    if (!activeRoomId || !currentUser) return;
    workspaceRepository.markChatRoomAsRead(activeRoomId, currentUser.id).catch(() => {});
  }, [activeRoomId, currentUser]);

  useEffect(() => {
    if (!activeRoomId) return;
    return joinChatRoom(activeRoomId);
  }, [activeRoomId]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeRoomId, allMessages]);

  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === activeRoomId) || null;
  }, [rooms, activeRoomId]);

  const activeRoomMembers = useMemo(() => {
    if (!activeRoomId) return [];
    return allMembers.filter((m) => m.roomId === activeRoomId);
  }, [allMembers, activeRoomId]);

  const activeRoomMessages = useMemo(() => {
    if (!activeRoomId) return [];
    const list = allMessages.filter((m) => m.roomId === activeRoomId);
    if (!roomSearchQuery.trim()) return list;
    const q = roomSearchQuery.toLowerCase().trim();
    return list.filter((m) => m.body.toLowerCase().includes(q));
  }, [allMessages, activeRoomId, roomSearchQuery]);

  // Compute room display title and avatar info
  const getRoomMeta = (room: ChatRoom) => {
    const roomMembers = allMembers.filter((m) => m.roomId === room.id);
    if (room.kind === "DIRECT") {
      const otherMember = roomMembers.find((m) => m.userId !== currentUser?.id);
      const otherUser = otherMember ? users.find((u) => u.id === otherMember.userId) : null;
      return {
        title: otherUser?.displayName || "Đồng nghiệp",
        subtitle: otherUser?.jobTitle || "Chuyên viên",
        avatarName: otherUser?.displayName || "?",
        isDirect: true,
      };
    } else {
      return {
        title: room.title || "Nhóm trao đổi",
        subtitle: `${roomMembers.length} thành viên`,
        avatarName: room.title || "Nhóm",
        isDirect: false,
      };
    }
  };

  // Compute unread count for each room
  const getRoomUnreadCount = (room: ChatRoom) => {
    if (!currentUser) return 0;
    const member = allMembers.find((m) => m.roomId === room.id && m.userId === currentUser.id);
    if (!member) return 0;
    const roomMsgs = allMessages.filter((m) => m.roomId === room.id && m.senderId !== currentUser.id);
    if (!member.lastReadAt) return roomMsgs.length;
    const lastReadTime = new Date(member.lastReadAt).getTime();
    return roomMsgs.filter((m) => new Date(m.createdAt).getTime() > lastReadTime).length;
  };

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setSearchParams({ roomId });
    setRoomSearchQuery("");
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !activeRoomId || (!inputText.trim() && !attachment) || isSending) return;

    const body = inputText.trim() || (attachment ? `Đã gửi tệp: ${attachment.name}` : '');
    const file = attachment;
    setInputText("");
    setAttachment(null);
    setIsSending(true);

    try {
      const message = await workspaceRepository.sendChatMessage(activeRoomId, body, currentUser.id);
      if (file) await workspaceRepository.uploadFile(file, 'MESSAGE', message.id);
      await loadChatData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể gửi tin nhắn";
      showToast(msg, "error");
      setInputText(body); // restore on error
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateNewRoom = async () => {
    if (!currentUser) return;
    try {
      if (newRoomType === "DIRECT") {
        if (!newDirectUserId) {
          showToast("Vui lòng chọn người cần nhắn tin", "error");
          return;
        }
        const room = await workspaceRepository.createChatRoom("DIRECT", null, [newDirectUserId], currentUser.id);
        setIsNewRoomOpen(false);
        setActiveRoomId(room.id);
        setSearchParams({ roomId: room.id });
        showToast("Đã mở cuộc hội thoại trực tiếp", "success");
      } else {
        if (!newGroupTitle.trim()) {
          showToast("Vui lòng nhập tên nhóm trao đổi", "error");
          return;
        }
        if (newGroupMemberIds.length === 0) {
          showToast("Vui lòng chọn ít nhất một thành viên cho nhóm", "error");
          return;
        }
        const room = await workspaceRepository.createChatRoom(
          "GROUP",
          newGroupTitle.trim(),
          newGroupMemberIds,
          currentUser.id
        );
        setIsNewRoomOpen(false);
        setActiveRoomId(room.id);
        setSearchParams({ roomId: room.id });
        setNewGroupTitle("");
        setNewGroupMemberIds([]);
        showToast(`Đã tạo nhóm [${room.title}] thành công`, "success");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo cuộc hội thoại";
      showToast(msg, "error");
    }
  };

  const toggleGroupMember = (uid: Id) => {
    if (newGroupMemberIds.includes(uid)) {
      setNewGroupMemberIds(newGroupMemberIds.filter((id) => id !== uid));
    } else {
      setNewGroupMemberIds([...newGroupMemberIds, uid]);
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Tin nhắn & Hội thoại" }]} />

        {/* Disclaimer Bar */}
        <div className="bg-purple-50/70 border border-purple-200 rounded-lg px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <MessagesSquare className="w-4 h-4 text-purple-700 shrink-0" />
            <span>
              <strong>Bản xem trước P1:</strong> Tin nhắn được đồng bộ tức thì qua kho MockDb và localStorage. Đổi tài khoản demo để thấy cùng dòng lịch sử trao đổi.
            </span>
          </div>
          <span className="font-semibold text-purple-800 text-[11px] bg-purple-100 px-2 py-0.5 rounded w-fit">
            Không sử dụng WebSocket giả lập
          </span>
        </div>

        {/* Main Messenger Layout */}
        <div className="bg-surface rounded-card border border-border shadow-xs overflow-hidden h-[calc(100vh-230px)] min-h-[520px] flex">
          {/* LEFT: Rooms list (Sidebar) */}
          <div className="w-80 border-r border-border flex flex-col bg-slate-50/50 shrink-0">
            {/* Rooms Header */}
            <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface">
              <div className="font-bold text-sm text-text-primary flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-700" />
                Hội thoại ({rooms.length})
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 px-2 text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  const defaultOther = users.find((u) => u.id !== currentUser?.id);
                  if (defaultOther) setNewDirectUserId(defaultOther.id);
                  setIsNewRoomOpen(true);
                }}
              >
                <PlusCircle className="w-3.5 h-3.5" /> Tạo mới
              </Button>
            </div>

            {/* Rooms List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {rooms.length === 0 && !isLoading ? (
                <div className="text-center py-12 px-4 text-xs text-text-muted space-y-2">
                  <MessagesSquare className="w-8 h-8 mx-auto text-slate-300" />
                  <div>Bạn chưa tham gia cuộc hội thoại nào.</div>
                </div>
              ) : (
                rooms.map((room) => {
                  const meta = getRoomMeta(room);
                  const unread = getRoomUnreadCount(room);
                  const isCurrent = room.id === activeRoomId;
                  const roomMsgs = allMessages.filter((m) => m.roomId === room.id);
                  const lastMsg = roomMsgs[roomMsgs.length - 1];

                  return (
                    <div
                      key={room.id}
                      onClick={() => handleSelectRoom(room.id)}
                      className={`p-3 cursor-pointer transition-colors flex items-start gap-3 ${
                        isCurrent
                          ? "bg-brand-50/60 border-l-4 border-l-brand-700"
                          : "hover:bg-slate-100/70"
                      }`}
                    >
                      {meta.isDirect ? (
                        <UserAvatar name={meta.avatarName} size="md" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                          <Users className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <div className="font-semibold text-xs text-text-primary truncate">
                            {meta.title}
                          </div>
                          {lastMsg && (
                            <span className="text-[10px] text-text-muted shrink-0">
                              {formatRelativeVN(lastMsg.createdAt)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-text-secondary truncate">
                            {lastMsg ? lastMsg.body : meta.subtitle}
                          </div>
                          {unread > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-danger-600 text-white shrink-0">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

            {/* RIGHT: Active Room Conversation */}
          <div className="flex-1 flex flex-col bg-surface min-w-0">
            {activeRoom ? (
              <>
                {/* Active Room Header */}
                <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {getRoomMeta(activeRoom).isDirect ? (
                      <UserAvatar name={getRoomMeta(activeRoom).avatarName} size="sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-text-primary truncate flex items-center gap-2">
                        <span>{getRoomMeta(activeRoom).title}</span>
                        <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded text-text-muted">
                          {activeRoom.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-muted truncate">
                        {activeRoom.kind === "DIRECT"
                          ? "Hội thoại 1-1 riêng tư"
                          : `Nhóm ${activeRoomMembers.length} thành viên: ${activeRoomMembers
                              .map((m) => users.find((u) => u.id === m.userId)?.displayName)
                              .filter(Boolean)
                              .join(", ")}`}
                      </div>
                    </div>
                  </div>

                  {/* Search within active room messages */}
                  <div className="relative w-48 shrink-0">
                    <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2" />
                    <Input
                      placeholder="Tìm tin nhắn..."
                      value={roomSearchQuery}
                      onChange={(e) => setRoomSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                  {activeRoomMessages.length === 0 ? (
                    <div className="text-center py-16 text-xs text-text-muted space-y-2">
                      <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                      <div>
                        {roomSearchQuery
                          ? `Không tìm thấy tin nhắn nào chứa "${roomSearchQuery}"`
                          : "Chưa có tin nhắn nào trong hội thoại này. Hãy gửi tin nhắn đầu tiên!"}
                      </div>
                    </div>
                  ) : (
                    activeRoomMessages.map((msg) => {
                      const isMe = msg.senderId === currentUser?.id;
                      const sender = users.find((u) => u.id === msg.senderId);

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}
                        >
                          {!isMe && (
                            <UserAvatar name={sender?.displayName || "N/A"} size="sm" />
                          )}

                          <div
                            className={`max-w-md space-y-1 ${
                              isMe ? "items-end text-right" : "items-start text-left"
                            }`}
                          >
                            <div className="flex items-center gap-2 text-[10px] text-text-muted">
                              {!isMe && (
                                <span className="font-semibold text-text-secondary">
                                  {sender?.displayName || msg.senderId}
                                </span>
                              )}
                              <span>{formatDateTimeVN(msg.createdAt)}</span>
                            </div>

                            <div
                              className={`p-3 rounded-2xl text-xs leading-relaxed break-words shadow-2xs ${
                                isMe
                                  ? "bg-brand-700 text-white rounded-tr-xs"
                                  : "bg-surface text-text-primary border border-border rounded-tl-xs"
                              }`}
                            >
                              {msg.body}
                            </div>
                            {((msg as ChatMessage & { fileLinks?: Array<{ file: { id: string; originalName: string } }> }).fileLinks ?? []).map(({ file }) => (
                              <button
                                key={file.id}
                                type="button"
                                className="block text-[11px] font-medium text-brand-700 hover:underline"
                                onClick={async () => {
                                  try {
                                    const url = await workspaceRepository.getDownloadUrl(file.id);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch (error) {
                                    showToast(error instanceof Error ? error.message : 'Không thể tải tệp', 'error');
                                  }
                                }}
                              >
                                {file.originalName}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Box */}
                <div className="p-3 border-t border-border bg-surface">
                  <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                    <input type="file" className="hidden" id="chat-attachment" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
                    <Button variant="outline" size="sm" type="button" className="h-[38px] px-3 shrink-0" onClick={() => document.getElementById('chat-attachment')?.click()} title="Đính kèm tệp">
                      <Paperclip className="w-3.5 h-3.5" />
                    </Button>
                    <textarea
                      rows={1}
                      placeholder={`Gửi tin nhắn trong ${getRoomMeta(activeRoom).title}... (Enter để gửi)`}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 resize-none rounded-md border border-border px-3 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-brand-500 max-h-24 min-h-[38px] leading-relaxed"
                    />

                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      disabled={(!inputText.trim() && !attachment) || isSending}
                      className="h-[38px] px-3 gap-1 shrink-0 bg-brand-700 hover:bg-brand-800 text-white"
                    >
                      <Send className="w-3.5 h-3.5" /> Gửi
                    </Button>
                  </form>
                  {attachment && <div className="mt-1 text-[11px] text-text-secondary">Tệp đính kèm: {attachment.name}</div>}
                </div>
              </>
            ) : (
              <EmptyState
                title="Chưa chọn cuộc hội thoại"
                description="Chọn một cuộc trò chuyện từ danh sách bên trái hoặc tạo hội thoại mới để bắt đầu nhắn tin trao đổi."
                icon={<MessagesSquare className="w-8 h-8 text-slate-400" />}
              />
            )}
          </div>
        </div>

        {/* Modal Tạo cuộc trò chuyện mới */}
        <ConfirmDialog
          isOpen={isNewRoomOpen}
          onClose={() => setIsNewRoomOpen(false)}
          onConfirm={handleCreateNewRoom}
          title="Tạo cuộc hội thoại mới"
          confirmText="Bắt đầu trò chuyện"
          cancelText="Hủy"
        >
          <div className="space-y-4 pt-2 text-xs">
            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewRoomType("DIRECT")}
                className={`py-2 px-3 rounded-md border text-center font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  newRoomType === "DIRECT"
                    ? "bg-brand-50 border-brand-500 text-brand-700"
                    : "border-border text-text-secondary hover:bg-slate-50"
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" /> Nhắn tin 1-1
              </button>

              <button
                type="button"
                onClick={() => setNewRoomType("GROUP")}
                className={`py-2 px-3 rounded-md border text-center font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  newRoomType === "GROUP"
                    ? "bg-purple-50 border-purple-500 text-purple-700"
                    : "border-border text-text-secondary hover:bg-slate-50"
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Tạo nhóm trao đổi
              </button>
            </div>

            {newRoomType === "DIRECT" ? (
              <div className="space-y-1.5">
                <label className="font-bold text-text-secondary">
                  Chọn đồng nghiệp cần trao đổi <span className="text-danger-600">*</span>
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-border rounded p-2 bg-slate-50/50">
                  {users
                    .filter((u) => u.id !== currentUser?.id)
                    .map((u) => (
                      <label
                        key={u.id}
                        className={`flex items-center gap-2.5 p-2 rounded cursor-pointer transition-colors ${
                          newDirectUserId === u.id ? "bg-brand-50 text-brand-800 font-semibold" : "hover:bg-slate-100"
                        }`}
                      >
                        <input
                          type="radio"
                          name="directUser"
                          checked={newDirectUserId === u.id}
                          onChange={() => setNewDirectUserId(u.id)}
                          className="accent-brand-700"
                        />
                        <UserAvatar name={u.displayName} size="sm" />
                        <div>
                          <div>{u.displayName}</div>
                          <div className="text-[10px] text-text-muted">{u.jobTitle}</div>
                        </div>
                      </label>
                    ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-text-secondary">
                    Tên nhóm trao đổi <span className="text-danger-600">*</span>
                  </label>
                  <Input
                    placeholder="VD: Nhóm dự án Chuyển đổi số, Tổ công tác..."
                    value={newGroupTitle}
                    onChange={(e) => setNewGroupTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-text-secondary">
                    Chọn các thành viên vào nhóm <span className="text-danger-600">*</span>
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border border-border rounded p-2 bg-slate-50/50">
                    {users
                      .filter((u) => u.id !== currentUser?.id)
                      .map((u) => (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2.5 p-1.5 rounded cursor-pointer transition-colors ${
                            newGroupMemberIds.includes(u.id)
                              ? "bg-purple-50 text-purple-900 font-semibold"
                              : "hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newGroupMemberIds.includes(u.id)}
                            onChange={() => toggleGroupMember(u.id)}
                            className="accent-purple-700 rounded"
                          />
                          <UserAvatar name={u.displayName} size="sm" />
                          <div className="text-xs">
                            <div>{u.displayName}</div>
                            <div className="text-[10px] text-text-muted">{u.jobTitle}</div>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
