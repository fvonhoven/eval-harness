// Shapes shared by the ranking stage and the harness.

export type Article = {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
};

// One labeled example. `rating` is the human score on the same 1 to 10 scale the prompt asks
// the model for; `include` is whether a human would put it in the issue. Both are kept because
// the pipeline's real decision is `include`, and a model can get the number wrong while
// getting the decision right.
export type Labeled = Article & { rating: number; include: boolean; note?: string };

export type GoldenSet = {
  name: string;
  labeledBy: string;
  labeledAt: string;
  minimumRating: number;
  articles: Labeled[];
};

// A rated article as the ranking stage returns it. `rating` is 0 when the model's answer
// could not be parsed for this position, mirroring the production code.
export type Rated = Article & { rating: number; include: boolean };

export type EditorialProfile = {
  newsletterName: string;
  contentFocus: string;
  rankingCriteria: string;
  minimumRating: number;
  maxItems: number;
  maxPerSource: number;
};

export type RunUsage = { calls: number; inputTokens: number; outputTokens: number; latencyMs: number; errors: number };
