import { useState, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import {
  PageHeader,
  SectionHeader,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  StatCard,
  StatusBadge,
  PriorityBadge,
  TaskTypeBadge,
  OverdueBadge,
  BlockedBadge,
  UserAvatar,
  Input,
  Textarea,
  Select,
  EmptyState,
  ErrorState,
  SkeletonCard,
  ConfirmDialog,
  useToast,
  FilterBar,
  DataTable,
  TaskCard,
  TimelineItem,
} from "../components/ui";
import { mockRepository } from "../mocks/mock-repository";
import type { Task, User, TaskEvent } from "../shared/data-contract";
import { formatDateTimeVN, formatRelativeVN } from "../shared/datetime";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  FileText,
  Clock,
  Sparkles,
  Plus,
  Save,
  Trash2,
  Send,
  Eye,
} from "lucide-react";

export function UiKitPage() {
  const { showToast } = useToast();

  // Seed sample data for showcasing components
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [inputText, setInputText] = useState("");
  const [selectVal, setSelectVal] = useState("option1");
  const [searchVal, setSearchVal] = useState("");

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const loadSampleData = async () => {
      try {
        const [taskList, userList, eventList] = await Promise.all([
          mockRepository.getTasks(),
          mockRepository.getUsers(),
          mockRepository.getEvents(),
        ]);
        setTasks(taskList);
        setUsers(userList);
        setEvents(eventList);
      } finally {
        setIsLoading(false);
      }
    };
    loadSampleData();
  }, []);

  // Palette definitions according to Prompt 01A
  const colorTokens = [
    { name: "brand-700", hex: "#0F766E", desc: "Nút chính, link chính, sidebar active, focus ring", bg: "bg-brand-700", text: "text-white" },
    { name: "brand-800", hex: "#115E59", desc: "Hover của nút chính", bg: "bg-brand-800", text: "text-white" },
    { name: "brand-100", hex: "#CCFBF1", desc: "Nền nhấn rất nhẹ, chip active", bg: "bg-brand-100", text: "text-brand-800" },
    { name: "brand-50", hex: "#F0FDFA", desc: "Nền khu lời chào, hover nhạt", bg: "bg-brand-50", text: "text-brand-800" },
    { name: "canvas", hex: "#F7F9FB", desc: "Nền toàn ứng dụng", bg: "bg-[#F7F9FB]", text: "text-text-primary" },
    { name: "surface", hex: "#FFFFFF", desc: "Card, sidebar, topbar, modal dialog", bg: "bg-[#FFFFFF]", text: "text-text-primary", border: true },
    { name: "text-primary", hex: "#0F172A", desc: "Tiêu đề, dữ liệu chính, văn bản chính", bg: "bg-text-primary", text: "text-white" },
    { name: "text-secondary", hex: "#475569", desc: "Nội dung phụ, mô tả, nhãn trường", bg: "bg-text-secondary", text: "text-white" },
    { name: "text-muted", hex: "#64748B", desc: "Chú thích, placeholder, icon phụ", bg: "bg-text-muted", text: "text-white" },
    { name: "border", hex: "#E2E8F0", desc: "Viền card, input, ngăn cách bảng", bg: "bg-border", text: "text-text-primary" },
    { name: "info", hex: "#2563EB", desc: "Trạng thái cần làm, thông báo thông tin", bg: "bg-info", text: "text-white" },
    { name: "success", hex: "#15803D", desc: "Hoàn thành, thành công, đúng hạn", bg: "bg-success", text: "text-white" },
    { name: "warning", hex: "#B45309", desc: "Đang làm, vướng mắc, cần chú ý", bg: "bg-warning", text: "text-white" },
    { name: "danger", hex: "#B91C1C", desc: "Quá hạn, lỗi mạng, hủy bỏ", bg: "bg-danger", text: "text-white" },
    { name: "review", hex: "#7C3AED", desc: "Chờ duyệt kết quả, nộp báo cáo", bg: "bg-review", text: "text-white" },
  ];

  // Table columns definition for sample table
  const columns = [
    {
      key: "code",
      header: "Mã việc",
      width: "110px",
      render: (t: Task) => (
        <span className="font-mono font-semibold text-text-primary">{t.code}</span>
      ),
    },
    {
      key: "type",
      header: "Loại việc",
      width: "120px",
      render: (t: Task) => <TaskTypeBadge type={t.type} />,
    },
    {
      key: "title",
      header: "Tên công việc",
      render: (t: Task) => (
        <div className="space-y-0.5">
          <div className="font-semibold text-text-primary line-clamp-1">{t.title}</div>
          <div className="text-[11px] text-text-muted line-clamp-1">{t.deliverable}</div>
        </div>
      ),
    },
    {
      key: "assignee",
      header: "Người chủ trì",
      width: "160px",
      render: (t: Task) => {
        const u = users.find((user) => user.id === t.primaryAssigneeId);
        return (
          <div className="flex items-center gap-2">
            <UserAvatar user={u} size="sm" />
            <span className="truncate font-medium">{u?.displayName || "Chưa giao"}</span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "130px",
      render: (t: Task) => <StatusBadge status={t.status} />,
    },
    {
      key: "priority",
      header: "Mức ưu tiên",
      width: "110px",
      render: (t: Task) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: "dueAt",
      header: "Hạn xử lý",
      width: "140px",
      render: (t: Task) => (
        <span className="text-text-secondary" title={formatDateTimeVN(t.dueAt)}>
          {formatRelativeVN(t.dueAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Thao tác",
      width: "90px",
      render: () => (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-text-muted hover:text-brand-700">
          <Eye className="w-3.5 h-3.5 mr-1" /> Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-10 pb-16">
        {/* Page Header */}
        <PageHeader
          title="Hệ thống Thiết kế & UI Kit"
          subtitle="Tài liệu trực quan về bảng màu, typography, khoảng cách và các thành phần giao diện dùng chung của Office Workspace."
          badge={
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Prompt 01A
            </span>
          }
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => showToast("Đã kích hoạt hệ thống thiết kế thành công!", "success")}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Thử thông báo Toast
            </Button>
          }
        />

        {/* 1. BẢNG MÀU CỐ ĐỊNH */}
        <section className="space-y-4">
          <SectionHeader
            title="1. Bảng màu cố định (Color Tokens)"
            description="Tất cả mã màu hex cố định bắt buộc tuân thủ Prompt 01A. Tuyệt đối không tự ý chọn màu khác ở từng màn hình."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {colorTokens.map((token) => (
              <div
                key={token.name}
                className={`rounded-card border border-border p-3 bg-surface shadow-xs flex flex-col justify-between`}
              >
                <div>
                  <div
                    className={`h-12 w-full rounded-btn ${token.bg} ${
                      token.border ? "border border-border" : ""
                    } shadow-xs mb-2.5`}
                  />
                  <div className="font-mono font-bold text-xs text-text-primary">
                    {token.name}
                  </div>
                  <div className="font-mono text-[11px] text-text-muted font-medium">
                    {token.hex}
                  </div>
                </div>
                <div className="text-[11px] text-text-secondary mt-2 pt-2 border-t border-border/60">
                  {token.desc}
                </div>
              </div>
            ))}
          </div>

          {/* Status Badges Matrix */}
          <div className="mt-4 p-5 rounded-card bg-surface border border-border">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Màu trạng thái chuẩn cho Badge và Biểu đồ
            </h3>
            <div className="flex flex-wrap gap-3 items-center">
              <StatusBadge status="DRAFT" />
              <StatusBadge status="TODO" />
              <StatusBadge status="IN_PROGRESS" />
              <StatusBadge status="IN_REVIEW" />
              <StatusBadge status="DONE" />
              <StatusBadge status="CANCELLED" />
              <OverdueBadge />
              <BlockedBadge reason="Đang vướng số liệu phối hợp" />
            </div>
          </div>
        </section>

        {/* 2. TYPOGRAPHY */}
        <section className="space-y-4">
          <SectionHeader
            title="2. Typography & Nhịp bố cục"
            description="Font chữ chính thức Be Vietnam Pro, số liệu KPI hiển thị tabular numerals."
          />

          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-1 pb-4 border-b border-border/70">
                <div className="text-xs font-mono text-text-muted">H1 Trang — 28px / line-height 36px / Weight 700</div>
                <h1 className="text-[28px] leading-[36px] font-bold text-text-primary">
                  Tổng hợp báo cáo tiến độ quý IV năm 2026
                </h1>
              </div>

              <div className="space-y-1 pb-4 border-b border-border/70">
                <div className="text-xs font-mono text-text-muted">H2 Khu vực — 20px / line-height 28px / Weight 650</div>
                <h2 className="text-[20px] leading-[28px] font-semibold text-text-primary">
                  Danh sách nhiệm vụ cần xử lý ngay trong ngày
                </h2>
              </div>

              <div className="space-y-1 pb-4 border-b border-border/70">
                <div className="text-xs font-mono text-text-muted">H3 Card — 16px / line-height 24px / Weight 600</div>
                <h3 className="text-[16px] leading-[24px] font-semibold text-text-primary">
                  Thông tin kết quả nộp phê duyệt từ Chuyên viên
                </h3>
              </div>

              <div className="space-y-1 pb-4 border-b border-border/70">
                <div className="text-xs font-mono text-text-muted">Body Text — 14px / line-height 22px / Weight 400-500</div>
                <p className="text-sm leading-[22px] text-text-secondary max-w-2xl">
                  Ứng dụng quản lý công việc nội bộ được thiết kế phẳng, gọn gàng, tương phản cao để đảm bảo người dùng dễ dàng quét nhanh thông tin mà không bị rối mắt bởi các chi tiết thừa.
                </p>
              </div>

              <div className="space-y-1 pb-4 border-b border-border/70">
                <div className="text-xs font-mono text-text-muted">Secondary Label — 12px / line-height 18px / Weight 400</div>
                <p className="text-xs leading-[18px] text-text-muted">
                  Cập nhật lần cuối: 16:30 26/10/2026 bởi Nguyễn Văn An (Trưởng phòng)
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-mono text-text-muted">KPI Numbers — 28–32px / Weight 700 / Tabular Numerals</div>
                <div className="flex items-baseline gap-6 font-bold tabular-nums">
                  <span className="text-[32px] text-brand-700">07</span>
                  <span className="text-[32px] text-info">24</span>
                  <span className="text-[32px] text-warning">12</span>
                  <span className="text-[32px] text-success">98%</span>
                  <span className="text-[32px] text-danger">01</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3. BUTTONS & ACTIONS */}
        <section className="space-y-4">
          <SectionHeader
            title="3. Nút bấm & Tương tác (Buttons)"
            description="Hành động chính cao 40px, nút compact cao 36px, bo góc 10px, hiệu ứng hover/focus rõ nét."
          />

          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-text-muted">Các kiểu nút (Variants):</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">
                    <Save className="w-4 h-4 mr-1.5" /> Nút chính (Primary)
                  </Button>
                  <Button variant="secondary">
                    <Plus className="w-4 h-4 mr-1.5" /> Nút phụ (Secondary)
                  </Button>
                  <Button variant="outline">Nút viền (Outline)</Button>
                  <Button variant="ghost">Nút mờ (Ghost)</Button>
                  <Button variant="danger">
                    <Trash2 className="w-4 h-4 mr-1.5" /> Nút nguy hiểm (Danger)
                  </Button>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-border/70">
                <div className="text-xs font-semibold text-text-muted">Kích thước (Sizes):</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Compact (36px / sm)</Button>
                  <Button size="md">Tiêu chuẩn (40px / md)</Button>
                  <Button size="lg">Lớn (44px / lg)</Button>
                  <Button isLoading>Đang lưu...</Button>
                  <Button disabled>Vô hiệu hóa</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 4. FORM CONTROLS */}
        <section className="space-y-4">
          <SectionHeader
            title="4. Trường nhập liệu (Form Controls)"
            description="Label ở trên, dấu bắt buộc rõ ràng, chiều cao 40px, thông báo lỗi ngay dưới input."
          />

          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                <Input
                  label="Tên nhiệm vụ"
                  placeholder="Ví dụ: Hoàn thiện báo cáo quý..."
                  required
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  hint="Nhập tên ngắn gọn, rõ ràng theo quy định."
                />

                <Input
                  label="Trường có lỗi xác thực"
                  placeholder="Nhập dữ liệu..."
                  required
                  defaultValue=""
                  error="Vui lòng nhập thông tin hợp lệ (bắt buộc)."
                />

                <Select
                  label="Mức độ ưu tiên"
                  required
                  value={selectVal}
                  onChange={(e) => setSelectVal(e.target.value)}
                  options={[
                    { label: "Bình thường (Normal)", value: "option1" },
                    { label: "Cao (High)", value: "option2" },
                    { label: "Khẩn cấp (Urgent)", value: "option3" },
                  ]}
                />

                <div className="md:col-span-2">
                  <Textarea
                    label="Mô tả công việc và yêu cầu kết quả"
                    placeholder="Mô tả cụ thể phạm vi và tài liệu kết quả cần nộp..."
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 5. STAT CARDS / CARD KPI */}
        <section className="space-y-4">
          <SectionHeader
            title="5. Thẻ thống kê (Card KPI - StatCard)"
            description="Biểu tượng trong ô nền nhạt, số lớn tabular numerals, có biến thể màu sắc theo ngữ nghĩa."
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Việc chính thức"
              value="07"
              description="Đang có hiệu lực"
              variant="brand"
              icon={<FolderKanban className="w-5 h-5" />}
              onClick={() => showToast("Xem chi tiết việc chính thức", "info")}
            />
            <StatCard
              label="Chưa làm"
              value="02"
              description="Cần phân bổ triển khai"
              variant="info"
              icon={<Clock className="w-5 h-5" />}
            />
            <StatCard
              label="Đang làm"
              value="02"
              description="Tiến độ đang thực hiện"
              variant="warning"
              icon={<Layers className="w-5 h-5" />}
            />
            <StatCard
              label="Chờ duyệt"
              value="01"
              description="Đã nộp kết quả"
              variant="review"
              icon={<FileText className="w-5 h-5" />}
            />
            <StatCard
              label="Hoàn thành"
              value="02"
              description="Đúng hạn: 1/2"
              variant="success"
              icon={<CheckCircle2 className="w-5 h-5" />}
            />
            <StatCard
              label="Quá hạn"
              value="01"
              description="Cần đôn đốc khẩn"
              variant="danger"
              icon={<AlertTriangle className="w-5 h-5" />}
              onClick={() => showToast("Xem danh sách công việc quá hạn", "error")}
            />
          </div>
        </section>

        {/* 6. SAMPLE DATA TABLE */}
        <section className="space-y-4">
          <SectionHeader
            title="6. Bảng dữ liệu chuẩn (DataTable)"
            description="Header 44px, hàng chuẩn 52px, hover nền brand-50, nút thao tác ở cuối hàng."
          />

          <FilterBar
            searchValue={searchVal}
            onSearchChange={setSearchVal}
            searchPlaceholder="Tìm theo mã việc hoặc tiêu đề..."
            activeFilterCount={searchVal ? 1 : 0}
            onClearFilters={() => setSearchVal("")}
          />

          <DataTable
            columns={columns}
            data={tasks.slice(0, 5)}
            keyExtractor={(t) => t.id}
            isLoading={isLoading}
          />
        </section>

        {/* 7. TASK CARDS (GRID VIEW) */}
        <section className="space-y-4">
          <SectionHeader
            title="7. Thẻ công việc (TaskCard)"
            description="Dạng lưới dùng cho chế độ Kanban, màn hình thu gọn hoặc thiết bị di động."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.slice(0, 3).map((t) => {
              const assignee = users.find((u) => u.id === t.primaryAssigneeId);
              return (
                <TaskCard
                  key={t.id}
                  task={t}
                  assignee={assignee}
                  onClick={() => showToast(`Chọn xem ${t.code}`, "info")}
                />
              );
            })}
          </div>
        </section>

        {/* 8. TIMELINE ITEM */}
        <section className="space-y-4">
          <SectionHeader
            title="8. Dòng thời gian lịch sử (TimelineItem)"
            description="Ghi nhận từng hành động thay đổi, nộp duyệt, hủy và phân công."
          />

          <Card>
            <CardHeader>
              <CardTitle>Nhật ký sự kiện gần đây</CardTitle>
              <CardDescription>Trích xuất từ kho mock event trail</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="max-w-2xl">
                {events.slice(0, 4).map((evt, idx) => {
                  const actor = users.find((u) => u.id === evt.actorId);
                  return (
                    <TimelineItem
                      key={evt.id}
                      event={evt}
                      actor={actor}
                      isLast={idx === 3}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 9. EMPTY, ERROR & SKELETON STATES */}
        <section className="space-y-4">
          <SectionHeader
            title="9. Trạng thái rỗng, lỗi và tải dữ liệu (States)"
            description="Giao diện đồng bộ cho trạng thái đang tải, chưa có dữ liệu và có sự cố."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Empty state */}
            <EmptyState
              title="Không tìm thấy nhiệm vụ"
              description="Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các tiêu chí lọc."
              action={
                <Button variant="outline" size="sm">
                  Xóa bộ lọc
                </Button>
              }
            />

            {/* Error state */}
            <ErrorState
              title="Máy chủ tạm thời bận"
              message="Đã phát sinh sự cố kết nối mock. Bạn có thể nhấn nút bên dưới để thử lại."
              onRetry={() => showToast("Đang kết nối lại...", "info")}
            />

            {/* Skeleton loading */}
            <SkeletonCard />
          </div>
        </section>

        {/* 10. MODAL DIALOG & TOAST DEMO */}
        <section className="space-y-4">
          <SectionHeader
            title="10. Hộp thoại xác nhận & Toast (Overlays)"
            description="Dialog xác nhận gọn gàng, hỗ trợ hành động nguy hiểm và thông báo trạng thái nổi."
          />

          <Card>
            <CardContent className="p-6 flex flex-wrap gap-4 items-center">
              <Button
                variant="danger"
                onClick={() => setIsDialogOpen(true)}
                className="gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Mở ConfirmDialog xác nhận
              </Button>

              <div className="h-6 w-px bg-border hidden sm:block" />

              <span className="text-xs text-text-muted font-medium">Kích hoạt Toast:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => showToast("Thao tác thực hiện thành công!", "success")}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                Thành công
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => showToast("Đã xảy ra lỗi khi lưu dữ liệu!", "error")}
                className="text-danger border-red-200 hover:bg-red-50"
              >
                Báo lỗi
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => showToast("Vui lòng chú ý thời hạn công việc sắp đến.", "warning")}
                className="text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                Cảnh báo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => showToast("Hệ thống đã tự động sao lưu dữ liệu.", "info")}
                className="text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                Thông tin
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Modal Dialog Instance */}
        <ConfirmDialog
          isOpen={isDialogOpen}
          title="Xác nhận hủy nhiệm vụ này?"
          description="Hành động này sẽ chuyển trạng thái công việc sang 'Đã hủy'. Lịch sử và dữ liệu liên quan sẽ được lưu lại trong nhật ký sự kiện."
          confirmLabel="Đồng ý hủy"
          cancelLabel="Đóng lại"
          variant="danger"
          onConfirm={() => {
            setIsDialogOpen(false);
            showToast("Đã hủy nhiệm vụ thành công.", "success");
          }}
          onCancel={() => setIsDialogOpen(false)}
        />
      </div>
    </AppShell>
  );
}
