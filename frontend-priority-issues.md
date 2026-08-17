# Top 10 Frontend Priority Issues — Opndrive/opndrive

Generated from open issues via the GitHub CLI on 2026-08-13.

**How these were selected:** the repo has no `frontend` label. The closest
frontend-scoped labels are `ui`, `accessibility`, `state-management`, `search`,
and `performance`, and the only priority label in use is `priority: high`
(applied to just two open issues). Issues were pulled with
`gh issue list -R opndrive/opndrive --state open --json number,title,url,labels,comments,body`,
filtered to those frontend labels, then ranked by: `priority: high` first, then
blast radius (data integrity and session correctness), then broken-in-production
bugs, then accessibility and structural defects. Comment/reaction counts were
not a useful signal here — nearly every issue in this set has zero comments.

---

## #85 — Files and folders cannot be opened with a keyboard

- **URL:** https://github.com/Opndrive/opndrive/issues/85
- **Labels:** `bug`, `priority: high`, `ui`, `accessibility`

`FolderItem` and the file item components are plain `<div>`s with
`onClick`/`onDoubleClick` and no `role`, `tabIndex`, or `onKeyDown`, so the
entire file browser is unreachable by keyboard and screen readers see unlabeled
text. This is high priority because it blocks the core interaction of the whole
app for keyboard and assistive-tech users — and the overflow menu button inside
each item _is_ a real `<button>`, producing a tab order that skips the items but
stops on their menus.

## #83 — No error boundaries anywhere: one render error blanks the whole app

- **URL:** https://github.com/Opndrive/opndrive/issues/83
- **Labels:** `bug`, `enhancement`, `priority: high`, `ui`

There is no `error.tsx`, `global-error.tsx`, or `ErrorBoundary` anywhere in the
frontend, so in the App Router any uncaught render error unmounts the tree and
leaves a blank page recoverable only by manual reload. High priority because
render paths do real parsing of S3 data (keys, extensions, dates) and the
pdf/xlsx/monaco preview viewers parse untrusted file content — a single
malformed key is enough to take down the whole UI.

## #99 — Closing the tab mid-delete leaves a partial delete with no record

- **URL:** https://github.com/Opndrive/opndrive/issues/99
- **Labels:** `bug`, `data-integrity`, `state-management`

Folder deletes walk chunks of 1000 keys in a loop; closing the tab partway stops
the loop with some objects deleted, the rest remaining, and nothing recording
where it stopped. This is a data-integrity issue: on reload the folder may still
list, or may have vanished while its contents are still billed, and the user has
no way to tell what happened or resume.

## #97 — Delete operations keep running after navigation and after logout

- **URL:** https://github.com/Opndrive/opndrive/issues/97
- **Labels:** `bug`, `s3-api`, `state-management`

`useDeleteOperations` owns its AbortControllers inside the hook with no effect
cleanup, so the only abort path is the user pressing Cancel. The serious case is
logout: `clearSession` nulls the provider but the running loop holds the old
reference, so a delete keeps deleting with the previous session's credentials —
a destructive operation outliving the session that authorized it.

## #80 — Advanced search sheet doesn't do anything

- **URL:** https://github.com/Opndrive/opndrive/issues/80
- **Labels:** `bug`, `search`, `ui`

The advanced search sheet collects twelve filter values and then throws all of
them away — `handleSearch` is just `onClose()`. High priority because it is a
fully styled dialog with a prominent Search button that silently does nothing,
so users will conclude filtering is broken; it also needs scoping work, since
most fields (Owner, Shared drives, Starred, In bin) are Google Drive concepts
with no S3 equivalent.

## #95 — Rapid folder clicks and double-clicked Show More cause duplicate fetches

- **URL:** https://github.com/Opndrive/opndrive/issues/95
- **Labels:** `bug`, `performance`, `state-management`

Two races in the drive store: `fetchData` skips only on status `'ready'`, so
returning to a folder whose request is still `'loading'` fires a second
identical request, and `loadMoreData` reads `nextToken` at call time, so two
Show More clicks in the same tick fetch and append the same page twice. Nothing
corrupts S3, but the list visibly duplicates items and the count goes wrong on
exactly the slow connections where it matters most.

## #92 — Folder names with emoji or accents get silently mangled

- **URL:** https://github.com/Opndrive/opndrive/issues/92
- **Labels:** `bug`, `enhancement`, `ui`

`sanitizeFolderName` strips everything outside `[a-zA-Z0-9\-_.\s()]`, so
`Café ☕` becomes `Caf__` and `文档` becomes `__`, with no warning to the user.
It ranks high because the three validation paths contradict each other —
`isValidFolderName` accepts the name, the dialog shows rules matching neither
function, and sanitization then quietly creates a folder under a different name
than the user typed.

## #96 — Modals have no focus trap and do not restore focus on close

- **URL:** https://github.com/Opndrive/opndrive/issues/96
- **Labels:** `refactor`, `ui`, `accessibility`

The hand-rolled modals lack `role="dialog"`/`aria-modal`, trap no focus (Tab
walks out behind the backdrop that still blocks the mouse), never restore focus
to the trigger, and put Escape handling on an inner div in the create-folder
dialog. Priority is raised by how cheap the fix is: `@radix-ui/react-dialog` is
already a dependency and `shared/components/ui/dialog.tsx` already wraps it.

## #88 — Menus declare `role=menu` but have no keyboard navigation

- **URL:** https://github.com/Opndrive/opndrive/issues/88
- **Labels:** `refactor`, `ui`, `accessibility`

The overflow menus advertise `role="menu"`/`role="menuitem"` while implementing
no arrow-key movement, no Home/End, no focus management, and no focus trap —
actively worse than omitting the roles, since screen readers announce a menu and
tell users to press keys that do nothing. The `Open with` submenu is hover-only,
leaving no keyboard path to Preview at all, and `@radix-ui/react-dropdown-menu`
is already available to fix it.

## #86 — Four components fight over `document.body.style.overflow`

- **URL:** https://github.com/Opndrive/opndrive/issues/86
- **Labels:** `bug`, `refactor`, `ui`

Body scroll locking is reimplemented in at least four places that clobber each
other: the preview modal resets `overflow` unconditionally on cleanup, the
overflow menu locks scroll just to show a dropdown, and stacked `useScrollLock`
consumers capture `hidden` as the "previous" value. The user-visible failure is
severe — closing modals in the wrong order can leave the page permanently
unscrollable until a full reload.

---

### Runners-up considered

- **#105** (`bug`, `good first issue`) — 62 `rules-of-hooks` violations across
  15 files; latent today only by accident of how `AuthProvider` swaps children.
- **#94** (`enhancement`, `state-management`, `ui`) — nothing handles going
  offline; folders render as empty and the user believes their files are gone.
- **#79** (`enhancement`, `performance`, `ui`) — two-tier pagination with no
  virtualization and a hardcoded 300ms delay per chunk.
- **#101** (`bug`, `state-management`) — upload/delete history not cleared on
  logout. Excluded because a maintainer comment states it was fixed as part of
  the #77 disposal work, though the issue is still open.
