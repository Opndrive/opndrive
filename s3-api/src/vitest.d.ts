/**
 * Makes the `aws-sdk-client-mock-vitest` matchers registered in
 * `vitest.setup.ts` visible to `tsc`.
 *
 * The setup file sits outside `rootDir`, so it is not part of the type-check
 * program. Without this declaration every `toHaveReceivedCommandWith(...)` call
 * is a type error even though it works fine at runtime.
 */

import 'aws-sdk-client-mock-vitest/extend';
