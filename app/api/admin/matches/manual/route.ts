import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DateTime } from 'luxon'

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

function slotToUtcMinutes(slot: { dayOfWeek: number; startTime: string; endTime: string }, tz: string) {
  const [sh, sm] = slot.startTime.split(':').map(Number)
  const [eh, em] = slot.endTime.split(':').map(Number)
  const now = DateTime.now()
  const base = DateTime.fromObject({ year: now.year, month: now.month, day: 7 + slot.dayOfWeek, hour: sh, minute: sm }, { zone: tz }).toUTC()
  const baseEnd = DateTime.fromObject({ year: now.year, month: now.month, day: 7 + slot.dayOfWeek, hour: eh, minute: em }, { zone: tz }).toUTC()
  const utcDay = base.weekday === 7 ? 0 : base.weekday
  return { dayOfWeek: utcDay, startMin: base.hour * 60 + base.minute, endMin: baseEnd.hour * 60 + baseEnd.minute }
}

function findCommonOverlap(participants: { availability: { dayOfWeek: number; startTime: string; endTime: string }[]; confirmedTz: string }[]) {
  if (participants.length === 0) return null
  const firstUtc = participants[0].availability.map((s) => slotToUtcMinutes(s, participants[0].confirmedTz))
  for (const seed of firstUtc) {
    let overlapStart = seed.startMin
    let overlapEnd = seed.endMin
    let overlapDay = seed.dayOfWeek
    let ok = true
    for (let i = 1; i < participants.length; i++) {
      const utcSlots = participants[i].availability.map((s) => slotToUtcMinutes(s, participants[i].confirmedTz))
      const match = utcSlots.find((u) => u.dayOfWeek === overlapDay && u.startMin <= overlapStart && u.endMin >= overlapEnd)
      if (!match) {
        // try narrower overlap
        const anyDay = utcSlots.find((u) => u.dayOfWeek === overlapDay)
        if (!anyDay) { ok = false; break }
        overlapStart = Math.max(overlapStart, anyDay.startMin)
        overlapEnd = Math.min(overlapEnd, anyDay.endMin)
        if (overlapEnd - overlapStart < 30) { ok = false; break }
      }
    }
    if (ok && overlapEnd - overlapStart >= 30) {
      const pad = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
      return { dayOfWeek: overlapDay, startTime: pad(overlapStart), endTime: pad(overlapStart + 30) }
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { participantIds } = await request.json()
    if (!Array.isArray(participantIds) || participantIds.length < 2) {
      return Response.json({ error: 'At least 2 participant IDs required' }, { status: 400 })
    }

    const participants = await prisma.participant.findMany({
      where: { id: { in: participantIds } },
      include: { availability: true },
    })

    if (participants.length !== participantIds.length) {
      return Response.json({ error: 'Some participants not found' }, { status: 404 })
    }

    const overlap = findCommonOverlap(participants.map((p) => ({ availability: p.availability, confirmedTz: p.confirmedTz })))
    const startUtc = overlap ? nextOccurrence(overlap.dayOfWeek, overlap.startTime) : new Date()
    const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000)

    const match = await prisma.match.create({
      data: {
        matchType: participantIds.length === 2 ? 'PAIR' : 'GROUP',
        status: 'APPROVED',
        scheduledStartUtc: startUtc,
        scheduledEndUtc: endUtc,
        approvedAt: new Date(),
        approvedBy: 'admin-manual',
        adminNotes: 'Manual match created by admin',
        members: { create: participantIds.map((id: string) => ({ participantId: id })) },
      },
    })

    await prisma.participant.updateMany({
      where: { id: { in: participantIds } },
      data: { status: 'MATCHED' },
    })

    return Response.json({ success: true, matchId: match.id })
  } catch (error) {
    console.error('POST /api/admin/matches/manual error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
