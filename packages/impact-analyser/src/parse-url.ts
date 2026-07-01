export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/** Parse a GitHub PR URL into owner/repo/number, or null if it isn't one. */
export function parseGitHubPrUrl(url: string): PrRef | null {
  const match = url
    .trim()
    .match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) };
}
