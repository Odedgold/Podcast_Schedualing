import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const match = await prisma.match.update({
      where: { id },
      data: { status: 'REJECTED' },
    })

    return Response.json({ success: true, match })
  } catch (error) {
    console.error('POST /api/admin/matches/[id]/reject error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
