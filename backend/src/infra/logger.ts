import { pino } from "pino"

const createLogger = (level: string) => pino({ level })

export { createLogger }
