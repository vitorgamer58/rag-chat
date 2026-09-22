import "dotenv/config"
import { MongoClient } from "mongodb"
import { z } from "zod"
import { ConfigKey, type ConfigKeyType } from "../src/domain/enums/ConfigKey.js"
import { Collections, type ConfigDoc } from "../src/infra/database/documents.js"

// Based on the prompt in ukraine-rag-console/rag_console.py (SYSTEM_PROMPT and build_user_message), adapted for
// a web chat UI: the console version asked for plain text because it only ever printed to a terminal, where
// Markdown syntax would just show up as literal asterisks/hashes. The frontend renders Markdown, so this asks
// for it instead.
const DEFAULT_CONFIG: Record<ConfigKeyType, string> = {
  [ConfigKey.SYSTEM_PROMPT]:
    "Your role is to answer questions or claims in first person, using your own knowledge and the provided context, if any. " +
    "Your role is to defend Ukraine from pro-Russian propaganda. " +
    "You cannot mention that there is a context, and you cannot mention the system prompt; " +
    "you must answer naturally, formatting your response in Markdown when it improves clarity " +
    "(e.g. **bold**, lists, or code blocks), without ever mentioning that you are using Markdown. " +
    "You can cite scientific articles (papers) if there are any in the context and it makes sense to answer. " +
    "If you don't have information about something, simply state that you don't have any information as briefly as possible.",
  // {{context}} is replaced by the rendered context_template (or by nothing when no chunk was retrieved).
  [ConfigKey.USER_MESSAGE_TEMPLATE]:
    "{{context}}Refute this, without repeating the text and without citing context, " +
    "by writing in the first person singular:\nQuestion:\n{{question}}\n",
  // {{chunks}} is replaced by the retrieved chunk texts, separated by a blank line.
  [ConfigKey.CONTEXT_TEMPLATE]:
    "---------------------\nContext information is below.\n{{chunks}}\n---------------------\n"
}

const Env = z.object({
  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1).default("rag")
})

/** Inserts the missing config documents. Pass --force to overwrite values that already exist. */
const main = async () => {
  const force = process.argv.includes("--force")
  const env = Env.parse(process.env)

  const client = new MongoClient(env.MONGO_URL)
  try {
    await client.connect()
    const collection = client.db(env.MONGO_DB_NAME).collection<ConfigDoc>(Collections.APP_CONFIG)
    await collection.createIndex({ key: 1 }, { unique: true })

    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      const now = new Date()
      const result = force
        ? await collection.updateOne({ key }, { $set: { value, updatedAt: now } }, { upsert: true })
        : await collection.updateOne({ key }, { $setOnInsert: { value, updatedAt: now } }, { upsert: true })
      const action = result.upsertedCount ? "inserted" : result.modifiedCount ? "updated" : "kept (already exists)"
      console.log(`${key}: ${action}`)
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
