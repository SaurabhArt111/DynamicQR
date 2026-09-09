import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { ensureUploadRoot } from './utils/storage.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import qrRoutes from './routes/qrRoutes.js';
import recycleRoutes from './routes/recycleRoutes.js';
import viewerRoutes from './routes/viewerRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import filesRoutes from './routes/filesRoutes.js';
import { RecycleBin } from './models/RecycleBin.js';
import { QRCode } from './models/QRCode.js';
import { errorHandler, notFound } from './middleware/notFound.js';

const app = express();
const nodeEnv = process.env.NODE_ENV || 'development';
const clientUrl = process.env.ADMIN_URL || process.env.CLIENT_URL || 'http://localhost:5173';
const publicUrl = process.env.PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:5174';
const isBehindProxy = nodeEnv === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RENDER_EXTERNAL_URL);

function toOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

const allowedOrigins = [clientUrl, env.clientUrl, env.adminUrl, publicUrl, env.publicBaseUrl, 'http://localhost:5173', 'http://localhost:5174']
  .filter(Boolean)
  .map(toOrigin)
  .filter((url, index, list) => list.indexOf(url) === index);

const frameAncestors = ["'self'", ...allowedOrigins];

if (isBehindProxy) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      frameAncestors
    }
  }
}));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 700, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    appName: env.appName,
    uptimeSeconds: Math.round(process.uptime()),
    dbConnected: mongoose.connection.readyState === 1
  });
});

app.get('/q/:token', (req, res) => {
  res.redirect(302, `${publicUrl.replace(/\/$/, '')}/q/${req.params.token}`);
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/qrcodes', qrRoutes);
app.use('/api/recycle-bin', recycleRoutes);
app.use('/api/vault', viewerRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/files', filesRoutes);

app.use(notFound);
app.use(errorHandler);

// Catch anything that slips past Express's own error handling (e.g. async
// errors outside a route handler) so the process logs clearly instead of
// dying silently or with an opaque Node trace.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaught exception]', error);
});

try {
  await ensureUploadRoot();
  await connectDb();
  await Promise.all([
    RecycleBin.syncIndexes(),
    QRCode.syncIndexes()
  ]);

  app.listen(env.port, () => {
    console.log(`${env.appName} API running on port ${env.port}`);
  });
} catch (startupError) {
  console.error('Failed to start the server:', startupError);
  process.exit(1);
}
