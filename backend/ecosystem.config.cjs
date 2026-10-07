module.exports = {
  apps: [
    {
      name: "rag-chat",
      script: "dist/index.js",
      cwd: __dirname,
      // The message bus is in-memory, so keep a single instance in fork mode.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "5010",
        HOST: "127.0.0.1"
      },
      max_memory_restart: "300M",
      time: true
    }
  ]
}
