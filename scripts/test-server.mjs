// Local-only fault injection for real connection failures. WebKit's offline
// emulation rejects even literal service-worker responses (Playwright #42775).
import { createServer } from 'node:http';
import next from 'next';
import { existsSync, rmSync } from 'node:fs';
const flag = '.local-test/origin-disconnected';
rmSync(flag, { force: true });
const app = next({ dev: false, hostname: '127.0.0.1', port: 3000 });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((req, res) => {
  if (existsSync(flag)) { req.socket.destroy(); return; }
  void handle(req, res);
});
server.listen(3000, '127.0.0.1');
function stop() { server.close(); void app.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
