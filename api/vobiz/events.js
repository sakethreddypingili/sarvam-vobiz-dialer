// Vobiz Events / Action Callback Serverless Endpoint
export default function handler(req, res) {
  const data = req.method === 'POST' ? req.body || {} : req.query || {};
  console.log('[Vobiz Event Serverless Callback]', JSON.stringify(data));

  res.setHeader('Content-Type', 'application/xml');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;
  return res.status(200).send(xml);
}
