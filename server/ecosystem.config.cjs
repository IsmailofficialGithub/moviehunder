/**
 * PM2 — catalog API (:8787) + play relay (:8788)
 * Combined budget ~2GB (1GB restart cap per process).
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "moviehunter-api",
      cwd: __dirname,
      script: "node_modules/wrangler/bin/wrangler.js",
      args: "dev --port 8787 --ip 0.0.0.0",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      node_args: "--max-old-space-size=896",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/moviehunter-api-error.log",
      out_file: "/var/log/pm2/moviehunter-api-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "moviehunter-relay",
      cwd: __dirname,
      script: "play-relay.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      node_args: "--max-old-space-size=896",
      env: {
        NODE_ENV: "production",
        PORT: "8788",
      },
      error_file: "/var/log/pm2/moviehunter-relay-error.log",
      out_file: "/var/log/pm2/moviehunter-relay-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
