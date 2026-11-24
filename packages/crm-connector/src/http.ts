import http from "node:http";
import https from "node:https";
import { ActiwhereError } from "./errors.js";

export interface HttpResult {
  status: number;
  json: unknown;
}

/**
 * Sends JSON and reads JSON. Written on node:http on purpose: the Actiwhere API requires a JSON
 * body on GET calls, which the built-in fetch() refuses to send.
 */
export function sendJson(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": String(payload.length) }
            : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          if (text.trim() === "") return resolve({ status, json: undefined });
          try {
            resolve({ status, json: JSON.parse(text) as unknown });
          } catch {
            reject(
              new ActiwhereError(status, "invalid-response", "Actiwhere vrátil neplatnú odpoveď."),
            );
          }
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(new ActiwhereError(0, "timeout", "Actiwhere neodpovedá.")),
    );
    request.on("error", (error) =>
      reject(
        error instanceof ActiwhereError
          ? error
          : new ActiwhereError(0, "network", "Actiwhere nie je dostupný."),
      ),
    );
    if (payload) request.write(payload);
    request.end();
  });
}
