import { DateTime } from 'luxon'

export function localToUtc(dateStr: string, timeStr: string, tz: string): string {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: tz })
  return dt.toUTC().toISO()!
}

export function utcToLocal(utcIso: string, tz: string): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' })
    .setZone(tz)
    .toFormat('yyyy-MM-dd HH:mm')
}

export function utcToIst(utcIso: string): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' })
    .setZone('Asia/Jerusalem')
    .toFormat('yyyy-MM-dd HH:mm')
}

export interface SlotInfo {
  startUtc: string
  endUtc: string
  label: string
  slotKey: string
}

export function generateDaySlots(dateStr: string, tz: string): SlotInfo[] {
  const slots: SlotInfo[] = []
  for (let hour = 6; hour < 23; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 22 && minute === 30) continue
      const start = DateTime.fromISO(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, { zone: tz })
      const end = start.plus({ minutes: 30 })
      const label = `${start.toFormat('HH:mm')} – ${end.toFormat('HH:mm')}`
      const slotKey = `${dateStr}_${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`
      slots.push({
        startUtc: start.toUTC().toISO()!,
        endUtc: end.toUTC().toISO()!,
        label,
        slotKey,
      })
    }
  }
  return slots
}

export function getNextDays(n: number): string[] {
  const days: string[] = []
  const today = DateTime.now().startOf('day')
  for (let i = 0; i < n; i++) {
    days.push(today.plus({ days: i }).toFormat('yyyy-MM-dd'))
  }
  return days
}

export const PRIORITY_TIMEZONES = [
  { label: 'Israel (Asia/Jerusalem)', value: 'Asia/Jerusalem' },
  { label: 'UK (Europe/London)', value: 'Europe/London' },
  { label: 'USA Eastern (America/New_York)', value: 'America/New_York' },
  { label: 'USA Central (America/Chicago)', value: 'America/Chicago' },
  { label: 'USA Mountain (America/Denver)', value: 'America/Denver' },
  { label: 'USA Pacific (America/Los_Angeles)', value: 'America/Los_Angeles' },
  { label: 'Mexico (America/Mexico_City)', value: 'America/Mexico_City' },
  { label: 'Brazil (America/Sao_Paulo)', value: 'America/Sao_Paulo' },
  { label: 'Uruguay (America/Montevideo)', value: 'America/Montevideo' },
  { label: 'Austria (Europe/Vienna)', value: 'Europe/Vienna' },
  { label: 'Switzerland (Europe/Zurich)', value: 'Europe/Zurich' },
]

export const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone').map((tz) => ({
  label: tz,
  value: tz,
}))
