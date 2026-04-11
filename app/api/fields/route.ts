import { prisma } from '@/lib/prisma'

export async function GET() {
  const fields = await prisma.customFieldDefinition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      label: true,
      fieldKey: true,
      fieldType: true,
      options: true,
      placeholder: true,
      isRequired: true,
      sortOrder: true,
    },
  })
  return Response.json(fields)
}
