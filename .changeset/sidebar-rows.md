---
'frontend': patch
---

Give the three sidebar rows one description, and fix what the copies hid

Sizing the nav icon on a wrapper rather than on the icon was one description of
a row disagreeing with another. The same shape turned out to be true one level
up: `SidebarItem`, `SidebarDropdown` and the settings sidebar each carried their
own copy of the row's classes, down to the active and hover states, and the
copies had already drifted - the settings layout still claims its back button
matches `SidebarCreateButton` while using different padding and a different font
size. All three now share `sidebarRowClasses`, so a change to how a row looks
reaches every row rather than two of them.

Fixed along the way:

- The active row reports `aria-current`, the dropdown reports `aria-expanded`
  and `aria-controls`, and decorative icons are `aria-hidden`. The dropdown's
  panel is hidden rather than unmounted so the id it points at always resolves,
  which also keeps collapsed children out of the tab order. Escape closes the
  mobile drawer.
- A badge of `0` rendered a bare `0` beside the label, because zero is falsy but
  still a valid React child. Badges are right-aligned in both rows now rather
  than right-aligned in one and against the title in the other.
- `disabled` was in the type and read by nothing. A disabled row renders as a
  span rather than a link, is out of the tab order, and is never treated as the
  current page.
- Sections auto-opened for the current route only while nothing had been saved,
  so the behaviour stopped working after the first time a section was toggled.
  Open state is derived during render instead: the route opens a section the
  user has never touched, and an explicit choice wins over it.
- The sidebar tracked the viewport with a `resize` listener that set state on
  every event fired while a window was being dragged. It uses `matchMedia`,
  which fires when the breakpoint is actually crossed.
- Sidebar state is read once during the first render instead of by an effect
  racing two others, and its key carries a version. Expanded sections reset once
  on first load after this ships.
- `groupSidebarItems` returned a single section with `showSeparator: false`
  whatever it was given, so the separator could never draw and the loop around
  it could only run once. The sidebar maps its items directly; grouping can come
  back described by data when something needs it.
- Removed `formatBytes`, `calculateUsagePercentage`, `getStorageKeyForRole` and
  `SidebarStorageProps`, none of which had a caller, and the dead `group` class
  on rows that had no `group-*` variant. `SidebarItem` was declared twice, in
  the config and in the sidebar's types, and only one copy knew about `badge`
  and `disabled`; the components own it now.
- `SidebarCreateButton` imported `CreateMenu` through a barrel that re-exports
  sixteen modules, and rows animated with `transition-all` where only colour
  changes.
