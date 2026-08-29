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
mobile bar to make room for - got the same shove. The padding is held open
permanently now. It costs nothing to look at, because the hero is `min-h-screen`
and so the padding is below the fold right up until the scroll position where
the bar arrives to cover it.

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
