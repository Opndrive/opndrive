'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/utils/utils';
import { DashboardNavbar } from '@/features/dashboard/components/layout/navbar/dashboard-navbar';
import { SettingsSidebar } from '@/features/settings/components/settings-sidebar';
import { SettingsTab } from '@/features/settings/types';
import { SettingsProvider } from '@/features/settings/context/settings-context';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Sidebar localStorage key
  const lsKey = useMemo(() => 'sidebarOpen_settings', []);

  useEffect(() => {
    function checkScreenSize() {
      setIsSmallScreen(window.innerWidth < 1024);
    }
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(lsKey);
    if (saved !== null) {
      setIsSidebarOpen(saved === 'true');
    } else if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [lsKey]);

  useEffect(() => {
    if (isSidebarOpen && isSmallScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen, isSmallScreen]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(lsKey, next.toString());
      return next;
    });
  };

  const closeSidebar = () => {
    if (window.innerWidth >= 1024) return;
    setIsSidebarOpen(false);
    localStorage.setItem(lsKey, 'false');
  };

  const handleBack = () => {
    router.push('/dashboard');
  };

  return (
    <>
      {/* Keep the same navbar as dashboard */}
      <DashboardNavbar toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 min-h-0">
        {/* Overlay for mobile */}
        {isSidebarOpen && isSmallScreen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Settings Sidebar - matches dashboard sidebar styling exactly */}
        <div
          className={cn(
            'bg-secondary flex flex-col z-50 h-[calc(100vh-3.5rem)] fixed lg:relative left-0 w-64 overflow-x-hidden',
            'transition-all duration-300 ease-in-out',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:translate-x-0',
            isSidebarOpen ? 'lg:w-64' : 'lg:w-0'
          )}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
            {/* Back button and Settings title - matches SidebarCreateButton styling */}
            <button
              onClick={handleBack}
              className="flex items-center w-full px-4 py-3 mb-4 text-sm font-medium bg-card text-card-foreground border border-border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5 mr-3 flex-shrink-0" />
              <span>Settings</span>
            </button>

            {/* Settings Navigation - matches sidebar items spacing */}
            <div className="space-y-1 mb-4">
              <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div
          className={cn(
            'flex flex-1 flex-col min-h-0 lg:mb-4 lg:mr-4',
            !isSidebarOpen ? 'lg:ml-4' : ''
          )}
        >
          <div className="flex flex-1 flex-col min-h-0 rounded-3xl border border-border/20 bg-background">
            <div className="rounded-t-3xl overflow-hidden" />
            <main className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 scroll-smooth custom-scrollbar">
              <div className="max-w-4xl mx-auto">
                {/* Create context provider to pass activeTab */}
                <SettingsProvider activeTab={activeTab}>{children}</SettingsProvider>
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
