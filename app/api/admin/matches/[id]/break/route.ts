import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const match = await prisma.match.findUnique({
      where: { id },
      include: { members: true },
    })
    if (!match) return Response.json({ error: 'Not found' }, { status: 404 })

    await prisma.match.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await prisma.participant.updateMany({
      where: { id: { in: match.members.map((m) => m.participantId) } },
      data: { status: 'PENDING' },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/admin/matches/[id]/break error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
