// Andon Radio Control — unofficial local client
// Talks directly to the radio's local WebSocket control API (ws://<ip>:8080/ws).
// See ../WS-PROTOCOL.md for the reverse-engineered protocol this is built on.

const STORAGE_KEY = 'andonRadioIp';
const WS_PORT = 8080;
const WS_PATH = '/ws';
const RECONCILE_DELAY_MS = 500; // work around the server's one-command reply lag

// Known stations, keyed by streamUrl, so the list shows names instead of raw URLs.
// Falls back to a generic label for anything not in this table (e.g. a station
// someone else pushed via set_stations).
const STATION_METADATA = {
  'https://streaming.live365.com/a46431': {
    name: 'Thinking Frequencies', subtitle: 'by Claude Opus 5',
    image: 'https://joghygnyphyxmoqvvvxf.supabase.co/storage/v1/object/public/profile-pics/thinkingfrequencies.png'
  },
  'https://streaming.live365.com/a81044': {
    name: 'OpenAIR', subtitle: 'by GPT 5.6 Sol',
    image: 'https://joghygnyphyxmoqvvvxf.supabase.co/storage/v1/object/public/profile-pics/openair.png'
  },
  'https://streaming.live365.com/a15419': {
    name: "Grok'n Roll Radio", subtitle: 'by Grok 4.5',
    image: 'https://joghygnyphyxmoqvvvxf.supabase.co/storage/v1/object/public/profile-pics/groknroll.png'
  },
  'https://streaming.live365.com/a13541': {
    name: 'Backlink Broadcast', subtitle: 'by Gemini 3.6 Flash',
    image: 'https://joghygnyphyxmoqvvvxf.supabase.co/storage/v1/object/public/profile-pics/backlinkbroadcast.png'
  },
  'https://ice1.somafm.com/groovesalad-128-mp3': { name: 'Groove Salad', subtitle: 'SomaFM — ambient/downtempo' },
  'https://ice1.somafm.com/dronezone-128-mp3':   { name: 'Drone Zone',   subtitle: 'SomaFM — ambient' },
  'https://ice1.somafm.com/secretagent-128-mp3': { name: 'Secret Agent', subtitle: 'SomaFM — spy/lounge' },
  'https://ice1.somafm.com/beatblender-128-mp3': { name: 'Beat Blender', subtitle: 'SomaFM — deep house' },
  'https://ice1.somafm.com/lush-128-mp3':        { name: 'Lush',         subtitle: 'SomaFM — vocal chill' },
};

// The 4 factory stations, in the device's native order (see ../stations/README.md).
// "Reset to default" pushes exactly this list back to the radio.
const DEFAULT_STATIONS = [
  'https://streaming.live365.com/a15419', // Grok'n Roll Radio
  'https://streaming.live365.com/a81044', // OpenAIR
  'https://streaming.live365.com/a46431', // Thinking Frequencies
  'https://streaming.live365.com/a13541', // Backlink Broadcast
];

// Verified public streams offered in the "Add station" modal (see ../stations/README.md).
const POPULAR_STATIONS = [
  { name: 'Groove Salad',        subtitle: 'SomaFM — ambient/downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'Drone Zone',          subtitle: 'SomaFM — ambient',           url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'Secret Agent',        subtitle: 'SomaFM — spy/lounge',        url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'Beat Blender',        subtitle: 'SomaFM — deep house',        url: 'https://ice1.somafm.com/beatblender-128-mp3' },
  { name: 'Lush',                subtitle: 'SomaFM — vocal chill',       url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'Radio Paradise — Main Mix',   subtitle: 'Eclectic rock/alt',  url: 'https://stream.radioparadise.com/mp3-128' },
  { name: 'Radio Paradise — Mellow Mix', subtitle: 'Mellow/acoustic',    url: 'https://stream.radioparadise.com/mellow-128' },
  { name: 'Radio Paradise — Rock Mix',   subtitle: 'Rock',               url: 'https://stream.radioparadise.com/rock-128' },
  { name: 'KEXP Seattle',        subtitle: 'Indie/alt (live DJ)',        url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { name: 'WFMU',                subtitle: 'Freeform/eclectic',          url: 'https://stream0.wfmu.org/freeform-128k' },
  { name: 'Radio Swiss Jazz',    subtitle: 'Jazz',                       url: 'http://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { name: 'Radio Swiss Classic', subtitle: 'Classical',                  url: 'http://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  { name: 'Nightwave Plaza',     subtitle: 'Vaporwave',                  url: 'https://radio.plaza.one/mp3' },
  { name: 'BBC World Service',   subtitle: 'News',                       url: 'http://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR Program Stream',  subtitle: 'News/talk',                  url: 'https://npr-ice.streamguys1.com/live.mp3' },
];

// ---------- DOM ----------
const connectPanel   = document.getElementById('connect-panel');
const devicePanel    = document.getElementById('device-panel');
const connectForm    = document.getElementById('connect-form');
const ipInput        = document.getElementById('ip-input');
const connectStatus  = document.getElementById('connect-status');
const disconnectBtn  = document.getElementById('disconnect-btn');

const powerLamp   = document.getElementById('power-lamp');
const npName      = document.getElementById('np-name');
const npSub       = document.getElementById('np-sub');
const deviceIdEl  = document.getElementById('device-id');

const prevBtn     = document.getElementById('prev-btn');
const nextBtn     = document.getElementById('next-btn');
const playBtn     = document.getElementById('play-btn');
const playIcon    = document.getElementById('play-icon');
const pauseIcon   = document.getElementById('pause-icon');
const playLabel   = document.getElementById('play-label');

const muteBtn      = document.getElementById('mute-btn');
const mutedIcon    = document.getElementById('muted-icon');
const unmutedIcon  = document.getElementById('unmuted-icon');
const muteLabel    = document.getElementById('mute-label');

const knob        = document.getElementById('volume-knob');
const knobWrap     = knob.closest('.knob-wrap');
const knobIndicator = knob.querySelector('.knob-indicator');
const volumeValue  = document.getElementById('volume-value');

const stationList  = document.getElementById('station-list');
const resetStationsBtn = document.getElementById('reset-stations-btn');

// ---------- State ----------
let ws = null;
let reconcileTimer = null;
let currentState = null; // last known RadioState from device
let draggingKnob = false;
let localVolumePreview = null; // optimistic value while dragging, before server confirms

let currentHost = null;
let manualDisconnect = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_ATTEMPTS = 15;
let connectTimeoutTimer = null;
const CONNECT_TIMEOUT_MS = 8000;
let lastErrorMsg = null;

// ---------- Helpers ----------

function stationLabel(station) {
  const meta = STATION_METADATA[station.streamUrl];
  if (meta) return meta;
  return { name: `Station ${station.id}`, subtitle: station.streamUrl, image: null };
}

function setStatus(msg, kind) {
  connectStatus.textContent = msg;
  connectStatus.className = 'status-line' + (kind ? ' ' + kind : '');
}

function volumeToAngle(v) {
  const clamped = Math.max(0, Math.min(100, v));
  return -135 + (clamped / 100) * 270;
}

// ---------- WebSocket ----------

function connect(host) {
  clearTimeout(reconnectTimer);
  clearTimeout(connectTimeoutTimer);
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  currentHost = host;
  manualDisconnect = false;
  setStatus('Connecting to ' + host + '…', 'connecting');
  connectPanel.classList.remove('hidden');
  devicePanel.classList.add('hidden');

  let socket;
  try {
    socket = new WebSocket(`ws://${host}:${WS_PORT}${WS_PATH}`);
  } catch (e) {
    setStatus('Invalid address: ' + e.message, 'err');
    return;
  }
  ws = socket;

  connectTimeoutTimer = setTimeout(() => {
    if (ws === socket && socket.readyState !== WebSocket.OPEN) {
      lastErrorMsg = 'Timed out trying to reach ' + host + ' — check the address and that you’re on the same network';
      try { socket.close(); } catch (e) {}
    }
  }, CONNECT_TIMEOUT_MS);

  socket.addEventListener('open', () => {
    clearTimeout(connectTimeoutTimer);
    reconnectAttempt = 0;
    lastErrorMsg = null;
    setStatus('Connected', 'ok');
    connectPanel.classList.add('hidden');
    devicePanel.classList.remove('hidden');
    send({ cmd: 'get_state' });
  });

  socket.addEventListener('message', (evt) => {
    let data;
    try { data = JSON.parse(evt.data); } catch (e) { return; }
    currentState = data;
    render(data);
  });

  socket.addEventListener('close', () => {
    if (ws !== socket) return;
    clearTimeout(connectTimeoutTimer);
    devicePanel.classList.add('hidden');
    connectPanel.classList.remove('hidden');

    if (manualDisconnect) {
      setStatus('Not connected');
      return;
    }
    scheduleReconnect(host);
  });

  socket.addEventListener('error', () => {
    lastErrorMsg = 'Could not reach ' + host + ' — check the address and that you’re on the same network';
    setStatus(lastErrorMsg, 'err');
  });
}

function scheduleReconnect(host) {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    setStatus((lastErrorMsg || 'Disconnected') + ' — gave up after several attempts. Try Connect again.', 'err');
    return;
  }
  const delaySec = Math.round(Math.min(1500 * Math.pow(2, reconnectAttempt), 6000) / 1000);
  reconnectAttempt++;
  setStatus(`${lastErrorMsg || 'Disconnected'} — reconnecting in ${delaySec}s (attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`, 'err');
  reconnectTimer = setTimeout(() => connect(host), delaySec * 1000);
}

function send(cmd) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(cmd));
  // The device's replies lag one command behind (see WS-PROTOCOL.md), so
  // follow up with a plain get_state shortly after any write to reconcile.
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => send({ cmd: 'get_state' }), RECONCILE_DELAY_MS);
}

// ---------- Rendering ----------

function render(state) {
  powerLamp.classList.toggle('lit', !!state.playing);
  playIcon.style.display = state.playing ? 'none' : '';
  pauseIcon.style.display = state.playing ? '' : 'none';
  playLabel.textContent = state.playing ? 'Pause' : 'Play';

  muteBtn.classList.toggle('active', !!state.muted);
  mutedIcon.style.display = state.muted ? '' : 'none';
  unmutedIcon.style.display = state.muted ? 'none' : '';
  muteLabel.textContent = state.muted ? 'Unmute' : 'Mute';
  knobWrap.classList.toggle('muted', !!state.muted);

  deviceIdEl.textContent = state.hostname || state.device_id || '';

  const stations = state.stations || [];
  const current = stations[state.station_index];
  if (current) {
    const meta = stationLabel(current);
    npName.textContent = meta.name;
    npSub.textContent = meta.subtitle || '';
  } else {
    npName.textContent = '—';
    npSub.textContent = '';
  }

  if (!draggingKnob) {
    const v = typeof state.volume === 'number' ? state.volume : 0;
    knobIndicator.style.transform = `translateX(-50%) rotate(${volumeToAngle(v)}deg)`;
    knob.setAttribute('aria-valuenow', String(v));
    volumeValue.textContent = v;
  }

  renderStations(stations, state.station_index);
}

function renderStations(stations, selectedIndex) {
  stationList.innerHTML = '';

  if (!stations.length) {
    const empty = document.createElement('li');
    empty.className = 'station-empty';
    empty.textContent = 'No stations on this device yet.';
    stationList.appendChild(empty);
    return;
  }

  stations.forEach((station, idx) => {
    const meta = stationLabel(station);
    const li = document.createElement('li');
    li.className = 'station-item' + (idx === selectedIndex ? ' selected' : '');
    li.addEventListener('click', () => send({ cmd: 'set_station', index: idx }));

    function makeLetterAvatar() {
      const fallback = document.createElement('div');
      fallback.className = 'station-art station-art-letter';
      fallback.textContent = (meta.name || '?').charAt(0).toUpperCase();
      return fallback;
    }

    if (meta.image) {
      const img = document.createElement('img');
      img.className = 'station-art';
      img.src = meta.image;
      img.alt = '';
      // If the art host is unreachable (e.g. no WAN uplink), degrade to the
      // same letter avatar unknown stations use instead of a broken image.
      img.addEventListener('error', () => {
        img.replaceWith(makeLetterAvatar());
      });
      li.appendChild(img);
    } else {
      li.appendChild(makeLetterAvatar());
    }

    const textWrap = document.createElement('div');
    textWrap.className = 'station-text';
    const nameEl = document.createElement('div');
    nameEl.className = 'station-name';
    nameEl.textContent = meta.name;
    const subEl = document.createElement('div');
    subEl.className = 'station-sub';
    subEl.textContent = meta.subtitle || station.streamUrl;
    textWrap.appendChild(nameEl);
    textWrap.appendChild(subEl);
    li.appendChild(textWrap);

    const idxEl = document.createElement('div');
    idxEl.className = 'station-idx';
    idxEl.textContent = String(idx).padStart(2, '0');
    li.appendChild(idxEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'station-remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Remove station';
    removeBtn.setAttribute('aria-label', 'Remove ' + meta.name);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also select the station
      confirmRemoveStation(idx, meta.name);
    });
    li.appendChild(removeBtn);

    stationList.appendChild(li);
  });
}

// ---------- Controls ----------

playBtn.addEventListener('click', () => {
  if (!currentState) return;
  send({ cmd: currentState.playing ? 'pause' : 'play' });
});

function stepStation(delta) {
  if (!currentState || !currentState.stations || !currentState.stations.length) return;
  const len = currentState.stations.length;
  const next = ((currentState.station_index + delta) % len + len) % len;
  send({ cmd: 'set_station', index: next });
}

prevBtn.addEventListener('click', () => stepStation(-1));
nextBtn.addEventListener('click', () => stepStation(1));

// ---------- Station list management ----------

// Push a full station list to the device, re-numbering ids 0..n-1 so indices
// stay contiguous (the protocol only supports whole-list replacement).
function pushStations(urls) {
  const stations = urls.map((url, i) => ({ id: i, streamUrl: url }));
  send({ cmd: 'set_stations', stations });
}

function currentStationUrls() {
  if (!currentState || !currentState.stations) return [];
  return currentState.stations.map((s) => s.streamUrl);
}

function addStation(url) {
  const urls = currentStationUrls();
  if (urls.includes(url)) return; // already present, no-op
  urls.push(url);
  pushStations(urls);
}

function removeStation(index) {
  const urls = currentStationUrls();
  if (index < 0 || index >= urls.length) return;
  const wasSelected = currentState.station_index;
  urls.splice(index, 1);
  pushStations(urls);
  // If we removed the currently-playing station or one before it, nudge the
  // selection so it stays pointed at a sensible entry after re-indexing.
  if (urls.length && index <= wasSelected) {
    const newIdx = Math.max(0, Math.min(wasSelected - 1, urls.length - 1));
    setTimeout(() => send({ cmd: 'set_station', index: newIdx }), RECONCILE_DELAY_MS + 120);
  }
}

resetStationsBtn.addEventListener('click', () => {
  openConfirm(
    'Reset stations?',
    'This replaces the current list with the 4 original Andon FM stations.',
    'Reset',
    () => pushStations(DEFAULT_STATIONS)
  );
});

function confirmRemoveStation(index, name) {
  openConfirm(
    'Remove station?',
    `Remove “${name}” from the radio? You can add it back later.`,
    'Remove',
    () => removeStation(index)
  );
}

// ---------- Add-station modal ----------

const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose    = document.getElementById('modal-close');
const popularList   = document.getElementById('popular-list');
const addStationBtn = document.getElementById('add-station-btn');

function renderPopularList() {
  const existing = new Set(currentStationUrls());
  popularList.innerHTML = '';
  POPULAR_STATIONS.forEach((s) => {
    const alreadyAdded = existing.has(s.url);
    const li = document.createElement('li');
    li.className = 'popular-item' + (alreadyAdded ? ' added' : '');

    const textWrap = document.createElement('div');
    textWrap.className = 'popular-text';
    const nameEl = document.createElement('div');
    nameEl.className = 'popular-name';
    nameEl.textContent = s.name;
    const subEl = document.createElement('div');
    subEl.className = 'popular-sub';
    subEl.textContent = s.subtitle;
    textWrap.appendChild(nameEl);
    textWrap.appendChild(subEl);
    li.appendChild(textWrap);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    if (alreadyAdded) {
      btn.textContent = '✓ Added';
      btn.disabled = true;
    } else {
      btn.textContent = '+ Add';
      btn.addEventListener('click', () => {
        addStation(s.url);
        // Optimistically mark it added in the modal without waiting for state.
        li.classList.add('added');
        btn.textContent = '✓ Added';
        btn.disabled = true;
      });
    }
    li.appendChild(btn);
    popularList.appendChild(li);
  });
}

function openAddModal() {
  renderPopularList();
  modalBackdrop.classList.remove('hidden');
}

function closeAddModal() {
  modalBackdrop.classList.add('hidden');
}

addStationBtn.addEventListener('click', openAddModal);
modalClose.addEventListener('click', closeAddModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeAddModal();
});

// ---------- Confirmation modal ----------

const confirmBackdrop = document.getElementById('confirm-backdrop');
const confirmTitle    = document.getElementById('confirm-title');
const confirmMessage  = document.getElementById('confirm-message');
const confirmOk       = document.getElementById('confirm-ok');
const confirmCancel   = document.getElementById('confirm-cancel');
let confirmCallback = null;

function openConfirm(title, message, okLabel, cb) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOk.textContent = okLabel || 'Confirm';
  confirmCallback = cb;
  confirmBackdrop.classList.remove('hidden');
}

function closeConfirm() {
  confirmBackdrop.classList.add('hidden');
  confirmCallback = null;
}

confirmOk.addEventListener('click', () => {
  const cb = confirmCallback;
  closeConfirm();
  if (cb) cb();
});
confirmCancel.addEventListener('click', closeConfirm);
confirmBackdrop.addEventListener('click', (e) => {
  if (e.target === confirmBackdrop) closeConfirm();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAddModal();
    closeConfirm();
  }
});

muteBtn.addEventListener('click', () => {
  if (!currentState) return;
  send({ cmd: currentState.muted ? 'unmute' : 'mute' });
});

// ---------- Rotary volume knob ----------

function angleFromCenter(clientX, clientY) {
  const rect = knob.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let deg = Math.atan2(dx, -dy) * (180 / Math.PI); // 0deg = straight up
  return deg;
}

function angleToVolume(deg) {
  // Dead zone at the bottom of the knob; clamp to nearest end.
  if (deg < -135) deg = deg > -180 ? -135 : 135;
  if (deg > 135) deg = deg < 180 ? 135 : -135;
  const v = Math.round(((deg + 135) / 270) * 100);
  return Math.max(0, Math.min(100, v));
}

function applyKnobVisual(v) {
  knobIndicator.style.transform = `translateX(-50%) rotate(${volumeToAngle(v)}deg)`;
  knob.setAttribute('aria-valuenow', String(v));
  volumeValue.textContent = v;
}

let volumeSendThrottle = null;
function sendVolume(v) {
  // Manually changing volume should bring sound back, like an OS volume slider.
  if (currentState && currentState.muted && v > 0) {
    send({ cmd: 'unmute' });
    currentState.muted = false;
    knobWrap.classList.remove('muted');
    muteBtn.classList.remove('active');
    mutedIcon.style.display = 'none';
    unmutedIcon.style.display = '';
    muteLabel.textContent = 'Mute';
  }
  clearTimeout(volumeSendThrottle);
  volumeSendThrottle = setTimeout(() => send({ cmd: 'set_volume', value: v }), 60);
}

knob.addEventListener('pointerdown', (e) => {
  draggingKnob = true;
  knob.setPointerCapture(e.pointerId);
  const v = angleToVolume(angleFromCenter(e.clientX, e.clientY));
  applyKnobVisual(v);
  sendVolume(v);
});

knob.addEventListener('pointermove', (e) => {
  if (!draggingKnob) return;
  const v = angleToVolume(angleFromCenter(e.clientX, e.clientY));
  applyKnobVisual(v);
  sendVolume(v);
});

function endKnobDrag() {
  draggingKnob = false;
}
knob.addEventListener('pointerup', endKnobDrag);
knob.addEventListener('pointercancel', endKnobDrag);

knob.addEventListener('wheel', (e) => {
  e.preventDefault();
  const current = currentState ? currentState.volume : 0;
  const v = Math.max(0, Math.min(100, current + (e.deltaY < 0 ? 2 : -2)));
  applyKnobVisual(v);
  sendVolume(v);
}, { passive: false });

document.querySelectorAll('.preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = parseInt(btn.dataset.vol, 10);
    applyKnobVisual(v);
    sendVolume(v);
  });
});

knob.addEventListener('keydown', (e) => {
  if (!currentState) return;
  let v = currentState.volume;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = Math.min(100, v + 2);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = Math.max(0, v - 2);
  else if (e.key === 'Home') v = 0;
  else if (e.key === 'End') v = 100;
  else return;
  e.preventDefault();
  applyKnobVisual(v);
  sendVolume(v);
});

// ---------- Connect form ----------

connectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const host = ipInput.value.trim();
  if (!host) return;
  localStorage.setItem(STORAGE_KEY, host);
  reconnectAttempt = 0;
  connect(host);
});

disconnectBtn.addEventListener('click', () => {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  clearTimeout(connectTimeoutTimer);
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  currentState = null;
  devicePanel.classList.add('hidden');
  connectPanel.classList.remove('hidden');
  setStatus('Not connected');
  ipInput.focus();
});

// ---------- Boot ----------

const savedHost = localStorage.getItem(STORAGE_KEY);
if (savedHost) {
  ipInput.value = savedHost;
  connect(savedHost);
}
