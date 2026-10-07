module.exports = {
  apps: [
    {
      name: "rag-chat-api",
      script: "dist/index.js",
      cwd: "/var/www/api",
      // The message bus is in-memory, so keep a single instance in fork mode.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "5010",
        HOST: "127.0.0.1"
      },
      max_memory_restart: "400M",
      time: true,
      out_file: "/var/log/api/out.log",
      error_file: "/var/log/api/error.log",
      merge_logs: true
    }
  ]
}
