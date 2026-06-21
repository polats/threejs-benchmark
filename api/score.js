// Vercel mock of /api/score. Stateless: echoes the submitted score back as the
// "best" (real persistence lives in the Devvit server).
export default function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const score = Number(body?.score) || 0;
  res.status(200).json({ type: 'score', postId: 'web', bestScore: score, rank: 1 });
}
