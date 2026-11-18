---
'frontend': patch
---

Redesign the notices in the upload panel

A notice ("Not verified", "Renamed" and so on) put a small capitalised label
beside its explanation, which squeezed the explanation into a narrow column five
or six lines tall, and every kind looked the same apart from the label's colour.

Each notice is now a small callout: an icon and a title on the top line with the
dismiss button, and the explanation at full width beneath. Warnings ("Not
verified", "Replaced") sit on an amber tint, renames on a blue one and skips on
a neutral one. The amber is a new `--warning` theme colour that is readable in
both themes; the old one was 2.1:1 on white. The dismiss button is bigger and
shows focus, and the "1 notice · Clear all" row only appears for two or more.
