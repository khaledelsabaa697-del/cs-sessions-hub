import type { GradingInput, GradingResponse } from "./schema";

export const MOCK_MODEL = "mock-dev";

/**
 * Deterministic stand-in used only when GEMINI_MOCK=1 in development and no API
 * key is configured. It lets you click through the whole grading/review flow
 * without calling Gemini. It is never enabled in production.
 */
export function mockGrade(input: GradingInput): GradingResponse {
  const code = input.code;
  const lines = code.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const issues: string[] = [
    "Mock grading is enabled in development — no AI model was called.",
  ];

  let ratio = 0.4;

  if (/#include\s*<iostream>/.test(code)) ratio += 0.1;
  else issues.push("Missing #include <iostream>.");

  if (/int\s+main\s*\(/.test(code)) ratio += 0.15;
  else issues.push("No int main() entry point was found.");

  if (/\b(for|while)\s*\(/.test(code)) ratio += 0.05;
  if (/\b(if|switch)\s*\(/.test(code)) ratio += 0.05;

  if (/\bstd::(cout|cin)\b|\bcout\b|\bcin\b/.test(code)) ratio += 0.1;
  else issues.push("No console input or output was found.");

  if (lines.length >= 10) ratio += 0.05;

  const score = Math.round(Math.min(1, ratio) * input.maxScore * 10) / 10;

  return {
    score,
    feedback_en: `Mock grading: ...`,
    feedback_ar: `...`,
    issues: issues.slice(0, 6),
    rubric_scores: [],
  };
}
