import { cn } from './utils';

/**
 * The one description of a sidebar navigation row.
 *
 * Three rows render this shape: `SidebarItem` and `SidebarDropdown` in the
 * dashboard, and `SettingsSidebar` in settings. Each was carrying its own copy
 * of the class list, and the copies had already drifted - the settings layout
 * still claims its back button "matches SidebarCreateButton styling" while
 * using different padding and a different font size.
 *
 * Sizing the icon rather than a box around it was the same failure one level
 * down: two places describing one thing, and only one of them corrected. A row
 * that cannot be described in two places cannot drift.
 */
export interface SidebarRowOptions {
  /** Row for the current route. */
  isActive?: boolean;
  /** Child row inside an open dropdown, indented under its parent. */
  isNested?: boolean;
  /** Non-interactive row. Wins over `isActive`, which cannot apply to it. */
  isDisabled?: boolean;
  /** Caller-supplied extras, merged last so they win. */
  className?: string;
}

export function sidebarRowClasses({
  isActive = false,
  isNested = false,
  isDisabled = false,
  className,
}: SidebarRowOptions = {}): string {
  return cn(
    'flex w-full items-center rounded-lg px-3 py-2 text-sm',
    // Not `transition-all`: it animates every animatable property, including
    // ones nothing here changes. Only colour actually transitions on hover.
    'transition-colors duration-200 ease-in-out',
    isNested && 'ml-6',
    isDisabled
      ? 'cursor-not-allowed opacity-50 text-secondary-foreground'
      : cn(
          'cursor-pointer',
          isActive
            ? 'bg-primary text-primary-foreground font-medium shadow-sm'
            : 'text-secondary-foreground hover:bg-accent hover:text-foreground'
        ),
    className
  );
}

/**
 * Badge pill on a nav row, right-aligned so it reads as a count against the
 * row rather than as part of the label. `ml-auto` in both rows: the dropdown
 * used to right-align nothing and sit its badge against the title instead.
 *
 * `py-0.5` rather than `py-1` so a row carrying a badge is not taller than one
 * without it.
 */
export function sidebarBadgeClasses({ isActive = false }: { isActive?: boolean } = {}): string {
  return cn(
    'ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-xs',
    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
  );
}
