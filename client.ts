// Thin client for the Extella REST API. No bb imports, so it can be tested with plain node.

export interface ExtellaConfig {
  apiKey: string;
  baseUrl: string;
  profileId: string;
  agentId: string;
}

export interface FoundProgram {
  name: string;
  description: string;
  similarity: number;
  code?: string;
}

export interface Device {
  deviceId: string;
  description: string;
}

export const NAME_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export class ExtellaError extends Error {}

export class ExtellaClient {
  private readonly config: ExtellaConfig;

  constructor(config: ExtellaConfig) {
    this.config = config;
    if (!config.apiKey) {
      throw new ExtellaError(
        "Extella API key is not set. Open bb settings → Plugins → Extella and paste a key from extella.ai.",
      );
    }
    if (!config.agentId) {
      throw new ExtellaError(
        "Extella agent id is not set. Programs live in an agent's scope: copy the agent id from extella.ai into the plugin settings.",
      );
    }
  }

  private async post(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Auth-Token": this.config.apiKey,
      "X-Profile-Id": this.config.profileId || "default",
      "X-Agent-Id": this.config.agentId,
    };
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(this.config.baseUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ExtellaError(`Extella answered ${response.status} with non-JSON: ${text.slice(0, 200)}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ExtellaError("Extella refused the API key. Check it in the plugin settings.");
    }
    if (!response.ok || data?.status === "error") {
      const raw = data?.message ?? data?.detail ?? text;
      const message = (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 300);
      const err = new ExtellaError(`Extella ${path} failed (${response.status}): ${message}`);
      (err as any).log = data?.execution_log;
      throw err;
    }
    return data;
  }

  async search(query: string, limit: number, withCode: boolean, signal?: AbortSignal): Promise<FoundProgram[]> {
    const data = await this.post("/api/expert/search", { query, limit }, 30_000, signal);
    return (data.experts ?? []).map((e: any) => ({
      name: String(e.name),
      description: String(e.description ?? ""),
      similarity: Math.round(Number(e.similarity ?? 0) * 100) / 100,
      ...(withCode ? { code: String(e.code ?? "") } : {}),
    }));
  }

  async get(name: string, signal?: AbortSignal): Promise<{ name: string; description: string; code: string; language: string } | null> {
    try {
      const data = await this.post("/api/expert/get", { name, global: false }, 30_000, signal);
      return {
        name: data.expert_name,
        description: data.expert_description ?? "",
        code: data.expert_code ?? "",
        language: data.cspl ?? "",
      };
    } catch (err) {
      if (err instanceof ExtellaError && /\(404\)|not found/i.test(err.message)) return null;
      throw err;
    }
  }

  async run(name: string, params: Record<string, unknown>, deviceId: string, signal?: AbortSignal) {
    const body: Record<string, unknown> = { expert_name: name, params, wait: true };
    if (deviceId) body.targets = [deviceId];
    const data = await this.post("/api/expert/run", body, 180_000, signal);
    return { result: data.result, runTimeMs: data.run_time_ms as number | undefined };
  }

  async save(name: string, description: string, code: string, kwargs: Record<string, unknown>, signal?: AbortSignal) {
    if (!NAME_PATTERN.test(name)) {
      throw new ExtellaError("Name must be lowercase letters, digits and underscores, 3–64 chars, starting with a letter.");
    }
    if (!new RegExp(`\\bdef\\s+${name}\\s*\\(`).test(code)) {
      throw new ExtellaError(`Code must define a function named ${name}(...) — Extella calls the function with the program's name.`);
    }
    await this.post(
      "/api/expert/save",
      { name, description, code, cspl: "fython", global: false, kwargs },
      30_000,
      signal,
    );
  }

  async devices(signal?: AbortSignal): Promise<Device[]> {
    const data = await this.post("/api/targets/list", {}, 30_000, signal);
    return (data.results ?? []).map((t: any) => ({
      deviceId: String(t.target),
      description: String(t.description ?? ""),
    }));
  }
}
