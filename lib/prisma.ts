import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!
  // max: 1 — each serverless instance opens a single pg connection.
  // Combined with Supabase pgbouncer (transaction mode, port 6543), this prevents
  // pool exhaustion under concurrent admin loads.
  const adapter = new PrismaPg({ connectionString, max: 1 })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Reuse the same client across hot-reloads in dev AND across warm serverless
// invocations in production.
globalForPrisma.prisma = prisma
