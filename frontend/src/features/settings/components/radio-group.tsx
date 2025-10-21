'use client';

import {
  CustomRadioSelect,
  RadioOption as CustomRadioOption,
} from '@/shared/components/custom-radio-select';
import { MdHomeFilled } from 'react-icons/md';
import { PiHardDrivesFill } from 'react-icons/pi';
import { LucideIcon } from 'lucide-react';
import React from 'react';

interface RadioOption<T> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }> | LucideIcon;
}

interface RadioGroupProps<T> {
  value: T;
  onValueChange: (value: T) => void;
  options: RadioOption<T>[];
  name: string;
  className?: string;
}

export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  name,
  className,
}: RadioGroupProps<T>) {
  // Convert RadioOption to CustomRadioSelect's RadioOption format
  const customRadioOptions: CustomRadioOption<T>[] = options.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
    // Pass icon directly - CustomRadioSelect now supports both types
    icon: option.icon,
    // Convert badge to a tag if present
    tags: option.badge ? [{ label: option.badge, variant: 'default' as const }] : undefined,
  }));

  return (
    <CustomRadioSelect
      options={customRadioOptions}
      value={value}
      onChange={onValueChange}
      name={name}
      className={className}
    />
  );
}

// Export icons for use
export { MdHomeFilled, PiHardDrivesFill };
