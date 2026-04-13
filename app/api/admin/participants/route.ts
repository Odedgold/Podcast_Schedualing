import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const programId = request.nextUrl.searchParams.get('programId')
    const participants = await prisma.participant.findMany({
      where: programId ? { programId } : {},
      include: {
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        customFields: { include: { field: { select: { label: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    return Response.json(participants)
  } catch (error) {
    console.error('GET /api/admin/participants error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
