---
'frontend': patch
---

Let a folder take a drop wherever the drag started

Dropping files onto a folder row worked or did not depending on where the drag
had entered the page. Come in over the sidebar and every folder accepted; start
the drag over the file listing itself and no folder would take a drop for the
rest of it, however far the pointer was moved.

A folder row would only accept a drop if a React context already said a drag was
in progress, and only one component ever wrote that: a detector mounted above
the listing. `dragenter` fires innermost-first, so the row was asked before
anything had recorded the drag - and the file table called `stopPropagation` on
its own drag handlers, so the event never reached the detector to record it. The
context stayed empty and every row inside stayed inert. Folders in grid view
were unaffected, because they sit beside that table rather than inside it, which
is why this only showed up in the list view the unified table introduced.

Nothing waits on anything else now. Whether a drag carries files is read from
the event in hand - `dataTransfer.types` says so from the first event onward -
so the first event of a drag is enough on its own.

Which folder is under the pointer is settled the same way, by hit-testing the
pointer against the DOM on every `dragover`. That replaces a tally of
`dragenter` against `dragleave` kept per element, which cannot be made to hold:
both fire once per _descendant_, so a row of icons and labels emits them in
bursts and one unpaired leave strands the highlight - the jiggling needed to get
a folder to light up. `dragover` repeats while the pointer is still, so every
reading is fresh rather than a correction of the last one.

The drag ends when `dragover` goes quiet rather than on a `dragleave` that looks
like it left the window. There is no dependable event for leaving: WebKit
reports a null `relatedTarget` for every `dragleave` it fires, so reading that
as "left the window" made the highlight strobe on Safari each time the pointer
crossed a row. The model reruns every 350ms while the pointer is over the
document, so silence is the one signal that means the drag is genuinely gone -
carried out of the window, cancelled, or dropped outside it.

A folder with no handler for its drops now steps out of the way entirely rather
than standing a no-op in: it is unmarked, claims nothing, and stops nothing, so
the drop falls through to the listing and uploads to the current prefix. The
no-op version claimed the drop and then discarded it, and claiming also stops
the listing behind from ever seeing it - so the files simply vanished.

While a folder is claiming the drop, the listing no longer draws its own dashed
outline. Both at once offered two answers to the one question of where the files
were about to land.

Two timers that ended live drags are gone with it: a ten-second fallback that
cleared the drag out from under a slow one, and a "left the window" guess of
`clientX === 0 && clientY === 0`, coordinates Chrome also reports mid-drag. The
window's own `dragleave` reports that properly.

Also: dropping a file anywhere in the app no longer risks the browser taking the
drop and navigating away from the page to display it, the drop overlay is drawn
in the theme's own colour rather than a hardcoded blue, and the dashboard layout
no longer re-subscribes to the current prefix to pass it to a provider that
never read it.
