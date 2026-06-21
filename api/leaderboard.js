// Vercel mock of /api/leaderboard. Returns a small sample board for the playground.
export default function handler(_req, res) {
  res.status(200).json({
    type: 'leaderboard',
    postId: 'web',
    entries: [
      { username: 'snoo_fan', score: 420, rank: 1 },
      { username: 'pixelpusher', score: 310, rank: 2 },
      { username: 'guest', score: 0, rank: 3 },
    ],
  });
}
