---
'frontend': patch
---

Let the answer to "this file already exists" be decided once, in settings

The prompt can now be answered in advance. General settings has a "When a file
already exists" choice: ask, keep both, or replace. It defaults to ask, which is
the behaviour there has always been, because deciding to overwrite by default is
the user's call rather than something to inherit from an install.

It is the same mechanism the prompt's own "do the same for the rest" uses. A
policy simply seeds that standing answer before the first question is asked, so
a drop of ten colliding files finishes without a single prompt.

Replacing without being asked leaves a notice on the transfers card saying how
many files were overwritten, and the setting says so beside the choice. A file
that was there is gone, and a setting chosen weeks earlier is not something
anyone remembers at the moment it acts. Keeping both takes nothing away and the
new name is already on the card, so it passes without one.
