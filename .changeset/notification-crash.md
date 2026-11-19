---
'frontend': patch
---

Fix notifications crashing in production

The notification component used React's `useEffectEvent`, which the React
bundled with Next.js does not have. Tests passed against the regular react
package, and the production build only warned, so on the live site every
notification threw the moment it appeared. It now keeps the latest close handler
in a ref, and a lint rule rejects `useEffectEvent` and `Activity` imported from
react, so this cannot come back.
