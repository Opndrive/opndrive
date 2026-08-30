---
'frontend': patch
---

Hand the landing page's two navbars over without the jerk

Scrolling out of the hero made the page lurch. Three separate things fired on
that one scroll position, and one of them moved the page: the wrapper holding
everything below the hero carried
`style={{ paddingTop: showMobileNav ? '3.5rem' : '0' }}`, so 56px appeared under
the hero at the exact moment the bar faded in and everything below it dropped.
An inline style also beats the `lg:pt-0` beside it, so desktop - which has no
mobile bar to make room for - got the same shove. The room is held open
permanently now.

Held open, it is not hidden until the bar covers it, which is what this said
first. The bar only arrives once the hero is entirely past, but the reserved
room enters the viewport from the bottom edge a whole screen before that - and
as padding on a transparent wrapper what showed through it was `body`, which is
`--secondary`, a lighter band than the `--background` on either side of it. On a
phone it read as a grey seam sliding up the page ahead of the navbar, and in
light mode as a blue-grey one across white.

So the room is a strip of its own now, painted `--background` like its
neighbours and carrying the divider artwork - the filaments running into the
mark - so that the same 56px reads as the deliberate join between hero and page
that a reader is about to scroll through. It is exactly the height of the bar
that lands on it, and gone at `lg`, where there is no bar to make room for and
the hero still meets the next section directly.

The artwork needed treating rather than dropping in. The file is not the
transparent PNG it appears to be: every pixel is opaque and what should have
been transparency was flattened to a flat grey at luminance 43, so as an image
it would have replaced one wrong-coloured band with another. A `contrast()`
lands that flat field on black and `screen` composites black as no change, so
the page's own background is what shows between the filaments; on a light page
the pair inverts to `contrast()` onto white and `multiply`. A genuinely
transparent export would let both filters come off.

The floating desktop navbar mounted on the way past, too, which built thirty-odd
nodes, a backdrop-filter layer to rasterise and a star count that lands a tick
later and re-centres the pill, all on the frame the browser was already busy
scrolling - and then ran two `setTimeout`s to fade in what it had just built. It
is now mounted with the rest of the page and revealed with a composited fade,
the same way the mobile bar always was. It fades out to `invisible` rather than
just transparent, so a bar nobody can see is not still tabbable.

Both bars now take their cue from one `IntersectionObserver` on the hero's
sentinel, which the page owns and passes down. That replaces two `scroll`
listeners that each called `getBoundingClientRect()` on every event, forcing a
synchronous layout per frame, one of them re-registering itself on every toggle.
It also means the bars hand off at the same pixel: the floating nav used to
appear while the hero was still most of the screen, which is what made the page
look like it had two navbars at once.

The blog navbar ran a third copy of that listener, tracking a sentinel into two
state values that nothing rendered. It is gone, along with the sentinel it
watched.

The Discord card in the hero navbar opened off the top of the screen. That
navbar asks for a card above it, which is right where it starts - near the
bottom of the viewport - but it scrolls with the page, and a reader who has
pushed it near the top has no room above it left. `placement` is a preference
now rather than an outcome: the card is measured against the space on each side
of its trigger when it opens, and moves to the other side when the requested one
cannot hold it and the other is roomier.

The connector squiggle beside that card is drawn above the chrome it comes out
of, so it wins every overlap - and out of a navbar, where the trigger is a 20px
icon in a packed row, what it won was the theme toggle sitting next to it. It is
measured against its neighbours now and left out where there is something within
its reach, which leaves the card to stand on its own in both navbars. Out of the
sidebar, where the row is full width and the arrow leaves into open page, it is
unchanged.

Three more things about the mobile bar, all of them visible on a phone.

It could fail to appear at all. An IntersectionObserver only reports when its
target's intersecting state changes, and against the bare viewport a sentinel
below the fold and a sentinel above it are both "not intersecting" - so a jump
straight from one to the other never reported anything and the bar stayed hidden
on a page scrolled well past the hero. A `#faq` deep link does that, so does the
scroll position a browser restores on a back navigation, and so does any hero
taller than the viewport, which is every phone once the address bar has taken
its cut. The observer's root is extended downward past any page length now, so
the sentinel intersects from load until it leaves over the top edge and the one
crossing that matters is a real transition.

Every link in the menu landed its own destination underneath the bar. Both
navbars are fixed at the top and `scrollIntoView` puts the target's top edge at
the top of the viewport, which is exactly where they are, so "Curious about
Opndrive?" arrived cut in half. The sections carry `scroll-mt` matching each
navbar's height, so the browser stops short by the bar it is scrolling under.

And the open menu could not be scrolled. Six links, three action rows and a
button come to around 620px with no cap and no overflow, which clears a tall
phone and does not clear a short one once the browser's chrome has taken its
cut, leaving the "Get Started" button at the bottom off screen and unreachable.
It is capped to what is left of the viewport below the bar, in `dvh` so that the
address bar is counted, and scrolls past that.

The bar's own bottom hairline is a shadow rather than `border-b`, so that it is
exactly the `h-14 sm:h-16` it says it is - as a border it measured a pixel
taller, and the strip reserving room for it is sized off the stated height.
