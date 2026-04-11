import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

type RuleMode = 'mandatory' | 'preferred' | 'off'
type Rules = Record<string, RuleMode>
type GroupRule = 'any' | 'A_with_B' | 'A_with_A' | 'B_with_B'

interface WeeklySlot { dayOfWeek: number; startTime: string; endTime: string }
interface UtcSlot { dayOfWeek: number; startMinutes: number; endMinutes: number }

interface ParticipantWithSlots {
  id: string
  fullName: string
  schoolName: string
  country: string
  confirmedTz: string
  englishLevel: string | null
  hobbies: string | null
  podcastLanguage: string | null
  competitionGoal: string | null
  grade: string | null
  gender: string | null
  availability: WeeklySlot[]
}

function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

// Convert a participant's local slot to UTC (day + minutes since midnight)
function slotToUtc(slot: WeeklySlot, tz: string): UtcSlot {
  // Use a fixed reference Sunday (2024-01-07) to compute the UTC equivalent
  const [sh, sm] = slot.startTime.split(':').map(Number)
  const [eh, em] = slot.endTime.split(':').map(Number)
  const base = DateTime.fromObject({ year: 2024, month: 1, day: 7 + slot.dayOfWeek, hour: sh, minute: sm, second: 0 }, { zone: tz }).toUTC()
  const baseEnd = DateTime.fromObject({ year: 2024, month: 1, day: 7 + slot.dayOfWeek, hour: eh, minute: em, second: 0 }, { zone: tz }).toUTC()
  // Luxon weekday: 1=Mon … 7=Sun → JS: 0=Sun, 1=Mon … 6=Sat
  const utcDay = base.weekday === 7 ? 0 : base.weekday
  return { dayOfWeek: utcDay, startMinutes: base.hour * 60 + base.minute, endMinutes: baseEnd.hour * 60 + baseEnd.minute }
}

// nextOccurrence receives UTC day-of-week + UTC time string
function nextOccurrence(utcDayOfWeek: number, utcTimeStr: string): Date {
  const jsToLuxon = [7, 1, 2, 3, 4, 5, 6]
  const targetWeekday = jsToLuxon[utcDayOfWeek]
  const [h, m] = utcTimeStr.split(':').map(Number)
  const now = DateTime.utc()
  let d = now.set({ hour: h, minute: m, second: 0, millisecond: 0 })
  let attempts = 0
  while ((d.weekday !== targetWeekday || d <= now) && attempts < 14) {
    d = d.plus({ days: 1 })
    attempts++
  }
  return d.toJSDate()
}

function findAvailabilityOverlap(slotsA: WeeklySlot[], tzA: string, slotsB: WeeklySlot[], tzB: string) {
  const utcA = slotsA.map((s) => slotToUtc(s, tzA))
  const utcB = slotsB.map((s) => slotToUtc(s, tzB))
  for (const a of utcA) {
    for (const b of utcB) {
      if (a.dayOfWeek !== b.dayOfWeek) continue
      const overlapStart = Math.max(a.startMinutes, b.startMinutes)
      const overlapEnd = Math.min(a.endMinutes, b.endMinutes)
      if (overlapEnd - overlapStart >= 30) {
        return { dayOfWeek: a.dayOfWeek, startTime: minutesToTime(overlapStart), endTime: minutesToTime(overlapStart + 30) }
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

function isGroupA(country: string, groupA: string[]): boolean {
  return groupA.includes(country)
}

function countryGroupAllowed(a: ParticipantWithSlots, b: ParticipantWithSlots, groupA: string[], groupRule: GroupRule): boolean {
  if (groupRule === 'any' || groupA.length === 0) return true
  const aInA = isGroupA(a.country, groupA)
  const bInA = isGroupA(b.country, groupA)
  if (groupRule === 'A_with_B') return aInA !== bInA
  if (groupRule === 'A_with_A') return aInA && bInA
  if (groupRule === 'B_with_B') return !aInA && !bInA
  return true
}

function generateSystemNotes(
  a: ParticipantWithSlots,
  b: ParticipantWithSlots,
  rules: Rules,
  groupA: string[],
  groupRule: GroupRule,
  gradeGap: number
): string {
  const notes: string[] = []

  // Country group notes
  if (groupA.length > 0 && groupRule !== 'any') {
    const aInA = isGroupA(a.country, groupA)
    const bInA = isGroupA(b.country, groupA)
    if (aInA && bInA) notes.push(`שתי מדינות מקבוצה A (${a.country}, ${b.country})`)
    else if (!aInA && !bInA) notes.push(`שתי מדינות מקבוצה B (${a.country}, ${b.country})`)
    else notes.push(`שיבוץ בינלאומי: ${a.country} + ${b.country}`)
  }

  // Same school warning
  if (a.schoolName === b.schoolName) {
    notes.push(`אותו בית ספר: ${a.schoolName}`)
  }

  // Same country
  if (a.country === b.country && rules.differentCountry === 'preferred') {
    notes.push(`אותה מדינה: ${a.country}`)
  }

  // English level
  if (a.englishLevel && b.englishLevel && a.englishLevel !== b.englishLevel) {
    notes.push(`רמת אנגלית שונה: ${a.englishLevel} / ${b.englishLevel}`)
  }

  // Hobbies
  if (!hobbiesOverlap(a.hobbies, b.hobbies) && rules.similarHobbies === 'preferred') {
    notes.push('אין תחביבים משותפים')
  }

  // Podcast language
  if (a.podcastLanguage && b.podcastLanguage && a.podcastLanguage !== b.podcastLanguage) {
    notes.push(`העדפת שפה שונה: ${a.podcastLanguage} / ${b.podcastLanguage}`)
  }

  // Competition goal
  if (a.competitionGoal && b.competitionGoal && a.competitionGoal !== b.competitionGoal) {
    notes.push(`מטרה שונה בתחרות: ${a.competitionGoal} / ${b.competitionGoal}`)
  }

  // Gender
  if (a.gender && b.gender && a.gender !== b.gender && a.gender !== 'no_choice' && b.gender !== 'no_choice') {
    notes.push(`מגדר שונה: ${a.gender} / ${b.gender}`)
  }

  // Grade gap
  if (a.grade && b.grade && rules.sameGrade !== 'off') {
    const gap = Math.abs((parseInt(a.grade) || 0) - (parseInt(b.grade) || 0))
    if (gap > 0) notes.push(`פער כיתות: ${a.grade} / ${b.grade}`)
  }

  return notes.join(' | ')
}

function gradeWithinGap(a: string | null, b: string | null, gap: number): boolean {
  if (!a || !b) return false
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (isNaN(na) || isNaN(nb)) return a === b
  return Math.abs(na - nb) <= gap
}

function scoreAndValidatePair(
  a: ParticipantWithSlots,
  b: ParticipantWithSlots,
  rules: Rules,
  groupA: string[],
  groupRule: GroupRule,
  gradeGap: number
): { valid: boolean; score: number; overlap: ReturnType<typeof findAvailabilityOverlap> } {
  let score = 0
  let valid = true

  // Country group rule (always mandatory)
  if (!countryGroupAllowed(a, b, groupA, groupRule)) return { valid: false, score: 0, overlap: null }

  const overlap = findAvailabilityOverlap(a.availability, a.confirmedTz, b.availability, b.confirmedTz)
  if (rules.availability === 'mandatory' && !overlap) return { valid: false, score: 0, overlap: null }
  if (rules.availability === 'preferred' && overlap) score += 10

  const diffSchool = a.schoolName !== b.schoolName
  if (rules.differentSchool === 'mandatory' && !diffSchool) valid = false
  if (rules.differentSchool === 'preferred' && diffSchool) score += 5

  const diffCountry = a.country !== b.country
  if (rules.differentCountry === 'mandatory' && !diffCountry) valid = false
  if (rules.differentCountry === 'preferred' && diffCountry) score += 5

  const sameEnglish = a.englishLevel && b.englishLevel && a.englishLevel === b.englishLevel
  if (rules.sameEnglishLevel === 'mandatory' && !sameEnglish) valid = false
  if (rules.sameEnglishLevel === 'preferred' && sameEnglish) score += 4

  const hobbyMatch = hobbiesOverlap(a.hobbies, b.hobbies)
  if (rules.similarHobbies === 'mandatory' && !hobbyMatch) valid = false
  if (rules.similarHobbies === 'preferred' && hobbyMatch) score += 4

  const sameLang = a.podcastLanguage && b.podcastLanguage && a.podcastLanguage === b.podcastLanguage
  if (rules.samePodcastLanguage === 'mandatory' && !sameLang) valid = false
  if (rules.samePodcastLanguage === 'preferred' && sameLang) score += 3

  const sameGoal = a.competitionGoal && b.competitionGoal && a.competitionGoal === b.competitionGoal
  if (rules.sameCompetitionGoal === 'mandatory' && !sameGoal) valid = false
  if (rules.sameCompetitionGoal === 'preferred' && sameGoal) score += 3

  const gradeOk = gradeWithinGap(a.grade, b.grade, gradeGap)
  if (rules.sameGrade === 'mandatory' && !gradeOk) valid = false
  if (rules.sameGrade === 'preferred' && gradeOk) score += 2

  const genderMatch = a.gender && b.gender && a.gender !== 'no_choice' && b.gender !== 'no_choice' && a.gender === b.gender
  if (rules.sameGender === 'mandatory' && !genderMatch) valid = false
  if (rules.sameGender === 'preferred' && genderMatch) score += 3

  return { valid, score, overlap }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      matchType = 'PAIR',
      groupSize = 3,
      countries,
      schools,
      rules = {},
      countryGroupA = [],
      countryGroupRule = 'any',
      gradeGap = 0,
    } = body

    const defaultRules: Rules = {
      availability: 'mandatory',
      differentSchool: 'off',
      differentCountry: 'off',
      sameEnglishLevel: 'off',
      similarHobbies: 'off',
      samePodcastLanguage: 'off',
      sameCompetitionGoal: 'off',
      sameGrade: 'off',
      sameGender: 'off',
      ...rules,
    }

    const participantFilter: Record<string, unknown> = { status: 'PENDING' }
    if (countries && Array.isArray(countries) && countries.length > 0) participantFilter.country = { in: countries }
    if (schools && Array.isArray(schools) && schools.length > 0) participantFilter.schoolName = { in: schools }

    const participants = await prisma.participant.findMany({
      where: participantFilter,
      include: { availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
    })

    const eligible: ParticipantWithSlots[] = participants.filter((p) => p.availability.length > 0).map((p) => ({
      id: p.id,
      fullName: p.fullName,
      schoolName: p.schoolName,
      country: p.country,
      confirmedTz: p.confirmedTz,
      englishLevel: p.englishLevel,
      hobbies: p.hobbies,
      podcastLanguage: p.podcastLanguage,
      competitionGoal: p.competitionGoal,
      grade: p.grade,
      gender: p.gender,
      availability: p.availability,
    }))

    const createdMatches: string[] = []

    if (matchType === 'PAIR' || matchType === 'BOTH') {
      const matched = new Set<string>()

      for (let i = 0; i < eligible.length; i++) {
        if (matched.has(eligible[i].id)) continue

        let bestScore = -1
        let bestJ = -1
        let bestOverlap: ReturnType<typeof findAvailabilityOverlap> = null

        for (let j = i + 1; j < eligible.length; j++) {
          if (matched.has(eligible[j].id)) continue
          const { valid, score, overlap } = scoreAndValidatePair(eligible[i], eligible[j], defaultRules, countryGroupA, countryGroupRule as GroupRule, gradeGap)
          if (valid && score > bestScore) {
            bestScore = score
            bestJ = j
            bestOverlap = overlap
          }
        }

        if (bestJ !== -1) {
          const overlap = bestOverlap || findAvailabilityOverlap(eligible[i].availability, eligible[i].confirmedTz, eligible[bestJ].availability, eligible[bestJ].confirmedTz)
          const startUtc = overlap ? nextOccurrence(overlap.dayOfWeek, overlap.startTime) : new Date()
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)
          const sysNotes = generateSystemNotes(eligible[i], eligible[bestJ], defaultRules, countryGroupA, countryGroupRule as GroupRule, gradeGap)

          const match = await prisma.match.create({
            data: {
              matchType: 'PAIR',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              systemNotes: sysNotes || null,
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
        // Seed with first participant's first slot converted to UTC
        let commonOverlap: ReturnType<typeof findAvailabilityOverlap> = group[0].availability.length > 0
          ? (() => { const u = slotToUtc(group[0].availability[0], group[0].confirmedTz); return { dayOfWeek: u.dayOfWeek, startTime: minutesToTime(u.startMinutes), endTime: minutesToTime(u.endMinutes) } })()
          : null

        for (let g = 1; g < group.length && commonOverlap; g++) {
          // commonOverlap is already UTC; compare against g's slots converted to UTC
          const utcSlotsG = group[g].availability.map((s) => { const u = slotToUtc(s, group[g].confirmedTz); return { dayOfWeek: u.dayOfWeek, startTime: minutesToTime(u.startMinutes), endTime: minutesToTime(u.endMinutes) } })
          commonOverlap = findAvailabilityOverlap([commonOverlap], 'UTC', utcSlotsG, 'UTC')
        }

        if (commonOverlap || defaultRules.availability !== 'mandatory') {
          const startUtc = commonOverlap ? nextOccurrence(commonOverlap.dayOfWeek, commonOverlap.startTime) : new Date()
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)

          // Generate notes for group
          const groupNotes: string[] = []
          const countries = [...new Set(group.map(p => p.country))]
          const schools = [...new Set(group.map(p => p.schoolName))]
          if (countries.length === 1) groupNotes.push(`כל המשתתפים מ-${countries[0]}`)
          if (schools.length < group.length) groupNotes.push('יש בית ספר כפול בקבוצה')

          const match = await prisma.match.create({
            data: {
              matchType: 'GROUP',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              systemNotes: groupNotes.join(' | ') || null,
              members: { create: group.map((p) => ({ participantId: p.id })) },
            },
          })
          createdMatches.push(match.id)
        }
      }
    }

    // Compute unmatched (still PENDING with availability but no match)
    const matchedIds = new Set(createdMatches)
    const unmatchedParticipants = eligible
      .filter((p) => !matchedIds.has(p.id))
      .map((p) => {
        const warnings: string[] = []
        const blockers: string[] = []

        // Isolation checks
        const sameSchoolCount = eligible.filter(q => q.schoolName === p.schoolName && q.id !== p.id).length
        if (sameSchoolCount === 0) warnings.push(`בית הספר היחיד מ-${p.schoolName}`)
        const sameCountryCount = eligible.filter(q => q.country === p.country && q.id !== p.id).length
        if (sameCountryCount === 0) warnings.push(`המשתתף היחיד מ-${p.country}`)

        // Rule blockers — explain WHY no match was found
        const others = eligible.filter(q => q.id !== p.id && !matchedIds.has(q.id))
        if (others.length === 0) {
          blockers.push('אין משתתפים פנויים אחרים לשיבוץ')
        } else {
          const hasOverlap = others.some(q => findAvailabilityOverlap(p.availability, p.confirmedTz, q.availability, q.confirmedTz))
          if (!hasOverlap && defaultRules.availability === 'mandatory') blockers.push('אין חפיפת זמנים עם אף משתתף אחר — שנה כלל זמינות ל-Off/Preferred')

          if (defaultRules.differentSchool === 'mandatory') {
            const sameSchool = others.every(q => q.schoolName === p.schoolName)
            if (sameSchool) blockers.push('כולם מאותו בית ספר — שנה כלל בית ספר')
          }
          if (defaultRules.differentCountry === 'mandatory') {
            const sameCountry = others.every(q => q.country === p.country)
            if (sameCountry) blockers.push('כולם מאותה מדינה — שנה כלל מדינה')
          }
          if (defaultRules.sameEnglishLevel === 'mandatory') {
            const noMatch = !others.some(q => q.englishLevel === p.englishLevel)
            if (noMatch) blockers.push(`אף אחד ברמת אנגלית ${p.englishLevel} — שנה כלל רמת אנגלית`)
          }
          if (defaultRules.sameGender === 'mandatory' && p.gender && p.gender !== 'no_choice') {
            const noMatch = !others.some(q => q.gender === p.gender)
            if (noMatch) blockers.push(`אין משתתף אחר עם מגדר ${p.gender} — שנה כלל מגדר`)
          }
          if (defaultRules.sameGrade === 'mandatory') {
            const noMatch = !others.some(q => gradeWithinGap(p.grade, q.grade, gradeGap))
            if (noMatch) blockers.push(`אין משתתף בטווח הכיתה — הרחב את פער הכיתות`)
          }
        }

        return { id: p.id, fullName: p.fullName, schoolName: p.schoolName, country: p.country, warnings, blockers }
      })

    return Response.json({
      success: true,
      matchesCreated: createdMatches.length,
      matchIds: createdMatches,
      unmatchedCount: unmatchedParticipants.length,
      unmatched: unmatchedParticipants,
    })
  } catch (error) {
    console.error('POST /api/admin/matches/run error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
