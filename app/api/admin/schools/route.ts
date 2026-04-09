import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const schools = await prisma.school.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  return Response.json(schools)
}

export async function POST(request: NextRequest) {
  const { name } = await request.json()
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 })
  try {
    const school = await prisma.school.create({ data: { name: name.trim() } })
    return Response.json(school)
  } catch {
    return Response.json({ error: 'School already exists' }, { status: 409 })
  }
}
