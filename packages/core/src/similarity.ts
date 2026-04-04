import { tokenizeTitle } from "./ai.js";

export function similarityScore(left: string, right: string): number {
  const leftTokens = new Set(tokenizeTitle(left));
  const rightTokens = new Set(tokenizeTitle(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

export function titleFormat(title: string): string {
  if (/^\d+/.test(title)) {
    return "number-led";
  }
  if (title.includes("?")) {
    return "question";
  }
  if (/how /i.test(title)) {
    return "how-to";
  }
  if (/I /i.test(title)) {
    return "personal-story";
  }
  return "statement";
}
