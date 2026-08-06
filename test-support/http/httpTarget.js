// test-support/http/httpTarget.js

export function startHttpTarget(app) {
  return new Promise((resolve, reject) => {
    let server;

    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;

      if (!Number.isInteger(port) || port <= 0) {
        server.close();
        reject(
          new Error(
            `Invalid server address port: expected positive integer, got ${port}`,
          ),
        );
        return;
      }

      const baseUrl = `http://127.0.0.1:${port}`;
      let closePromise;

      const close = () => {
        if (!closePromise) {
          closePromise = new Promise((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) {
                rejectClose(err);
                return;
              }

              resolveClose();
            });
          });
        }

        return closePromise;
      };

      resolve({
        baseUrl,
        server,
        close,
      });
    };

    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };

    server = app.listen(0, "127.0.0.1");
    server.once("listening", onListening);
    server.once("error", onError);
  });
}
