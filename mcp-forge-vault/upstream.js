/**
 * upstream.js — a lazily connected, self-healing link from the bridge to Forge's MCP server.
 *
 * Why: Claude Desktop gives up on a server that closes during its handshake, so
 * the bridge must answer the handshake at once and connect to Forge only when a
 * real request arrives. If Forge restarts later, the next request reconnects.
 */

/**
 * Creates a session whose listTools/callTool connect on first use and, after a
 * failure, drop the dead client, reconnect once, and retry the request.
 */
export function createUpstreamSession({ connect }) {
  let clientPromise = null;

  async function discardClient(failedPromise) {
    if (clientPromise !== failedPromise) return;
    clientPromise = null;
    const client = await failedPromise.catch(() => null);
    await client?.close?.().catch(() => {});
  }

  function getClient() {
    if (!clientPromise) clientPromise = connect();
    return clientPromise;
  }

  async function runWithRetry(request) {
    const firstPromise = getClient();
    try {
      return await request(await firstPromise);
    } catch {
      await discardClient(firstPromise);
    }
    const retryPromise = getClient();
    try {
      return await request(await retryPromise);
    } catch (retryError) {
      await discardClient(retryPromise);
      throw retryError;
    }
  }

  return {
    listTools: () => runWithRetry((client) => client.listTools()),
    callTool: (params) => runWithRetry((client) => client.callTool(params)),
  };
}
