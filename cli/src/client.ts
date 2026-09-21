import { CONFIG, type ApiResponse, type RegisterResponse } from "./config.js";

/**
 * Thin typed client for the RagScrape Worker API.
 * Uses Node's native fetch (Node ≥ 18) — no node-fetch dependency.
 */
export async function scrapeUrl(
  url: string,
  apiKey: string,
  baseUrl: string = CONFIG.API_BASE_URL,
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT_MS,
  );

  try {
    const res = await fetch(`${baseUrl}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": `rag-scrape-cli/${CONFIG.VERSION}`,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    const data = (await res.json()) as ApiResponse;
    return data;
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return {
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Request timed out after ${CONFIG.REQUEST_TIMEOUT_MS / 1000} s.`,
        },
      };
    }
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message:
          err instanceof Error
            ? `${err.message} (Is the API reachable at ${baseUrl}?)`
            : "Network error.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function registerEmail(
  email: string,
  baseUrl: string = CONFIG.API_BASE_URL,
): Promise<RegisterResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `rag-scrape-cli/${CONFIG.VERSION}`,
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    return (await res.json()) as RegisterResponse;
  } catch (err) {
    return {
      success: false,
      error: {
        code: err instanceof Error && err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
