# State Management

Opndrive doesn't use a single state library for everything. Three mechanisms
cover three different kinds of state, and knowing which one to reach for is
mostly about knowing which kind of state you have.

## The Three Mechanisms

| Mechanism                  | Use for                                          | Examples in this repo                                                    |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| React Context              | Cross-cutting concerns, one provider per concern | `auth-context`, `data-context`, `notification-context`, `theme-provider` |
| Zustand stores             | Feature-local state accessed by many components  | `use-upload-store`, `use-search-store`, `use-multi-select-store`         |
| Local `useState`/URL state | State that belongs to one component or one page  | Component-level UI state, `useSearchParams()`                            |

There is no React Query, SWR, or Redux anywhere in this codebase.

## Context Providers (`frontend/src/context/`)

Eight providers exist today, each scoped to one concern:

- `auth-context.tsx` - the connected S3 credentials, and the `UploadManager` /
  `SignedUrlUploadManager` instances built from them. Persists credentials to
  `localStorage`, never to a server (see
  [Connecting Storage](../guides/connecting-storage.md)).
- `data-context.tsx` - the current drive/folder data.
- `rename-context.tsx`, `share-context.tsx`, `details-context.tsx`,
  `file-preview-context.tsx`, `scroll-context.tsx`, `notification-context.tsx`
  - one feature each, named for what they hold.

`providers/theme-provider.tsx` handles light/dark theme separately from the
`context/` folder.

## Zustand Stores

Four stores exist, all under their owning feature:

- `features/dashboard/stores/use-search-store.ts`
- `features/dashboard/stores/use-multi-select-store.ts`
- `features/upload/stores/use-upload-store.ts`
- `features/upload/stores/use-upload-settings-store.ts`

```typescript
// Reading from a store
const selected = useMultiSelectStore((s) => s.selected);

// Updating it
const clearSelection = useMultiSelectStore((s) => s.clearSelection);
```

## Where Context Meets Zustand: `zustand-bridge.tsx`

`context/zustand-bridge.tsx` is a bridge component, not a provider - it reads
`uploadManager` / `signedUrlUploadManager` off `AuthContext` and the current
`uploadMode` off `useUploadSettingsStore`, and pushes whichever manager is
active into `useUploadStore` via an effect:

```typescript
useEffect(() => {
  if (uploadMode === 'signed-url') {
    setUploadManager(signedUrlUploadManager);
    return;
  }
  setUploadManager(uploadManager);
}, [uploadMode, uploadManager, signedUrlUploadManager, setUploadManager]);
```

This exists because the upload store needs a manager instance that Context owns
(it's built from the connected credentials), but components deep in the upload
feature read it through Zustand rather than `useContext(AuthContext)` directly.
If you add a new manager or a new upload mode, this is the file that has to know
about it.

## Choosing One

- **New cross-cutting concern used by many unrelated features?** Context.
- **New piece of state read/written by many components within one feature?** A
  Zustand store under that feature's `stores/`.
- **State only one component cares about?** `useState`. Don't reach for Context
  or Zustand by default - both add indirection that a local hook doesn't need.
