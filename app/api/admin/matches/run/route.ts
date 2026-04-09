import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { matchType = 'PAIR', daysAhead = 14, groupSize = 3, country, schoolName } = body

    const now = DateTime.utc()
    const future = now.plus({ days: daysAhead })

    const participantFilter: Record<string, unknown> = { status: 'PENDING' }
    if (country) participantFilter.country = country
    if (schoolName) participantFilter.schoolName = schoolName

    const participants = await prisma.participant.findMany({
      where: participantFilter,
      include: {
        availability: {
          where: {
            startUtc: { gte: now.toJSDate(), lte: future.toJSDate() },
          },
          orderBy: { startUtc: 'asc' },
        },
      },
    })

    const eligibleParticipants = participants.filter((p) => p.availability.length > 0)
    const createdMatches: string[] = []

    if (matchType === 'PAIR' || matchType === 'BOTH') {
      const matched = new Set<string>()

      for (let i = 0; i < eligibleParticipants.length; i++) {
        if (matched.has(eligibleParticipants[i].id)) continue

        for (let j = i + 1; j < eligibleParticipants.length; j++) {
          if (matched.has(eligibleParticipants[j].id)) continue

          const overlap = findOverlap(
            eligibleParticipants[i].availability,
            eligibleParticipants[j].availability
          )

          if (overlap) {
            const match = await prisma.match.create({
              data: {
                matchType: 'PAIR',
                scheduledStartUtc: overlap.startUtc,
                scheduledEndUtc: overlap.endUtc,
                members: {
                  create: [
                    { participantId: eligibleParticipants[i].id },
                    { participantId: eligibleParticipants[j].id },
                  ],
                },
              },
            })
            createdMatches.push(match.id)
            matched.add(eligibleParticipants[i].id)
            matched.add(eligibleParticipants[j].id)
            break
          }
        }
      }
    }

    if (matchType === 'GROUP' || matchType === 'BOTH') {
      const size = groupSize || 3
      const unmatched = eligibleParticipants.filter(
        (p) => !createdMatches.some(async () => false)
      )

      for (let i = 0; i + size <= unmatched.length; i += size) {
        const group = unmatched.slice(i, i + size)
        const commonSlot = findGroupOverlap(group.map((p) => p.availability))

        if (commonSlot) {
          const match = await prisma.match.create({
            data: {
              matchType: 'GROUP',
              scheduledStartUtc: commonSlot.startUtc,
              scheduledEndUtc: commonSlot.endUtc,
              members: {
                create: group.map((p) => ({ participantId: p.id })),
              },
            },
          })
          createdMatches.push(match.id)
        }
      }
    }

    return Response.json({ success: true, matchesCreated: createdMatches.length, matchIds: createdMatches })
  } catch (error) {
    console.error('POST /api/admin/matches/run error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface Slot {
  startUtc: Date
  endUtc: Date
}

function findOverlap(slotsA: Slot[], slotsB: Slot[]) {
  for (const a of slotsA) {
    for (const b of slotsB) {
      const start = new Date(Math.max(a.startUtc.getTime(), b.startUtc.getTime()))
      const end = new Date(Math.min(a.endUtc.getTime(), b.endUtc.getTime()))
      if (end.getTime() - start.getTime() >= 30 * 60 * 1000) {
        return { startUtc: start, endUtc: new Date(start.getTime() + 30 * 60 * 1000) }
      }
    }
  }
  return null
}

function findGroupOverlap(allSlots: Slot[][]) {
  if (allSlots.length === 0) return null
  const reference = allSlots[0]
  for (const slot of reference) {
    let valid = true
    for (let i = 1; i < allSlots.length; i++) {
      const hasOverlap = allSlots[i].some((s) => {
        const start = Math.max(slot.startUtc.getTime(), s.startUtc.getTime())
        const end = Math.min(slot.endUtc.getTime(), s.endUtc.getTime())
        return end - start >= 30 * 60 * 1000
      })
      if (!hasOverlap) { valid = false; break }
    }
    if (valid) return { startUtc: slot.startUtc, endUtc: slot.endUtc }
  }
  return null
}
