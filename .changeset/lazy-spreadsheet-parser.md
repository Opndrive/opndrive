---
'frontend': patch
---

Load the spreadsheet parser only when a spreadsheet is opened

The preview window is part of every dashboard page, and its spreadsheet viewer
pulled in the spreadsheet parser, the largest library in the app, whether or not
anyone opened a spreadsheet. It is now loaded the first time one is previewed.
The dashboard's first load drops from 488 kB to 367 kB of JavaScript, and Browse
and Search by the same amount.
