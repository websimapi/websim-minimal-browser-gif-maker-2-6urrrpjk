// Minimal in-browser GIF builder using gif.js and its worker

let gifWorkerBlob = null;

// Fetch the worker script once (required by gif.js)
(async function preloadWorker() {
  const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
  gifWorkerBlob = await resp.blob();
})();

const el = (id) => document.getElementById(id);
const drawCanvas = document.getElementById('drawCanvas');
const dctx = drawCanvas.getContext('2d');
const btn = el('generateGif');
const statusEl = el('status');
const resultImg = el('resultImg');
const downloadLink = el('downloadLink');
let frames = [];
let currentFrame = 0;
let drawing = false, lastX = 0, lastY = 0;

btn.addEventListener('click', async () => {
  if (!frames.length) { statusEl.textContent = 'Add at least one frame.'; return; }
  const width = clampInt(parseInt(el('gifWidth').value, 10), 16, 2048);
  const height = clampInt(parseInt(el('gifHeight').value, 10), 16, 2048);
  const fps = clampInt(parseInt(el('fps').value, 10), 1, 60);
  const quality = clampInt(parseInt(el('quality').value, 10), 1, 30);
  const delay = Math.round(1000 / fps);

  if (!gifWorkerBlob) {
    statusEl.textContent = 'Loading worker...';
    await waitFor(() => !!gifWorkerBlob);
  }

  btn.disabled = true;
  statusEl.textContent = 'Building GIF...';

  const workerUrl = URL.createObjectURL(gifWorkerBlob);
  const gif = new GIF({
    workers: 2,
    quality,
    width,
    height,
    workerScript: workerUrl,
    transparent: 0x00000000
  });

  // Add frames
  for (const frame of frames) { gif.addFrame(frame, { delay, copy: true }); }

  gif.on('finished', (blob) => {
    URL.revokeObjectURL(workerUrl);
    const url = URL.createObjectURL(blob);
    resultImg.src = url;
    downloadLink.href = url;
    downloadLink.style.display = 'inline-block';
    statusEl.textContent = 'Done.';
    btn.disabled = false;
  });

  gif.on('progress', (p) => {
    statusEl.textContent = `Building GIF… ${(p * 100).toFixed(0)}%`;
  });

  gif.render();
});

function clampInt(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function waitFor(fn, interval = 50, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        resolve();
      } else if (performance.now() - start > timeout) {
        clearInterval(t);
        reject(new Error('Timeout waiting for condition'));
      }
    }, interval);
  });
}

function initFrames(w = 256, h = 256) {
  frames = [makeBlankCanvas(w, h)];
  currentFrame = 0;
  syncCanvasSize(w, h);
  renderCurrentFrame();
  updateFrameInfo();
}

function makeBlankCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cctx = c.getContext('2d');
  cctx.fillStyle = '#ffffff00'; cctx.fillRect(0,0,w,h);
  return c;
}

function syncCanvasSize(w, h) {
  drawCanvas.width = w;
  drawCanvas.height = h;
}

function renderCurrentFrame() {
  const src = frames[currentFrame];
  dctx.clearRect(0,0,drawCanvas.width, drawCanvas.height);
  dctx.drawImage(src, 0, 0, drawCanvas.width, drawCanvas.height);
}

function updateFrameInfo() {
  const info = document.getElementById('frameInfo');
  info.textContent = `Frame ${currentFrame + 1}/${frames.length}`;
}

function startDraw(x, y) { drawing = true; lastX = x; lastY = y; }
function lineTo(x, y) {
  if (!drawing) return;
  dctx.lineCap = 'round'; dctx.lineJoin = 'round';
  dctx.strokeStyle = document.getElementById('brushColor').value;
  dctx.lineWidth = clampInt(parseInt(document.getElementById('brushSize').value,10),1,120);
  dctx.beginPath(); dctx.moveTo(lastX, lastY); dctx.lineTo(x, y); dctx.stroke();
  lastX = x; lastY = y;
}
function endDraw() { drawing = false; commitCanvasToFrame(); }

function getPos(evt) {
  const rect = drawCanvas.getBoundingClientRect();
  const isTouch = evt.touches && evt.touches[0];
  const cx = isTouch ? evt.touches[0].clientX : evt.clientX;
  const cy = isTouch ? evt.touches[0].clientY : evt.clientY;
  return { x: (cx - rect.left) * (drawCanvas.width / rect.width),
           y: (cy - rect.top) * (drawCanvas.height / rect.height) };
}

function commitCanvasToFrame() {
  const c = frames[currentFrame];
  const cctx = c.getContext('2d');
  cctx.clearRect(0,0,c.width,c.height);
  cctx.drawImage(drawCanvas, 0, 0);
}

drawCanvas.addEventListener('mousedown', e => { const p = getPos(e); startDraw(p.x,p.y); });
drawCanvas.addEventListener('mousemove', e => { const p = getPos(e); lineTo(p.x,p.y); });
window.addEventListener('mouseup', endDraw);
drawCanvas.addEventListener('touchstart', e => { e.preventDefault(); const p = getPos(e); startDraw(p.x,p.y); }, {passive:false});
drawCanvas.addEventListener('touchmove', e => { e.preventDefault(); const p = getPos(e); lineTo(p.x,p.y); }, {passive:false});
drawCanvas.addEventListener('touchend', e => { e.preventDefault(); endDraw(); }, {passive:false});

document.getElementById('addFrame').addEventListener('click', () => {
  const w = frames[0]?.width || drawCanvas.width;
  const h = frames[0]?.height || drawCanvas.height;
  frames.splice(currentFrame + 1, 0, makeBlankCanvas(w, h));
  currentFrame++; renderCurrentFrame(); updateFrameInfo();
});

document.getElementById('deleteFrame').addEventListener('click', () => {
  if (frames.length <= 1) return;
  frames.splice(currentFrame, 1);
  currentFrame = Math.max(0, currentFrame - 1);
  renderCurrentFrame(); updateFrameInfo();
});

document.getElementById('prevFrame').addEventListener('click', () => {
  if (currentFrame > 0) { currentFrame--; renderCurrentFrame(); updateFrameInfo(); }
});
document.getElementById('nextFrame').addEventListener('click', () => {
  if (currentFrame < frames.length - 1) { currentFrame++; renderCurrentFrame(); updateFrameInfo(); }
});

document.getElementById('clearFrame').addEventListener('click', () => {
  dctx.clearRect(0,0,drawCanvas.width, drawCanvas.height);
  commitCanvasToFrame();
});

document.getElementById('gifWidth').addEventListener('change', onSizeChange);
document.getElementById('gifHeight').addEventListener('change', onSizeChange);
function onSizeChange() {
  const w = clampInt(parseInt(document.getElementById('gifWidth').value,10),16,2048);
  const h = clampInt(parseInt(document.getElementById('gifHeight').value,10),16,2048);
  // Rescale all frames to new size
  frames = frames.map(src => {
    const n = makeBlankCanvas(w,h); n.getContext('2d').drawImage(src,0,0,w,h); return n;
  });
  syncCanvasSize(w,h); renderCurrentFrame();
}

window.addEventListener('load', () => {
  initFrames(parseInt(document.getElementById('gifWidth').value,10),
             parseInt(document.getElementById('gifHeight').value,10));
});