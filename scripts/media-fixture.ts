/** Local, synthetic discovery/API fixture. It never downloads or writes a media file. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import {
  MediaProbeRequestSchema,
  MediaSubmitRequestSchema,
  selectionError,
  type MediaProbe,
  type MediaPresentation,
} from '../lib/media/contracts';

const port = Number(process.env.MEDIA_FIXTURE_PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid MEDIA_FIXTURE_PORT');
const origin = `http://127.0.0.1:${port}`;
const probes = new Map<string, { request: string; response: MediaProbe; submission?: string }>();
const header = 'Bearer media-fixture';
const track = (id: string, type: 'video' | 'audio', height = 0) => ({
  id,
  type,
  height,
  width: height ? Math.round((height * 16) / 9) : 0,
  language: type === 'audio' ? 'en' : '',
  codec: type === 'audio' ? 'mp4a' : 'avc1',
  bandwidth: height ? height * 3000 : 128000,
  frameRate: height ? 30 : 0,
});
const server = createServer(async (req, res) => {
  const incomingOrigin = req.headers.origin;
  if (
    incomingOrigin &&
    !/^(chrome-extension|moz-extension):\/\//.test(incomingOrigin) &&
    incomingOrigin !== origin
  ) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', incomingOrigin || origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  const json = (body: unknown, status = 200) => {
    res
      .writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(body));
  };
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url || '/', origin);
    if (url.pathname === '/') {
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(await readFile(new URL('../test-site/media.html', import.meta.url)));
      return;
    }
    if (url.pathname.startsWith('/fixtures/')) {
      const dash = url.pathname.includes('dash');
      const type = dash
        ? 'application/dash+xml'
        : url.pathname.endsWith('.mp4')
          ? 'video/mp4'
          : 'application/vnd.apple.mpegurl';
      res
        .writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
        .end(
          dash
            ? '<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011" />'
            : '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST\n',
        );
      return;
    }
    if (url.pathname === '/ping') {
      json({ status: 'ok', version: 'fixture' });
      return;
    }
    if (req.headers.authorization !== header) {
      json({ error: 'authentication_required' }, 401);
      return;
    }
    if (url.pathname === '/stat') {
      json({
        downloadSpeed: '0',
        uploadSpeed: '0',
        numActive: '0',
        numWaiting: '0',
        numStopped: '0',
        numStoppedTotal: '0',
      });
      return;
    }
    if (url.pathname === '/media/v1/capabilities') {
      json({ protocolVersion: 1, sourceKinds: ['file', 'hls', 'dash'] });
      return;
    }
    const parts: Buffer[] = [];
    let size = 0;
    for await (const data of req) {
      const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      size += chunk.byteLength;
      if (size > 256 * 1024) {
        json({ error: 'probe_failed' }, 413);
        return;
      }
      parts.push(chunk);
    }
    const body: unknown = parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
    for (const [id, entry] of probes) if (entry.response.expiresAt < Date.now()) probes.delete(id);
    if (url.pathname === '/media/v1/probes' && req.method === 'POST') {
      const request = MediaProbeRequestSchema.parse(body);
      if (new URL(request.source.url).origin !== origin) {
        json({ error: 'unsupported_source' }, 422);
        return;
      }
      const serialized = JSON.stringify(request);
      const found = probes.get(request.id);
      if (found) {
        json(
          found.request === serialized ? found.response : { error: 'conflict' },
          found.request === serialized ? 200 : 409,
        );
        return;
      }
      const file = request.source.kind === 'file';
      const presentation: MediaPresentation = {
        kind: request.source.kind,
        title: 'Synthetic fixture — no file will be downloaded',
        live: new URL(request.source.url).searchParams.has('live'),
        durationMs: 60_000,
        size: null,
        tracks: file
          ? []
          : [
              track('video-1080', 'video', 1080),
              track('video-720', 'video', 720),
              track('audio-en', 'audio'),
            ],
        formats: file ? ['original'] : ['mp4', 'mkv'],
        defaults: {
          videoId: file ? null : 'video-1080',
          audioId: file ? null : 'audio-en',
          subtitleId: null,
          format: file ? 'original' : 'mp4',
          recordTimeSeconds: 0,
        },
      };
      const response: MediaProbe = {
        id: request.id,
        expiresAt: Date.now() + 300_000,
        state: 'ready',
        presentation,
      };
      probes.set(request.id, { request: serialized, response });
      json(response);
      return;
    }
    const match = url.pathname.match(/^\/media\/v1\/probes\/([^/]+)(?:\/(submit|cancel))?$/);
    const id = match?.[1];
    const entry = id ? probes.get(id) : undefined;
    if (!id || !entry) {
      json({ error: 'not_found' }, 404);
      return;
    }
    if (!match?.[2] && req.method === 'GET') {
      json(entry.response);
      return;
    }
    if (match?.[2] === 'cancel' && req.method === 'POST') {
      if (entry.response.state === 'submitted') {
        json({
          id,
          state: 'submitted',
          submissionId: entry.response.submissionId,
          gid: entry.response.gid,
        });
        return;
      }
      entry.response = { id, expiresAt: entry.response.expiresAt, state: 'cancelled' };
      json({ id, state: 'cancelled' });
      return;
    }
    if (match?.[2] === 'submit' && req.method === 'POST') {
      const submission = MediaSubmitRequestSchema.parse(body);
      const serialized = JSON.stringify(submission);
      if (entry.response.state === 'submitted' && entry.submission === serialized) {
        json({ id, submissionId: entry.response.submissionId, gid: entry.response.gid });
        return;
      }
      if (entry.response.state !== 'ready') {
        json({ error: 'conflict' }, 409);
        return;
      }
      if (selectionError(entry.response.presentation, submission.selection)) {
        json({ error: 'unsupported_selection' }, 422);
        return;
      }
      entry.submission = serialized;
      entry.response = {
        id,
        expiresAt: entry.response.expiresAt,
        state: 'submitted',
        submissionId: submission.submissionId,
        gid: `fixture-${id}`,
      };
      json({ id, submissionId: submission.submissionId, gid: entry.response.gid });
      return;
    }
    json({ error: 'not_found' }, 404);
  } catch {
    json({ error: 'probe_failed' }, 400);
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Synthetic media fixture: ${origin}`);
  console.log(`Extension API port: ${port}; secret: media-fixture. No media is downloaded.`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
