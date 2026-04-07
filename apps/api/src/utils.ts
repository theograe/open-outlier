export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function subtractDays(days: number): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
  }

  return sorted[midpoint];
}

export function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildRollingMedianMap<T extends { id: string; views: number; publishedAt?: string | null }>(
  items: T[],
  neighborCount = 10,
): Map<string, number> {
  const sorted = [...items].sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return leftTime - rightTime;
  });

  const result = new Map<string, number>();

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current?.id) {
      continue;
    }

    const neighborCandidates = sorted
      .map((item, candidateIndex) => ({
        item,
        distance: Math.abs(candidateIndex - index),
        candidateIndex,
      }))
      .filter((candidate) => candidate.candidateIndex !== index)
      .sort((left, right) => {
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return left.candidateIndex - right.candidateIndex;
      })
      .slice(0, neighborCount);

    const neighborViews: number[] = [];
    for (const candidate of neighborCandidates) {
      const value = Math.max(candidate.item?.views ?? 0, 0);
      if (value > 0) {
        neighborViews.push(value);
      }
    }

    result.set(current.id, median(neighborViews));
  }

  return result;
}
