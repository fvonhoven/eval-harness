// The editorial profile the harness evaluates against. Copied from the VibeCoder newsletter's
// brand profile so the golden set and the prompt agree on what "relevant" means.
import type { EditorialProfile } from "./types.ts";

export const VIBECODER: EditorialProfile = {
  newsletterName: "VibeCoder Newsletter",
  contentFocus: "AI-assisted development, agentic coding, and building web and mobile apps with AI coding assistants",
  rankingCriteria:
    "9-10: hands-on AI coding tutorials, real shipping case studies, agentic coding workflows, or high-value prompt techniques. " +
    "7-8: meaningful AI coding tool news, comparisons, reviews, or developer productivity guidance. " +
    "5-6: general AI and development topics with a credible coding connection. " +
    "1-4: unrelated AI research, traditional coding with no AI angle, marketing fluff, or thin content.",
  minimumRating: 7,
  maxItems: 8,
  maxPerSource: 3,
};
