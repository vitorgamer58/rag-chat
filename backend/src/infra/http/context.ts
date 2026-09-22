import type { Response } from "express"
import type { UserType } from "../../domain/entities/User.js"

const USER_KEY = "user"

const setUser = (res: Response, user: UserType): void => {
  res.locals[USER_KEY] = user
}

/** The user resolved by the fingerprint + registerUser middlewares. Only call it on routes behind them. */
const getUser = (res: Response): UserType => {
  const user = res.locals[USER_KEY] as UserType | undefined
  if (!user) throw new Error("No authenticated user in the request context")
  return user
}

export { setUser, getUser }
