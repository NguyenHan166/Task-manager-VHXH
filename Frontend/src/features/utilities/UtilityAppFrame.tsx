import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wrench } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { Breadcrumb, Button, PageHeader } from "../../components/ui";

interface UtilityAppFrameProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function UtilityAppFrame({ title, description, children }: UtilityAppFrameProps) {
  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Tiện ích", href: "/utilities" }, { label: title }]} />
        <PageHeader
          title={title}
          subtitle={description}
          badge={(
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <Wrench className="h-3.5 w-3.5" /> Mini app
            </span>
          )}
          actions={(
            <Link to="/utilities">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Tất cả tiện ích
              </Button>
            </Link>
          )}
        />
        {children}
      </div>
    </AppShell>
  );
}
