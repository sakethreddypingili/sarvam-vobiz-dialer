import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Vobiz webhooks often send application/x-www-form-urlencoded

// Restore original requested URL if proxied/rewritten by Vercel
app.use((req, res, next) => {
  if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'];
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory call history
const callHistory = [];
const eventLogs = [];

// Helper to escape XML special characters
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// ---------------------------------------------------------------------
// 1. VOBIZ CALL CONTROL INSTRUCTIONS (VobizXML)
// ---------------------------------------------------------------------

/**
 * Answer URL endpoint for Vobiz Voice Applications
 * Required by Vobiz dashboard when configuring your Voice App.
 * Handles both GET and POST webhooks from Vobiz.
 */
const handleVobizAnswer = (req, res) => {
  const data = req.method === 'POST' ? req.body : req.query;
  console.log('[Vobiz Answer Webhook Received]', JSON.stringify(data));

  const to = data.To || data.to || '';
  const from = data.From || data.from || process.env.VOBIZ_CALLER_ID || process.env.SARVAM_AGENT_PHONE_NUMBER || '';
  const callUuid = data.CallUUID || data.call_uuid || 'unknown';
  const direction = data.Direction || data.direction || 'outbound';

  // Record into call history
  const callRecord = {
    id: callUuid,
    targetNumber: to || 'Browser Session',
    callerNumber: from || 'Vobiz App',
    status: 'answered',
    direction,
    initiatedAt: new Date().toISOString(),
    details: data
  };
  callHistory.unshift(callRecord);

  res.set('Content-Type', 'application/xml');

  // If there's a destination number to dial (e.g. from browser dial pad or call forward)
  if (to && to !== from) {
    const callerIdAttr = from ? ` callerId="${escapeXml(from)}"` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Bridging call to destination number -->
    <Dial${callerIdAttr} timeout="30" action="/vobiz/events" method="POST">
        <Number>${escapeXml(to)}</Number>
    </Dial>
</Response>`;
    return res.status(200).send(xml);
  }

  // Fallback greeting response if testing or no destination specified
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak>Welcome to the Vobiz Browser Phone. Your Answer URL endpoint is online and functioning properly.</Speak>
    <Hangup/>
</Response>`;
  return res.status(200).send(xml);
};

app.all('/vobiz/answer', handleVobizAnswer);
app.all('/api/vobiz/answer', handleVobizAnswer);

/**
 * Vobiz Call Events / Action Callback endpoint
 */
const handleVobizEvents = (req, res) => {
  const data = req.method === 'POST' ? req.body : req.query;
  console.log('[Vobiz Event Webhook]', JSON.stringify(data));
  eventLogs.unshift({
    receivedAt: new Date().toISOString(),
    event: data
  });

  res.set('Content-Type', 'application/xml');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;
  return res.status(200).send(xml);
};

app.all('/vobiz/events', handleVobizEvents);
app.all('/api/vobiz/events', handleVobizEvents);

// Health check endpoint
app.get(['/health', '/api/health', '/vobiz/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'vobiz-browser-dialer',
    answerUrl: '/vobiz/answer',
    eventsUrl: '/vobiz/events',
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------
// 2. CONFIGURATION & DIALER APIS
// ---------------------------------------------------------------------

// Get current configuration status
app.get('/api/config', (req, res) => {
  res.json({
    hasApiKey: !!process.env.SARVAM_API_KEY,
    orgId: process.env.SARVAM_ORG_ID || '',
    workspaceId: process.env.SARVAM_WORKSPACE_ID || '',
    agentPhoneNumber: process.env.SARVAM_AGENT_PHONE_NUMBER || process.env.VOBIZ_CALLER_ID || '',
    connectionId: process.env.SARVAM_CONNECTION_ID || '',
    appId: process.env.SARVAM_APP_ID || '',
    appVersion: parseInt(process.env.SARVAM_APP_VERSION || '1', 10),
    vobizAppId: process.env.VOBIZ_APP_ID || '',
    vobizAuthId: process.env.VOBIZ_AUTH_ID || ''
  });
});

// Update runtime configuration
app.post('/api/config', (req, res) => {
  const { agentPhoneNumber, connectionId, appId, appVersion, vobizAppId, vobizAuthId } = req.body;
  if (agentPhoneNumber !== undefined) process.env.SARVAM_AGENT_PHONE_NUMBER = agentPhoneNumber;
  if (connectionId !== undefined) process.env.SARVAM_CONNECTION_ID = connectionId;
  if (appId !== undefined) process.env.SARVAM_APP_ID = appId;
  if (appVersion !== undefined) process.env.SARVAM_APP_VERSION = appVersion;
  if (vobizAppId !== undefined) process.env.VOBIZ_APP_ID = vobizAppId;
  if (vobizAuthId !== undefined) process.env.VOBIZ_AUTH_ID = vobizAuthId;

  res.json({ success: true, message: 'Configuration updated successfully' });
});

// Get call history & event logs
app.get('/api/calls', (req, res) => {
  res.json(callHistory);
});

app.get('/api/events', (req, res) => {
  res.json(eventLogs);
});

// Place call endpoint (Supports Sarvam and Simulated/Direct modes)
app.post('/api/calls/dial', async (req, res) => {
  const { phoneNumber, customConfig } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;

  const agentPhoneNumber = customConfig?.agentPhoneNumber || process.env.SARVAM_AGENT_PHONE_NUMBER || process.env.VOBIZ_CALLER_ID;
  const connectionId = customConfig?.connectionId || process.env.SARVAM_CONNECTION_ID;
  const appId = customConfig?.appId || process.env.SARVAM_APP_ID;
  const appVersion = parseInt(customConfig?.appVersion || process.env.SARVAM_APP_VERSION || '1', 10);

  // If Sarvam configuration is missing, simulate or guide to Vobiz Answer URL
  if (!agentPhoneNumber || !connectionId || !appId || !apiKey) {
    const callRecord = {
      id: 'call_' + Date.now(),
      targetNumber: phoneNumber,
      callerNumber: agentPhoneNumber || '+91 (Config needed)',
      status: 'simulated_success',
      initiatedAt: new Date().toISOString(),
      duration: 0,
      note: 'Dialer ready: Configure Sarvam/Vobiz in Settings or link your Vobiz Application to /vobiz/answer.'
    };
    callHistory.unshift(callRecord);

    return res.json({
      success: true,
      mode: 'simulation',
      attemptId: callRecord.id,
      message: 'Call simulated. Configure your Sarvam Connection ID or Vobiz Answer URL for live carrier dialing.',
      callRecord
    });
  }

  // Real Sarvam API Call
  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;

  const payload = {
    app_config: {
      app_id: appId,
      app_version: appVersion,
      connection_config: {
        connection_id: connectionId,
        agent_phone_number: agentPhoneNumber
      }
    },
    user_config: {
      user_phone_number: phoneNumber
    }
  };

  try {
    const sarvamRes = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await sarvamRes.json();

    if (!sarvamRes.ok) {
      return res.status(sarvamRes.status).json({
        error: responseData.message || responseData.detail || 'Failed to place call via Sarvam',
        details: responseData
      });
    }

    const callRecord = {
      id: responseData.attempt_id,
      targetNumber: phoneNumber,
      callerNumber: agentPhoneNumber,
      status: 'connected',
      initiatedAt: new Date().toISOString(),
      duration: 0
    };
    callHistory.unshift(callRecord);

    return res.json({
      success: true,
      mode: 'live',
      attemptId: responseData.attempt_id,
      callRecord
    });
  } catch (err) {
    console.error('Call routing error:', err);
    return res.status(500).json({ error: err.message || 'Network error dialing number' });
  }
});

export default app;
