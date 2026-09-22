import { z } from "zod"

const FINGERPRINT_REGEX = /^[A-Za-z0-9_-]{8,128}$/

const Fingerprint = z.string().regex(FINGERPRINT_REGEX)

const User = z.object({
  id: z.string(),
  fingerprint: Fingerprint,
  createdAt: z.date(),
  lastSeenAt: z.date(),
  lastIp: z.string().optional()
})

export { User, Fingerprint, FINGERPRINT_REGEX }
export type UserType = z.infer<typeof User>
