import { SearchMatchResult } from '@stage/shared';

export const POPULAR_DESTINATIONS = ['Juja', 'Ngong', 'Kikuyu', 'Westlands'];

function routeText(m: SearchMatchResult): string {
  const r = m.route;
  return `${r.destinationName} ${r.destinationArea} ${r.corridorName}`.toLowerCase();
}

/** Real count of dataset routes that mention the keyword (never invented). */
export function countRoutesFor(
  matches: SearchMatchResult[],
  keyword: string
): number {
  const k = keyword.toLowerCase();
  return matches.filter((m) => routeText(m).includes(k)).length;
}

export function findRoutesFor(
  matches: SearchMatchResult[],
  keyword: string
): SearchMatchResult[] {
  const k = keyword.toLowerCase();
  return matches.filter((m) => routeText(m).includes(k));
}

export function formatWalkDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

