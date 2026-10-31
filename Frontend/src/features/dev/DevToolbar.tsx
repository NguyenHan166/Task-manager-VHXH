import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import { Button } from "../../components/ui/Button";
import { UserAvatar } from "../../components/ui/Avatar";
import {
  RotateCcw,
  Bug,
  UserCheck,
  ChevronUp,
  ChevronDown,
  Database,
  BellRing,
  Shield,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
} from "lucide-react";

export function DevToolbar() {
  const { users, currentUser, switchUser, isManager, isDeputy, isStaff } = useSession();
  const [isOpen, setIsOpen] = useState(true);
  const [showPermissionsPreview, setShowPermissionsPreview] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(() =>
    mockRepository.getSimulateFailure()
  );

  const handleToggleFailure = () => {
    const nextVal = !simulateFailure;
    mockRepository.setSimulateFailure(nextVal);
    setSimulateFailure(nextVal);
  };

  const handleResetSeed = async () => {
    if (
      !window.confirm(
        "Khôi phục kho dữ liệu mock về trạng thái chuẩn theo thời điểm hiện tại? Các thay đổi thử nghiệm sẽ được làm mới."
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      await mockRepository.resetSeed();
    } finally {
      setIsResetting(false);
    }
  };

  const handleTriggerMockReminders = async () => {
    if (!currentUser) return;
    try {
      const res = await mockRepository.triggerMockReminders(currentUser.id);
      if (res.createdCount > 0) {
        alert(`Đã chạy nhắc hạn mẫu: Tạo ${res.createdCount} thông báo mới (Mô phỏng scheduler 24h & quá hạn).`);
      } else {
        alert("Không có thông báo mới: Tất cả công việc đến hạn đã được nhắc trước đó (chống trùng lặp).");
      }
    } catch {
      alert("Lỗi khi chạy nhắc hạn mẫu");
    }
  };

  return (
    <aside
      aria-label="Khung điều khiển thử nghiệm phát triển"
      className="fixed bottom-3 right-3 z-50 max-w-2xl w-[calc(100vw-24px)] md:w-auto text-xs font-sans shadow-2xl border border-border bg-surface/95 backdrop-blur-md rounded-xl transition-all"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 text-white rounded-t-xl select-none">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-brand-100" />
          <span className="font-semibold text-[13px] tracking-wide">
            Dev Tools & Role Switcher
          </span>
          <span className="bg-slate-700 text-slate-200 text-[10px] px-1.5 py-0.5 rounded font-mono">
            Mock DB v1
          </span>

          {/* Current role pill indicator */}
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isManager
                ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                : isDeputy
                ? "bg-indigo-950 text-indigo-300 border border-indigo-700/60"
                : "bg-blue-950 text-blue-300 border border-blue-700/60"
            }`}
          >
            {isManager && <Shield className="w-3 h-3 text-emerald-400" />}
            {isDeputy && <ShieldCheck className="w-3 h-3 text-indigo-400" />}
            {isStaff && <UserCheck className="w-3 h-3 text-blue-400" />}
            {isManager
              ? "Trưởng phòng (Quản trị và điều hành)"
              : isDeputy
              ? "Phó phòng (Điều hành - Không quản trị)"
              : "Chuyên viên (Staff)"}
          </span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Thu nhỏ thanh công cụ" : "Mở rộng thanh công cụ"}
          className="text-slate-400 hover:text-white transition-colors p-1"
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-3.5 space-y-3 max-h-[85vh] overflow-y-auto">
          {/* Role switcher */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-text-secondary flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-brand-700" />
                Đổi vai trò demo ({users.length} tài khoản seed):
              </span>
              <button
                onClick={() => setShowPermissionsPreview(!showPermissionsPreview)}
                className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {showPermissionsPreview ? "Ẩn ma trận quyền" : "🔍 Preview ma trận quyền (3 vai trò)"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
              {users.map((u) => {
                const isActive = currentUser?.id === u.id;
                const isUserMgr = u.role === "MANAGER";
                const isUserDep = u.role === "DEPUTY_MANAGER";
                const isLocked = u.status !== "ACTIVE";
                return (
                  <button
                    key={u.id}
                    disabled={isLocked}
                    onClick={() => !isLocked && switchUser(u.id)}
                    title={isLocked ? "Tài khoản bị khóa" : `${u.displayName} (${u.jobTitle})`}
                    className={`flex items-center sm:flex-col sm:items-center text-left sm:text-center p-2 rounded-lg border transition-all ${
                      isActive
                        ? isUserMgr
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 font-semibold"
                          : isUserDep
                          ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 font-semibold"
                          : "border-brand-700 bg-brand-50 text-brand-800 ring-1 ring-brand-700 font-semibold"
                        : isLocked
                        ? "border-border bg-slate-50 opacity-40 cursor-not-allowed text-text-muted"
                        : "border-border hover:bg-slate-50 text-text-primary"
                    }`}
                  >
                    <UserAvatar user={u} size="sm" showRoleBadge />
                    <div className="ml-2 sm:ml-0 sm:mt-1 min-w-0">
                      <div className="font-semibold truncate max-w-[85px]">{u.displayName}</div>
                      <div className="text-[10px] text-text-muted truncate">
                        {isLocked
                          ? "Đã khóa"
                          : isUserMgr
                          ? "Trưởng phòng"
                          : isUserDep
                          ? "Phó phòng"
                          : "Chuyên viên"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PERMISSIONS PREVIEW MATRIX PANEL */}
          {showPermissionsPreview && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 animate-fade-in text-xs">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-brand-700" />
                    Bảng đối chiếu Ma trận Phân quyền (3 Vai trò)
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Rà soát ranh giới giữa <strong>Điều hành chuyên môn</strong> (Trưởng & Phó phòng) và <strong>Quản trị hệ thống</strong> (Chỉ Trưởng phòng).
                  </div>
                </div>
                <button
                  onClick={() => setShowPermissionsPreview(false)}
                  className="text-slate-400 hover:text-slate-700 p-0.5"
                  aria-label="Đóng bảng phân quyền"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto border border-slate-200 rounded bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                      <th className="p-2 font-semibold w-2/5">Chức năng & Phân quyền</th>
                      <th className="p-2 font-semibold text-center text-emerald-800 bg-emerald-50/60 w-1/5 border-l border-slate-200">
                        Trưởng phòng<br />
                        <span className="font-mono text-[9px] font-normal text-emerald-700">MANAGER</span>
                      </th>
                      <th className="p-2 font-semibold text-center text-indigo-800 bg-indigo-50/60 w-1/5 border-l border-slate-200">
                        Phó phòng<br />
                        <span className="font-mono text-[9px] font-normal text-indigo-700">DEPUTY_MANAGER</span>
                      </th>
                      <th className="p-2 font-semibold text-center text-blue-800 bg-blue-50/60 w-1/5 border-l border-slate-200">
                        Chuyên viên<br />
                        <span className="font-mono text-[9px] font-normal text-blue-700">STAFF</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* SECTION 1: ĐIỀU HÀNH CHUYÊN MÔN */}
                    <tr className="bg-slate-50 font-bold text-slate-700">
                      <td colSpan={4} className="p-1.5 pl-2 text-[10px] uppercase tracking-wider bg-slate-100/80">
                        🔹 Khối 1: Điều hành & Quản lý Công việc (Chuyên môn)
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Giao việc & Lưu nháp</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-400">
                        <X className="w-3.5 h-3.5 inline text-slate-300 mr-1" /> Không
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Xem tất cả việc chính thức của cả phòng</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-500">
                        Chỉ việc tham gia
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Phê duyệt / Trả lại kết quả nộp (/approvals)</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-400">
                        <X className="w-3.5 h-3.5 inline text-slate-300 mr-1" /> Không
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Điều chỉnh việc chính thức (Hạn, người XLC, ưu tiên)</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Trực tiếp đổi
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Trực tiếp đổi
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-500">
                        Chỉ gửi đề nghị
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Quyết định đề nghị gia hạn & Đổi người chủ trì</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-400">
                        <X className="w-3.5 h-3.5 inline text-slate-300 mr-1" /> Không
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Hủy & Mở lại nhiệm vụ chính thức</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Có
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-400">
                        <X className="w-3.5 h-3.5 inline text-slate-300 mr-1" /> Không
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Nhiệm vụ định kỳ (/recurrence)</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> CRUD & Phát hành
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> CRUD & Phát hành
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-blue-700">
                        <Check className="w-3.5 h-3.5 inline text-blue-600 mr-1" /> Xem & Báo cáo
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Dashboard điều hành & KPI toàn phòng (/dashboard)</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-500">
                        Dashboard cá nhân
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700">Báo cáo thống kê toàn phòng & Xuất dữ liệu (/reports)</td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-indigo-700 bg-indigo-50/30">
                        <Check className="w-3.5 h-3.5 inline text-indigo-600 mr-1" /> Toàn phòng
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 text-slate-500">
                        Chỉ xem bản thân
                      </td>
                    </tr>

                    {/* SECTION 2: QUẢN TRỊ HỆ THỐNG */}
                    <tr className="bg-slate-50 font-bold text-slate-700">
                      <td colSpan={4} className="p-1.5 pl-2 text-[10px] uppercase tracking-wider bg-amber-50 text-amber-900 border-t border-slate-200">
                        🔒 Khối 2: Quản trị Hệ thống (Chỉ Trưởng phòng kiêm Quản trị)
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700 font-medium">
                        Quản lý thành viên (/members)
                        <span className="block text-[10px] text-slate-500 font-normal">Tạo tài khoản, sửa hồ sơ, phân vai trò</span>
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có quyền
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700 font-medium">
                        Khóa / Mở khóa tài khoản thành viên
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có quyền
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700 font-medium">
                        Cài đặt hệ thống (/settings)
                        <span className="block text-[10px] text-slate-500 font-normal">Tên phòng, múi giờ, quy tắc nhắc hạn, dung lượng</span>
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có quyền
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-700 font-medium">
                        Nhật ký kiểm toán (Audit Logs) & Sao lưu JSON
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5 inline text-emerald-600 mr-1" /> Có quyền
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                      <td className="p-2 text-center border-l border-slate-100 font-semibold text-danger bg-red-50/40">
                        <X className="w-3.5 h-3.5 inline text-danger mr-1" /> Chặn 403
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Quick Test Navigation Links */}
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 text-brand-700" />
                  Bấm thử để kiểm tra phân quyền thực tế với vai trò hiện tại (
                  <strong>
                    {isManager ? "Trưởng phòng" : isDeputy ? "Phó phòng" : "Chuyên viên"}
                  </strong>
                  ):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    to="/approvals"
                    className="px-2 py-1 bg-white border border-slate-200 hover:border-brand-500 rounded text-[11px] text-slate-700 hover:text-brand-700"
                  >
                    Chờ duyệt (/approvals) {isManager || isDeputy ? "✅ Cho phép" : "❌ Chặn 403"}
                  </Link>
                  <Link
                    to="/recurrence"
                    className="px-2 py-1 bg-white border border-slate-200 hover:border-brand-500 rounded text-[11px] text-slate-700 hover:text-brand-700"
                  >
                    Nhiệm vụ định kỳ (/recurrence) ✅ Cho phép cả 3 vai trò
                  </Link>
                  <Link
                    to="/members"
                    className={`px-2 py-1 border rounded text-[11px] ${
                      isManager
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-red-50 border-red-300 text-danger hover:bg-red-100"
                    }`}
                  >
                    Quản lý thành viên (/members) {isManager ? "✅ Cho phép" : "🚫 Thử vào để xem 403"}
                  </Link>
                  <Link
                    to="/settings"
                    className={`px-2 py-1 border rounded text-[11px] ${
                      isManager
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-red-50 border-red-300 text-danger hover:bg-red-100"
                    }`}
                  >
                    Cài đặt hệ thống (/settings) {isManager ? "✅ Cho phép" : "🚫 Thử vào để xem 403"}
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
            {/* Failure Simulation */}
            <button
              onClick={handleToggleFailure}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-btn font-medium transition-colors border ${
                simulateFailure
                  ? "bg-red-50 text-danger border-red-200 hover:bg-red-100"
                  : "bg-surface text-text-secondary border-border hover:bg-slate-100"
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Mô phỏng lỗi API: </span>
              <span
                className={`font-bold ${
                  simulateFailure ? "text-danger" : "text-emerald-600"
                }`}
              >
                {simulateFailure ? "BẬT" : "TẮT"}
              </span>
            </button>

            {/* Trigger Mock Reminders Button */}
            <button
              onClick={handleTriggerMockReminders}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn font-medium transition-colors border bg-surface text-brand-700 border-brand-200 hover:bg-brand-50"
              title="Mô phỏng scheduler quét hạn 24h & quá hạn"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Chạy nhắc hạn mẫu</span>
            </button>

            {/* Reset Seed Button */}
            <Button
              variant="outline"
              size="sm"
              isLoading={isResetting}
              onClick={handleResetSeed}
              className="border-slate-300 text-text-secondary hover:text-danger hover:border-red-300 hover:bg-red-50 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset seed dữ liệu mẫu
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
