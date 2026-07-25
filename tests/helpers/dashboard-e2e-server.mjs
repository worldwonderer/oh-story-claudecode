import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createDashboardServer } from "../../skills/story/scripts/dashboard-server.mjs";

const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 43139;
const fixtureRoot = await mkdtemp(resolve(tmpdir(), "oh-story-dashboard-e2e-"));
await cp(resolve("demo"), fixtureRoot, { recursive: true });

const server = createDashboardServer({ root: fixtureRoot });
await new Promise((accept, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", accept);
});
console.log(`Dashboard E2E fixture: http://127.0.0.1:${port} -> ${fixtureRoot}`);

async function shutdown() {
  await new Promise((accept) => server.close(accept));
  await rm(fixtureRoot, { recursive: true, force: true });
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
