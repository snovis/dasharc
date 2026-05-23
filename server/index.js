import express from 'express';
import { loadConfig } from './config.js';
import meRouter from './routes/me.js';
import agentsRouter from './routes/agents.js';
import callsRouter from './routes/calls.js';
import callRouter from './routes/call.js';
import demoTriggerRouter from './routes/demoTrigger.js';

const PORT = Number(process.env.PORT) || 4100;

const cfg = loadConfig();
console.log(
  `Loaded config from ${cfg.sourcePath}: ${cfg.accountIds.length} accounts, ${cfg.users.length} users`,
);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use('/api/me', meRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/call', callRouter);
app.use('/api/demo-trigger', demoTriggerRouter);

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
