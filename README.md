# Browser Phone Dialer & Vobiz / Sarvam Telephony

A web-based phone dialer interface supporting real voice calls via **Vobiz** and **Sarvam Telephony**.

## Features

- 📞 **Interactive Browser Dialpad**: Keypad with real DTMF audio feedback, microphone/speaker device selection, and input level metering.
- ⚡ **Vobiz Call Control (VobizXML)**: Built-in `/vobiz/answer` and `/vobiz/events` webhooks responding with `<Response><Dial>` instructions for Vobiz Voice Applications.
- 🇮🇳 **Sarvam Samvaad Carrier Routing**: Integrated with Sarvam Outbounds API (`apps.sarvam.ai`) to route calls through rented or registered numbers.
- 🚀 **Vercel Serverless Ready**: Full support for Vercel deployment with serverless Express handler.

---

## Vobiz Voice Application Setup

When creating a **Voice Application** on [Vobiz Console](https://console.vobiz.ai/):

1. **Answer URL**:
   ```
   https://<your-deployed-domain>.vercel.app/vobiz/answer
   ```
   *Method: `POST` or `GET`*
   
   This endpoint immediately responds with valid VobizXML:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
       <Dial callerId="+918047168000" timeout="30" action="/vobiz/events" method="POST">
           <Number>+919876543210</Number>
       </Dial>
   </Response>
   ```

2. **Event / Action Callback URL**:
   ```
   https://<your-deployed-domain>.vercel.app/vobiz/events
   ```

---

## Local Development

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/sakethreddypingili/sarvam-vobiz-dialer.git
   cd sarvam-vobiz-dialer
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Start server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

---

## Deploy to Vercel

### Option 1: Via Vercel Web Dashboard (Recommended)
1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the GitHub repository: `sakethreddypingili/sarvam-vobiz-dialer`.
3. Keep default settings and click **Deploy**.
4. Once deployed, copy your deployment URL and set your Vobiz Answer URL to:
   ```
   https://<your-project>.vercel.app/vobiz/answer
   ```
