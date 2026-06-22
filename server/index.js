import express from 'express';
import { loadConfig } from './config.js';
import { sessionConfigured } from './session.js';
import sessionRouter from './routes/session.js';
import meRouter from './routes/me.js';
import agentsRouter from './routes/agents.js';
import callsRouter from './routes/calls.js';
import callRouter from './routes/call.js';
import demoTriggerRouter from './routes/demoTrigger.js';
import dallasCallsRouter from './routes/dallasCalls.js';

const PORT = Number(process.env.PORT) || 4100;

if (!sessionConfigured()) {
  console.error(
    'FATAL: SESSION_SECRET is not set (or shorter than 32 chars). ' +
      'It signs session cookies — generate one with:\n' +
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
  );
  process.exit(1);
}

const cfg = loadConfig();
console.log(
  `Loaded config from ${cfg.sourcePath}: ${cfg.accountIds.length} accounts, ${cfg.users.length} users`,
);

const app = express();
app.disable('x-powered-by');
// Behind nginx: trust X-Forwarded-Proto so req.secure reflects the real HTTPS
// edge (used to set the Secure flag on the session cookie).
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));

app.use('/api', sessionRouter);
app.use('/api/me', meRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/call', callRouter);
app.use('/api/demo-trigger', demoTriggerRouter);
app.use('/api/dallas-calls', dallasCallsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, accounts: cfg.accountIds.length, users: cfg.users.length });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`dasharc-api listening on http://127.0.0.1:${PORT}`);
});
