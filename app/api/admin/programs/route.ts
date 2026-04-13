import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const programs = await prisma.program.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return Response.json(programs)
  } catch (error) {
    console.error('GET /api/admin/programs error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()
    if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

    const slug = name.trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (!slug) return Response.json({ error: 'Could not generate a valid slug from name' }, { status: 400 })

    const existing = await prisma.program.findUnique({ where: { slug } })
    if (existing) return Response.json({ error: 'A program with this name already exists' }, { status: 409 })

    const program = await prisma.program.create({ data: { name: name.trim(), slug } })
    const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`
    return Response.json({ ...program, url: `${origin}/form/${program.slug}` }, { status: 201 })
  } catch (error) {
    console.error('POST /api/admin/programs error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
