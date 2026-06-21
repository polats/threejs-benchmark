// Vercel serverless mock of the Devvit /api/init endpoint, so the standalone
// playground (Vercel) behaves like the real app. Stateless — no Reddit/Redis.
export default function handler(_req, res) {
  res.status(200).json({ type: 'init', postId: 'web', username: 'guest', bestScore: 0 });
}
