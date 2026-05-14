/**
 * TEMPORARY ONE-SHOT MIGRATION ENDPOINT.
 * Adds parentPhone, countryOfBirth, notes columns to "Participant".
 * Idempotent via IF NOT EXISTS. Will be deleted after running once.
 *
 * Usage:
 *   curl -X POST https://<deployment>/api/admin/migrate-add-columns \
 *        -H "x-admin-password: <ADMIN_PASSWORD>"
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_request: NextRequest) {
  try {
    const stmts = [
      'ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "parentPhone" TEXT',
      'ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "countryOfBirth" TEXT',
      'ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "notes" TEXT',
    ]
    for (const sql of stmts) {
      await prisma.$executeRawUnsafe(sql)
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Participant'
         AND column_name IN ('parentPhone','countryOfBirth','notes')
       ORDER BY column_name`,
    )
    return Response.json({
      success: true,
      columnsPresent: rows.map((r) => r.column_name),
    })
  } catch (error) {
    console.error('POST /api/admin/migrate-add-columns error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return Response.json({ error: 'Migration failed', detail: msg }, { status: 500 })
  }
}
