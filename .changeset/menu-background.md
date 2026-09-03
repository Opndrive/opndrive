---
'frontend': patch
---

Give dropdown menus a background again

`DropdownMenuContent` paints itself with `bg-popover`, and `--popover` was never
defined, so menus rendered as text floating over whatever was behind them. The
profile menu escaped only because it passed a background of its own.
