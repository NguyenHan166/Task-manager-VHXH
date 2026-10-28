import React from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";
import { PageHeader, Breadcrumb, Button, Card, CardContent } from "../ui";
import { Sparkles, Construction, ArrowLeft, Home } from "lucide-react";

export interface PlaceholderPageProps {
  title: string;
  description: string;
  breadcrumbLabel: string;
  promptNote: string; // e.g. "Prompt 06 — Dự án & Lịch việc"
  icon?: React.ReactNode;
}

export function PlaceholderPage({
  title,
  description,
  breadcrumbLabel,
  promptNote,
  icon,
}: PlaceholderPageProps) {
  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: breadcrumbLabel }]} />

        <PageHeader
          title={title}
          subtitle={description}
          badge={
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
              <Construction className="w-3.5 h-3.5" /> Sắp hoàn thiện trong bước tiếp theo
            </span>
          }
        />

        <Card className="border-dashed border-2 border-border/80 bg-slate-50/50">
          <CardContent className="p-10 sm:p-14 text-center max-w-lg mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto shadow-xs">
              {icon || <Construction className="w-8 h-8 text-brand-700" />}
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800">
                <Sparkles className="w-3.5 h-3.5" /> Kế hoạch triển khai: {promptNote}
              </div>
              <h3 className="text-lg font-bold text-text-primary tracking-tight">
                Phân hệ đang được chuẩn bị
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Giao diện và nghiệp vụ chi tiết của <strong>{title}</strong> sẽ được xây dựng hoàn thiện ở các prompt tiếp theo theo đúng hợp đồng dữ liệu. Dữ liệu mock backend đã sẵn sàng phục vụ phân hệ này.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-center gap-3">
              <Link to="/tasks">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" /> Danh sách công việc
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="primary" size="sm" className="gap-1.5">
                  <Home className="w-3.5 h-3.5" /> Về trang Tổng quan
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
