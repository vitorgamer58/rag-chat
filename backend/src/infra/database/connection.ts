import { MongoClient } from "mongodb"

const connectToMongo = async (url: string): Promise<MongoClient> => {
  const client = new MongoClient(url)
  await client.connect()
  await client.db("admin").command({ ping: 1 })
  return client
}

export { connectToMongo }
