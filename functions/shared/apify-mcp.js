/**
 * Apify MCP client.
 *
 * Lets the backend reach Apify actors through the hosted Apify MCP server
 * (https://mcp.apify.com) instead of a bespoke REST call, so the agent's
 * "scrape this" intent flows over the same MCP transport everywhere.
 *
 * Transport: streamable HTTP JSON-RPC 2.0. We do the minimal handshake —
 * `initialize` then `tools/call` — auth'd with the Apify token as a Bearer.
 * The MCP server runs the actor and returns its dataset items inline.
 *
 * If APIFY_MCP_URL is not configured we fall back to the Apify SDK so callers
 * keep working in environments where the MCP server isn't wired yet.
 *
 * Env:
 *   APIFY_MCP_URL    hosted MCP endpoint (e.g. https://mcp.apify.com/sse or /mcp)
 *   APIFY_API_TOKEN  Apify token (also used by the SDK fallback)
 */
import { ApifyClient } from 'apify-client';

const MCP_URL = process.env.APIFY_MCP_URL;
const TOKEN = process.env.APIFY_API_TOKEN;

/**
 * Run an Apify actor and return its dataset items.
 * @param {string} actorId  e.g. "junglee/amazon-crawler"
 * @param {object} input    actor input object
 * @param {{ maxItems?: number, waitSecs?: number }} [opts]
 * @returns {Promise<object[]>} dataset items
 */
export async function runActor(actorId, input, opts = {}) {
  const { maxItems = 50, waitSecs = 90 } = opts;
  if (MCP_URL) {
    return runViaMcp(actorId, input, { maxItems, waitSecs });
  }
  return runViaSdk(actorId, input, { maxItems, waitSecs });
}

async function runViaMcp(actorId, input, { maxItems, waitSecs }) {
  const session = new McpSession(MCP_URL, TOKEN);
  await session.initialize();
  // The Apify MCP server exposes each actor as a callable tool. Calling it
  // runs the actor to completion and returns the dataset in the tool result.
  const result = await session.callTool(
    'call-actor',
    { actor: actorId, input, maxItems, waitForFinish: waitSecs },
    waitSecs,
  );
  return extractItems(result, maxItems);
}

async function runViaSdk(actorId, input, { maxItems, waitSecs }) {
  const client = new ApifyClient({ token: TOKEN });
  const run = await client.actor(actorId).call(input, { waitSecs });
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: maxItems });
  return items;
}

// ── Minimal MCP-over-HTTP (JSON-RPC 2.0) session ─────────────────────────────
class McpSession {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.sessionId = undefined;
    this.id = 0;
  }

  async initialize() {
    const res = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'autnio', version: '1.0' },
    });
    return res;
  }

  async callTool(name, args, waitSecs) {
    return this.send('tools/call', { name, arguments: args }, waitSecs * 1000 + 5000);
  }

  async send(method, params, timeoutMs = 30000) {
    const id = ++this.id;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });

      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      if (!res.ok) {
        throw new Error(`MCP ${method} failed: ${res.status} ${await res.text()}`);
      }

      const payload = parseRpc(await res.text());
      if (payload?.error) {
        throw new Error(`MCP ${method} error: ${payload.error.message ?? 'unknown'}`);
      }
      return payload?.result;
    } finally {
      clearTimeout(timer);
    }
  }
}

// The server may answer as plain JSON or as an SSE stream ("data: {...}" lines).
function parseRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (const line of dataLines.reverse()) {
    try {
      const obj = JSON.parse(line);
      if (obj.result || obj.error) return obj;
    } catch {
      // skip non-JSON keep-alive frames
    }
  }
  return undefined;
}

// MCP tool results carry content blocks; actor datasets come back as JSON text
// or as a structured `content` array. Normalize to a plain array of items.
function extractItems(result, maxItems) {
  if (!result) return [];
  if (Array.isArray(result.structuredContent?.items)) {
    return result.structuredContent.items.slice(0, maxItems);
  }
  const items = [];
  for (const block of result.content ?? []) {
    if (block.type === 'text' && block.text) {
      try {
        const parsed = JSON.parse(block.text);
        if (Array.isArray(parsed)) items.push(...parsed);
        else items.push(parsed);
      } catch {
        // non-JSON text block — ignore
      }
    }
  }
  return items.slice(0, maxItems);
}
