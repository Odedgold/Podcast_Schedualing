/**
 * Seed script: creates custom field definitions + 30 test participants
 * Run: node_modules/.bin/tsx scripts/seed-test-data.ts
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

function createClient() {
  const connectionString = process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

const NAMES = [
  'Lior Cohen', 'Maya Levy', 'Ethan Ben-David', 'Noa Mizrahi', 'Yoav Shapiro',
  'Tamar Katz', 'Omer Friedman', 'Shira Goldstein', 'Itai Peretz', 'Dana Avraham',
  'Ariel Saban', 'Lihi Rosen', 'Noam Azulay', 'Hila Barak', 'Ido Weiss',
  'James Smith', 'Emma Johnson', 'Oliver Williams', 'Sophia Brown', 'Lucas Jones',
  'Isabella Davis', 'Mason Wilson', 'Mia Moore', 'Logan Taylor', 'Charlotte Anderson',
  'Amir Hassan', 'Fatima Al-Rashid', 'Omar Khaled', 'Sara Mansour', 'Yusuf Ibrahim',
]

const SCHOOLS = [
  'Tel Aviv High School', 'Jerusalem Academy', 'Haifa Science School',
  'Lincoln High School', 'Boston Academy', 'Chicago STEM School',
  'Cairo International School', 'Amman Academy',
]

const LOCATIONS = [
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Tel Aviv' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Jerusalem' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Haifa' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Tel Aviv' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Jerusalem' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Haifa' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Tel Aviv' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Be\'er Sheva' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Netanya' },
  { country: 'Israel', tz: 'Asia/Jerusalem', city: 'Rishon LeZion' },
  { country: 'USA', tz: 'America/New_York', city: 'New York' },
  { country: 'USA', tz: 'America/New_York', city: 'Boston' },
  { country: 'USA', tz: 'America/Chicago', city: 'Chicago' },
  { country: 'USA', tz: 'America/New_York', city: 'Philadelphia' },
  { country: 'USA', tz: 'America/Los_Angeles', city: 'Los Angeles' },
  { country: 'USA', tz: 'America/New_York', city: 'Washington DC' },
  { country: 'USA', tz: 'America/Chicago', city: 'Houston' },
  { country: 'Egypt', tz: 'Africa/Cairo', city: 'Cairo' },
  { country: 'Egypt', tz: 'Africa/Cairo', city: 'Alexandria' },
  { country: 'Jordan', tz: 'Asia/Amman', city: 'Amman' },
  { country: 'Jordan', tz: 'Asia/Amman', city: 'Irbid' },
  { country: 'UK', tz: 'Europe/London', city: 'London' },
  { country: 'UK', tz: 'Europe/London', city: 'Manchester' },
  { country: 'Germany', tz: 'Europe/Berlin', city: 'Berlin' },
  { country: 'Germany', tz: 'Europe/Berlin', city: 'Munich' },
  { country: 'France', tz: 'Europe/Paris', city: 'Paris' },
  { country: 'Canada', tz: 'America/Toronto', city: 'Toronto' },
  { country: 'Canada', tz: 'America/Vancouver', city: 'Vancouver' },
  { country: 'Australia', tz: 'Australia/Sydney', city: 'Sydney' },
  { country: 'Brazil', tz: 'America/Sao_Paulo', city: 'São Paulo' },
]

const ENGLISH_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Native']
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say']
const GRADES = ['9', '10', '11', '12']
const GOALS = ['Win the competition', 'Learn and experience', 'Make international friends', 'Improve public speaking']
const LANGUAGES = ['Hebrew', 'English', 'Arabic', 'Both Hebrew and English']
const HOBBIES_POOL = ['Music', 'Sports', 'Reading', 'Gaming', 'Art', 'Science', 'Cooking', 'Photography', 'Travel', 'Debate']

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

function randomAvailability() {
  const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = []
  const days = pickN([0, 1, 2, 3, 4, 5, 6], 2 + Math.floor(Math.random() * 3))
  for (const day of days) {
    const startH = 15 + Math.floor(Math.random() * 5)
    const start = `${String(startH).padStart(2, '0')}:00`
    const end = `${String(startH + 1).padStart(2, '0')}:30`
    slots.push({ dayOfWeek: day, startTime: start, endTime: end })
  }
  return slots
}

async function main() {
  const prisma = createClient()
  try {
    console.log('Clearing existing data...')
    await prisma.customFieldResponse.deleteMany()
    await prisma.availabilitySlot.deleteMany()
    await prisma.matchMember.deleteMany()
    await prisma.match.deleteMany()
    await prisma.participant.deleteMany()
    await prisma.customFieldDefinition.deleteMany()

    console.log('Creating custom field definitions...')
    const genderField = await prisma.customFieldDefinition.create({
      data: {
        label: 'Gender', fieldKey: 'gender', fieldType: 'SELECT',
        options: GENDERS, isRequired: true, sortOrder: 1,
        matchingMode: 'PREFERRED', matchingType: 'SAME_VALUE', matchingWeight: 3,
      },
    })
    const gradeField = await prisma.customFieldDefinition.create({
      data: {
        label: 'Grade', fieldKey: 'grade', fieldType: 'NUMBER',
        placeholder: 'e.g. 10', isRequired: true, sortOrder: 2,
        matchingMode: 'PREFERRED', matchingType: 'NUMERIC_GAP', matchingWeight: 1,
      },
    })
    const englishField = await prisma.customFieldDefinition.create({
      data: {
        label: 'English Level', fieldKey: 'english_level', fieldType: 'SELECT',
        options: ENGLISH_LEVELS, isRequired: true, sortOrder: 3,
        matchingMode: 'MANDATORY', matchingType: 'SAME_VALUE', matchingWeight: 4,
      },
    })
    const hobbiesField = await prisma.customFieldDefinition.create({
      data: {
        label: 'Hobbies', fieldKey: 'hobbies', fieldType: 'MULTISELECT',
        options: HOBBIES_POOL, isRequired: false, sortOrder: 4,
        matchingMode: 'PREFERRED', matchingType: 'SAME_VALUE', matchingWeight: 3,
      },
    })
    const goalField = await prisma.customFieldDefinition.create({
      data: {
        label: 'Competition Goal', fieldKey: 'competition_goal', fieldType: 'SELECT',
        options: GOALS, isRequired: false, sortOrder: 5,
        matchingMode: 'PREFERRED', matchingType: 'SAME_VALUE', matchingWeight: 2,
      },
    })
    const languageField = await prisma.customFieldDefinition.create({
      data: {
        label: 'Podcast Language', fieldKey: 'podcast_language', fieldType: 'SELECT',
        options: LANGUAGES, isRequired: false, sortOrder: 6,
        matchingMode: 'PREFERRED', matchingType: 'SAME_VALUE', matchingWeight: 2,
      },
    })

    const fieldDefs = [genderField, gradeField, englishField, hobbiesField, goalField, languageField]
    console.log(`Created ${fieldDefs.length} custom field definitions\n`)

    console.log('Creating 30 participants...')
    for (let i = 0; i < 30; i++) {
      const name = NAMES[i]
      const loc = LOCATIONS[i]
      const school = SCHOOLS[i % SCHOOLS.length]
      const englishLevel = pick(ENGLISH_LEVELS)
      const gender = pick(GENDERS)
      const grade = pick(GRADES)
      const hobbies = pickN(HOBBIES_POOL, 2 + Math.floor(Math.random() * 3)).join(',')
      const goal = pick(GOALS)
      const language = pick(LANGUAGES)

      const participant = await prisma.participant.create({
        data: {
          fullName: name,
          email: `${name.toLowerCase().replace(/[\s']/g, '.')}.test${i}@example.com`,
          phone: `+1-555-${String(1000 + i).padStart(4, '0')}`,
          schoolName: school,
          city: loc.city,
          country: loc.country,
          detectedTz: loc.tz,
          confirmedTz: loc.tz,
          status: 'PENDING',
          availability: { create: randomAvailability() },
          customFields: {
            create: [
              { fieldId: genderField.id, value: gender },
              { fieldId: gradeField.id, value: grade },
              { fieldId: englishField.id, value: englishLevel },
              { fieldId: hobbiesField.id, value: hobbies },
              { fieldId: goalField.id, value: goal },
              { fieldId: languageField.id, value: language },
            ],
          },
        },
      })
      console.log(`  ${String(i + 1).padStart(2, ' ')}. ${participant.fullName.padEnd(22)} ${loc.country.padEnd(12)} ${englishLevel.padEnd(14)} grade ${grade}`)
    }

    console.log('\n✅ Seed complete!')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
