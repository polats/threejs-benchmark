// Shared request/response contracts between the Devvit client (iframe) and the
// Hono server (serverless). Keep these in sync — they are the single source of
// truth for the typed `devvit-bridge` client.

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  /** This user's best score on this post (0 if none yet). */
  bestScore: number;
};

export type ScoreRequest = {
  score: number;
};

export type ScoreResponse = {
  type: 'score';
  postId: string;
  /** The score that is now recorded for the user (their best). */
  bestScore: number;
  /** 1-based rank on the post leaderboard, or null if not ranked. */
  rank: number | null;
};

export type LeaderboardEntry = {
  username: string;
  score: number;
  rank: number;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  postId: string;
  entries: LeaderboardEntry[];
};

/** A single stress-test result reported by a bench. */
export type BenchResultRequest = {
  /** Bench identifier, e.g. 'instancing', 'gpgpu', 'physics-rapier'. */
  bench: string;
  /** Highest object/light/body count that held the target FPS. */
  capacity: number;
  /** Average FPS at that capacity. */
  fps: number;
  /** Device + renderer info, useful for slicing results. */
  device: { dpr: number; width: number; height: number; backend?: string; gpuTier?: number };
};

export type BenchResultResponse = {
  type: 'bench-result';
  bench: string;
  /** Best capacity recorded across all users for this bench. */
  globalBest: number;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
