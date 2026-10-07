import { afterEach, describe, expect, it } from "vitest"
import { ScriptedLLMClient } from "./fakes.js"
import { buildTestApp, createCaller } from "./helpers.js"

describe("client IP resolution", () => {
  let app: ReturnType<typeof buildTestApp>

  afterEach(() => {
    app.close()
  })

  const lastIp = async (headers: Record<string, string>) => {
    app = buildTestApp({ llmClient: new ScriptedLLMClient([]) })
    await createCaller(app.baseUrl)("/api/chats", { headers })
    return app.userRepository.users.get("fingerprint-user-1")?.lastIp
  }

  it("takes the IP from X-Forwarded-For set by the loopback proxy", async () => {
    expect(await lastIp({ "X-Forwarded-For": "203.0.113.9" })).toBe("203.0.113.9")
  })

  it("ignores a client-supplied CF-Connecting-IP", async () => {
    expect(await lastIp({ "CF-Connecting-IP": "198.51.100.7" })).not.toBe("198.51.100.7")
  })
})

describe("security headers", () => {
  it("sets helmet headers and hides X-Powered-By", async () => {
    const app = buildTestApp({ llmClient: new ScriptedLLMClient([]) })
    try {
      const response = await fetch(`${app.baseUrl}/health`)
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
      expect(response.headers.get("strict-transport-security")).toBeTruthy()
      expect(response.headers.get("x-powered-by")).toBeNull()
    } finally {
      app.close()
    }
  })
})
