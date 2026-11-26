import { readFile } from "node:fs/promises";
import { json as readJson } from "node:stream/consumers";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const topics = new Set(["delivery", "pricing", "other"]);
const modelTimeoutMs = 300;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function triage(text) {
  try {
    const raw = await classify(text, { signal: AbortSignal.timeout(modelTimeoutMs) });
    const result = JSON.parse(raw);
    if (topics.has(result?.topic) && typeof result.draft === "string" && result.draft.trim()) {
      return { status: "ready", topic: result.topic, draft: result.draft.trim() };
    }
  } catch {
    // Both provider failures and unreadable model output require a manager's review.
  }
  return { status: "manual_review", topic: null, draft: null };
}

export async function handleRequest(request, response) {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }
  if (typeof body?.text !== "string" || !body.text.trim()) {
    return json(response, 400, { status: "invalid_input" });
  }
  return json(response, 200, await triage(body.text.trim()));
}
