export function drainServers(servers) {
  return Promise.all(servers.map((server) => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()))));
}
