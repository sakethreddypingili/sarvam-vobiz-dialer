// Browser Phone Dialer Application Logic

// Web Audio API for Keypad DTMF & Feedback
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// DTMF Tone Frequencies for standard phone keypad
const dtmfFreqs = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
};

function playDTMF(digit) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const freqs = dtmfFreqs[digit];
    if (!freqs) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 0.18);
  } catch (e) {
    console.error('Audio playback error:', e);
  }
}

// State
let callActive = false;
let callStartTime = null;
let timerInterval = null;
let isMuted = false;
let isSpeakerOn = true;
let micStream = null;
let audioAnalyser = null;
let animFrameId = null;

// DOM Elements
const phoneInput = document.getElementById('phoneNumber');
const backspaceBtn = document.getElementById('backspaceBtn');
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');
const callOverlay = document.getElementById('callOverlay');
const callStateTitle = document.getElementById('callStateTitle');
const callingNumber = document.getElementById('callingNumber');
const callTimer = document.getElementById('callTimer');
const callerIdDisplay = document.getElementById('callerIdDisplay');
const micBtn = document.getElementById('micBtn');
const speakerBtn = document.getElementById('speakerBtn');
const micSelect = document.getElementById('micSelect');
const speakerSelect = document.getElementById('speakerSelect');
const meterFill = document.getElementById('meterFill');
const recentCallsList = document.getElementById('recentCallsList');
const callCountBadge = document.getElementById('callCountBadge');

// Settings Modal DOM
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsForm = document.getElementById('settingsForm');
const cfgAgentNumber = document.getElementById('cfgAgentNumber');
const cfgConnectionId = document.getElementById('cfgConnectionId');
const cfgAppId = document.getElementById('cfgAppId');
const cfgAppVersion = document.getElementById('cfgAppVersion');

// Load App Configuration
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.agentPhoneNumber) {
      callerIdDisplay.textContent = data.agentPhoneNumber;
      cfgAgentNumber.value = data.agentPhoneNumber;
    } else {
      callerIdDisplay.textContent = 'Configure in Settings';
    }
    if (data.connectionId) cfgConnectionId.value = data.connectionId;
    if (data.appId) cfgAppId.value = data.appId;
    if (data.appVersion) cfgAppVersion.value = data.appVersion;

    // Populate public Vobiz Answer URL
    const answerInput = document.getElementById('vobizAnswerUrlInput');
    const copyBtn = document.getElementById('copyAnswerUrlBtn');
    const copyMsg = document.getElementById('copySuccessMsg');
    if (answerInput) {
      const publicAnswerUrl = window.location.origin + '/vobiz/answer';
      answerInput.value = publicAnswerUrl;
      
      if (copyBtn && !copyBtn.dataset.bound) {
        copyBtn.dataset.bound = 'true';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(answerInput.value).then(() => {
            if (copyMsg) {
              copyMsg.style.display = 'block';
              setTimeout(() => { copyMsg.style.display = 'none'; }, 2500);
            }
          });
        });
      }
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

// Load Call History
async function loadCallHistory() {
  try {
    const res = await fetch('/api/calls');
    const calls = await res.json();
    callCountBadge.textContent = calls.length;

    if (calls.length === 0) {
      recentCallsList.innerHTML = '<div class="empty-state">No recent calls yet</div>';
      return;
    }

    recentCallsList.innerHTML = calls.map(c => `
      <div class="call-item" onclick="selectNumber('${c.targetNumber}')">
        <div class="call-item-left">
          <span class="call-item-icon">${c.status === 'connected' ? '↗️' : '📞'}</span>
          <div>
            <div class="call-item-number">${c.targetNumber}</div>
            <div class="call-item-time">${new Date(c.initiatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        <div class="call-item-duration">${formatDuration(c.duration || 0)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load call history:', err);
  }
}

window.selectNumber = function(num) {
  // Strip +91 if present for input field
  const clean = num.replace(/^\+91/, '');
  phoneInput.value = clean;
};

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Setup Media Devices & Mic Visualizer
async function setupAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    micSelect.innerHTML = '';
    speakerSelect.innerHTML = '';

    devices.forEach(device => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.text = device.label || `${device.kind} (${opt.value.slice(0, 5)}...)`;

      if (device.kind === 'audioinput') {
        micSelect.appendChild(opt);
      } else if (device.kind === 'audiooutput') {
        speakerSelect.appendChild(opt);
      }
    });

    // Request Mic stream for level meter
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(micStream);
    audioAnalyser = ctx.createAnalyser();
    audioAnalyser.fftSize = 64;
    source.connect(audioAnalyser);

    updateMeter();
  } catch (e) {
    console.warn('Audio devices/permissions could not be initialized:', e.message);
  }
}

function updateMeter() {
  if (!audioAnalyser || isMuted) {
    meterFill.style.width = '0%';
  } else {
    const data = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const pct = Math.min(100, Math.round((avg / 128) * 100));
    meterFill.style.width = `${pct}%`;
  }
  animFrameId = requestAnimationFrame(updateMeter);
}

// Keypad Event Listeners
document.querySelectorAll('.key-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    playDTMF(key);
    phoneInput.value += key;
  });
});

backspaceBtn.addEventListener('click', () => {
  phoneInput.value = phoneInput.value.slice(0, -1);
});

// Call Placement
callBtn.addEventListener('click', async () => {
  let target = phoneInput.value.trim();
  if (!target) {
    alert('Please enter a phone number to dial');
    return;
  }

  // Format to E.164 with +91
  if (!target.startsWith('+')) {
    target = '+91' + target;
  }

  // Start Call UI
  startCallUI(target);

  try {
    const res = await fetch('/api/calls/dial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: target })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Call Error: ${data.error || 'Failed to place call'}`);
      endCallUI();
      return;
    }

    if (data.mode === 'simulation') {
      callStateTitle.textContent = 'Call Connected (Test Mode)';
      console.log('Simulated Call Placed:', data);
    } else {
      callStateTitle.textContent = 'Call Connected via Sarvam';
      console.log('Live Call Placed:', data);
    }
  } catch (err) {
    alert('Failed to place call: ' + err.message);
    endCallUI();
  }
});

hangupBtn.addEventListener('click', () => {
  endCallUI();
});

function startCallUI(target) {
  callActive = true;
  callingNumber.textContent = target;
  callStateTitle.textContent = 'Dialing...';
  callOverlay.classList.remove('hidden');
  callBtn.classList.add('hidden');
  hangupBtn.classList.remove('hidden');

  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - callStartTime) / 1000);
    callTimer.textContent = formatDuration(elapsedSec);
  }, 1000);
}

function endCallUI() {
  callActive = false;
  clearInterval(timerInterval);
  callOverlay.classList.add('hidden');
  callBtn.classList.remove('hidden');
  hangupBtn.classList.add('hidden');
  callTimer.textContent = '00:00';
  loadCallHistory();
}

// Audio Controls
micBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (micStream) {
    micStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  }
  if (isMuted) {
    micBtn.classList.remove('active');
    micBtn.classList.add('muted');
    micBtn.querySelector('.ctrl-label').textContent = 'Unmute Mic';
    micBtn.querySelector('.ctrl-icon').textContent = '🔇';
  } else {
    micBtn.classList.remove('muted');
    micBtn.classList.add('active');
    micBtn.querySelector('.ctrl-label').textContent = 'Mute Mic';
    micBtn.querySelector('.ctrl-icon').textContent = '🎙️';
  }
});

speakerBtn.addEventListener('click', () => {
  isSpeakerOn = !isSpeakerOn;
  if (isSpeakerOn) {
    speakerBtn.classList.add('active');
    speakerBtn.querySelector('.ctrl-label').textContent = 'Speaker ON';
    speakerBtn.querySelector('.ctrl-icon').textContent = '🔊';
  } else {
    speakerBtn.classList.remove('active');
    speakerBtn.querySelector('.ctrl-label').textContent = 'Speaker OFF';
    speakerBtn.querySelector('.ctrl-icon').textContent = '🔈';
  }
});

// Settings Modal
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    agentPhoneNumber: cfgAgentNumber.value.trim(),
    connectionId: cfgConnectionId.value.trim(),
    appId: cfgAppId.value.trim(),
    appVersion: parseInt(cfgAppVersion.value || '1', 10)
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      settingsModal.classList.add('hidden');
      loadConfig();
      alert('Telephony settings saved!');
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
});

// Init
loadConfig();
loadCallHistory();
setupAudioDevices();
