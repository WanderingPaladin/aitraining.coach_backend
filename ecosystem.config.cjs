module.exports = {
  apps: [
    {
      name: 'aitraining-api',
      cwd: __dirname,
      script: 'src/index.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      time: true,
    },
  ],
};
