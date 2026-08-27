/**
 * HTTP for discovery providers, routed through the Rust backend.
 *
 * The webview cannot call these catalogues directly — they send no permissive
 * CORS headers, and several sit behind Cloudflare, which returns 403 to a
 * request with no browser User-Agent (verified against chub.ai: 403 without,
 * 200 with). Going through the existing `api_request` command sidesteps both:
 * it is a plain reqwest client, so there is no origin policy, and headers can
 * be set freely.
 */

import { invoke } from "@tauri-apps/api/core";

/** Cloudflare-fronted catalogues reject requests that do not look like a browser. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface ApiResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
}

export class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

export interface GetJsonOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * GET a JSON document.
 *
 * Throws ProviderHttpError on a non-2xx so callers can tell "the site said no"
 * from "the request never happened".
 */
export async function getJson<T>(url: string, options: GetJsonOptions = {}): Promise<T> {
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Drop undefined entries so an unset filter does not become the string
  // "undefined" in the query.
  const query: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) query[key] = value;
  }

  const response = await invoke<ApiResponse>("api_request", {
    req: {
      url,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": BROWSER_UA,
        ...options.headers,
      },
      query,
      timeoutMs: options.timeoutMs ?? 20_000,
      stream: false,
    },
  });

  // The request is already done by the time it returns; honour a late abort so
  // a superseded search does not overwrite fresher results.
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (!response.ok) {
    throw new ProviderHttpError(
      response.status,
      response.status === 403
        ? "That catalogue refused the request. It may be rate limiting or require an account."
        : `Request failed with status ${response.status}.`,
    );
  }

  return response.data as T;
}
