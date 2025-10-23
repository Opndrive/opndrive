'use client';

import React from 'react';
import { Check, LucideIcon } from 'lucide-react';

export interface RadioOption<T = string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  tags?: {
    label: string;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'info';
  }[];
}

export interface CustomRadioSelectProps<T = string> {
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  name?: string;
  className?: string;
}

const tagVariantStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] dark:text-[#4ade80]',
  warning: 'bg-[rgba(249,115,22,0.1)] text-[#f97316] dark:text-[#fb923c]',
  info: 'bg-[rgba(59,130,246,0.1)] text-[#3b82f6] dark:text-[#60a5fa]',
};

export function CustomRadioSelect<T = string>({
  options,
  value,
  onChange,
  name = 'custom-radio-select',
  className = '',
}: CustomRadioSelectProps<T>) {
  return (
    <div className={`space-y-3 ${className}`}>
      {options.map((option) => {
        const isSelected = value === option.value;
        const Icon = option.icon;

        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            }`}
            role="radio"
            aria-checked={isSelected}
            aria-labelledby={`${name}-${String(option.value)}-label`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              {Icon && (
                <div
                  className={`flex-shrink-0 mt-0.5 ${
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                {/* Label and Check Icon */}
                <div className="flex items-center gap-2 mb-1">
                  <h4
                    id={`${name}-${String(option.value)}-label`}
                    className="font-medium text-foreground"
                  >
                    {option.label}
                  </h4>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>

                {/* Description */}
                {option.description && (
                  <p className="text-sm text-muted-foreground mb-3">{option.description}</p>
                )}

                {/* Tags */}
                {option.tags && option.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {option.tags.map((tag, index) => (
                      <span
                        key={index}
                        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          tagVariantStyles[tag.variant || 'default']
                        }`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
