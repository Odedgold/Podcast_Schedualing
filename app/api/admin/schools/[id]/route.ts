import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.school.delete({ where: { id } })
  return Response.json({ success: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, sortOrder } = await request.json()
  const school = await prisma.school.update({ where: { id }, data: { ...(name && { name }), ...(sortOrder !== undefined && { sortOrder }) } })
  return Response.json(school)
}
