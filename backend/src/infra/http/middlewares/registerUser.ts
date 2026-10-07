import { isIP } from "node:net"
import type { RequestHandler } from "express"
import type RegisterUser from "../../../application/usecases/RegisterUser.js"
import { setUser } from "../context.js"

/**
 * Registers the user on first contact (idempotent upsert) and keeps `lastSeenAt` fresh. The client IP (`req.ip`, resolved
 * through the trusted loopback proxy) is stored for information only; it is never used to identify anyone.
 */
const registerUser =
  ({ registerUser }: { registerUser: RegisterUser }): RequestHandler =>
  async (req, res, next) => {
    try {
      const fingerprint = res.locals["fingerprint"] as string
      const ip = req.ip
      const user = await registerUser.execute({
        fingerprint,
        lastIp: ip && isIP(ip) ? ip : undefined
      })
      setUser(res, user)
      next()
    } catch (error) {
      next(error)
    }
  }

export { registerUser }
