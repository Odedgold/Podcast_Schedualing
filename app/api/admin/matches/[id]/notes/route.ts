import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { adminNotes } = await request.json()

    await prisma.match.update({
      where: { id },
      data: { adminNotes },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/admin/matches/[id]/notes error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
