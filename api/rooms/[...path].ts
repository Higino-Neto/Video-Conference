
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../../apps/server/dist/app.js';
import { loadConfig } from '../../apps/server/dist/config.js';

let appPromise: Promise<FastifyInstance> | undefined;

async function getApp() {
  appPromise ??= buildApp({ config: loadConfig() }).then(async (app) => {
    await app.ready();
    return app;
  });

  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getApp();

  await new Promise<void>((resolve, reject) => {
    res.once('finish', resolve);
    res.once('close', resolve);

    getApp()
      .then(() => app.server.emit('request', req, res))
      .catch(reject);
  });
}

