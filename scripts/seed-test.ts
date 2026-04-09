import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const SCHOOLS = [
  'Tel Aviv Academy', 'NY Hebrew School', 'London Jewish School',
  'Paris Lycee', 'Buenos Aires Jewish', 'Sydney Hebrew College',
  'Toronto Jewish Day', 'Moscow Jewish School', 'Cape Town Hebrew',
  'Mumbai Jewish School',
]

const COUNTRIES = [
  'Israel', 'USA', 'UK', 'France', 'Argentina',
  'Australia', 'Canada', 'Russia', 'South Africa', 'India',
]

const HOBBIES = [
  'reading, music, hiking',
  'soccer, gaming, cooking',
  'painting, dance, yoga',
  'chess, coding, movies',
  'basketball, photography, travel',
  'guitar, swimming, writing',
  'tennis, baking, volunteering',
  'drawing, cycling, theatre',
  'singing, running, board games',
  'piano, fishing, podcasts',
]

const FIRST_NAMES = [
  'Avi', 'Maya', 'Yosef', 'Sarah', 'Daniel', 'Noa', 'Eitan', 'Tamar',
  'Michael', 'Rachel', 'David', 'Leah', 'Jonathan', 'Miriam', 'Ariel',
  'Rivka', 'Noam', 'Shira', 'Amit', 'Hila', 'Itay', 'Lior', 'Ori',
  'Dana', 'Idan', 'Yael', 'Ron', 'Tal', 'Gal', 'Bar',
]

const LAST_NAMES = [
  'Cohen', 'Levi', 'Mizrahi', 'Shapiro', 'Goldberg', 'Klein',
  'Friedman', 'Katz', 'Weiss', 'Rosen', 'Stern', 'Goldman',
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateWeeklySlots(count: number): { dayOfWeek: number; startTime: string; endTime: string }[] {
  const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = []
  const used = new Set<string>()

  while (slots.length < count) {
    const day = randomInt(0, 6) // 0=Sun, 6=Sat
    const hour = randomInt(8, 21)
    const minute = Math.random() < 0.5 ? 0 : 30
    const key = `${day}_${hour}_${minute}`
    if (used.has(key)) continue
    used.add(key)

    const startH = String(hour).padStart(2, '0')
    const startM = String(minute).padStart(2, '0')
    const endMinTotal = hour * 60 + minute + 30
    const endH = String(Math.floor(endMinTotal / 60)).padStart(2, '0')
    const endM = String(endMinTotal % 60).padStart(2, '0')

    slots.push({
      dayOfWeek: day,
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    })
  }

  return slots
}

async function main() {
  console.log('Seeding 50 test participants...')

  // Clear existing test data
  await prisma.availabilitySlot.deleteMany({})
  await prisma.customFieldResponse.deleteMany({})
  await prisma.matchMember.deleteMany({})
  await prisma.match.deleteMany({})
  await prisma.participant.deleteMany({})

  for (let i = 0; i < 50; i++) {
    const firstName = randomItem(FIRST_NAMES)
    const lastName = randomItem(LAST_NAMES)
    const tz = randomItem(TIMEZONES)
    const country = randomItem(COUNTRIES)
    const school = randomItem(SCHOOLS)
    const slotCount = randomInt(5, 20)

    const participant = await prisma.participant.create({
      data: {
        fullName: `${firstName} ${lastName}`,
        email: `test${i + 1}@test.com`,
        phone: null,
        schoolName: school,
        city: country,
        country: country,
        grade: String(randomInt(7, 12)),
        gender: randomItem(['male', 'female', 'no_choice']),
        hobbies: randomItem(HOBBIES),
        englishLevel: randomItem(['beginner', 'elementary', 'intermediate', 'upper-intermediate', 'advanced', 'native']),
        podcastLanguage: randomItem(['english', 'hebrew', 'no_preference']),
        competitionGoal: randomItem(['win', 'quality', 'experience', 'connect']),
        additionalInfo: randomItem([null, null, null, 'I prefer morning sessions', 'I have experience in public speaking', 'Very motivated!', 'First time participating']),
        detectedTz: tz,
        confirmedTz: tz,
        status: 'PENDING',
      },
    })

    const slots = generateWeeklySlots(slotCount)
    await prisma.availabilitySlot.createMany({
      data: slots.map((s) => ({
        participantId: participant.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    })

    process.stdout.write(`\r${i + 1}/50`)
  }

  console.log('\nDone! 50 participants created.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
