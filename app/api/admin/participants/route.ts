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

export async function DELETE(request: NextRequest) {
  try {
    const programId = request.nextUrl.searchParams.get('programId')
    const where = programId ? { programId } : {}
    // Must delete matches first (FK constraint from MatchMember → Participant)
    await prisma.match.deleteMany({ where })
    const { count } = await prisma.participant.deleteMany({ where })
    return Response.json({ success: true, deleted: count })
  } catch (error) {
    console.error('DELETE /api/admin/participants error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
