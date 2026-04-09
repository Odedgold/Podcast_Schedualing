import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  try {
    const matches = await prisma.match.findMany({
      include: {
        members: {
          include: {
            participant: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json(matches)
  } catch (error) {
    console.error('GET /api/admin/matches error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
