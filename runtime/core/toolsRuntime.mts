import type { ToolDefinition, ToolRegistry, ToolAuth } from "../../core/types";

export interface ToolExecutionOptions {
  /**
   * Optionele operation, bv. "search" → endpoint + "/search"
   */
  operation?: string;

  /**
   * Payload die naar de tool gaat.
   * - Bij GET → query parameters
   * - Bij POST/PUT/... → JSON body
   */
  input?: any;

  /**
   * Globale API key (bv. uit Settings in Studio of uit env).
   * Wordt gebruikt als fallback als de tool zelf geen key/token heeft.
   */
  globalApiKey?: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  status: number | null;
  data?: any;
  error?: string;
  rawBody?: string;
}

/**
 * Haal een ToolDefinition op uit het registry.
 * - Bestaat de tool niet → `null`
 */
export function resolveToolDefinition(
  name: string,
  registry: ToolRegistry
): ToolDefinition | null {
  if (!name || !registry) return null;
  const def = registry[name];
  return def ?? null;
}

/**
 * Bouw HTTP headers op basis van ToolAuth + optionele globale API key.
 *
 * Ondersteunt:
 * - type: 'none'  → {}
 * - type: 'api_key' → custom header (bv. X-API-Key) of Authorization
 * - type: 'bearer' → Authorization: Bearer <token>
 * - type: 'oauth2' → verwacht een kant-en-klare bearer token in auth.token
 */
export function buildAuthHeaders(
  auth: ToolAuth | undefined,
  globalApiKey?: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!auth || auth.type === "none") {
    return headers;
  }

  if (auth.type === "api_key") {
    const headerName = auth.header_key || "Authorization";
    const value = auth.key || globalApiKey;

    if (value) {
      headers[headerName] = value;
    }

    return headers;
  }

  if (auth.type === "bearer") {
    const token = auth.token || globalApiKey;

    if (token) {
      headers["Authorization"] = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;
    }

    return headers;
  }

  if (auth.type === "oauth2") {
    // v0.1/v0.2: we doen nog geen volledige OAuth2 flow.
    // Aanname: caller zet een geldige bearer token in auth.token.
    if (auth.token) {
      headers["Authorization"] = auth.token.startsWith("Bearer ")
        ? auth.token
        : `Bearer ${auth.token}`;
    }

    return headers;
  }

  return headers;
}

/**
 * Bouw een HTTP request (URL + init) uit een ToolDefinition.
 *
 * - Alleen voor type: 'http'
 * - Voegt optioneel `operation` toe als path-segment
 * - Maakt query params (GET) of JSON body (POST/PUT/PATCH/DELETE)
 * - Injecteert auth headers
 */
export function buildHttpRequest(
  def: ToolDefinition,
  options: ToolExecutionOptions = {}
): {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string };
} {
  if (def.type !== "http") {
    throw new Error(
      `buildHttpRequest only supports HTTP tools, got '${def.type}'`
    );
  }

  if (!def.endpoint) {
    throw new Error("HTTP tool is missing 'endpoint'.");
  }

  const method = (def.method || "GET").toUpperCase();
  const op = options.operation;
  let url = def.endpoint;

  // Operation aan endpoint plakken: "https://api/x" + "/search"
  if (op && op.trim().length > 0) {
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    const opPath = op.startsWith("/") ? op.slice(1) : op;
    url = `${url}/${opPath}`;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const authHeaders = buildAuthHeaders(def.auth, options.globalApiKey);
  Object.assign(headers, authHeaders);

  const hasBody = options.input !== undefined && options.input !== null;
  let body: string | undefined;

  // GET → query params
  if (method === "GET" || method === "HEAD") {
    if (hasBody && typeof options.input === "object") {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.input)) {
        if (value === undefined || value === null) continue;
        params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }
  } else if (hasBody) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.input);
  }

  const init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  } = {
    method,
    headers,
  };

  if (body !== undefined) {
    init.body = body;
  }

  return { url, init };
}

/**
 * Eenvoudige HTTP-executie helper.
 *
 * - Gebruikt `buildHttpRequest` voor URL + init
 * - Probeert response als JSON te parsen, anders raw string
 * - Geeft altijd een ToolExecutionResult terug
 */
export async function executeHttpTool(
  def: ToolDefinition,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult> {
  const { url, init } = buildHttpRequest(def, options);

  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is not available in this runtime.");
  }

  const response = await fetch(url, init as any);
  const rawBody = await response.text();

  let data: any;
  try {
    data = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    data = rawBody;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `HTTP ${response.status} ${response.statusText || ""}`.trim(),
      data,
      rawBody,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    rawBody,
  };
}
