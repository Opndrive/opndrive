---
'frontend': minor
---

Grid view now scrolls large folders as smoothly as list view does: only the rows
of cards near the screen are drawn, with as many columns as the window has room
for. Arrow keys move between cards, scrolling the next one into view.
Shift-click selects a range even across cards that have scrolled away, and
Ctrl/Cmd+A or the toolbar's new "Select all" selects every loaded item, every
item once the folder has fully loaded.
