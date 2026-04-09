import { prisma } from '@/lib/prisma'

export async function GET() {
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
  return Response.json(schools)
}
