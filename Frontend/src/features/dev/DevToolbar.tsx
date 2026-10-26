import { useState } from "react";
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
} from "lucide-react";

export function DevToolbar() {
  const { users, currentUser, switchUser } = useSession();
  const [isOpen, setIsOpen] = useState(true);
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
      className="fixed bottom-3 right-3 z-50 max-w-xl w-[calc(100vw-24px)] md:w-auto text-xs font-sans shadow-xl border border-border bg-surface/95 backdrop-blur-md rounded-xl transition-all"
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
        <div className="p-3.5 space-y-3">
          {/* Role switcher */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-text-secondary flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-brand-700" />
                Đổi vai trò demo (5 tài khoản seed):
              </span>
              <span className="text-[11px] text-text-muted italic">
                (Phiên demo lưu trên trình duyệt)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
              {users.map((u) => {
                const isActive = currentUser?.id === u.id;
                const isManager = u.role === "MANAGER";
                const isLocked = u.status !== "ACTIVE";
                return (
                  <button
                    key={u.id}
                    disabled={isLocked}
                    onClick={() => !isLocked && switchUser(u.id)}
                    title={isLocked ? "Tài khoản bị khóa" : u.displayName}
                    className={`flex items-center sm:flex-col sm:items-center text-left sm:text-center p-2 rounded-lg border transition-all ${
                      isActive
                        ? "border-brand-700 bg-brand-50 text-brand-800 ring-1 ring-brand-700"
                        : isLocked
                        ? "border-border bg-slate-50 opacity-40 cursor-not-allowed text-text-muted"
                        : "border-border hover:bg-slate-50 text-text-primary"
                    }`}
                  >
                    <UserAvatar user={u} size="sm" showRoleBadge />
                    <div className="ml-2 sm:ml-0 sm:mt-1">
                      <div className="font-semibold truncate max-w-[90px]">{u.displayName}</div>
                      <div className="text-[10px] text-text-muted">
                        {isLocked ? "Đã khóa" : isManager ? "Trưởng phòng" : "Chuyên viên"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
