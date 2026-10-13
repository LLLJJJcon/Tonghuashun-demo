import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仅开发服务器生效：DEV_SAMPLE=1 时把 /data/*.json 映射到 data/dev/（虚构样例，不进入生产构建）
function devSampleData(): Plugin {
  return {
    name: 'eventtrace-dev-sample-data',
    apply: 'serve',
    configureServer(server) {
      if (process.env.DEV_SAMPLE !== '1') return;
      const dir = fileURLToPath(new URL('./data/dev/', import.meta.url));
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/data\/([\w.-]+\.json)(?:\?.*)?$/.exec(req.url ?? '');
        if (!m) return next();
        try {
          const body = await readFile(resolve(dir, m[1]));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devSampleData()],
  test: { include: ['src/**/*.test.ts'] },
});
