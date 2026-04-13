import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

type RuleMode = 'mandatory' | 'preferred' | 'off'

interface WeeklySlot { dayOfWeek: number; startTime: string; endTime: string }
interface UtcSlot { dayOfWeek: number; startMinutes: number; endMinutes: number }

interface FieldDef {
  id: string
  label: string
  fieldKey: string
  fieldType: string
  matchingMode: 'OFF' | 'PREFERRED' | 'MANDATORY'
  matchingType: 'SAME_VALUE' | 'DIFFERENT_VALUE' | 'NUMERIC_GAP' | 'ANY_VALUE'
  matchingWeight: number
}

interface ParticipantData {
  id: string
  fullName: string
  schoolName: string
  country: string
  confirmedTz: string
  availability: WeeklySlot[]
  customValues: Record<string, string> // fieldId → value
  side: 'A' | 'B' | 'both'
}

function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function slotToUtc(slot: WeeklySlot, tz: string): UtcSlot {
  const [sh, sm] = slot.startTime.split(':').map(Number)
  const [eh, em] = slot.endTime.split(':').map(Number)
  // Use current year/month so DST offset matches the actual scheduling period
  const now = DateTime.now()
  const base = DateTime.fromObject({ year: now.year, month: now.month, day: 7 + slot.dayOfWeek, hour: sh, minute: sm, second: 0 }, { zone: tz }).toUTC()
  const baseEnd = DateTime.fromObject({ year: now.year, month: now.month, day: 7 + slot.dayOfWeek, hour: eh, minute: em, second: 0 }, { zone: tz }).toUTC()
  const utcDay = base.weekday === 7 ? 0 : base.weekday
  return { dayOfWeek: utcDay, startMinutes: base.hour * 60 + base.minute, endMinutes: baseEnd.hour * 60 + baseEnd.minute }
}

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

// Check whether two field values satisfy a matchingType condition
function fieldMatches(valA: string | undefined, valB: string | undefined, fieldType: string, matchingType: string, matchingWeight: number): boolean {
  if (matchingType === 'ANY_VALUE') return !!(valA?.trim()) || !!(valB?.trim())
  if (!valA?.trim() || !valB?.trim()) return false

  if (matchingType === 'NUMERIC_GAP') {
    const na = parseFloat(valA)
    const nb = parseFloat(valB)
    if (isNaN(na) || isNaN(nb)) return valA === valB
    return Math.abs(na - nb) <= matchingWeight
  }

  if (fieldType === 'MULTISELECT') {
    const setA = new Set(valA.split(',').map((v) => v.trim()).filter(Boolean))
    const hasOverlap = valB.split(',').map((v) => v.trim()).some((v) => setA.has(v))
    if (matchingType === 'SAME_VALUE') return hasOverlap
    if (matchingType === 'DIFFERENT_VALUE') return !hasOverlap
    return false
  }

  if (matchingType === 'SAME_VALUE') return valA === valB
  if (matchingType === 'DIFFERENT_VALUE') return valA !== valB
  return false
}

function scoreAndValidatePair(
  a: ParticipantData,
  b: ParticipantData,
  fieldDefs: FieldDef[],
  availabilityRule: RuleMode,
  differentSchoolRule: RuleMode,
  differentCountryRule: RuleMode,
): { valid: boolean; score: number; overlap: ReturnType<typeof findAvailabilityOverlap> } {
  let score = 0
  let valid = true

  // Built-in: availability
  const overlap = findAvailabilityOverlap(a.availability, a.confirmedTz, b.availability, b.confirmedTz)
  if (availabilityRule === 'mandatory' && !overlap) return { valid: false, score: 0, overlap: null }
  if (availabilityRule === 'preferred' && overlap) score += 10

  // Built-in: different school
  const diffSchool = a.schoolName !== b.schoolName
  if (differentSchoolRule === 'mandatory' && !diffSchool) valid = false
  if (differentSchoolRule === 'preferred' && diffSchool) score += 5

  // Built-in: different country
  const diffCountry = a.country !== b.country
  if (differentCountryRule === 'mandatory' && !diffCountry) valid = false
  if (differentCountryRule === 'preferred' && diffCountry) score += 5

  // Dynamic field rules from DB
  for (const fd of fieldDefs) {
    if (fd.matchingMode === 'OFF') continue
    const valA = a.customValues[fd.id]
    const valB = b.customValues[fd.id]
    const matches = fieldMatches(valA, valB, fd.fieldType, fd.matchingType, fd.matchingWeight)
    if (fd.matchingMode === 'MANDATORY' && !matches) { valid = false; break }
    if (fd.matchingMode === 'PREFERRED' && matches) score += fd.matchingWeight
  }

  return { valid, score, overlap }
}

function generateSystemNotes(
  a: ParticipantData,
  b: ParticipantData,
  fieldDefs: FieldDef[],
  differentCountryRule: RuleMode,
): string {
  const notes: string[] = []

  if (a.schoolName === b.schoolName) notes.push(`Same school: ${a.schoolName}`)
  if (a.country === b.country && differentCountryRule === 'preferred') notes.push(`Same country: ${a.country}`)

  for (const fd of fieldDefs) {
    if (fd.matchingMode === 'OFF') continue
    const valA = a.customValues[fd.id]
    const valB = b.customValues[fd.id]
    const matches = fieldMatches(valA, valB, fd.fieldType, fd.matchingType, fd.matchingWeight)
    if (!matches && fd.matchingMode === 'PREFERRED') {
      if (valA && valB) notes.push(`${fd.label}: ${valA} / ${valB}`)
    }
  }

  return notes.join(' | ')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      matchType = 'PAIR',
      groupSize = 3,
      maxPairs,
      maxGroups,
      programId,
      countrySideA = [],
      countrySideB = [],
      schoolSideA = [],
      schoolSideB = [],
      availabilityRule = 'mandatory',
      differentSchoolRule = 'off',
      differentCountryRule = 'off',
    } = body

    // Fetch all active field definitions with matching config
    const fieldDefs: FieldDef[] = await prisma.customFieldDefinition.findMany({
      where: { isActive: true, matchingMode: { not: 'OFF' } },
      select: { id: true, label: true, fieldKey: true, fieldType: true, matchingMode: true, matchingType: true, matchingWeight: true },
      orderBy: { sortOrder: 'asc' },
    })

    // Determine which countries/schools are in play
    const allSelectedCountries = [...new Set([...countrySideA, ...countrySideB])]
    const allSelectedSchools = [...new Set([...schoolSideA, ...schoolSideB])]

    const participantFilter: Record<string, unknown> = { status: 'PENDING' }
    if (programId) participantFilter.programId = programId
    if (allSelectedCountries.length > 0) participantFilter.country = { in: allSelectedCountries }
    if (allSelectedSchools.length > 0) participantFilter.schoolName = { in: allSelectedSchools }

    const participants = await prisma.participant.findMany({
      where: participantFilter,
      include: {
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        customFields: true,
      },
    })

    const hasSideFilter = countrySideA.length > 0 || countrySideB.length > 0 || schoolSideA.length > 0 || schoolSideB.length > 0

    function getSide(p: { country: string; schoolName: string }): 'A' | 'B' | 'both' {
      if (!hasSideFilter) return 'both'
      const inCountryA = countrySideA.length === 0 || countrySideA.includes(p.country)
      const inCountryB = countrySideB.length === 0 || countrySideB.includes(p.country)
      const inSchoolA = schoolSideA.length === 0 || schoolSideA.includes(p.schoolName)
      const inSchoolB = schoolSideB.length === 0 || schoolSideB.includes(p.schoolName)
      const isA = inCountryA && inSchoolA
      const isB = inCountryB && inSchoolB
      if (isA && isB) return 'both'
      if (isA) return 'A'
      if (isB) return 'B'
      return 'both'
    }

    const eligible: ParticipantData[] = participants
      .filter((p) => p.availability.length > 0)
      .map((p) => ({
        id: p.id,
        fullName: p.fullName,
        schoolName: p.schoolName,
        country: p.country,
        confirmedTz: p.confirmedTz,
        availability: p.availability,
        customValues: Object.fromEntries(p.customFields.map((cf) => [cf.fieldId, cf.value])),
        side: getSide(p),
      }))

    const createdMatches: string[] = []
    const matchedParticipantIds = new Set<string>()

    if (matchType === 'PAIR' || matchType === 'BOTH') {
      const matched = matchedParticipantIds

      for (let i = 0; i < eligible.length; i++) {
        if (matched.has(eligible[i].id)) continue

        let bestScore = -1
        let bestJ = -1
        let bestOverlap: ReturnType<typeof findAvailabilityOverlap> = null

        for (let j = i + 1; j < eligible.length; j++) {
          if (matched.has(eligible[j].id)) continue
          const sideI = eligible[i].side
          const sideJ = eligible[j].side
          if (sideI !== 'both' && sideJ !== 'both' && sideI === sideJ) continue

          const { valid, score, overlap } = scoreAndValidatePair(
            eligible[i], eligible[j], fieldDefs,
            availabilityRule, differentSchoolRule, differentCountryRule,
          )
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
          const sysNotes = generateSystemNotes(eligible[i], eligible[bestJ], fieldDefs, differentCountryRule)

          const match = await prisma.match.create({
            data: {
              matchType: 'PAIR',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              systemNotes: sysNotes || null,
              programId: programId ?? null,
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
          // Stop if pair limit reached
          if (maxPairs !== undefined && createdMatches.length >= maxPairs) break
        }
      }
    }

    const pairMatchCount = createdMatches.length

    if (matchType === 'GROUP' || matchType === 'BOTH') {
      const size = groupSize || 3
      const unmatchedForGroup = eligible.filter((p) => !matchedParticipantIds.has(p.id))

      // Find best group by trying all combinations of `size` participants
      const groupMatched = matchedParticipantIds

      // Greedy: pick best-scoring group starting from each unmatched participant
      for (let i = 0; i < unmatchedForGroup.length; i++) {
        if (groupMatched.has(unmatchedForGroup[i].id)) continue

        // Find all others that share a UTC overlap with participant i
        const candidates: { p: ParticipantData; overlap: NonNullable<ReturnType<typeof findAvailabilityOverlap>> }[] = []
        for (let j = 0; j < unmatchedForGroup.length; j++) {
          if (j === i || groupMatched.has(unmatchedForGroup[j].id)) continue
          const ov = findAvailabilityOverlap(
            unmatchedForGroup[i].availability, unmatchedForGroup[i].confirmedTz,
            unmatchedForGroup[j].availability, unmatchedForGroup[j].confirmedTz,
          )
          if (ov) candidates.push({ p: unmatchedForGroup[j], overlap: ov })
        }

        if (candidates.length < size - 1) continue

        // Try to extend: find a common overlap among i + first (size-1) candidates
        // Pick the first viable combination
        let bestGroup: ParticipantData[] | null = null
        let bestOverlap: ReturnType<typeof findAvailabilityOverlap> = null

        const tryGroup = (members: ParticipantData[], currentOverlap: ReturnType<typeof findAvailabilityOverlap>) => {
          if (members.length === size) { bestGroup = members; bestOverlap = currentOverlap; return }
          for (const cand of candidates) {
            if (members.includes(cand.p)) continue
            // Narrow current overlap against this candidate's UTC slots
            const utcSlots = cand.p.availability.map((s) => {
              const u = slotToUtc(s, cand.p.confirmedTz)
              return { dayOfWeek: u.dayOfWeek, startTime: minutesToTime(u.startMinutes), endTime: minutesToTime(u.endMinutes) }
            })
            const newOverlap = currentOverlap
              ? findAvailabilityOverlap([currentOverlap], 'UTC', utcSlots, 'UTC')
              : findAvailabilityOverlap(cand.p.availability, cand.p.confirmedTz, members[0].availability, members[0].confirmedTz)
            if (newOverlap || availabilityRule !== 'mandatory') {
              tryGroup([...members, cand.p], newOverlap)
              if (bestGroup) return
            }
          }
        }

        // Seed overlap: convert first participant's slots to UTC pseudo-slots
        const seedUtcSlots = unmatchedForGroup[i].availability.map((s) => {
          const u = slotToUtc(s, unmatchedForGroup[i].confirmedTz)
          return { dayOfWeek: u.dayOfWeek, startTime: minutesToTime(u.startMinutes), endTime: minutesToTime(u.endMinutes) }
        })
        // Find overlap between seed and first candidate to start with
        let seedOverlap: ReturnType<typeof findAvailabilityOverlap> = null
        if (candidates.length > 0) {
          const firstCandUtc = candidates[0].p.availability.map((s) => {
            const u = slotToUtc(s, candidates[0].p.confirmedTz)
            return { dayOfWeek: u.dayOfWeek, startTime: minutesToTime(u.startMinutes), endTime: minutesToTime(u.endMinutes) }
          })
          seedOverlap = findAvailabilityOverlap(seedUtcSlots, 'UTC', firstCandUtc, 'UTC')
        }

        tryGroup([unmatchedForGroup[i]], seedOverlap)

        const resolvedGroup = bestGroup as ParticipantData[] | null
        const resolvedOverlap = bestOverlap as ReturnType<typeof findAvailabilityOverlap>
        if (resolvedGroup && resolvedGroup.length === size) {
          const startUtc = resolvedOverlap ? nextOccurrence(resolvedOverlap.dayOfWeek, resolvedOverlap.startTime) : new Date()
          const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)

          const groupNotes: string[] = []
          const countries = [...new Set(resolvedGroup.map((p) => p.country))]
          const schools = [...new Set(resolvedGroup.map((p) => p.schoolName))]
          if (countries.length === 1) groupNotes.push(`All participants from ${countries[0]}`)
          if (schools.length < resolvedGroup.length) groupNotes.push('Duplicate school in group')

          const match = await prisma.match.create({
            data: {
              matchType: 'GROUP',
              scheduledStartUtc: startUtc,
              scheduledEndUtc: endUtc,
              systemNotes: groupNotes.join(' | ') || null,
              programId: programId ?? null,
              members: { create: resolvedGroup.map((p) => ({ participantId: p.id })) },
            },
          })
          createdMatches.push(match.id)
          resolvedGroup.forEach((p) => groupMatched.add(p.id))
          // Stop if group limit reached
          const groupsCreated = createdMatches.length - pairMatchCount
          if (maxGroups !== undefined && groupsCreated >= maxGroups) break
        }
      }
    }

    // Compute unmatched with blocker explanations
    const unmatchedParticipants = eligible
      .filter((p) => !matchedParticipantIds.has(p.id))
      .map((p) => {
        const warnings: string[] = []
        const blockers: string[] = []

        const others = eligible.filter((q) => q.id !== p.id && !matchedParticipantIds.has(q.id))

        if (others.length === 0) {
          blockers.push('No other available participants to match with')
        } else {
          const sameSchoolOnly = others.every((q) => q.schoolName === p.schoolName)
          if (others.filter((q) => q.schoolName === p.schoolName).length === others.length && others.length > 0) {
            warnings.push(`All available participants are from the same school (${p.schoolName})`)
          }
          if (others.filter((q) => q.country === p.country).length === others.length && others.length > 0) {
            warnings.push(`All available participants are from the same country (${p.country})`)
          }

          const hasOverlap = others.some((q) =>
            findAvailabilityOverlap(p.availability, p.confirmedTz, q.availability, q.confirmedTz),
          )
          if (!hasOverlap && availabilityRule === 'mandatory') {
            blockers.push('No availability overlap with any other participant — change availability rule to Off/Preferred')
          }
          if (differentSchoolRule === 'mandatory' && sameSchoolOnly) {
            blockers.push('All others are from the same school — change school rule')
          }
          if (differentCountryRule === 'mandatory' && others.every((q) => q.country === p.country)) {
            blockers.push('All others are from the same country — change country rule')
          }

          for (const fd of fieldDefs) {
            if (fd.matchingMode !== 'MANDATORY') continue
            const pVal = p.customValues[fd.id]
            const hasFieldMatch = others.some((q) =>
              fieldMatches(pVal, q.customValues[fd.id], fd.fieldType, fd.matchingType, fd.matchingWeight),
            )
            if (!hasFieldMatch) {
              blockers.push(`No match for field "${fd.label}" (value: ${pVal ?? 'empty'}) — change field to Preferred`)
            }
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
