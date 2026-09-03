# frontend

## 3.1.1

### Patch Changes

- eb3c1ce: Answer every duplicate prompt at once instead of one file at a time

  Dropping ten files onto ten that already exist asked ten identical questions,
  one after another, each needing its own click. Nothing said how many were
  left, so there was no way to tell whether answering meant one more click or
  nine.

  The dialog now offers to let the answer stand for every collision left in the
  drop, so ten files take one click. It is honoured by the loop that raises the
  prompts, in use-upload-dispatch, by not asking again. That loop awaits each
  answer before the next question exists, so there is never a queue of prompts
  to answer in bulk - which is the shape this looked like it had from the store.

  The dialog also shows how many are left, which is most of what made repeating
  the same answer feel endless.

  Cancel used to close the dialog and resolve nothing, leaving the loop awaiting
  an answer that never came: every file behind the cancelled one was never asked
  about and never uploaded, and the drop stalled there in silence. Cancel is an
  answer now. With more than one collision it reads "Skip this one", and a
  "Cancel all" beside it abandons the rest of the drop. A file left alone this
  way gets a notice saying so rather than the "could not find a free name" one,
  which was about a different thing entirely.

- 357d45f: fix provider selection layouting in connect page and icon sizes
- 5309414: Make the delete card say what it deleted, and what it could not

  Three things about that card were wrong, and the last one hid real failures.

  The icon was hardcoded. Batch deletes set `type: 'folder'` to get _an_ icon,
  so deleting a single photo drew a folder — and a selection of eight files drew
  a folder too, sitting next to a label that correctly read "Deleting 8 files".
  The icon is now read from the selection: one item gets its own name and icon,
  eight JSON files get the JSON icon, and a selection with no one answer gets a
  stacked one rather than picking a side. A folder saved as a real object — a
  zero-byte key ending in a slash — counts as a folder here, because that is
  what it is to the person looking at it.

  The shared extension has to be carried on the card rather than read back off
  its name, because a batch card is named "8 items" and there is no extension in
  that. Deriving it from the name is what left the icon as a question mark,
  which reads as an error rather than as eight files.

  The card also names them now, behind an info icon beside the count: hovering
  it lists the files one per line. "8 items" is true and useless — it does not
  tell you whether the eight you selected are the eight you meant — but the
  names inline truncate to "main - Copy - Copy (2).json, mai…", which spends a
  whole line saying less than the count already did.

  That list needed two things from the tooltip it borrows. `multiline` on its
  own gives `white-space: normal`, which wraps but folds newlines into spaces,
  so a list arrives as one run-on paragraph; there is a `pre-line` variant for
  it now. And the tooltip measured itself with a class list that left out the
  caller's own `className`, so it sized one element and rendered another —
  harmless while nothing passed one, and wrong the moment anything did.

  A finished delete was painted the same red as a cancelled or failed one, so a
  green tick sat beside red text and a genuine failure was indistinguishable
  from a success at a glance. It is muted now, like a finished upload.

  And a failed delete showed no reason at all. `failDeleteOperation` sets the
  status to `'failed'`, but the row only rendered a reason for `'error'` — a
  status deletes never use. So the summary naming the objects that could not be
  deleted was built, written to the store, and dropped at the last step. That
  summary now reaches the card, and it names up to three failed objects with the
  codes S3 gave, rather than only the first one.

  None of this costs an extra request. S3 returns per-object failures inline in
  the same `DeleteObjects` response that does the deleting; the information was
  already in hand.

- 4526d5d: Delete the selection with the Delete key

  Selecting files or folders and pressing Delete now does what the toolbar's
  delete button does, confirmation dialog and all. A key that is quick to hit is
  the last one that should skip the warning about a folder taking everything
  inside it.

  The listener is mounted by the multi-select toolbar and only while something
  is selected, rather than sitting on the window for the whole session.

  Four presses are deliberately left alone: a held key, which would otherwise
  stack a confirmation per repeat; any modifier combination, which belongs to
  the browser or the operating system; a press while typing in a field, since
  removing a character in the search box must not remove the files behind it;
  and a press while a dialog is open, which matters most for the confirmation
  this raises itself, where it would let one press start the next delete.

  Backspace is not bound. It is "go back" in too many places to take over for
  something that cannot be undone.

- 1c3fc86: Report a download in one place, and let a failed one be dismissed

  A download that hit a network error left a row nothing could remove, so the
  panel showing it stayed up until the page was reloaded. The store gave
  `completed` and `cancelled` rows a delay after which they clear themselves but
  had no case for `error`; the operations panel mapped `upload` and `delete` to
  their remove actions and never handled `download`, in both the row's remove
  and the panel's close button; and the panel only hides once its list is empty.
  So the close button did nothing, however many times it was pressed.

  A failed row also had no button on it at all. The row drew its trailing
  control for active, then completed, then cancelled operations, and anything
  that had gone wrong fell past all three to nothing - so the one row a reader
  most wants rid of was the only one with nothing to press. That was true of
  failed uploads and deletes too, and is fixed for all three.

  Settled downloads now wait to be dismissed instead of clearing themselves.
  They used to go on a timer, three seconds for a completion and two for a
  cancel, which read as tidy until a failure needed the same treatment: a reason
  for a failure that takes itself off the screen is no use to anyone who was not
  looking at that moment, and the panel can be collapsed. Uploads and deletes
  have always waited to be dismissed, and downloads now match them.

  The same download was also announcing itself three times over: a toast, a card
  of its own in the top right, and a row on the operations card in the bottom
  right. The operations card is the one that stays, since it already carried
  every status the separate card did, down to the queue position and the reason
  for a failure. The separate card is gone, along with the toasts for starting,
  cancelling and failing. One toast is left for a download that throws before
  the service can record it, which leaves no row to read. The row now shows the
  percentage while downloading, the only thing the removed card said that it did
  not.

  The three copies of "which statuses count as still running" are now one, and
  it knows about downloads. Each listed upload and delete statuses only, so a
  running download read as settled - which would have mattered the moment the
  close button learned to remove downloads, since it would have dropped the row
  of a transfer still in flight rather than offering to cancel it.

- eb3c1ce: Let the answer to "this file already exists" be decided once, in
  settings

  The prompt can now be answered in advance. General settings has a "When a file
  already exists" choice: ask, keep both, or replace. It defaults to ask, which
  is the behaviour there has always been, because deciding to overwrite by
  default is the user's call rather than something to inherit from an install.

  It is the same mechanism the prompt's own "do the same for the rest" uses. A
  policy simply seeds that standing answer before the first question is asked,
  so a drop of ten colliding files finishes without a single prompt.

  Replacing without being asked leaves a notice on the transfers card saying how
  many files were overwritten, and the setting says so beside the choice. A file
  that was there is gone, and a setting chosen weeks earlier is not something
  anyone remembers at the moment it acts. Keeping both takes nothing away and
  the new name is already on the card, so it passes without one.

- e12ffb5: Let a folder take a drop wherever the drag started

  Dropping files onto a folder row worked or did not depending on where the drag
  had entered the page. Come in over the sidebar and every folder accepted;
  start the drag over the file listing itself and no folder would take a drop
  for the rest of it, however far the pointer was moved.

  A folder row would only accept a drop if a React context already said a drag
  was in progress, and only one component ever wrote that: a detector mounted
  above the listing. `dragenter` fires innermost-first, so the row was asked
  before anything had recorded the drag - and the file table called
  `stopPropagation` on its own drag handlers, so the event never reached the
  detector to record it. The context stayed empty and every row inside stayed
  inert. Folders in grid view were unaffected, because they sit beside that
  table rather than inside it, which is why this only showed up in the list view
  the unified table introduced.

  Nothing waits on anything else now. Whether a drag carries files is read from
  the event in hand - `dataTransfer.types` says so from the first event onward -
  so the first event of a drag is enough on its own.

  Which folder is under the pointer is settled the same way, by hit-testing the
  pointer against the DOM on every `dragover`. That replaces a tally of
  `dragenter` against `dragleave` kept per element, which cannot be made to
  hold: both fire once per _descendant_, so a row of icons and labels emits them
  in bursts and one unpaired leave strands the highlight - the jiggling needed
  to get a folder to light up. `dragover` repeats while the pointer is still, so
  every reading is fresh rather than a correction of the last one.

  The drag ends when `dragover` goes quiet rather than on a `dragleave` that
  looks like it left the window. There is no dependable event for leaving:
  WebKit reports a null `relatedTarget` for every `dragleave` it fires, so
  reading that as "left the window" made the highlight strobe on Safari each
  time the pointer crossed a row. The model reruns every 350ms while the pointer
  is over the document, so silence is the one signal that means the drag is
  genuinely gone - carried out of the window, cancelled, or dropped outside it.

  A folder with no handler for its drops now steps out of the way entirely
  rather than standing a no-op in: it is unmarked, claims nothing, and stops
  nothing, so the drop falls through to the listing and uploads to the current
  prefix. The no-op version claimed the drop and then discarded it, and claiming
  also stops the listing behind from ever seeing it - so the files simply
  vanished.

  While a folder is claiming the drop, the listing no longer draws its own
  dashed outline. Both at once offered two answers to the one question of where
  the files were about to land.

  Two timers that ended live drags are gone with it: a ten-second fallback that
  cleared the drag out from under a slow one, and a "left the window" guess of
  `clientX === 0 && clientY === 0`, coordinates Chrome also reports mid-drag.
  The window's own `dragleave` reports that properly.

  Also: dropping a file anywhere in the app no longer risks the browser taking
  the drop and navigating away from the page to display it, the drop overlay is
  drawn in the theme's own colour rather than a hardcoded blue, and the
  dashboard layout no longer re-subscribes to the current prefix to pass it to a
  provider that never read it.

- 7d9772c: Clip the grid card's thumbnail to the card's rounded corners

  The card is `rounded-lg` but never clipped its children, and the thumbnail is
  a square box sitting flush in the top two corners. So the radius only ever
  applied to the background, and the thumbnail painted straight over the curve.

  It was only obvious on files with an image preview, because those fill the box
  edge to edge with an opaque photo, while a file without one gets a pale tint
  that hides the same overflow. Selecting made it worse again: a selected card
  draws a 2px outline, outlines follow `border-radius`, so a clean rounded
  corner had two square image corners crossing it.

  The grid skeleton has always drawn its placeholder with `rounded-t-lg`, so
  this is the shape the card was meant to have all along.

- b942a0c: Put the FAQ answers in the page, and stop the feature list rotating
  at readers

  The eight FAQ answers were mounted only once their question was clicked, so
  the most substantial writing on the landing page - which S3 permissions are
  needed, where the credentials are actually stored - reached a crawler as
  nothing at all. They are in the markup now, collapsed by a `0fr` grid row
  rather than dropped from the tree, and the SSR test asserts every answer is
  really there. The accordion also has `aria-expanded` and `aria-controls` it
  never had, and each question is a heading wrapping its button rather than a
  heading buried inside one, so the eight questions form an outline a reader can
  navigate.

  `/` is now a server shell around the client page, which is what lets it emit
  FAQPage structured data built from the same `faqData` the section renders -
  Google requires the markup to describe what a visitor can see, and generating
  both from one array is what keeps that true when a question is edited. The
  route was already server-rendered on demand, so the shell costs nothing new.

  `verification` no longer ships `content="your-google-verification-code"` on
  every page: a claim to own the site backed by a token that verifies nothing.
  It reads `GOOGLE_SITE_VERIFICATION` from the server environment and is left
  off when unset.

  Both feature sections rotated every six seconds for as long as the tab was
  open. Narrower than `lg` the image column beside the list is `hidden`, so the
  timer's only effect was to swap the paragraph a reader was in the middle of -
  and the pause is bound to hover, which a touch device never fires, so on a
  phone there was no way to stop it. Rotation is now gated on the viewport being
  wide enough to show the image and on the section being on screen at all. The
  500ms crossfade it promised never ran either: `key` remounts the image, and a
  brand new element has no previous opacity to transition from, so it was a hard
  cut. It fades in now.

  Three star counters mount on the landing page in the same tick, and the GitHub
  cache is only written once a response lands - so all three missed it and all
  three fetched, against a limit of sixty requests an hour for an
  unauthenticated IP. Callers now share a request that is already running.

- 5309414: Update the listing in place after a file operation, instead of
  re-reading it

  Every operation used to finish by calling `refreshCurrentData`, which re-lists
  a whole prefix twice - once for the directory and once for the recent items,
  each up to a thousand objects. It always re-read the prefix the user was
  standing in, whatever prefix the operation had actually touched, so dropping
  files into a folder from outside it re-listed the wrong folder and left the
  right one stale. Deleting several files paid for that round trip once per
  file, in series.

  The drive store now edits the rows it already knows changed. `removeFiles`,
  `addFile`, `addFolder`, `renameFile` and `renameFolder` rewrite the affected
  listing - and the recent list behind it, offsets included - and each returns
  the inverse of what it did, so an operation whose request then fails puts back
  what it took and nothing else. Uploads carry the key, size and destination
  they landed at, so a finished one adds its own row rather than asking where
  the user happens to be.

  A re-read still happens where the outcome is genuinely unknown - a partly
  failed batch delete, a folder rename that left copies behind - but silently:
  it does not announce itself as loading, and a failure no longer replaces rows
  that are still on screen with an error notice.

- b942a0c: Hand the landing page's two navbars over without the jerk

  Scrolling out of the hero made the page lurch. Three separate things fired on
  that one scroll position, and one of them moved the page: the wrapper holding
  everything below the hero carried
  `style={{ paddingTop: showMobileNav ? '3.5rem' : '0' }}`, so 56px appeared
  under the hero at the exact moment the bar faded in and everything below it
  dropped. An inline style also beats the `lg:pt-0` beside it, so desktop -
  which has no mobile bar to make room for - got the same shove. The room is
  held open permanently now.

  Held open, it is not hidden until the bar covers it, which is what this said
  first. The bar only arrives once the hero is entirely past, but the reserved
  room enters the viewport from the bottom edge a whole screen before that - and
  as padding on a transparent wrapper what showed through it was `body`, which
  is `--secondary`, a lighter band than the `--background` on either side of it.
  On a phone it read as a grey seam sliding up the page ahead of the navbar, and
  in light mode as a blue-grey one across white.

  So the room is a strip of its own now, painted `--background` like its
  neighbours and carrying the divider artwork - the filaments running into the
  mark - so that the same 56px reads as the deliberate join between hero and
  page that a reader is about to scroll through. It is exactly the height of the
  bar that lands on it, and gone at `lg`, where there is no bar to make room for
  and the hero still meets the next section directly.

  The artwork needed treating rather than dropping in. The file is not the
  transparent PNG it appears to be: every pixel is opaque and what should have
  been transparency was flattened to a flat grey at luminance 43, so as an image
  it would have replaced one wrong-coloured band with another. A `contrast()`
  lands that flat field on black and `screen` composites black as no change, so
  the page's own background is what shows between the filaments; on a light page
  the pair inverts to `contrast()` onto white and `multiply`. A genuinely
  transparent export would let both filters come off.

  The floating desktop navbar mounted on the way past, too, which built
  thirty-odd nodes, a backdrop-filter layer to rasterise and a star count that
  lands a tick later and re-centres the pill, all on the frame the browser was
  already busy scrolling - and then ran two `setTimeout`s to fade in what it had
  just built. It is now mounted with the rest of the page and revealed with a
  composited fade, the same way the mobile bar always was. It fades out to
  `invisible` rather than just transparent, so a bar nobody can see is not still
  tabbable.

  Both bars now take their cue from one `IntersectionObserver` on the hero's
  sentinel, which the page owns and passes down. That replaces two `scroll`
  listeners that each called `getBoundingClientRect()` on every event, forcing a
  synchronous layout per frame, one of them re-registering itself on every
  toggle. It also means the bars hand off at the same pixel: the floating nav
  used to appear while the hero was still most of the screen, which is what made
  the page look like it had two navbars at once.

  The blog navbar ran a third copy of that listener, tracking a sentinel into
  two state values that nothing rendered. It is gone, along with the sentinel it
  watched.

  The Discord card in the hero navbar opened off the top of the screen. That
  navbar asks for a card above it, which is right where it starts - near the
  bottom of the viewport - but it scrolls with the page, and a reader who has
  pushed it near the top has no room above it left. `placement` is a preference
  now rather than an outcome: the card is measured against the space on each
  side of its trigger when it opens, and moves to the other side when the
  requested one cannot hold it and the other is roomier.

  The connector squiggle beside that card is drawn above the chrome it comes out
  of, so it wins every overlap - and out of a navbar, where the trigger is a
  20px icon in a packed row, what it won was the theme toggle sitting next to
  it. It is measured against its neighbours now and left out where there is
  something within its reach, which leaves the card to stand on its own in both
  navbars. Out of the sidebar, where the row is full width and the arrow leaves
  into open page, it is unchanged.

  Three more things about the mobile bar, all of them visible on a phone.

  It could fail to appear at all. An IntersectionObserver only reports when its
  target's intersecting state changes, and against the bare viewport a sentinel
  below the fold and a sentinel above it are both "not intersecting" - so a jump
  straight from one to the other never reported anything and the bar stayed
  hidden on a page scrolled well past the hero. A `#faq` deep link does that, so
  does the scroll position a browser restores on a back navigation, and so does
  any hero taller than the viewport, which is every phone once the address bar
  has taken its cut. The observer's root is extended downward past any page
  length now, so the sentinel intersects from load until it leaves over the top
  edge and the one crossing that matters is a real transition.

  Every link in the menu landed its own destination underneath the bar. Both
  navbars are fixed at the top and `scrollIntoView` puts the target's top edge
  at the top of the viewport, which is exactly where they are, so "Curious about
  Opndrive?" arrived cut in half. The sections carry `scroll-mt` matching each
  navbar's height, so the browser stops short by the bar it is scrolling under.

  And the open menu could not be scrolled. Six links, three action rows and a
  button come to around 620px with no cap and no overflow, which clears a tall
  phone and does not clear a short one once the browser's chrome has taken its
  cut, leaving the "Get Started" button at the bottom off screen and
  unreachable. It is capped to what is left of the viewport below the bar, in
  `dvh` so that the address bar is counted, and scrolls past that.

  The bar's own bottom hairline is a shadow rather than `border-b`, so that it
  is exactly the `h-14 sm:h-16` it says it is - as a border it measured a pixel
  taller, and the strip reserving room for it is sized off the stated height.

- e12ffb5: Show My Drive's folders and files as one table, and stop
  over-subscribing to the drive store

  My Drive was a copy of Home. Both pages rendered the same two components, so a
  directory listing came out as a block of folder cards with its own heading
  stacked above a file table with its own heading, and both headings called a
  bucket's own contents "Suggested". Home wants that shape, because it lists
  recent activity of two different kinds. A directory does not.

  List view in My Drive is now a single table. Folders lead, sharing one header
  and one index space with the files, so a shift-select can run from a folder
  into the files below it. Grid view keeps the two sections, because folder and
  file cards are different shapes and interleaving them only makes the grid
  ragged. Home is unchanged.

  That also fixes a directory holding only folders rendering as empty: the file
  table returned its drop zone whenever there were no files, before the folder
  rows handed to it could render, which is the top of most buckets.

  Separately, thirteen call sites read the drive store as `useDriveStore()`.
  With no selector zustand subscribes the component to the whole store, so every
  listing write for any prefix re-rendered all of them. Two of those sites are
  the row overflow menus, one per row, each reading a single string, so a
  hundred-row listing meant a hundred components re-rendering on every write.
  Each site now selects the value it uses.

- 7d66889: Server-render the landing page, and stop createSession navigating

  `isLoading` starts true, so `AuthProvider` renders a `Loading...` placeholder
  for any route not on its public list, which is the whole body of the page a
  crawler sees. `/privacy`, `/terms` and `/connect` were exempt for that reason.
  The landing page was not, so the hero, the features and the FAQ were all
  invisible without JavaScript. It is on the list now.

  That also means the page renders before a session has been looked for, so the
  main call to action no longer has a loading state: it reads "Get Started" and
  goes to /connect until a session turns up, rather than server-rendering a
  disabled button labelled "Loading..." as the page's primary CTA.

  `createSession` no longer pushes to /dashboard. Its only caller is
  ConnectWizard, which lives at /connect/[provider] and navigates itself once
  the session resolves, so the branch could only have fired from `/` or
  `/login`, neither of which has a connect form, and `/login` is not a route.

  The way back into the drive, which those same public pages now have to show
  rather than redirect, is labelled "Dashboard" instead of "Go to Dashboard".
  Two words that the arrow beside them already carried, and enough width to push
  the landing page's sticky nav wider than the pill it sits in. It is a
  rounded-full pill to match that nav, and the arrow is thickened so it still
  reads as a direction next to the label rather than dissolving into it.

- 728b561: Let signed-in visitors read the public pages, and clear out five
  rough edges

  The landing page, /connect and every provider page used to bounce a visitor
  with a connected bucket straight to the dashboard. All three exist to be
  read - the connect pages carry their own metadata and canonical URLs so they
  can be found in search - which meant the page Google indexed was the one page
  a returning user could never see, and anyone with one bucket connected could
  not reach the form to add a second. They stay put now, and a "Go to Dashboard"
  control appears for whoever has a session. The landing page's main button
  carries it rather than growing a second button beside it: that button already
  sent returning visitors to their drive, it just said "Get Started" while doing
  so.

  Opening a row's overflow menu from the keyboard now selects the row, as the
  mouse already did. Radix opens the menu from its own keydown handler and calls
  preventDefault, so the click that selection hung off was never synthesised and
  the toolbar showed nothing.

  Folder navigation no longer puts a `key` parameter in the URL. It carried the
  folder's own name beside a prefix that already ended in it, and nothing read
  it for its value - duplicated data on every navigation, in an app whose
  privacy story is about keeping paths out of query strings.

  Cloudflare R2's endpoint field showed a literal `{{accountId}}`, our own
  templating syntax, as the example to type. It reads the way Cloudflare's docs
  write it now.

  `--danger` held byte-identical values to `--destructive` in every theme, three
  uses against fifty-four, and is gone. robots.txt repeated one rule three times
  where `*` already covered every bot.

- 5309414: Make the multi-select delete confirmation readable, and warn about
  folders

  Deleting a selection asked for confirmation with every name comma-joined and
  quoted into one paragraph, and with no cap at all — so eight files arrived as
  a run-on line to be parsed rather than scanned, and four hundred arrived as a
  four-hundred-name wall. The body also opened by repeating the count the title
  had just given.

  The names are now listed one per line, capped at eight with the rest counted,
  and folders keep a trailing slash — in a plain list that is the only thing
  that says a name is a folder.

  More importantly, it now says what a folder costs. The single-folder dialog
  has always warned "and everything inside it"; this one said "5 items will be
  deleted forever" and stopped, which gives no hint that one of those five might
  hold ten thousand more. A selection containing a folder now carries that
  sentence, and a selection of exactly one folder gets the same wording the
  overflow menu uses.

- 5309414: Declare the rename provider's hooks unconditionally

  `RenameProvider` returned early — once while authenticating, once when signed
  out — above every hook it declares. That makes the number of hooks depend on
  session state, which is the one thing rules-of-hooks exists to prevent:
  signing out flips `isAuthenticated` on an already-mounted provider, so the
  next render runs one hook where the previous ran twenty. React raises
  "Rendered fewer hooks than expected" and the dashboard goes down with it.

  The hooks now come first and the two returns last. `renameService` is memoised
  on `apiS3` rather than rebuilt on every render, which also settles a stale
  closure: as a bare call it was absent from every dependency array, so the
  rename callbacks captured whichever instance the first render happened to
  build and would have kept talking to the previous bucket after a switch.

  Eighteen lint warnings had been reporting this, and `--max-warnings=0` in
  lint-staged meant the file could not be committed at all.

- 93513fc: Hold a drive request's status and its failure reason as one value

  The store kept `status`, `recentStatus`, `failures` and `recentFailures` as
  four maps keyed by the same prefix, with nothing forcing any two of them to
  agree. That had already caused a bug: with one shared failures map, the
  directory listing finishing erased why the recent list had failed, and the
  recent list fell back to a generic "something went wrong". Splitting the map
  per request kind fixed that instance without fixing the shape.

  Each key now holds one `RequestState`, so a reason is only ever written with
  the status it explains, and the error path is a single write rather than two.
  No behaviour change: the `AsyncState` selectors already hid the store's shape
  from every page, so nothing outside `data-context` and its tests moved.

- 013c63d: Delete a folder and its contents, not just the marker

  S3 has no directories. A folder is either inferred from a delimiter, which
  gives it a `Prefix`, or written as a zero-byte object whose key ends in a
  slash. The second kind is shaped exactly like a file - same type, same
  fields - and the trailing slash is the only thing separating them.

  Nothing recorded which was which, so every site that needed to tell them apart
  invented its own test. Six of them, across twenty places, and they did not
  agree. Delete was one of the places they disagreed.

  The list of files to delete was built with a test that excluded markers. The
  loop that then deleted them used one that did not, eleven lines further down.
  So a folder stored as an object went to the file path: the marker was removed
  and everything beneath it stayed - still stored, still billed, and no longer
  reachable by a listing with no prefix left to find it under.

  The loop was also an `if / else if` with no `else`. An item matching neither
  arm fell through it silently, with the confirmation already accepted and the
  selection already cleared, so the interface reported a deletion that never
  happened. Anything that cannot be deleted now says so.

  One module decides instead. `isFolder`, `isFolderMarker`, `isFile` and
  `itemKey` live in `shared/utils/drive-item.ts`, and the twenty hand-rolled
  predicates are gone along with the `as FileItem` and `as Folder` casts each of
  them needed - every one a place the compiler had been told to stop checking.

  Both types now carry a `kind` tag, set by the factory that builds them, rather
  than leaving the answer to be inferred from which optional field happened to
  be populated. It is optional, so anything restored from a cache written before
  it still resolves through the structural test. The tag records the shape an
  item was built as, which is not the same question: a marker is built by the
  file factory and carries `kind: 'file'` while being a folder, so the marker
  test runs before the tag is trusted anywhere it matters.

  Selection identity is fixed with it. `itemKey` read the key, then the prefix,
  then gave up and returned the empty string - so any two items carrying neither
  collapsed into one, and selecting either showed both as selected. It reads the
  `id` first now, which the factories always populate, and falls back to a
  per-object identifier that is stable for one item and unique between two.

  Selecting an item no longer takes a type from the caller. Components passed a
  literal `'file'` or `'folder'` alongside it, and only the plain-click path
  read it, so the same folder reported one thing when clicked and another when
  ctrl-clicked. Every path derives from the item now, and the argument is gone
  from all ninety-six call sites.

  Also fixed on the way past: a folder stored as an object opened a file preview
  when tapped on mobile, where that row had no such check at all.

- 17b6a44: Size the sidebar nav icons on the icon rather than on a box around it

  The size classes sat on a wrapper `div` and the icon inside was given none.
  `react-icons` default to a width and height of `1em`, so the icon inherited
  the row's `text-sm` and drew at 14px inside a slot reserved for 20. It looked
  misaligned for the same reason: Tailwind's preflight makes an svg
  `display: block`, so those 14px sat in the top left corner of the 20px box.
  The row centred the box, and nothing centred the icon inside it.

  The size is on the icon now and the wrapper is gone. The row is already
  `flex items-center`, so a direct child is centred by the row itself and there
  is no intermediate element left to get it wrong. Icons are 20px against a 14px
  label, which is the usual pairing, and 16px for a nested item.

- a0f3896: Give the three sidebar rows one description, and fix what the copies
  hid

  Sizing the nav icon on a wrapper rather than on the icon was one description
  of a row disagreeing with another. The same shape turned out to be true one
  level up: `SidebarItem`, `SidebarDropdown` and the settings sidebar each
  carried their own copy of the row's classes, down to the active and hover
  states, and the copies had already drifted - the settings layout still claims
  its back button matches `SidebarCreateButton` while using different padding
  and a different font size. All three now share `sidebarRowClasses`, so a
  change to how a row looks reaches every row rather than two of them.

  Fixed along the way:

  - The active row reports `aria-current`, the dropdown reports `aria-expanded`
    and `aria-controls`, and decorative icons are `aria-hidden`. The dropdown's
    panel is hidden rather than unmounted so the id it points at always
    resolves, which also keeps collapsed children out of the tab order. Escape
    closes the mobile drawer.
  - A badge of `0` rendered a bare `0` beside the label, because zero is falsy
    but still a valid React child. Badges are right-aligned in both rows now
    rather than right-aligned in one and against the title in the other.
  - `disabled` was in the type and read by nothing. A disabled row renders as a
    span rather than a link, is out of the tab order, and is never treated as
    the current page.
  - Sections auto-opened for the current route only while nothing had been
    saved, so the behaviour stopped working after the first time a section was
    toggled. Open state is derived during render instead: the route opens a
    section the user has never touched, and an explicit choice wins over it.
  - The sidebar tracked the viewport with a `resize` listener that set state on
    every event fired while a window was being dragged. It uses `matchMedia`,
    which fires when the breakpoint is actually crossed.
  - Sidebar state is read once during the first render instead of by an effect
    racing two others, and its key carries a version. Expanded sections reset
    once on first load after this ships.
  - `groupSidebarItems` returned a single section with `showSeparator: false`
    whatever it was given, so the separator could never draw and the loop around
    it could only run once. The sidebar maps its items directly; grouping can
    come back described by data when something needs it.
  - Removed `formatBytes`, `calculateUsagePercentage`, `getStorageKeyForRole`
    and `SidebarStorageProps`, none of which had a caller, and the dead `group`
    class on rows that had no `group-*` variant. `SidebarItem` was declared
    twice, in the config and in the sidebar's types, and only one copy knew
    about `badge` and `disabled`; the components own it now.
  - `SidebarCreateButton` imported `CreateMenu` through a barrel that re-exports
    sixteen modules, and rows animated with `transition-all` where only colour
    changes.

- e12ffb5: Keep the layout toggle still, and show the landing page's artwork in
  the right theme

  **The list/grid toggle no longer moves when you use it.** It lived in the file
  table's heading in both layouts, and in grid view that heading sits below the
  entire folder grid - so clicking "grid" dropped the control a whole section's
  height, out from under the pointer that had just clicked it, and clicking
  "list" threw it back up. Whichever section leads the page owns it now: the
  folders heading in grid, the table in list. Both start at the same offset and
  hold the same row height, so the control stays where it was put.

  An empty directory keeps the toggle too. That branch of the table rendered no
  heading row at all, so opening an empty folder in grid view left no way back
  to list until you navigated somewhere with contents in it.

  **The landing page's screenshots follow the theme again.** A visitor in dark
  mode got the light artwork until they toggled the theme twice.

  The src was picked in JavaScript from the resolved theme. The server cannot
  know the theme, so it rendered the light one - and React keeps a
  server-rendered attribute through hydration rather than patching it. The
  client then computed the right theme, found it already matched what it was
  holding, and never re-rendered, so the light image stayed. Toggling forced a
  real render, which is why that appeared to fix it. Nothing was wrong before
  the landing page began server-rendering; it only had no server HTML to be
  stuck with.

  Both images ship now and CSS paints one, the same way every colour on the page
  is already chosen - `data-theme` is stamped on the document before first
  paint, so the right one is the only one ever drawn. Only one is fetched: the
  other is `display: none`, so lazy loading never asks for it.

  That last part costs the hero image its preload hint, since preloading ignores
  `display` and would pull both. It is in the opening viewport either way. The
  two rotating feature sections lose a `priority` they should never have
  carried - they sit below the fold and behind a `lg` breakpoint, so it was
  preloading offscreen images on every visit.

- Updated dependencies [4793a75]
  - @opndrive/s3-api@3.1.1

## 3.1.0

### Minor Changes

- 060fccc: Give each S3 provider its own page and rebuild connect as an
  onboarding flow

  /connect was blocked in robots.txt and served Loading as its entire body, so
  it could not be indexed at all. It now renders real html and every provider
  has its own route with its own title, heading, description and canonical,
  generated from a single registry that also feeds the sitemap.

  The page itself is now a focused flow: provider cards first, then one card per
  provider with the logo, a back link, a searchable region combobox that fixes
  the old height and scrolling bug, an accessible reveal toggle for the secret
  key, and a connect button that sticks to the bottom.

  Anything the list does not name is covered by a custom-endpoint provider at
  /connect/custom-endpoint. That link previously went to /connect/minio, which
  sent people on DigitalOcean Spaces or Scaleway to a page about self-hosting
  MinIO. The hub also now points anyone wanting a provider added at the issue
  tracker.

- d8cb534: Add the privacy architecture: policy pages, opt out, CSP and a
  storage registry

  Publishes a privacy policy and terms, adds a site footer and docs footer
  links, and offers a working analytics opt out that carries across both
  subdomains on a cookie written only when somebody actually opts out. Analytics
  now mounts through a gate that honours it. A nonce based Content Security
  Policy protects the credentials held in localStorage, and a storage key
  registry generates the policy table so a new key cannot ship undisclosed.

### Patch Changes

- 26be79d: Stop delete operations outliving the session. The upload store now
  owns each delete's AbortController, so ending a session aborts everything in
  flight instead of leaving a loop deleting objects under credentials the user
  has already signed out of. Cancelling from the operations modal now aborts the
  delete as well, rather than only removing its card.
- bdf0b80: Animate menus open and land the multi-select bar with them. The
  animation utilities were never imported, so every Radix transition compiled to
  nothing; menus now unfold downward and selection fires on pointer down, at the
  same moment the menu opens, instead of trailing it by the length of the press.
- 43c81b6: Put the open file preview in the URL. Opening a preview now adds a
  `preview` query parameter to the current page, so Back closes it instead of
  leaving the folder, and a preview can be linked, bookmarked and reloaded.
  Arrowing between files replaces the entry rather than pushing, so a long
  browse does not bury the folder. The separate `/dashboard/preview/[etag]` page
  is retired to a redirect and "Open in new tab" points at the modal URL, keyed
  by S3 key so a shared link survives the file being re-uploaded.
- 6b11c4d: Stop sending private data to analytics, and correct the privacy copy

  Search terms and S3 object keys moved from the query string into the URL hash,
  which a browser never transmits, and analytics now redacts whatever is left.
  The settings privacy panel no longer claims we collect nothing, and the four
  privacy toggles that no code read are gone apart from the analytics opt out.

- cd66664: Replace the native `window.confirm` used for deletes with a themed
  dialog built on the Radix alert-dialog primitive, covering the file menu, the
  folder menu and multi-select delete. Also gives the advanced search sheet a
  dialog role, a name from its heading, Escape handling from anywhere, and focus
  that moves into the panel on open and back to the trigger on close.

  Defines the `destructive` colour the shadcn primitives already referenced. It
  was never in the palette, so `bg-destructive` generated no rule at all and the
  confirm button rendered as white text on a white dialog.

  Pins the dialog border to the theme's border colour. Tailwind v4 leaves a bare
  `border` at `currentColor`, so both dialogs were outlining themselves in their
  own text colour - a hard white rectangle in dark mode.

- 55b08f1: Show what went wrong when a bucket cannot be reached, instead of a
  skeleton that never resolves.

  A failed listing set an error status that no page read, so both dashboard
  pages rendered the loading skeleton forever. The store now keeps the reason
  and hands the page one value it cannot read without deciding what a failure
  looks like, so the next view added cannot repeat the omission.

  Credentials are also proved before a session is built on them: constructing
  the client touched no network, so wrong keys only failed later on the
  dashboard, a page away from the form that could fix them. They now fail on
  /connect, naming whether the problem is the keys, the bucket, the region or a
  missing CORS rule.

- 505f32c: Add vercel speed analytics
- @opndrive/s3-api@3.1.0
