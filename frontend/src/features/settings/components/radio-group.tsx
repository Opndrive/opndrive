'use client';

import { cn } from '@/shared/utils/utils';

interface RadioOption<T> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
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
  return (
    <div className={cn('space-y-2', className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex items-start space-x-4 p-4 rounded-lg border cursor-pointer transition-all duration-200',
            value === option.value
              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
              : 'border-border hover:border-border/80 hover:bg-accent/30',
            option.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex-shrink-0 mt-0.5">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => !option.disabled && onValueChange(option.value)}
              disabled={option.disabled}
              className="w-4 h-4 text-primary border-border focus:ring-primary focus:ring-2 focus:ring-offset-0"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-foreground">{option.label}</span>
              {option.badge && (
                <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-md">
                  {option.badge}
                </span>
              )}
            </div>
            {option.description && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {option.description}
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
