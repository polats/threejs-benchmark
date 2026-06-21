// Vercel mock of /api/bench-result. Echoes the reported capacity as the global best.
export default function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  res.status(200).json({
    type: 'bench-result',
    bench: String(body?.bench ?? ''),
    globalBest: Number(body?.capacity) || 0,
  });
}
