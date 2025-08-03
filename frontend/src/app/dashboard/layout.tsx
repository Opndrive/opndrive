import type React from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // <UnifiedRoleGuard>
    <div className="flex min-h-screen flex-col">
      <main className="flex w-full flex-1 flex-col overflow-hidden">{children}</main>
    </div>
    // </UnifiedRoleGuard>
  );
}
