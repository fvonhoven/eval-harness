# eval-harness

## What this is

A test harness for the prompt that ranks newsletter articles. It scores a prompt and model against forty hand-labeled articles, prints the numbers, and fails a CI check when a change to the prompt, the parser, or the model makes those numbers worse.

## The problem it solves

The VibeCoder newsletter pipeline asks a model to rate every fetched article from 1 to 10 against an editorial rubric, then publishes the top eight. That stage has no unit test that can tell you whether it is any good. Its output is a list of integers, it is correct whenever it parses, and nobody notices a bad week until a reader does.

Three things go wrong with a stage like this and none of them throw an error:

1. The model's taste drifts. A model upgrade, a price-driven swap to a smaller model, or a rewording of the rubric changes which articles make the cut. The pipeline keeps running.
2. The answer format drifts. The prompt says "one number per line". Models add a preamble, write "8/10", or skip an article. The production parser (`src/parse.ts`, ported line for line) survives all of that, but a skipped line shifts every rating after it onto the wrong article, silently.
3. Nobody can tell a wobble from a regression. Without a labeled set and a recorded baseline, "it looks different this week" is a feeling.

The fix is the same as for any other code: a fixture with known answers, metrics that name what you care about, and a check that runs on every change.

## How it works

```
data/golden.json ---> rank.ts (prompt v1 or v2) ---> model ---> parse.ts ---> assign ratings
   40 labeled                                                                     |
   articles                                                                       v
       |                                                                    metrics.ts
       |                                                                          |
       +-------------------- labels ----------------------------------------------+
                                                                                  v
                                              regression.ts  <---  data/baseline.json
                                                   |
                                             pass / fail (exit 1)
```

- `data/golden.json` is the fixture: forty articles with a human rating and an include flag, written to cover every band of the rubric plus the cases that fool a model (marketing copy stuffed with AI words, traditional coding posts with no AI angle, research with no builder takeaway). `src/golden.ts` validates it on load.
- `src/rank.ts` is the stage under test. Variant `v1` is the production prompt and parser. Variant `v2` is the proposed fix: a numbered list and a `<n>. <rating>` answer format, parsed by position so a dropped line leaves a gap instead of shifting its neighbours. `pickIssue` is the production issue selection, ported as is.
- `src/metrics.ts` scores a run: parse coverage, exact and within-one agreement, mean absolute error, Spearman rank correlation, precision, recall, and F1 of the include decision at the production threshold, and overlap of the model's top eight with the labeled top eight. The include metrics matter most; the pipeline's real decision is include or skip, and a model can get the number wrong while getting the decision right.
- `src/regression.ts` compares a run with `data/baseline.json`. Parse coverage may not fall at all. Include F1 and within-one may fall five points, Spearman ten points, top-8 overlap one item, MAE may rise a quarter point. Improvements never fail.
- `scripts/measure.ts` runs a four-cell matrix (two prompts, two models), prints the tables below, writes `runs/latest.json`, and with `--check` exits 1 on a regression. `scripts/baseline.ts` promotes the latest run to the baseline once a human has looked at it.
- `src/scripted.ts` is a deterministic stand-in model that rates from the labels with seeded noise and imitates real formatting habits (a preamble, a "7/10", a skipped line). It builds the replay fixture when no keys are available and is what the tests use.

## Results

Live, 2026-11-19: real responses from gpt-4o-mini and claude-haiku-4-5, temperature 0, recorded to `data/replay/golden.json`. `npm run measure` with no keys replays that recording and prints these same tables.

```
run                          parsed  exact  within 1   MAE  spearman  incl P  incl R  incl F1  top-8
---------------------------  ------  -----  --------  ----  --------  ------  ------  -------  -----
v1/gpt-4o-mini/chunk25        40/40  22.5%     70.0%  1.25      0.81   95.0%   82.6%    88.4%  62.5%
v2/gpt-4o-mini/chunk25        40/40  27.5%     65.0%  1.25      0.78   94.4%   73.9%    82.9%  50.0%
v1/claude-haiku-4-5/chunk25   40/40  47.5%     85.0%  0.72      0.90   95.2%   87.0%    90.9%  75.0%
v2/claude-haiku-4-5/chunk25   40/40  47.5%     82.5%  0.72      0.90  100.0%   91.3%    95.5%  75.0%
```

Every answer parsed in all four cells. Neither model skipped a line, added a preamble, or wrote "8/10" in this run, so the `v2` parser had nothing to repair; the failure it fixes is real in production but did not show up here. What separates the cells is judgment. Haiku tracks the labels more closely than gpt-4o-mini (Spearman 0.90 against 0.78 to 0.81, MAE 0.72 against 1.25), and the include decision follows: F1 of 91 to 96% against 83 to 88%. Switching prompts moved include F1 up 4.6 points on Haiku and down 5.5 on gpt-4o-mini. One article crossing the threshold is worth two to three points at this size, so neither difference is strong evidence yet.

Two labels were revised after the live run, and the table above uses the revised set. All four cells included `a29` (an empirical study of generated code quality, then labeled 6) and all four skipped `a16` (a price change for coding models, then labeled 7). On review both labels were wrong, so `a29` is now 8 and `a16` is now 6. Against the original labels, every cell scored lower: include F1 of 86 to 91% for Haiku and 78 to 84% for gpt-4o-mini. When every model and prompt disagrees with a label the same way, check the label before blaming the model, and say so when you change it.

```
run                          calls  errors  input tok  output tok     cost   latency
---------------------------  -----  ------  ---------  ----------  -------  --------
v1/gpt-4o-mini/chunk25           2       0      8,373          80  $0.0013  3,551 ms
v2/gpt-4o-mini/chunk25           2       0      2,109         200  $0.0004  3,816 ms
v1/claude-haiku-4-5/chunk25      2       0      9,489          86  $0.0099  2,072 ms
v2/claude-haiku-4-5/chunk25      2       0      2,341         206  $0.0034  2,635 ms
```

Token counts are the providers' reported usage. `v1` repeats the full rubric for every article, so it sends about four times the input tokens of `v2` for the same forty articles. On quality this run does not settle which prompt to ship; on cost `v2` is the clear choice.

`data/baseline.json` was promoted from this run, so `npm run check` prints `ok` for all four cells. Edit a label in `data/golden.json` or tighten a tolerance in `src/regression.ts` and it fails with the metric that moved.

## Design decisions

- Two parsers, kept apart. The production parser is ported unchanged, including its weakness, and tested for it (`"1. 8"` reads as a 1). The fix lives in a second function behind a second prompt variant, so the harness can show the before and after instead of quietly replacing the thing it is meant to measure.
- Include F1 is the headline metric, not exact match. The rubric's numbers are fuzzy by nature; a 7 versus an 8 does not change the newsletter. Whether an article crosses the threshold does. Exact match and MAE are reported because they catch calibration drift, but the regression tolerances are set around the decision.
- Parse coverage has zero tolerance. Every other metric can wobble with the model; a rating that did not parse is a bug in the prompt or the parser, and it should stop the build.
- The baseline is a committed file, promoted by hand. The obvious alternative, comparing against the previous run, means a slow slide never fails. A human looks at a run and decides it is the new reference; that is the whole point of the step.
- A scripted model rather than mocks in every test. The obvious option was to hand-write model responses per test. The scripted client instead reproduces the real formatting habits from the labels with a seed, so the same code path that builds the replay fixture is exercised in tests, and a new habit (say, markdown bullets) is added in one place.

## When not to use this

- The task has no stable right answer. If two editors would disagree on half the labels, the harness measures the editors, not the model. Forty labels is an afternoon of work; a rubric that cannot be labeled consistently needs rewriting before it needs evals.
- The output is free text. These metrics assume an integer per item. Summaries and captions need a judge model or a rubric scorer, which is a different harness with its own failure modes.
- You cannot commit a baseline. Teams that re-rank every run against the last run get a check that never fails. If nobody will own the baseline, skip the check and keep the metrics report.
- Forty items is enough to catch a parser bug or a threshold shift and not enough to resolve a two-point change in F1 with confidence. The tolerances are set for this size; a larger set can tighten them.

## Running it

```
npm test            # offline, node:test, 35 tests
npm run measure     # prints the tables above from data/replay/golden.json
npm run check       # measure, then compare with data/baseline.json; exit 1 on regression
npm run demo        # one six-article batch through v1 and v2, raw answers shown
npm run baseline    # promote runs/latest.json to data/baseline.json
npm run fixture     # replace the recording with a synthetic one from src/scripted.ts (overwrites live data)
npm install && npm run typecheck   # only typescript and @types/node
```

Node 22 runs the TypeScript directly; nothing is built. `npm test`, `npm run measure` and `npm run check` need no network and no keys. With `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the environment (see `.env.example`), `npm run measure` calls the models, records every response to `data/replay/golden.json` with `synthetic: false`, and prints "live" at the top.

## Cost

One live `npm run measure` makes eight calls. From the token counts in the table above and list prices as of 2026-09 (prices change):

- gpt-4o-mini, `v1` + `v2`: (8,373 + 2,109) = 10,482 input tokens at $0.15 per million is $0.00157, plus (80 + 200) = 280 output tokens at $0.60 per million is $0.00017. Total $0.0017.
- claude-haiku-4-5, `v1` + `v2`: (9,489 + 2,341) = 11,830 input tokens at $1.00 per million is $0.01183, plus (86 + 206) = 292 output tokens at $5.00 per million is $0.00146. Total $0.0133.

Total: $0.015 per full live run, so running the check on every pull request costs more in CI minutes than in tokens.
