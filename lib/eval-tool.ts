import Anthropic from "@anthropic-ai/sdk";

export const EVAL_TOOL: Anthropic.Tool = {
  name: "evaluate_draft",
  description: "Evaluate whether a LinkedIn outreach draft is personalized or generic",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["pass", "fail"],
        description: "pass = personalized and effective; fail = generic or templated",
      },
      reason: {
        type: "string",
        description: "One sentence explaining the verdict",
      },
    },
    required: ["verdict", "reason"],
    additionalProperties: false,
  },
};
