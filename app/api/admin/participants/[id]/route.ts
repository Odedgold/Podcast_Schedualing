import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status } = await request.json()
  const participant = await prisma.participant.update({ where: { id }, data: { status } })
  return Response.json(participant)
}

// GDPR Art.17 / CCPA §1798.105 — Right to erasure
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Cascading deletes handled by Prisma schema (onDelete: Cascade)
    await prisma.participant.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/admin/participants/[id] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
