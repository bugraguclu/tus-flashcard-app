// Proxy server that adds Cross-Origin Isolation headers for expo-sqlite web support.
// Spawns Expo on an internal port, then proxies all requests with COOP/COEP headers.
const http = require('http');
const { spawn } = require('child_process');

const PROXY_PORT = parseInt(process.env.PORT || '8081', 10);
const EXPO_PORT = PROXY_PORT + 100; // internal

// Start Expo on the internal port
const expo = spawn(process.execPath, [
  'node_modules/expo/bin/cli', 'start', '--web', '--port', String(EXPO_PORT),
], { cwd: __dirname, stdio: 'inherit' });

expo.on('error', (err) => { console.error('Expo failed:', err); process.exit(1); });
expo.on('exit', (code) => process.exit(code ?? 1));

// Proxy with COOP/COEP headers
const proxy = http.createServer((req, res) => {
  const opts = { hostname: '127.0.0.1', port: EXPO_PORT, path: req.url, method: req.method, headers: req.headers };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    });
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('Expo dev server not ready yet');
  });
  req.pipe(proxyReq, { end: true });
});

// Also proxy WebSocket connections (for HMR)
proxy.on('upgrade', (req, socket, head) => {
  const opts = { hostname: '127.0.0.1', port: EXPO_PORT, path: req.url, method: req.method, headers: req.headers };
  const proxyReq = http.request(opts);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

proxy.listen(PROXY_PORT, () => {
  console.log(`\n  COOP/COEP proxy listening on http://localhost:${PROXY_PORT}\n`);
});

process.on('SIGTERM', () => { expo.kill(); proxy.close(); });
process.on('SIGINT', () => { expo.kill(); proxy.close(); });
