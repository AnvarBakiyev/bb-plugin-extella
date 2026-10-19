// Plugin loads in bb's fake host; tools validate input and call the right endpoints. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";

function stubFetch(replies) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, headers: init.headers, body: JSON.parse(init.body) });
    const reply = replies[path] ?? { status: 404, body: { detail: "Not Found" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  };
  return calls;
}

async function load(settings) {
  const { bb, harness } = createFakePluginHost({ pluginId: "extella", settings });
  await plugin(bb);
  return harness;
}

const ready = { apiKey: "test-key", agentId: "agent_test", defaultDevice: "dev-1" };

test("search returns trimmed matches and sends auth headers", async () => {
  const calls = stubFetch({
    "/api/expert/search": { body: { status: "success", experts: [{ name: "csv_totals", description: "Sum columns", similarity: "0.8123", code: "def csv_totals(): pass" }] } },
  });
  const h = await load(ready);
  const out = await h.behavior.callAgentTool("extella_search", { query: "sum csv columns" });
  const text = typeof out === "string" ? out : JSON.stringify(out);
  assert.match(text, /csv_totals/);
  assert.match(text, /0\.81/);
  assert.doesNotMatch(text, /def csv_totals/);
  assert.equal(calls[0].headers["X-Auth-Token"], "test-key");
  assert.equal(calls[0].headers["X-Agent-Id"], "agent_test");
  await h.lifecycle.dispose();
});

test("run uses the default device when none is given", async () => {
  const calls = stubFetch({ "/api/expert/run": { body: { status: "success", result: "{'value': 3}", run_time_ms: 9000 } } });
  const h = await load(ready);
  const out = await h.behavior.callAgentTool("extella_run", { name: "word_count", params: { text: "a b c" } });
  assert.match(JSON.stringify(out), /value/);
  assert.deepEqual(calls[0].body.targets, ["dev-1"]);
  assert.equal(calls[0].body.wait, true);
  await h.lifecycle.dispose();
});

test("save refuses to replace an existing program", async () => {
  const calls = stubFetch({ "/api/expert/get": { body: { status: "success", expert_name: "word_count", expert_code: "x" } } });
  const h = await load(ready);
  const out = await h.behavior.callAgentTool("extella_save", {
    name: "word_count", description: "Count words in text", code: "def word_count(text):\n    return {}",
  });
  assert.match(JSON.stringify(out), /already exists/);
  assert.ok(!calls.some((c) => c.path === "/api/expert/save"));
  await h.lifecycle.dispose();
});

test("missing key gives a plain instruction, not a crash", async () => {
  stubFetch({});
  const h = await load({ agentId: "agent_test" });
  const out = await h.behavior.callAgentTool("extella_devices", {});
  assert.match(JSON.stringify(out), /API key is not set/);
  await h.lifecycle.dispose();
});

test("bad program name is rejected by the schema", async () => {
  stubFetch({});
  const h = await load(ready);
  await assert.rejects(h.behavior.callAgentTool("extella_run", { name: "Bad Name!" }));
  await h.lifecycle.dispose();
});
