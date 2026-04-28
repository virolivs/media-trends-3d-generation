import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const TRIPO_KEY = process.env.TRIPO_API_KEY;
const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── POST /api/generate ────────────────────────────────────────
// Body: { prompt, quality }
// Returns: { task_id }
app.post('/api/generate', async (req, res) => {
  const { prompt, quality = 'standard' } = req.body;

  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  if (!TRIPO_KEY) return res.status(500).json({ error: 'TRIPO_API_KEY not set in .env' });

  const faceLimit = quality === 'draft' ? 5000 : quality === 'detailed' ? 30000 : 15000;
  const modelVersion = quality === 'detailed' ? 'v2.5-20250123' : 'v2.0-20240919';

  try {
    const tripoRes = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TRIPO_KEY}`,
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt,
        model_version: modelVersion,
        face_limit: faceLimit,
      }),
    });

    const data = await tripoRes.json();

    if (!tripoRes.ok || !data.data?.task_id) {
      return res.status(tripoRes.status).json({ error: data.message || 'Failed to create task' });
    }

    res.json({ task_id: data.data.task_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/status/:taskId ───────────────────────────────────
// Returns: { status, progress, model_url? }
app.get('/api/status/:taskId', async (req, res) => {
  const { taskId } = req.params;

  if (!TRIPO_KEY) return res.status(500).json({ error: 'TRIPO_API_KEY not set in .env' });

  try {
    const tripoRes = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${TRIPO_KEY}` },
    });

    const data = await tripoRes.json();
    const task = data.data;

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const model_url = task.output?.model || task.output?.pbr_model || null;

    res.json({
      status: task.status,
      progress: task.progress ?? 0,
      model_url,
      error: task.error ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/proxy-model?url=... ──────────────────────────────
// Proxies the GLB file so the browser doesn't hit CORS on Tripo's CDN
app.get('/api/proxy-model', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('url required');

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${TRIPO_KEY}` },
    });

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'model/gltf-binary');
    res.setHeader('Access-Control-Allow-Origin', '*');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => {
  console.log(`\n🟣 Tripo3D backend running → http://localhost:${PORT}\n`);
});
