import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      token,
      fullName,
      email,
      phone,
      schoolName,
      city,
      country,
      detectedTz,
      confirmedTz,
      availability,
      customFields,
    } = body

    if (!fullName || !email || !schoolName || !city || !country || !confirmedTz) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let participant
    if (token) {
      participant = await prisma.participant.findUnique({ where: { submissionToken: token } })
    }

    const coreData = {
      fullName,
      email,
      phone: phone || null,
      schoolName,
      city,
      country,
      detectedTz: detectedTz || confirmedTz,
      confirmedTz,
    }

    if (participant) {
      participant = await prisma.participant.update({
        where: { submissionToken: token },
        data: { ...coreData, status: 'PENDING' },
      })
    } else {
      participant = await prisma.participant.create({ data: coreData })
    }

    if (availability && Array.isArray(availability)) {
      await prisma.availabilitySlot.deleteMany({ where: { participantId: participant.id } })
      if (availability.length > 0) {
        await prisma.availabilitySlot.createMany({
          data: availability.map((slot: { dayOfWeek: number; startTime: string; endTime: string }) => ({
            participantId: participant.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        })
      }
    }

    if (customFields && typeof customFields === 'object') {
      for (const [fieldId, value] of Object.entries(customFields)) {
        if (value === '' || value === null || value === undefined) continue
        await prisma.customFieldResponse.upsert({
          where: { participantId_fieldId: { participantId: participant.id, fieldId } },
          create: { participantId: participant.id, fieldId, value: String(value) },
          update: { value: String(value) },
        })
      }
    }

    return Response.json({ success: true, participantId: participant.id })
  } catch (error) {
    console.error('POST /api/participants error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
