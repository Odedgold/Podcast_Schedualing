import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  try {
    const fields = await prisma.customFieldDefinition.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return Response.json(fields)
  } catch (error) {
    console.error('GET /api/admin/custom-fields error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { label, fieldKey, fieldType, options, isRequired, sortOrder } = body

    if (!label || !fieldKey) {
      return Response.json({ error: 'label and fieldKey are required' }, { status: 400 })
    }

    const field = await prisma.customFieldDefinition.create({
      data: {
        label,
        fieldKey,
        fieldType: fieldType || 'TEXT',
        options: options || [],
        isRequired: isRequired || false,
        sortOrder: sortOrder || 0,
      },
    })

    return Response.json(field)
  } catch (error) {
    console.error('POST /api/admin/custom-fields error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
