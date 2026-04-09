import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { label, fieldType, options, isRequired, isActive, sortOrder } = body

    const field = await prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(fieldType !== undefined && { fieldType }),
        ...(options !== undefined && { options }),
        ...(isRequired !== undefined && { isRequired }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    })

    return Response.json(field)
  } catch (error) {
    console.error('PATCH /api/admin/custom-fields/[id] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.customFieldDefinition.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/admin/custom-fields/[id] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
