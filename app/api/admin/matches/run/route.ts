import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

type RuleMode = 'mandatory' | 'preferred' | 'off'
type Rules = Record<string, RuleMode>

interface WeeklySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface ParticipantWithSlots {
  id: string
  schoolName: string
  country: string
  englishLevel: string | null
  hobbies: string | null
  podcastLanguage: string | null
  competitionGoal: string | null
  grade: string | null
  availability: WeeklySlot[]
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function nextOccurrence(dayOfWeek: number, timeStr: string): Date {
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

function findAvailabilityOverlap(slotsA: WeeklySlot[], slotsB: WeeklySlot[]) {
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

function hobbiesOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const setA = new Set(a.toLowerCase().split(',').map((h) => h.trim()))
  return b.toLowerCase().split(',').some((h) => setA.has(h.trim()))
}

function scoreAndValidatePair(
  a: ParticipantWithSlots,
  b: ParticipantWithSlots,
  rules: Rules
): { valid: boolean; score: number; overlap: ReturnType<typeof findAvailabilityOverlap> } {
  let score = 0
  let valid = true

  // Check availability
  const overlap = findAvailabilityOverlap(a.availability, b.availability)
  if (rules.availability === 'mandatory' && !overlap) return { valid: false, score: 0, overlap: null }
  if (rules.availability === 'preferred' && overlap) score += 10

  // Different school
  const diffSchool = a.schoolName !== b.schoolName
  if (rules.differentSchool === 'mandatory' && !diffSchool) { valid = false }
  if (rules.differentSchool === 'preferred' && diffSchool) score += 5

  // Different country
  const diffCountry = a.country !== b.country
  if (rules.differentCountry === 'mandatory' && !diffCountry) { valid = false }
  if (rules.differentCountry === 'preferred' && diffCountry) score += 5

  // Same English level
  const sameEnglish = a.englishLevel && b.englishLevel && a.englishLevel === b.englishLevel
  if (rules.sameEnglishLevel === 'mandatory' && !sameEnglish) { valid = false }
  if (rules.sameEnglishLevel === 'preferred' && sameEnglish) score += 4

  // Similar hobbies
  const hobbyMatch = hobbiesOverlap(a.hobbies, b.hobbies)
  if (rules.similarHobbies === 'mandatory' && !hobbyMatch) { valid = false }
  if (rules.similarHobbies === 'preferred' && hobbyMatch) score += 4

  // Same podcast language
  const sameLang = a.podcastLanguage && b.podcastLanguage && a.podcastLanguage === b.podcastLanguage
  if (rules.samePodcastLanguage === 'mandatory' && !sameLang) { valid = false }
  if (rules.samePodcastLanguage === 'preferred' && sameLang) score += 3

  // Same competition goal
  const sameGoal = a.competitionGoal && b.competitionGoal && a.competitionGoal === b.competitionGoal
  if (rules.sameCompetitionGoal === 'mandatory' && !sameGoal) { valid = false }
  if (rules.sameCompetitionGoal === 'preferred' && sameGoal) score += 3

  // Same grade
  const sameGrade = a.grade && b.grade && a.grade === b.grade
  if (rules.sameGrade === 'mandatory' && !sameGrade) { valid = false }
  if (rules.sameGrade === 'preferred' && sameGrade) score += 2

  return { valid, score, overlap }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { matchType = 'PAIR', groupSize = 3, country, schoolName, rules = {} } = body

    const defaultRules: Rules = {
      availability: 'mandatory',
      differentSchool: 'off',
      differentCountry: 'off',
      sameEnglishLevel: 'off',
      similarHobbies: 'off',
      samePodcastLanguage: 'off',
      sameCompetitionGoal: 'off',
      sameGrade: 'off',
      ...rules,
    }

    const participantFilter: Record<string, unknown> = { status: 'PENDING' }
    if (country) participantFilter.country = country
    if (schoolName) participantFilter.schoolName = schoolName

    const participants = await prisma.participant.findMany({
      where: participantFilter,
      include: {
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    })

    const eligible: ParticipantWithSlots[] = participants.filter((p) => p.availability.length > 0).map((p) => ({
      id: p.id,
      schoolName: p.schoolName,
      country: p.country,
      englishLevel: p.englishLevel,
      hobbies: p.hobbies,
      podcastLanguage: p.podcastLanguage,
      competitionGoal: p.competitionGoal,
      grade: p.grade,
      availability: p.availability,
    }))

    const createdMatches: string[] = []

    if (matchType === 'PAIR' || matchType === 'BOTH') {
      const matched = new Set<string>()

      for (let i = 0; i < eligible.length; i++) {
        if (matched.has(eligible[i].id)) continue

        // Find best candidate for eligible[i]
        let bestScore = -1
        let bestJ = -1
        let bestOverlap: ReturnType<typeof findAvailabilityOverlap> = null

        for (let j = i + 1; j < eligible.length; j++) {
          if (matched.has(eligible[j].id)) continue
          const { valid, score, overlap } = scoreAndValidatePair(eligible[i], eligible[j], defaultRules)
          if (valid && score > bestScore) {
            bestScore = score
            bestJ = j
            bestOverlap = overlap
          }
        }

        if (bestJ !== -1) {
          const overlap = bestOverlap || findAvailabilityOverlap(eligible[i].availability, eligible[bestJ].availability)
          const startUtc = overlap ? nextOccurrence(overlap.dayOfWeek, overlap.startTime) : new Date()
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)
          const match = await prisma.match.create({
            data: {
              matchType: 'PAIR',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              members: {
                create: [
                  { participantId: eligible[i].id },
                  { participantId: eligible[bestJ].id },
                ],
              },
            },
          })
          createdMatches.push(match.id)
          matched.add(eligible[i].id)
          matched.add(eligible[bestJ].id)
        }
      }
    }

    if (matchType === 'GROUP' || matchType === 'BOTH') {
      const size = groupSize || 3
      const unmatched = eligible.filter((p) => !createdMatches.includes(p.id))

      for (let i = 0; i + size <= unmatched.length; i += size) {
        const group = unmatched.slice(i, i + size)
        // Find common availability
        let commonOverlap: ReturnType<typeof findAvailabilityOverlap> = group[0].availability.length > 0
          ? { dayOfWeek: group[0].availability[0].dayOfWeek, startTime: group[0].availability[0].startTime, endTime: group[0].availability[0].endTime }
          : null

        for (let g = 1; g < group.length && commonOverlap; g++) {
          commonOverlap = findAvailabilityOverlap(
            [commonOverlap],
            group[g].availability
          )
        }

        if (commonOverlap || defaultRules.availability !== 'mandatory') {
          const startUtc = commonOverlap ? nextOccurrence(commonOverlap.dayOfWeek, commonOverlap.startTime) : new Date()
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)
          const match = await prisma.match.create({
            data: {
              matchType: 'GROUP',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              members: { create: group.map((p) => ({ participantId: p.id })) },
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
