/**
 * Orders a folder's keys so the folder's own marker object is deleted last.
 *
 * S3 lists lexicographically and "docs/" sorts ahead of "docs/a.txt", so left
 * alone the marker goes out in the first batch and an interrupted delete leaves
 * the folder invisible while its contents remain, and remain billed. Sending it
 * last inverts that: what survives is a folder the user can still see and open.
 *
 * The marker is appended even when the listing did not include one. Deleting a
 * key that is not there is a no-op in S3, and that keeps this the single answer
 * to "what should we delete for this folder, and in what order".
 */
export function markerLast(keys: string[], markerKey: string): string[] {
  const contents = keys.filter((key) => key !== markerKey);
  return [...contents, markerKey];
}
