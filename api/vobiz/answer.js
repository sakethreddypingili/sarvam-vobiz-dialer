// Vobiz Answer URL Serverless Endpoint
export default function handler(req, res) {
  const data = req.method === 'POST' ? req.body || {} : req.query || {};
  console.log('[Vobiz Answer Serverless Request]', JSON.stringify(data));

  const to = data.To || data.to || '';
  const from = data.From || data.from || process.env.VOBIZ_CALLER_ID || process.env.SARVAM_AGENT_PHONE_NUMBER || '';

  // Escape XML
  const cleanTo = String(to).replace(/[<>&'"]/g, '');
  const cleanFrom = String(from).replace(/[<>&'"]/g, '');

  res.setHeader('Content-Type', 'application/xml');

  if (cleanTo && cleanTo !== cleanFrom) {
    const callerIdAttr = cleanFrom ? ` callerId="${cleanFrom}"` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Bridge call to destination number -->
    <Dial${callerIdAttr} timeout="30" action="/vobiz/events" method="POST">
        <Number>${cleanTo}</Number>
    </Dial>
</Response>`;
    return res.status(200).send(xml);
  }

  // Greeting if testing or empty destination
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak>Welcome to the Vobiz Browser Phone. Your Answer URL endpoint is active and working properly.</Speak>
    <Hangup/>
</Response>`;
  return res.status(200).send(xml);
}
