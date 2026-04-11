import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { label, fieldType, options, placeholder, isRequired, isActive, sortOrder, matchingMode, matchingType, matchingWeight } = body
  const field = await prisma.customFieldDefinition.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(fieldType !== undefined && { fieldType }),
      ...(options !== undefined && { options }),
      ...(placeholder !== undefined && { placeholder }),
      ...(isRequired !== undefined && { isRequired }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(matchingMode !== undefined && { matchingMode }),
      ...(matchingType !== undefined && { matchingType }),
      ...(matchingWeight !== undefined && { matchingWeight }),
    },
  })
  return Response.json(field)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.customFieldDefinition.delete({ where: { id } })
  return Response.json({ success: true })
}
