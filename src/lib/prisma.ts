import { PrismaPg } from "@prisma/adapter-pg"
import { env } from "../config/env.js"
import { PrismaClient } from "../generated/prisma/client.js"

/**
 * Single Prisma client instance for the whole process.
 * Prisma 7 connects through the node-postgres driver adapter.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
