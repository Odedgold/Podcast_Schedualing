import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status } = await request.json()
  const participant = await prisma.participant.update({ where: { id }, data: { status } })
  return Response.json(participant)
}
