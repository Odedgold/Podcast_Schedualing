import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function nextOccurrence(dayOfWeek: number, timeStr: string): Date {
  // dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
  // Luxon weekday: 1=Monday, ..., 7=Sunday
  const jsToLuxon = [7, 1, 2, 3, 4, 5, 6]
  const targetWeekday = jsToLuxon[dayOfWeek]
  const [h, m] = timeStr.split(':').map(Number)
  const now = DateTime.now()
  let d = now.set({ hour: h, minute: m, second: 0, millisecond: 0 })
  let attempts = 0
  while ((d.weekday !== targetWeekday || d <= now) && attempts < 14) {
    d = d.plus({ days: 1 })
    attempts++
  }
  return d.toUTC().toJSDate()
}

interface WeeklySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

function findOverlap(slotsA: WeeklySlot[], slotsB: WeeklySlot[]) {
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.dayOfWeek !== b.dayOfWeek) continue
      const aStart = timeToMinutes(a.startTime)
      const aEnd = timeToMinutes(a.endTime)
      const bStart = timeToMinutes(b.startTime)
      const bEnd = timeToMinutes(b.endTime)
      const overlapStart = Math.max(aStart, bStart)
      const overlapEnd = Math.min(aEnd, bEnd)
      if (overlapEnd - overlapStart >= 30) {
        return {
          dayOfWeek: a.dayOfWeek,
          startTime: minutesToTime(overlapStart),
          endTime: minutesToTime(overlapStart + 30),
        }
      }
    }
  }
  return null
}

function findGroupOverlap(allSlots: WeeklySlot[][]) {
  if (allSlots.length === 0) return null
  for (const slot of allSlots[0]) {
    let valid = true
    for (let i = 1; i < allSlots.length; i++) {
      const hasOverlap = allSlots[i].some((s) => {
        if (s.dayOfWeek !== slot.dayOfWeek) return false
        const aStart = timeToMinutes(slot.startTime)
        const aEnd = timeToMinutes(slot.endTime)
        const bStart = timeToMinutes(s.startTime)
        const bEnd = timeToMinutes(s.endTime)
        return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) >= 30
      })
      if (!hasOverlap) { valid = false; break }
    }
    if (valid) return { dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { matchType = 'PAIR', groupSize = 3, country, schoolName } = body

    const participantFilter: Record<string, unknown> = { status: 'PENDING' }
    if (country) participantFilter.country = country
    if (schoolName) participantFilter.schoolName = schoolName

    const participants = await prisma.participant.findMany({
      where: participantFilter,
      include: {
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
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
            const startUtc = nextOccurrence(overlap.dayOfWeek, overlap.startTime)
            const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)
            const match = await prisma.match.create({
              data: {
                matchType: 'PAIR',
                scheduledStartUtc: startUtc,
                scheduledEndUtc: endUtc,
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
      const unmatched = eligibleParticipants.filter((p) => !createdMatches.includes(p.id))

      for (let i = 0; i + size <= unmatched.length; i += size) {
        const group = unmatched.slice(i, i + size)
        const commonSlot = findGroupOverlap(group.map((p) => p.availability))

        if (commonSlot) {
          const startUtc = nextOccurrence(commonSlot.dayOfWeek, commonSlot.startTime)
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)
          const match = await prisma.match.create({
            data: {
              matchType: 'GROUP',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
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
