import { ReactNode } from "react";
import ShareBellControls from "@/components/shared/ShareBellControls";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="hidden lg:block bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="page-header truncate">{title}</h1>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {children}
          <ShareBellControls variant="light" />
        </div>
      </div>
    </div>
  );
}
