// Live check against the Extella API. Needs EXTELLA_API_KEY; skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtellaClient } from "../client.ts";

const key = process.env.EXTELLA_API_KEY;
const device = process.env.EXTELLA_DEVICE ?? "";
const api = key && new ExtellaClient({ apiKey: key, baseUrl: "https://api.extella.ai", profileId: "default", agentId: process.env.EXTELLA_AGENT ?? "" });
const opts = { skip: !key && "EXTELLA_API_KEY not set", timeout: 240_000 };

test("search finds programs by meaning", opts, async () => {
  const found = await api.search("add up a list of numbers", 3, false);
  assert.ok(found.length > 0);
  assert.ok(found[0].similarity > 0);
});

test("devices list returns ids", opts, async () => {
  const list = await api.devices();
  assert.ok(list.length > 0);
  console.log("devices:", list.map((d) => d.deviceId.slice(0, 8) + " " + d.description.slice(0, 40)));
});

test("save, read, run a new program", opts, async () => {
  const name = "bbtest_word_count";
  const code = 'def bbtest_word_count(text: str) -> dict:\n    return {"status": "success", "value": len(text.split())}';
  await api.save(name, "Test from bb plugin: count words in a text", code, { text: "a b" });
  const back = await api.get(name);
  assert.equal(back?.code.trim(), code.trim());
  const { result, runTimeMs } = await api.run(name, { text: "one two three" }, device);
  console.log("run:", result, runTimeMs, "ms");
  assert.match(String(result), /3/);
});

test("missing program reads as null", opts, async () => {
  assert.equal(await api.get("bbtest_no_such_program_xyz"), null);
});

test("save refuses code without the named function", opts, async () => {
  await assert.rejects(api.save("bbtest_bad", "bad program for test", "def other(): pass", {}), /must define a function/);
});
