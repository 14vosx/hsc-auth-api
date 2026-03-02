// src/server/start.js

export function startServer(app, port) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`[hsc-auth] listening on http://0.0.0.0:${port}`);
  });
}