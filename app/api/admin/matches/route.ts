import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const programId = request.nextUrl.searchParams.get('programId')
    const matches = await prisma.match.findMany({
      where: programId ? { programId } : {},
      include: {
        members: {
          include: {
            participant: {
              include: {
                availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
              },
            },
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
