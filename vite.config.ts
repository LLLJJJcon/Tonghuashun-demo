import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

// 构建信息注入（AGENT-4）：仅 vite build 生效，开发服务器和测试中页脚仍显示「开发版」。
// 版本号取 package.json 的 version，构建时间为东八区 YYYY-MM-DD HH:mm（与构建机时区无关）。
function buildInfo(): Plugin {
  return {
    name: 'eventtrace-build-info',
    apply: 'build',
    config() {
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
      const buildTime = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
      return {
        define: {
          'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
          'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
        },
      };
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devSampleData(), buildInfo()],
  test: { include: ['src/**/*.test.ts'] },
});
