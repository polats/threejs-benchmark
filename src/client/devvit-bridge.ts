import type {
  BenchResultRequest,
  BenchResultResponse,
  InitResponse,
  LeaderboardResponse,
  ScoreResponse,
} from '../shared/api';

// Typed wrapper over the Hono server's /api routes. All client <-> server traffic
// goes through here so call sites get end-to-end types from src/shared/api.ts.
//
// Note: inside the Devvit webview, prefer navigateTo / showToast from
// '@devvit/web/client' over window.location / window.alert (see AGENTS.md).

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const bridge = {
  init: () => getJson<InitResponse>('/api/init'),
  submitScore: (score: number) => postJson<ScoreResponse>('/api/score', { score }),
  leaderboard: () => getJson<LeaderboardResponse>('/api/leaderboard'),
  reportBench: (result: BenchResultRequest) =>
    postJson<BenchResultResponse>('/api/bench-result', result),
};
