import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { validateRequest, requestTutor, TutorError } from './tutor.js';

export function createApp({ env = process.env, timeoutMs = 30_000 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(env.OPENAI_API_KEY?.trim()) }));
  app.post('/api/tutor', (req, res, next) => {
    try {
      const origin = new URL(req.get('origin'));
      if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.username || origin.password || origin.origin !== req.get('origin') || req.get('sec-fetch-site') === 'cross-site') throw new Error();
      next();
    } catch { res.status(403).json({ error: 'A localhost origin is required.' }); }
  }, express.json({ limit: '9mb' }), async (req, res, next) => {
    try {
      res.json(await requestTutor(validateRequest(req.body), { env, timeoutMs }));
    } catch (error) { next(error); }
  });
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.status || 500;
    res.status(status).json({ error: status === 400 ? 'Invalid request: ' + (error.type === 'entity.parse.failed' ? 'malformed JSON.' : error.message) : status === 413 ? 'Request body is too large.' : error instanceof TutorError ? error.message : 'The tutor service failed.' });
  });
  return app;
}

export const app = createApp();
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(4318, '127.0.0.1', () => console.log('Folio API listening at http://127.0.0.1:4318'));
}
