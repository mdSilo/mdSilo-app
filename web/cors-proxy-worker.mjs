/**
 * The mdSilo CORS proxy as a Cloudflare Worker, for the web version on static
 * hosting (e.g. GitHub Pages) where no server is available. Free tier is enough.
 *
 *   npx wrangler deploy web/cors-proxy-worker.mjs --name mdsilo-cors-proxy \
 *     --compatibility-date 2024-09-01 --var ALLOW_ORIGIN:https://<user>.github.io
 *
 * Then use `https://mdsilo-cors-proxy.<subdomain>.workers.dev/?url={url}` as the proxy.
 * It relays the AI of the web version too (POST, see handleRelay), to the AI
 * hosts it knows and those of `--var RELAY_HOSTS:host1,host2`.
 * .github/workflows/deploy-web.yml deploys it automatically if Cloudflare secrets are set.
 *
 * Workers fetch from Cloudflare edge and can not reach private networks, so only
 * the hostname is checked here.
 */
import { handleProxy, handleRelay, relayHostsOf } from './cors-proxy-core.mjs';

export default {
  /**
   * @param {Request} request
   * @param {{ ALLOW_ORIGIN?: string }} env
   */
  async fetch(request, env) {
    const allowOrigin = env.ALLOW_ORIGIN || '*';
    // the AI of the web version: relayed to the hosts allowed, streamed
    const result =
      request.method === 'POST'
        ? await handleRelay(
            { url: request.url, headers: request.headers, body: request.body },
            { allowOrigin, relayHosts: relayHostsOf(env.RELAY_HOSTS) },
          )
        : await handleProxy({ method: request.method, url: request.url }, { allowOrigin });
    return new Response(result.body, { status: result.status, headers: result.headers });
  },
};
