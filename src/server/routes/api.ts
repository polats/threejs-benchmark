import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  BenchResultRequest,
  BenchResultResponse,
  ErrorResponse,
  InitResponse,
  LeaderboardResponse,
  ScoreRequest,
  ScoreResponse,
} from '../../shared/api';

export const api = new Hono();

// Per-post leaderboard sorted set: member = username, score = best score.
const leaderboardKey = (postId: string) => `leaderboard:${postId}`;
// Global per-bench best capacity (across all posts/users).
const benchKey = (bench: string) => `bench:best:${bench}`;

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const best = await redis.zScore(leaderboardKey(postId), username);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      username,
      bestScore: best ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'init failed';
    return c.json<ErrorResponse>({ status: 'error', message }, 400);
  }
});

api.post('/score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const body = (await c.req.json()) as ScoreRequest;
  const score = Number(body.score);
  if (!Number.isFinite(score)) {
    return c.json<ErrorResponse>({ status: 'error', message: 'score must be a number' }, 400);
  }

  const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
  const key = leaderboardKey(postId);

  const previous = (await redis.zScore(key, username)) ?? 0;
  const bestScore = Math.max(previous, score);
  if (bestScore !== previous) {
    await redis.zAdd(key, { member: username, score: bestScore });
  }

  const total = await redis.zCard(key);
  const ascRank = await redis.zRank(key, username);
  const rank = ascRank === undefined ? null : total - ascRank;

  return c.json<ScoreResponse>({ type: 'score', postId, bestScore, rank });
});

api.get('/leaderboard', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const key = leaderboardKey(postId);
  const rows = await redis.zRange(key, 0, 9, { reverse: true, by: 'score' });

  return c.json<LeaderboardResponse>({
    type: 'leaderboard',
    postId,
    entries: rows.map((row, i) => ({
      username: row.member,
      score: row.score,
      rank: i + 1,
    })),
  });
});

api.post('/bench-result', async (c) => {
  const body = (await c.req.json()) as BenchResultRequest;
  const bench = String(body.bench);
  const capacity = Number(body.capacity);
  if (!bench || !Number.isFinite(capacity)) {
    return c.json<ErrorResponse>({ status: 'error', message: 'invalid bench result' }, 400);
  }

  const key = benchKey(bench);
  const previous = Number((await redis.get(key)) ?? 0);
  const globalBest = Math.max(previous, capacity);
  if (globalBest !== previous) {
    await redis.set(key, String(globalBest));
  }

  return c.json<BenchResultResponse>({ type: 'bench-result', bench, globalBest });
});
