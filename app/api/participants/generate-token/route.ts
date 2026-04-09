import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const participant = await prisma.participant.create({
      data: {
        fullName: '',
        email: '',
        schoolName: '',
        city: '',
        country: '',
        detectedTz: '',
        confirmedTz: '',
      },
    })

    const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`
    const url = `${origin}/form/${participant.submissionToken}`

    return Response.json({ token: participant.submissionToken, url })
  } catch (error) {
    console.error('POST /api/participants/generate-token error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
