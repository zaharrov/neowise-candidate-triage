import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { handleRequest } from "../app.mjs";

let server;
let endpoint;
before(async () => {
  server = createServer(handleRequest);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${server.address().port}/api/triage`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function post(body, expectedStatus) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(response.status, expectedStatus);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  return response.json();
}

const invalidCases = [
  ["пустое тело", ""],
  ["битый JSON", '{"text":'],
  ["null", "null"],
  ["строка вместо объекта", '"[error]"'],
  ["массив вместо объекта", "[]"],
  ["нет text", "{}"],
  ["text равен null", '{"text":null}'],
  ["text — число", '{"text":123}'],
  ["text — массив", '{"text":["цена"]}'],
  ["пустая строка", '{"text":""}'],
  ["пробелы и переносы", JSON.stringify({ text: " \t\n " })],
];
for (const [name, raw] of invalidCases) {
  test(`HTTP 400 / invalid_input — ${name}`, async () => {
    assert.deepEqual(await post(raw, 400), { status: "invalid_input" });
  });
}

const draft = "Спасибо за обращение. Уточним детали заявки.";
for (const [text, topic] of [
  ["  Интересует доставка  ", "delivery"],
  ["Какая стоимость?", "pricing"],
  ["Здравствуйте!", "other"],
]) {
  test(`HTTP 200 / ready — ${topic}`, async () => {
    assert.deepEqual(await post(JSON.stringify({ text }), 200), { status: "ready", topic, draft });
  });
}

const manual = { status: "manual_review", topic: null, draft: null };
for (const text of ["[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`HTTP 200 / manual_review — ${text}`, async () => {
    assert.deepEqual(await post(JSON.stringify({ text }), 200), manual);
  });
}

test("Медленная модель → ручной разбор → следующая заявка получает черновик", async () => {
  const started = performance.now();
  const result = await post(JSON.stringify({ text: "[timeout]" }), 200);
  const elapsed = performance.now() - started;
  assert.deepEqual(result, manual);
  // Allow scheduling and HTTP overhead, but catch waiting for the full 1200 ms mock delay.
  assert.ok(elapsed < 750, `Ответ занял ${Math.round(elapsed)} мс`);
  assert.deepEqual(await post(JSON.stringify({ text: "Цена?" }), 200), {
    status: "ready", topic: "pricing", draft,
  });
});
