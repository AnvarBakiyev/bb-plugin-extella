import { z } from "zod";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ExtellaClient, ExtellaError, NAME_PATTERN } from "./client.ts";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    apiKey: {
      type: "string",
      label: "Extella API key",
      description: "Token from extella.ai. Stored by bb in a 0600 file, never sent to the browser.",
      secret: true,
    },
    agentId: {
      type: "string",
      label: "Extella agent id",
      description: "Required. Programs are searched, run and saved in this agent's scope (agent_… id from extella.ai).",
      default: "",
    },
    defaultDevice: {
      type: "string",
      label: "Default device id",
      description: "Where programs run when the agent does not name a device. Use the extella_devices tool to see ids.",
      default: "",
    },
    profileId: {
      type: "string",
      label: "Extella profile",
      default: "default",
    },
    baseUrl: {
      type: "string",
      label: "API address",
      default: "https://api.extella.ai",
    },
  });

  async function client() {
    const s = await settings.get();
    return {
      api: new ExtellaClient({
        apiKey: typeof s.apiKey === "string" ? s.apiKey : "",
        baseUrl: s.baseUrl,
        profileId: s.profileId,
        agentId: s.agentId,
      }),
      defaultDevice: s.defaultDevice,
    };
  }

  function failure(err: unknown) {
    const text = err instanceof ExtellaError || err instanceof Error ? err.message : String(err);
    const log = (err as any)?.log;
    return {
      content: [{ type: "text" as const, text: Array.isArray(log) ? `${text}\n\nRun log:\n${log.join("\n")}` : text }],
      isError: true,
    };
  }

  bb.agents.registerTool({
    name: "extella_search",
    description:
      "Search saved Extella programs by meaning. Returns names, descriptions and similarity (0–1). Use before writing a new script for a task.",
    instructions:
      "Before writing a new script for a self-contained task (parse, convert, compute, fetch, report), call extella_search with a plain-language description. Reuse a program if similarity is high and the description fits.",
    presentation: { label: { pending: "Searching Extella programs", completed: "Searched Extella programs" } },
    parameters: z.object({
      query: z.string().min(3).describe("What the program should do, in plain words"),
      limit: z.number().int().min(1).max(20).default(5),
      includeCode: z.boolean().default(false).describe("Return the code of each match"),
    }),
    async execute({ query, limit, includeCode }, { signal }) {
      try {
        const found = await (await client()).api.search(query, limit, includeCode, signal);
        if (found.length === 0) return `No saved programs match "${query}".`;
        return JSON.stringify(found, null, 2);
      } catch (err) {
        return failure(err);
      }
    },
  });

  bb.agents.registerTool({
    name: "extella_get",
    description: "Read one saved Extella program: description, language and full code.",
    presentation: { label: { pending: "Reading Extella program", completed: "Read Extella program" } },
    parameters: z.object({ name: z.string().regex(NAME_PATTERN) }),
    async execute({ name }, { signal }) {
      try {
        const program = await (await client()).api.get(name, signal);
        return program ? JSON.stringify(program, null, 2) : `No program named ${name} in this scope.`;
      } catch (err) {
        return failure(err);
      }
    },
  });

  bb.agents.registerTool({
    name: "extella_run",
    description:
      "Run a saved Extella program with parameters on one of your devices and return its result. Takes 5–20 seconds; no model tokens are spent on the run itself.",
    presentation: { label: { pending: "Running Extella program", completed: "Ran Extella program" } },
    parameters: z.object({
      name: z.string().regex(NAME_PATTERN),
      params: z.record(z.string(), z.unknown()).default({}).describe("Keyword arguments of the program's function"),
      device: z.string().optional().describe("Device id; omit to use the default device from settings"),
    }),
    async execute({ name, params, device }, { signal }) {
      try {
        const { api, defaultDevice } = await client();
        const { result, runTimeMs } = await api.run(name, params, device || defaultDevice, signal);
        return `${typeof result === "string" ? result : JSON.stringify(result)}\n\n(run took ${runTimeMs ?? "?"} ms)`;
      } catch (err) {
        return failure(err);
      }
    },
  });

  bb.agents.registerTool({
    name: "extella_save",
    description:
      "Save a working Python function as an Extella program so later threads and other agents find it with extella_search. Refuses to replace an existing program unless overwrite is true.",
    instructions:
      "Save only code you have already run successfully. The description is what future searches match, so write what the program does and what it returns.",
    presentation: { label: { pending: "Saving Extella program", completed: "Saved Extella program" } },
    parameters: z.object({
      name: z.string().regex(NAME_PATTERN).describe("Function and program name, snake_case"),
      description: z.string().min(10).describe("What it does and returns, in plain words"),
      code: z.string().min(10).describe("Python source with def <name>(...) returning a JSON-serialisable dict"),
      params: z.record(z.string(), z.unknown()).default({}).describe("Example keyword arguments"),
      overwrite: z.boolean().default(false),
    }),
    async execute({ name, description, code, params, overwrite }, { signal }) {
      try {
        const { api } = await client();
        if (!overwrite && (await api.get(name, signal))) {
          return failure(new ExtellaError(`A program named ${name} already exists. Pick another name or pass overwrite: true.`));
        }
        await api.save(name, description, code, params, signal);
        return `Saved ${name}. Run it with extella_run.`;
      } catch (err) {
        return failure(err);
      }
    },
  });

  bb.agents.registerTool({
    name: "extella_devices",
    description: "List the devices connected to this Extella account, with ids to pass to extella_run.",
    presentation: { label: { pending: "Listing Extella devices", completed: "Listed Extella devices" } },
    parameters: z.object({}),
    async execute(_args, { signal }) {
      try {
        const list = await (await client()).api.devices(signal);
        return list.length ? JSON.stringify(list, null, 2) : "No devices are connected to this account.";
      } catch (err) {
        return failure(err);
      }
    },
  });
}
