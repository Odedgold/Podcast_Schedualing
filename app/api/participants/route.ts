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
      grade,
      gender,
      hobbies,
      englishLevel,
      podcastLanguage,
      competitionGoal,
      additionalInfo,
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

    if (participant) {
      participant = await prisma.participant.update({
        where: { submissionToken: token },
        data: {
          fullName,
          email,
          phone: phone || null,
          schoolName,
          city,
          country,
          grade: grade || null,
          gender: gender || null,
          hobbies: hobbies || null,
          englishLevel: englishLevel || null,
          podcastLanguage: podcastLanguage || null,
          competitionGoal: competitionGoal || null,
          additionalInfo: additionalInfo || null,
          detectedTz: detectedTz || confirmedTz,
          confirmedTz,
          status: 'PENDING',
        },
      })
    } else {
      participant = await prisma.participant.create({
        data: {
          fullName,
          email,
          phone: phone || null,
          schoolName,
          city,
          country,
          grade: grade || null,
          gender: gender || null,
          hobbies: hobbies || null,
          englishLevel: englishLevel || null,
          podcastLanguage: podcastLanguage || null,
          competitionGoal: competitionGoal || null,
          additionalInfo: additionalInfo || null,
          detectedTz: detectedTz || confirmedTz,
          confirmedTz,
        },
      })
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
