---
'frontend': patch
---

Show My Drive's folders and files as one table, and stop over-subscribing to the
drive store

My Drive was a copy of Home. Both pages rendered the same two components, so a
directory listing came out as a block of folder cards with its own heading
stacked above a file table with its own heading, and both headings called a
bucket's own contents "Suggested". Home wants that shape, because it lists
recent activity of two different kinds. A directory does not.

List view in My Drive is now a single table. Folders lead, sharing one header
and one index space with the files, so a shift-select can run from a folder into
the files below it. Grid view keeps the two sections, because folder and file
cards are different shapes and interleaving them only makes the grid ragged.
Home is unchanged.

That also fixes a directory holding only folders rendering as empty: the file
table returned its drop zone whenever there were no files, before the folder
rows handed to it could render, which is the top of most buckets.

Separately, thirteen call sites read the drive store as `useDriveStore()`. With
no selector zustand subscribes the component to the whole store, so every
listing write for any prefix re-rendered all of them. Two of those sites are the
row overflow menus, one per row, each reading a single string, so a hundred-row
listing meant a hundred components re-rendering on every write. Each site now
selects the value it uses.
