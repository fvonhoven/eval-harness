# Why it is built this way

The harness started from a question I could not answer about my own pipeline: when I swapped the ranking model to save money, did the newsletter get worse? The run logs said every call succeeded. That is the wrong signal for a stage whose output is a list of integers; it succeeds whenever the parser finds a number. So the first design decision was to make the pipeline's actual decision, include or skip, the thing that gets measured, and to treat the rating itself as supporting evidence.

## Tradeoffs I accepted

The golden set is small and was written to cover the rubric, not to sample the feed. Forty items drawn from real fetches would be more representative and would also be mostly 3s and 4s, because most of what an RSS feed carries is not relevant. Coverage of the bands and of the known traps (marketing copy, adjacent-but-traditional posts) buys more signal per label at this size. A production version should add a sampled set alongside this one and report both.

The production parser is ported with its flaw intact. Fixing it in place would have been a two-line change and would have hidden the most useful result in the README. The `v2` variant is the fix; whether it ships is a decision for the pipeline, not the harness.

Tolerances are hand-set, not statistical. With forty items, one article flipping across the threshold moves include F1 by two to three points, so a five-point tolerance is "about two articles". A confidence interval would be more honest and would need a larger set to be narrow enough to act on.

The scripted model is a stand-in for the tests and for offline use, and it is biased toward making the harness look useful: its formatting habits are ones I have seen from real models, but their rates are guesses. In the live run behind the README tables, neither model showed any of them. The scripts record live responses on the first run with keys and replay them after, so the published numbers come from real model output.

Temperature is pinned at 0 and chunk size is fixed at 25. Both are worth a row in the matrix (the production code chunks because big prompts drop lines) and I left them out to keep the first table readable.

## What I would do differently with more time

Add a judge-free calibration check: rate the same batch twice with the item order reversed and report how many ratings change. Position bias is a known failure of list-rating prompts and the harness cannot see it yet.

Make the matrix a config file instead of a constant in `scripts/_setup.ts`, with the baseline keyed by a hash of the prompt text so that editing a prompt invalidates its own baseline rather than silently comparing against the old wording.

Store per-article results across runs, not just metrics. The most useful question after a failed check is "which articles flipped", and today that needs a diff of two `runs/latest.json` files.

Run it in the pipeline's own CI. The harness lives in its own repo so it can be read on its own; the pipeline would import `rank.ts` and `parse.ts` from here rather than keeping a Python copy, or the Python side would call this with a fixture path.
