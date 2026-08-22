---
'frontend': patch
---

Animate menus open and land the multi-select bar with them. The animation
utilities were never imported, so every Radix transition compiled to nothing;
menus now unfold downward and selection fires on pointer down, at the same
moment the menu opens, instead of trailing it by the length of the press.
