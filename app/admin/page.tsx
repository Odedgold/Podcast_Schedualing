'use client'

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { DateTime } from 'luxon'

type FieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTISELECT'
type MatchStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type MatchType = 'PAIR' | 'GROUP'
type ParticipantStatus = 'PENDING' | 'MATCHED' | 'INACTIVE'

interface AvailabilitySlot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface CustomFieldResponse {
  field: { label: string }
  value: string
}

interface Participant {
  id: string
  fullName: string
  email: string
  phone?: string
  schoolName: string
  city: string
  country: string
  confirmedTz: string
  status: ParticipantStatus
  submittedAt: string
  availability: AvailabilitySlot[]
  customFields: CustomFieldResponse[]
  grade?: string | null
  gender?: string | null
  hobbies?: string | null
  englishLevel?: string | null
  hebrewLevel?: string | null
  podcastLanguage?: string | null
  competitionGoal?: string | null
}

interface CustomField {
  id: string
  label: string
  fieldKey: string
  fieldType: FieldType
  options: string[]
  isRequired: boolean
  isActive: boolean
  sortOrder: number
}

interface MatchMember {
  participant: Participant & { availability: AvailabilitySlot[] }
  role: string
}

interface Match {
  id: string
  matchType: MatchType
  status: MatchStatus
  scheduledStartUtc: string
  scheduledEndUtc: string
  adminNotes?: string
  systemNotes?: string
  members: MatchMember[]
}

const PALETTE = [
  '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6',
  '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
  '#14B8A6','#F43F5E','#A855F7','#FB923C','#22C55E',
  '#EAB308','#0EA5E9','#E879F9','#4ADE80','#F87171',
]

function utcToIst(utcIso: string) {
  return DateTime.fromISO(utcIso, { zone: 'utc' })
    .setZone('Asia/Jerusalem')
    .toFormat('dd MMM HH:mm')
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<'participants' | 'fields' | 'matching' | 'matches' | 'schools'>('participants')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null)
  // Calendar controls
  const [colorMode, setColorMode] = useState<'individual' | 'school' | 'country'>('individual')
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  // Participant search & status
  const [participantSearch, setParticipantSearch] = useState('')
  // Schools management
  const [schools, setSchools] = useState<{ id: string; name: string; isActive: boolean; sortOrder: number }[]>([])
  const [newSchoolName, setNewSchoolName] = useState('')

  // Matching state
  const [matchType, setMatchType] = useState<'PAIR' | 'GROUP' | 'BOTH'>('PAIR')
  const [groupSize, setGroupSize] = useState(3)
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSchool, setFilterSchool] = useState('')

  // Country group state
  const [countryGroupA, setCountryGroupA] = useState<string[]>([])
  const [countryGroupRule, setCountryGroupRule] = useState<'any' | 'A_with_B' | 'A_with_A' | 'B_with_B'>('any')
  const [matchResult, setMatchResult] = useState<{ matchesCreated: number; unmatchedCount: number; unmatched: { id: string; fullName: string; schoolName: string; country: string; warnings: string[] }[] } | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  type RuleMode = 'mandatory' | 'preferred' | 'off'
  const [rules, setRules] = useState<Record<string, RuleMode>>({
    availability: 'mandatory',
    differentSchool: 'off',
    differentCountry: 'off',
    sameEnglishLevel: 'off',
    similarHobbies: 'off',
    samePodcastLanguage: 'off',
    sameCompetitionGoal: 'off',
    sameGrade: 'off',
    sameGender: 'off',
  })
  const [gradeGap, setGradeGap] = useState<0 | 1 | 2>(0)

  function setRule(key: string, mode: RuleMode) {
    setRules((r) => ({ ...r, [key]: mode }))
  }

  // Custom field form
  const [showAddField, setShowAddField] = useState(false)
  const [newField, setNewField] = useState({ label: '', fieldKey: '', fieldType: 'TEXT' as FieldType, options: '', isRequired: false })

  const fetchParticipants = useCallback(async () => {
    const res = await fetch('/api/admin/participants')
    if (res.ok) setParticipants(await res.json())
  }, [])

  const fetchCustomFields = useCallback(async () => {
    const res = await fetch('/api/admin/custom-fields')
    if (res.ok) setCustomFields(await res.json())
  }, [])

  const fetchMatches = useCallback(async () => {
    const res = await fetch('/api/admin/matches')
    if (res.ok) setMatches(await res.json())
  }, [])

  const fetchSchools = useCallback(async () => {
    const res = await fetch('/api/admin/schools')
    if (res.ok) setSchools(await res.json())
  }, [])

  useEffect(() => {
    fetchParticipants()
    fetchCustomFields()
    fetchMatches()
    fetchSchools()
  }, [fetchParticipants, fetchCustomFields, fetchMatches, fetchSchools])

  function exportParticipantsToExcel() {
    const data = participants.map((p) => ({
      Name: p.fullName,
      Email: p.email,
      Phone: p.phone || '',
      School: p.schoolName,
      City: p.city,
      Country: p.country,
      Timezone: p.confirmedTz,
      Status: p.status,
      'Available Slots': p.availability.length,
      Submitted: p.submittedAt,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Participants')
    XLSX.writeFile(wb, 'participants.xlsx')
  }

  function exportMatchesToExcel() {
    const data = matches.filter((m) => m.status === 'APPROVED').map((m) => ({
      Type: m.matchType,
      Status: m.status,
      'Start (IST)': utcToIst(m.scheduledStartUtc),
      'End (IST)': utcToIst(m.scheduledEndUtc),
      Participants: m.members.map((mm) => mm.participant.fullName).join(', '),
      Schools: m.members.map((mm) => mm.participant.schoolName).join(', '),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Approved Matches')
    XLSX.writeFile(wb, 'matches.xlsx')
  }

  async function runMatching() {
    setLoading(true)
    setMatchResult(null)
    const res = await fetch('/api/admin/matches/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchType, groupSize, country: filterCountry || undefined, schoolName: filterSchool || undefined, rules, countryGroupA, countryGroupRule, gradeGap }),
    })
    if (res.ok) {
      const data = await res.json()
      setMatchResult(data)
      await fetchMatches()
    }
    setLoading(false)
  }

  async function approveMatch(id: string) {
    await fetch(`/api/admin/matches/${id}/approve`, { method: 'POST' })
    fetchMatches()
    fetchParticipants()
  }

  async function rejectMatch(id: string) {
    await fetch(`/api/admin/matches/${id}/reject`, { method: 'POST' })
    fetchMatches()
  }

  async function breakMatch(id: string) {
    if (!confirm('לפרק את השיבוץ ולהחזיר משתתפים לפול?')) return
    await fetch(`/api/admin/matches/${id}/break`, { method: 'POST' })
    fetchMatches()
    fetchParticipants()
  }

  async function saveNotes(id: string) {
    await fetch(`/api/admin/matches/${id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNotes: editingNotes[id] }),
    })
    fetchMatches()
  }

  function toggleCountryA(country: string) {
    setCountryGroupA((prev) =>
      prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
    )
  }

  async function toggleField(id: string, isActive: boolean) {
    await fetch(`/api/admin/custom-fields/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    fetchCustomFields()
  }

  async function deleteField(id: string) {
    if (!confirm('Delete this field?')) return
    await fetch(`/api/admin/custom-fields/${id}`, { method: 'DELETE' })
    fetchCustomFields()
  }

  async function addField() {
    if (!newField.label || !newField.fieldKey) return
    const options = newField.options.split(',').map((o) => o.trim()).filter(Boolean)
    await fetch('/api/admin/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newField, options }),
    })
    setShowAddField(false)
    setNewField({ label: '', fieldKey: '', fieldType: 'TEXT', options: '', isRequired: false })
    fetchCustomFields()
  }

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  async function toggleParticipantStatus(p: Participant) {
    if (p.status === 'MATCHED') return
    const next = p.status === 'INACTIVE' ? 'PENDING' : 'INACTIVE'
    await fetch(`/api/admin/participants/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    fetchParticipants()
  }

  async function toggleSchoolStatus(schoolName: string) {
    const schoolPs = participants.filter(p => p.schoolName === schoolName && p.status !== 'MATCHED')
    const allInactive = schoolPs.every(p => p.status === 'INACTIVE')
    const next = allInactive ? 'PENDING' : 'INACTIVE'
    await Promise.all(schoolPs.map(p => fetch(`/api/admin/participants/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })))
    fetchParticipants()
  }

  function computeProsAndCons(a: Participant, b: Participant) {
    const pros: string[] = []
    const cons: string[] = []
    if (a.schoolName !== b.schoolName) pros.push('בתי ספר שונים')
    else cons.push('אותו בית ספר')
    if (a.country !== b.country) pros.push(`מדינות שונות: ${a.country} / ${b.country}`)
    else cons.push(`אותה מדינה: ${a.country}`)
    if (a.englishLevel && b.englishLevel) {
      if (a.englishLevel === b.englishLevel) pros.push(`רמת אנגלית זהה: ${a.englishLevel}`)
      else cons.push(`רמת אנגלית שונה: ${a.englishLevel} / ${b.englishLevel}`)
    }
    if (a.hobbies && b.hobbies) {
      const setA = new Set(a.hobbies.toLowerCase().split(',').map(h => h.trim()))
      const shared = b.hobbies.toLowerCase().split(',').map(h => h.trim()).filter(h => setA.has(h))
      if (shared.length > 0) pros.push(`תחביבים משותפים: ${shared.join(', ')}`)
      else cons.push('אין תחביבים משותפים')
    }
    if (a.podcastLanguage && b.podcastLanguage) {
      if (a.podcastLanguage === b.podcastLanguage) pros.push(`העדפת שפה זהה: ${a.podcastLanguage}`)
      else cons.push(`העדפת שפה שונה: ${a.podcastLanguage} / ${b.podcastLanguage}`)
    }
    if (a.competitionGoal && b.competitionGoal) {
      if (a.competitionGoal === b.competitionGoal) pros.push(`מטרת תחרות זהה`)
      else cons.push(`מטרת תחרות שונה: ${a.competitionGoal} / ${b.competitionGoal}`)
    }
    if (a.grade && b.grade) {
      const gap = Math.abs((parseInt(a.grade) || 0) - (parseInt(b.grade) || 0))
      if (gap === 0) pros.push(`אותה כיתה: ${a.grade}`)
      else if (gap === 1) cons.push(`פער כיתה: ${a.grade} / ${b.grade}`)
      else cons.push(`פער כיתות: ${a.grade} / ${b.grade}`)
    }
    if (a.gender && b.gender && a.gender !== 'no_choice' && b.gender !== 'no_choice') {
      if (a.gender === b.gender) pros.push(`אותו מגדר: ${a.gender}`)
      else cons.push(`מגדרים שונים: ${a.gender} / ${b.gender}`)
    }
    return { pros, cons }
  }

  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  async function addSchool() {
    if (!newSchoolName.trim()) return
    await fetch('/api/admin/schools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSchoolName.trim() }) })
    setNewSchoolName('')
    fetchSchools()
  }

  async function deleteSchool(id: string) {
    await fetch(`/api/admin/schools/${id}`, { method: 'DELETE' })
    fetchSchools()
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const timeSlots: string[] = []
  for (let h = 6; h < 23; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`)
    timeSlots.push(`${String(h).padStart(2, '0')}:30`)
  }

  const uniqueSchoolsList = [...new Set(participants.map((p) => p.schoolName))].sort()
  const uniqueCountriesList = [...new Set(participants.map((p) => p.country))].sort()

  function getGroupColor(p: Participant): string {
    if (colorMode === 'school') {
      const idx = uniqueSchoolsList.indexOf(p.schoolName)
      return PALETTE[idx % PALETTE.length]
    }
    if (colorMode === 'country') {
      const idx = uniqueCountriesList.indexOf(p.country)
      return PALETTE[idx % PALETTE.length]
    }
    const idx = participants.findIndex((pp) => pp.id === p.id)
    return PALETTE[idx % PALETTE.length]
  }

  function isSlotOccupied(participantId: string, dayOfWeek: number, time: string) {
    const p = participants.find((pp) => pp.id === participantId)
    if (!p) return false
    return p.availability.some((slot) => slot.dayOfWeek === dayOfWeek && slot.startTime === time)
  }

  function toggleGroup(ids: string[]) {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      const allHidden = ids.every((id) => next.has(id))
      ids.forEach((id) => (allHidden ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const visibleParticipants = participants.filter((p) => !hiddenIds.has(p.id))

  const filteredParticipants = participantSearch.trim()
    ? participants.filter(p => {
        const q = participantSearch.toLowerCase()
        return p.fullName?.toLowerCase().includes(q) || p.schoolName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
      })
    : participants

  const uniqueCountries = uniqueCountriesList
  const uniqueSchools = uniqueSchoolsList
  const draftMatches = matches.filter((m) => m.status === 'DRAFT')
  const approvedMatches = matches.filter((m) => m.status === 'APPROVED')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Scheduling & Matching Platform</h1>
        <div className="flex gap-3">
          <a href="/admin/generate-link" className="text-sm text-blue-600 hover:underline">
            Generate Link
          </a>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          {(['participants', 'fields', 'matching', 'matches', 'schools'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'fields' ? 'Custom Fields' : t === 'matching' ? 'Matching Engine' : t === 'matches' ? 'Matches Review' : t === 'schools' ? 'Schools' : 'Participants'}
            </button>
          ))}
        </div>
      </div>

      <main className="p-6">
        {/* TAB 1: Participants */}
        {tab === 'participants' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Participants <span className="text-gray-400 font-normal text-sm">({participants.length})</span>
              </h2>
              <div className="flex gap-3">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Table
                  </button>
                  <button
                    onClick={() => setViewMode('calendar')}
                    className={`px-3 py-1.5 text-sm ${viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Calendar
                  </button>
                </div>
                <button
                  onClick={exportParticipantsToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg"
                >
                  Export Excel
                </button>
              </div>
            </div>

            {viewMode === 'table' ? (
              <div className="space-y-3">
                {/* Search + school toggles */}
                <div className="flex flex-wrap gap-3 items-center">
                  <input
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    placeholder="Search by name, school or email..."
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {uniqueSchools.map((school) => {
                      const schoolPs = participants.filter(p => p.schoolName === school && p.status !== 'MATCHED')
                      const allInactive = schoolPs.length > 0 && schoolPs.every(p => p.status === 'INACTIVE')
                      return (
                        <button key={school} onClick={() => toggleSchoolStatus(school)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${allInactive ? 'bg-gray-100 text-gray-400 border-gray-300 line-through' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                          title={allInactive ? 'Click to activate all' : 'Click to deactivate all'}>
                          {school}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                        <th className="px-4 py-3 font-medium text-gray-600">School</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Country</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Timezone</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Slots</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Submitted</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Toggle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParticipants.map((p) => (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${p.status === 'INACTIVE' ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{p.fullName || '(empty)'}</td>
                          <td className="px-4 py-3 text-gray-600">{p.email}</td>
                          <td className="px-4 py-3 text-gray-600">{p.schoolName}</td>
                          <td className="px-4 py-3 text-gray-600">{p.country}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{p.confirmedTz}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.status === 'MATCHED' ? 'bg-green-100 text-green-700' :
                              p.status === 'INACTIVE' ? 'bg-gray-100 text-gray-600' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.availability.length}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {DateTime.fromISO(p.submittedAt).toFormat('dd MMM yyyy')}
                          </td>
                          <td className="px-4 py-3">
                            {p.status !== 'MATCHED' && (
                              <button onClick={() => toggleParticipantStatus(p)}
                                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${p.status === 'INACTIVE' ? 'border-green-300 text-green-600 hover:bg-green-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                                {p.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredParticipants.length === 0 && (
                    <p className="text-center text-gray-400 py-8">No participants found</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Controls */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Color by:</span>
                    {(['individual', 'school', 'country'] as const).map((m) => (
                      <button key={m} onClick={() => setColorMode(m)}
                        className={`px-3 py-1 rounded-lg text-xs border transition-colors ${colorMode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                        {m === 'individual' ? 'Individual' : m === 'school' ? 'School' : 'Country'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setHiddenIds(new Set())} className="text-xs text-blue-600 hover:underline">Show all</button>
                  <button onClick={() => setHiddenIds(new Set(participants.map(p => p.id)))} className="text-xs text-gray-500 hover:underline">Hide all</button>
                </div>

                {/* Legend with toggles */}
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  {colorMode === 'individual' && (
                    <div className="flex flex-wrap gap-2">
                      {participants.map((p) => {
                        const hidden = hiddenIds.has(p.id)
                        return (
                          <button key={p.id} onClick={() => setHiddenIds(prev => { const n = new Set(prev); hidden ? n.delete(p.id) : n.add(p.id); return n })}
                            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-opacity ${hidden ? 'opacity-40 border-gray-200' : 'border-gray-300'}`}>
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getGroupColor(p) }} />
                            {p.fullName || p.email}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {colorMode === 'school' && (
                    <div className="space-y-2">
                      {uniqueSchoolsList.map((school, si) => {
                        const schoolParticipants = participants.filter(p => p.schoolName === school)
                        const allHidden = schoolParticipants.every(p => hiddenIds.has(p.id))
                        return (
                          <div key={school}>
                            <button onClick={() => toggleGroup(schoolParticipants.map(p => p.id))}
                              className={`flex items-center gap-2 text-xs font-semibold mb-1 px-2 py-0.5 rounded transition-opacity ${allHidden ? 'opacity-40' : ''}`}>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PALETTE[si % PALETTE.length] }} />
                              {school} ({schoolParticipants.length})
                            </button>
                            <div className="flex flex-wrap gap-1.5 pl-5">
                              {schoolParticipants.map(p => {
                                const hidden = hiddenIds.has(p.id)
                                return (
                                  <button key={p.id} onClick={() => setHiddenIds(prev => { const n = new Set(prev); hidden ? n.delete(p.id) : n.add(p.id); return n })}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-opacity ${hidden ? 'opacity-40 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700'}`}>
                                    {p.fullName || p.email}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {colorMode === 'country' && (
                    <div className="space-y-2">
                      {uniqueCountriesList.map((country, ci) => {
                        const countryParticipants = participants.filter(p => p.country === country)
                        const allHidden = countryParticipants.every(p => hiddenIds.has(p.id))
                        return (
                          <div key={country}>
                            <button onClick={() => toggleGroup(countryParticipants.map(p => p.id))}
                              className={`flex items-center gap-2 text-xs font-semibold mb-1 px-2 py-0.5 rounded transition-opacity ${allHidden ? 'opacity-40' : ''}`}>
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PALETTE[ci % PALETTE.length] }} />
                              {country} ({countryParticipants.length})
                            </button>
                            <div className="flex flex-wrap gap-1.5 pl-5">
                              {countryParticipants.map(p => {
                                const hidden = hiddenIds.has(p.id)
                                return (
                                  <button key={p.id} onClick={() => setHiddenIds(prev => { const n = new Set(prev); hidden ? n.delete(p.id) : n.add(p.id); return n })}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-opacity ${hidden ? 'opacity-40 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700'}`}>
                                    {p.fullName || p.email}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Calendar grid */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-auto relative">
                  <div className="flex min-w-max">
                    <div className="sticky left-0 bg-white z-10 border-r border-gray-100">
                      <div className="h-14 border-b border-gray-100" />
                      {timeSlots.map((t) => (
                        <div key={t} className="h-10 flex items-center px-2 text-xs text-gray-400 w-16 border-b border-gray-50">
                          {t}
                        </div>
                      ))}
                    </div>
                    {DAY_LABELS.map((dayLabel, dayIndex) => (
                      <div key={dayIndex} className="border-r border-gray-100 min-w-[140px]">
                        <div className="h-14 border-b border-gray-100 flex items-center justify-center">
                          <div className="text-sm font-semibold text-gray-700">{dayLabel}</div>
                        </div>
                        {timeSlots.map((time) => {
                          const occupants = visibleParticipants.filter((p) => isSlotOccupied(p.id, dayIndex, time))
                          return (
                            <div key={time} className="h-10 border-b border-gray-50 relative flex" onMouseLeave={() => setTooltip(null)}>
                              {occupants.map((p) => (
                                <div key={p.id} className="flex-1 opacity-80"
                                  style={{ backgroundColor: getGroupColor(p) }}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setTooltip({ x: rect.left, y: rect.top - 30, name: occupants.map(o => o.fullName || o.email).join(', ') })
                                  }}
                                />
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {tooltip && (
                  <div className="fixed z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded pointer-events-none" style={{ left: tooltip.x, top: tooltip.y }}>
                    {tooltip.name}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Custom Fields */}
        {tab === 'fields' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Custom Fields</h2>
              <button
                onClick={() => setShowAddField(!showAddField)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg"
              >
                + Add Field
              </button>
            </div>

            {showAddField && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                <h3 className="font-medium text-gray-900 mb-3">New Field</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Label</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={newField.label}
                      onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                      placeholder="e.g. Grade Level"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Field Key (unique)</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={newField.fieldKey}
                      onChange={(e) => setNewField({ ...newField, fieldKey: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                      placeholder="e.g. grade_level"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Type</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={newField.fieldType}
                      onChange={(e) => setNewField({ ...newField, fieldType: e.target.value as FieldType })}
                    >
                      <option value="TEXT">Text</option>
                      <option value="NUMBER">Number</option>
                      <option value="SELECT">Select</option>
                      <option value="MULTISELECT">Multi-Select</option>
                    </select>
                  </div>
                  {(newField.fieldType === 'SELECT' || newField.fieldType === 'MULTISELECT') && (
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Options (comma-separated)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={newField.options}
                        onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="required"
                      checked={newField.isRequired}
                      onChange={(e) => setNewField({ ...newField, isRequired: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="required" className="text-sm text-gray-700">Required</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={addField} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg">Save</button>
                  <button onClick={() => setShowAddField(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-1.5 rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {customFields.map((field) => (
                <div key={field.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{field.label}</div>
                    <div className="text-xs text-gray-400">{field.fieldKey} · {field.fieldType}{field.isRequired ? ' · Required' : ''}</div>
                    {field.options.length > 0 && (
                      <div className="text-xs text-gray-400">{field.options.join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleField(field.id, !field.isActive)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${field.isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${field.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                    <button
                      onClick={() => deleteField(field.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {customFields.length === 0 && (
                <p className="text-center text-gray-400 py-8">No custom fields yet</p>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Matching Engine */}
        {tab === 'matching' && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Matching Engine</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-6">

              {/* Match Type */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Match Type</label>
                <div className="flex gap-2">
                  {(['PAIR', 'GROUP', 'BOTH'] as const).map((t) => (
                    <button key={t} onClick={() => setMatchType(t)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${matchType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group Size */}
              {(matchType === 'GROUP' || matchType === 'BOTH') && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Group Size: <span className="text-blue-600">{groupSize}</span>
                  </label>
                  <input type="range" min={2} max={10} value={groupSize}
                    onChange={(e) => setGroupSize(Number(e.target.value))}
                    className="w-full accent-blue-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>2</span><span>10</span></div>
                </div>
              )}

              {/* Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Filter by Country</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                    <option value="">All countries</option>
                    {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Filter by School</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}>
                    <option value="">All schools</option>
                    {uniqueSchools.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Country Groups */}
              {uniqueCountries.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">כללי שיבוץ לפי מדינה</label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">בחר מדינות לקבוצה A (למשל: ישראל)</p>
                      <div className="flex flex-wrap gap-2">
                        {uniqueCountries.map((c) => (
                          <button key={c} onClick={() => toggleCountryA(c)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${countryGroupA.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                    {countryGroupA.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">כלל שיבוץ בין הקבוצות</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'A_with_B', label: 'A + B בלבד (ישראל עם חו"ל)' },
                            { value: 'A_with_A', label: 'A + A בלבד' },
                            { value: 'B_with_B', label: 'B + B בלבד' },
                            { value: 'any', label: 'ללא הגבלה' },
                          ].map((opt) => (
                            <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${countryGroupRule === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                              <input type="radio" name="groupRule" value={opt.value}
                                checked={countryGroupRule === opt.value}
                                onChange={(e) => setCountryGroupRule(e.target.value as typeof countryGroupRule)} />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Matching Rules */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-3">Matching Rules</label>
                <div className="text-xs text-gray-400 flex gap-4 mb-2 px-1">
                  <span className="w-48">Rule</span>
                  <span className="w-24 text-center">Off</span>
                  <span className="w-24 text-center text-yellow-600">Preferred</span>
                  <span className="w-24 text-center text-red-600">Mandatory</span>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {[
                    { key: 'availability', label: 'Overlapping availability', desc: 'Must have a common free slot' },
                    { key: 'differentSchool', label: 'Different schools', desc: 'Participants from different schools' },
                    { key: 'differentCountry', label: 'Different countries', desc: 'Participants from different countries' },
                    { key: 'sameEnglishLevel', label: 'Same English level', desc: 'Similar English proficiency' },
                    { key: 'similarHobbies', label: 'Similar hobbies', desc: 'At least one hobby in common' },
                    { key: 'samePodcastLanguage', label: 'Same podcast language preference', desc: 'Agree on recording language' },
                    { key: 'sameCompetitionGoal', label: 'Same competition goal', desc: 'Similar motivation (win/experience/etc.)' },
                    { key: 'sameGrade', label: 'Same grade', desc: rules.sameGrade === 'off' ? 'Same school grade/year' : `Max gap: ${gradeGap === 0 ? 'exact' : `±${gradeGap}`}` },
                    { key: 'sameGender', label: 'Same gender', desc: 'Participants with the same gender (ignores "no preference")' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center px-3 py-2.5 gap-4">
                      <div className="w-48">
                        <div className="text-sm text-gray-800">{label}</div>
                        <div className="text-xs text-gray-400">{desc}</div>
                      </div>
                      {(['off', 'preferred', 'mandatory'] as const).map((mode) => (
                        <button key={mode}
                          onClick={() => setRule(key, mode)}
                          className={`w-24 py-1 rounded text-xs font-medium border transition-colors ${
                            rules[key] === mode
                              ? mode === 'mandatory' ? 'bg-red-500 text-white border-red-500'
                              : mode === 'preferred' ? 'bg-yellow-400 text-white border-yellow-400'
                              : 'bg-gray-200 text-gray-600 border-gray-200'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                          }`}>
                          {mode === 'off' ? 'Off' : mode === 'preferred' ? 'Preferred' : 'Mandatory'}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {rules.sameGrade !== 'off' && (
                <div className="border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-2">Grade gap allowed</p>
                  <div className="flex gap-2">
                    {([0, 1, 2] as const).map((gap) => (
                      <button key={gap} onClick={() => setGradeGap(gap)}
                        className={`px-4 py-1.5 rounded-lg text-sm border transition-colors ${gradeGap === gap ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                        {gap === 0 ? 'Exact (±0)' : `±${gap} grade${gap > 1 ? 's' : ''}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={runMatching} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors">
                {loading ? 'Running...' : 'Run Matching'}
              </button>

              {matchResult && (
                <div className="space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                    ✓ נוצרו <strong>{matchResult.matchesCreated}</strong> שיבוצים. בדוק בטאב Matches Review.
                  </div>
                  {matchResult.unmatchedCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                      ⚠️ <strong>{matchResult.unmatchedCount}</strong> משתתפים לא שובצו
                      {matchResult.unmatched.map((u) => (
                        <div key={u.id} className="mt-1 text-xs">
                          • {u.fullName} ({u.schoolName}, {u.country}){u.warnings.length > 0 && ` — ${u.warnings.join(', ')}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Matches Review */}
        {tab === 'matches' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Matches Review</h2>
              <button
                onClick={exportMatchesToExcel}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg"
              >
                Export Approved
              </button>
            </div>

            {/* Draft matches */}
            {draftMatches.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  Draft ({draftMatches.length})
                </h3>
                <div className="space-y-3">
                  {draftMatches.map((match) => {
                    const isExpanded = expandedMatch === match.id
                    const members = match.members.map(mm => mm.participant)
                    return (
                      <div key={match.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Header row */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setExpandedMatch(isExpanded ? null : match.id)}>
                            <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${match.matchType === 'PAIR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {match.matchType}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {members.map(m => m.fullName).join(' + ')}
                            </span>
                            {match.systemNotes && <span className="text-yellow-500 text-xs">⚠️</span>}
                          </button>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => approveMatch(match.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">אשר</button>
                            <button onClick={() => rejectMatch(match.id)} className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1.5 rounded-lg">דחה</button>
                            <button onClick={() => breakMatch(match.id)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg">פרק</button>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50">
                            {/* Date & Time */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">תאריך ושעה (שעון ישראל)</p>
                              <p className="text-sm text-gray-800 font-medium">
                                {utcToIst(match.scheduledStartUtc)} – {DateTime.fromISO(match.scheduledEndUtc, { zone: 'utc' }).setZone('Asia/Jerusalem').toFormat('HH:mm')}
                              </p>
                            </div>

                            {/* Participants details + availability */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">משתתפים וזמינות</p>
                              <div className="grid grid-cols-1 gap-2">
                                {match.members.map((mm) => {
                                  const p = mm.participant as Participant & { availability: AvailabilitySlot[] }
                                  return (
                                    <div key={mm.role + p.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                      <div className="font-semibold text-gray-900 mb-1">{p.fullName} <span className="font-normal text-gray-400">· {p.schoolName} · {p.country}</span></div>
                                      <div className="text-gray-400 mb-1.5">{p.confirmedTz}</div>
                                      {p.availability && p.availability.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {p.availability.map((slot) => (
                                            <span key={slot.id} className="bg-blue-50 border border-blue-200 text-blue-700 rounded px-1.5 py-0.5 text-[11px]">
                                              {DAY_NAMES[slot.dayOfWeek]} {slot.startTime}–{slot.endTime}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic">אין זמינות רשומה</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Pros & Cons (PAIR only) */}
                            {match.matchType === 'PAIR' && match.members.length === 2 && (() => {
                              const pa = match.members[0].participant as Participant
                              const pb = match.members[1].participant as Participant
                              const { pros, cons } = computeProsAndCons(pa, pb)
                              return (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">יתרונות וחסרונות</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-green-700 mb-1">יתרונות</p>
                                      {pros.length === 0 && <p className="text-xs text-gray-400 italic">אין</p>}
                                      {pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-1 text-xs text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1">
                                          <span className="shrink-0">✓</span><span>{pro}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-red-700 mb-1">חסרונות</p>
                                      {cons.length === 0 && <p className="text-xs text-gray-400 italic">אין</p>}
                                      {cons.map((con, i) => (
                                        <div key={i} className="flex items-start gap-1 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                                          <span className="shrink-0">✗</span><span>{con}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}

                            {/* System Notes */}
                            {match.systemNotes && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">התראות מערכת</p>
                                <div className="space-y-1">
                                  {match.systemNotes.split(' | ').map((note, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                                      <span>⚠️</span><span>{note}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Admin Notes */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">הערה ידנית</p>
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="הוסף הערה..."
                                  value={editingNotes[match.id] ?? match.adminNotes ?? ''}
                                  onChange={(e) => setEditingNotes((n) => ({ ...n, [match.id]: e.target.value }))}
                                />
                                <button onClick={() => saveNotes(match.id)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded">שמור</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Approved matches */}
            {approvedMatches.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3">
                  Approved ({approvedMatches.length})
                </h3>
                <div className="space-y-3">
                  {approvedMatches.map((match) => (
                    <div key={match.id} className="bg-green-50 rounded-xl border border-green-200 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${match.matchType === 'PAIR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {match.matchType}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {utcToIst(match.scheduledStartUtc)} – {DateTime.fromISO(match.scheduledEndUtc, { zone: 'utc' }).setZone('Asia/Jerusalem').toFormat('HH:mm')} IST
                        </span>
                        <span className="text-xs text-green-600 font-medium">✓ Approved</span>
                      </div>
                      {match.members.map((mm) => (
                        <div key={mm.participant.id} className="text-sm text-gray-600">
                          {mm.participant.fullName} — <span className="text-gray-400">{mm.participant.schoolName}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draftMatches.length === 0 && approvedMatches.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                No matches yet. Run the matching engine first.
              </div>
            )}
          </div>
        )}
        {/* TAB 5: Schools */}
        {tab === 'schools' && (
          <div className="max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">School List</h2>
              <span className="text-sm text-gray-400">{schools.length} schools</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <p className="text-sm text-gray-600 mb-3">Schools appear as a dropdown in the registration form. Participants can also choose &quot;Other&quot;.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="School name..."
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSchool()}
                />
                <button onClick={addSchool} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">Add</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {schools.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">No schools yet. Add some above.</p>
              )}
              {schools.map((school) => (
                <div key={school.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-800">{school.name}</span>
                  <button onClick={() => deleteSchool(school.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
