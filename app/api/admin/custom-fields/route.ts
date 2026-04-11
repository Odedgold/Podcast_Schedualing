import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const fields = await prisma.customFieldDefinition.findMany({ orderBy: { sortOrder: 'asc' } })
  return Response.json(fields)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { label, fieldKey, fieldType, options, placeholder, isRequired, sortOrder, matchingMode, matchingType, matchingWeight } = body
  if (!label || !fieldKey) return Response.json({ error: 'label and fieldKey are required' }, { status: 400 })
  try {
    const field = await prisma.customFieldDefinition.create({
      data: {
        label, fieldKey,
        fieldType: fieldType || 'TEXT',
        options: options || [],
        placeholder: placeholder || null,
        isRequired: isRequired || false,
        sortOrder: sortOrder || 0,
        matchingMode: matchingMode || 'OFF',
        matchingType: matchingType || 'SAME_VALUE',
        matchingWeight: matchingWeight ?? 3,
      },
    })
    return Response.json(field)
  } catch {
    return Response.json({ error: 'Field key already exists' }, { status: 409 })
  }
}
