'use client';

import { FileType, Users, Calendar, MapPin } from 'lucide-react';
import React, { forwardRef } from 'react';
import { Button } from '@/components/ui/button';

const FilterButton = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <Button
    variant="ghost"
    className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-foreground shadow-sm hover:bg-accent transition-colors"
  >
    {icon}
    <span>{label}</span>
  </Button>
);

export const FilterBar = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`flex flex-wrap items-center justify-center gap-3 transition-all duration-300 ${className}`}
      {...props}
    >
      <FilterButton icon={<FileType size={16} />} label="Type" />
      <FilterButton icon={<Users size={16} />} label="People" />
      <FilterButton icon={<Calendar size={16} />} label="Modified" />
      <FilterButton icon={<MapPin size={16} />} label="Location" />
    </div>
  )
);

FilterBar.displayName = 'FilterBar';
