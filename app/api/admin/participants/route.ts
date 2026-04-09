import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { utcToIst } from '@/lib/timezone'

export async function GET(_request: NextRequest) {
  try {
    const participants = await prisma.participant.findMany({
      include: {
        availability: { orderBy: { startUtc: 'asc' } },
        customFields: { include: { field: true } },
        matchMembers: { include: { match: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    const data = participants.map((p) => ({
      ...p,
      availability: p.availability.map((slot) => ({
        ...slot,
        startIst: utcToIst(slot.startUtc.toISOString()),
        endIst: utcToIst(slot.endUtc.toISOString()),
      })),
    }))

    return Response.json(data)
  } catch (error) {
    console.error('GET /api/admin/participants error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
