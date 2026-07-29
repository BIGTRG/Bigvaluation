/**
 * Boots the licensing API on a local port with the demo (mock-backed) wiring.
 * Run: `node examples/serve.ts`, then e.g.:
 *
 *   curl -s localhost:8787/health
 *   curl -s -X POST localhost:8787/valuations \
 *     -H 'authorization: Bearer fmk_demo.secret123' -H 'content-type: application/json' \
 *     -d '{"subject":{"address":"123 Flip St, Phoenix, AZ 85021","radiusMiles":2},
 *          "deal":{"purchasePrice":290000},"rental":{"monthlyRent":2400}}'
 */
import { createDemoApi, createHttpServer } from '../src/index.ts';

const { api, apiKey } = createDemoApi();
const server = createHttpServer(api);
const port = Number(process.env.PORT ?? 8787);

server.listen(port, () => {
  console.log(`ValueProof API listening on http://localhost:${port}`);
  console.log(`Demo key: ${apiKey}`);
  console.log('Try:  curl -s localhost:' + port + '/health');
});
