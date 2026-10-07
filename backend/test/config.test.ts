import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/infra/config/index.js"

const baseEnv = { MONGO_URL: "mongodb://localhost:27017", MISTRAL_API_KEY: "mistral-key", KIMI_API_KEY: "kimi-key" }

describe("loadConfig", () => {
  it("defaults to Kimi K3 and to the documented limits", () => {
    const config = loadConfig(baseEnv)

    expect(config.llm.provider).toBe("KIMI")
    expect(config.llm.kimi).toMatchObject({ model: "kimi-k3", baseUrl: "https://api.moonshot.ai/v1" })
    expect(config.rateLimit).toEqual({ maxMessages: 20, windowMinutes: 60 })
    expect(config.rag).toEqual({ vectorIndex: "vector_index", retrieveK: 6, scoreThreshold: 0.8 })
    expect(config.mongo.dbName).toBe("rag")
    expect(config.llm.mistral.embedTimeoutMs).toBe(30_000)
  })

  it("binds to loopback by default and accepts HOST/PORT overrides", () => {
    expect(loadConfig(baseEnv)).toMatchObject({ host: "127.0.0.1", port: 3000 })
    expect(loadConfig({ ...baseEnv, HOST: "0.0.0.0", PORT: "5010" })).toMatchObject({ host: "0.0.0.0", port: 5010 })
  })

  it("refuses a wildcard CORS origin in production only", () => {
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production", CORS_ORIGIN: "*" })).toThrow(/CORS_ORIGIN/)
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "production", CORS_ORIGIN: "https://a.com, *" })).toThrow(
      /CORS_ORIGIN/
    )
    expect(loadConfig({ ...baseEnv, NODE_ENV: "production", CORS_ORIGIN: "https://a.com" }).corsOrigins).toEqual([
      "https://a.com"
    ])
    expect(loadConfig({ ...baseEnv, CORS_ORIGIN: "*" }).corsOrigins).toEqual(["*"])
  })

  it("switches to Mistral through LLM_PROVIDER (case-insensitive) without needing the Kimi key", () => {
    const { KIMI_API_KEY: _ignored, ...withoutKimi } = baseEnv
    void _ignored

    expect(loadConfig({ ...withoutKimi, LLM_PROVIDER: "mistral" }).llm.provider).toBe("MISTRAL")
  })

  it("fails fast, naming every problem", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "OPENAI" })).toThrow(/MONGO_URL[\s\S]*MISTRAL_API_KEY|LLM_PROVIDER/)
    expect(() => loadConfig({ MONGO_URL: "x", MISTRAL_API_KEY: "y" })).toThrow(/KIMI_API_KEY/)
  })

  it("treats blank variables as not set", () => {
    expect(() => loadConfig({ ...baseEnv, KIMI_API_KEY: "" })).toThrow(/KIMI_API_KEY/)
    expect(loadConfig({ ...baseEnv, RATE_LIMIT_MAX_MESSAGES: "" }).rateLimit.maxMessages).toBe(20)
  })

  it("parses numeric overrides and comma-separated CORS origins", () => {
    const config = loadConfig({
      ...baseEnv,
      RATE_LIMIT_MAX_MESSAGES: "5",
      RATE_LIMIT_WINDOW_MINUTES: "30",
      CORS_ORIGIN: "https://a.com, https://b.com"
    })

    expect(config.rateLimit).toEqual({ maxMessages: 5, windowMinutes: 30 })
    expect(config.corsOrigins).toEqual(["https://a.com", "https://b.com"])
  })
})
