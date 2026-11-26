import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { handleRequest } from "../app.mjs";

test("Черновик исчезает при сбое, исходная заявка остаётся, повторный разбор работает", async (t) => {
  const server = createServer(handleRequest);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  const input = page.getByLabel("Текст заявки");
  const submit = page.getByRole("button", { name: "Разобрать заявку" });
  const draft = page.locator("#draft");
  const topic = page.locator("#topic");
  const status = page.getByRole("status");
  await input.fill("Какова стоимость заказа?");
  await submit.click();
  await draft.waitFor({ state: "visible" });
  assert.equal(await topic.innerText(), "Стоимость");
  assert.match(await draft.innerText(), /Спасибо за обращение/);

  const failedText = "Когда доставка? [timeout]";
  await input.fill(failedText);
  await submit.click();
  await status.filter({ hasText: "Нужен ручной разбор" }).waitFor();
  assert.equal(await input.inputValue(), failedText);
  assert.equal(await draft.isVisible(), false);
  assert.equal(await draft.textContent(), "");
  assert.equal(await topic.textContent(), "");

  await input.fill("  ");
  await submit.click();
  await status.filter({ hasText: "Введите текст заявки" }).waitFor();
  assert.equal(await input.getAttribute("aria-invalid"), "true");

  await input.fill("Когда доставка?");
  await submit.click();
  await draft.waitFor({ state: "visible" });
  assert.equal(await topic.innerText(), "Доставка");
  assert.match(await draft.innerText(), /Спасибо за обращение/);
});
