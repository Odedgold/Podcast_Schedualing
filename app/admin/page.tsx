'use client'

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { DateTime } from 'luxon'

type FieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTISELECT'

interface Program {
  id: string
  name: string
  slug: string
  createdAt: string
}
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
  placeholder?: string
  isRequired: boolean
  isActive: boolean
  sortOrder: number
  matchingMode: 'OFF' | 'PREFERRED' | 'MANDATORY'
  matchingType: 'SAME_VALUE' | 'DIFFERENT_VALUE' | 'NUMERIC_GAP' | 'ANY_VALUE'
  matchingWeight: number
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
    .toFormat('cccc, dd MMM HH:mm')
}

export default function AdminDashboard() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
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
  // Manual match mode
  const [manualMatchMode, setManualMatchMode] = useState(false)
  const [selectedForMatch, setSelectedForMatch] = useState<Set<string>>(new Set())
  // Participant search & status
  const [participantSearch, setParticipantSearch] = useState('')
  // Schools management
  const [schools, setSchools] = useState<{ id: string; name: string; isActive: boolean; sortOrder: number }[]>([])
  const [newSchoolName, setNewSchoolName] = useState('')

  // Participants filter
  const [showMatchedParticipants, setShowMatchedParticipants] = useState(false)
  // Matching state
  const [matchType, setMatchType] = useState<'PAIR' | 'GROUP' | 'BOTH'>('PAIR')
  const [groupSize, setGroupSize] = useState(3)
  const [maxPairs, setMaxPairs] = useState<number | ''>('')
  const [maxGroups, setMaxGroups] = useState<number | ''>('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  // Side A / Side B populations
  const [countrySideA, setCountrySideA] = useState<string[]>([])
  const [countrySideB, setCountrySideB] = useState<string[]>([])
  const [schoolSideA, setSchoolSideA] = useState<string[]>([])
  const [schoolSideB, setSchoolSideB] = useState<string[]>([])
  // Calendar popup
  const [calendarPopup, setCalendarPopup] = useState<{ participant: Participant; x: number; y: number } | null>(null)
  // Participant detail modal
  const [detailParticipant, setDetailParticipant] = useState<Participant | null>(null)

  const [matchResult, setMatchResult] = useState<{ matchesCreated: number; unmatchedCount: number; unmatched: { id: string; fullName: string; schoolName: string; country: string; warnings: string[]; blockers: string[] }[] } | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  type RuleMode = 'mandatory' | 'preferred' | 'off'
  const [availabilityRule, setAvailabilityRule] = useState<RuleMode>('mandatory')
  const [differentSchoolRule, setDifferentSchoolRule] = useState<RuleMode>('off')
  const [differentCountryRule, setDifferentCountryRule] = useState<RuleMode>('off')

  // Custom field form
  const [showAddField, setShowAddField] = useState(false)
  const [newField, setNewField] = useState({ label: '', fieldKey: '', fieldType: 'TEXT' as FieldType, options: '', isRequired: false })

  const fetchParticipants = useCallback(async () => {
    const url = selectedProgramId ? `/api/admin/participants?programId=${selectedProgramId}` : '/api/admin/participants'
    const res = await fetch(url)
    if (res.ok) setParticipants(await res.json())
  }, [selectedProgramId])

  const fetchCustomFields = useCallback(async () => {
    const res = await fetch('/api/admin/custom-fields')
    if (res.ok) setCustomFields(await res.json())
  }, [])

  const fetchMatches = useCallback(async () => {
    const url = selectedProgramId ? `/api/admin/matches?programId=${selectedProgramId}` : '/api/admin/matches'
    const res = await fetch(url)
    if (res.ok) setMatches(await res.json())
  }, [selectedProgramId])

  const fetchSchools = useCallback(async () => {
    const res = await fetch('/api/admin/schools')
    if (res.ok) setSchools(await res.json())
  }, [])

  useEffect(() => {
    fetch('/api/admin/programs')
      .then(r => r.json())
      .then((data: Program[]) => {
        setPrograms(data)
        if (data.length > 0) setSelectedProgramId(data[0].id)
      })
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
      body: JSON.stringify({
        matchType, groupSize,
        programId: selectedProgramId,
        maxPairs: maxPairs !== '' ? maxPairs : undefined,
        maxGroups: maxGroups !== '' ? maxGroups : undefined,
        availabilityRule, differentSchoolRule, differentCountryRule,
        countrySideA: countrySideA.length > 0 ? countrySideA : undefined,
        countrySideB: countrySideB.length > 0 ? countrySideB : undefined,
        schoolSideA: schoolSideA.length > 0 ? schoolSideA : undefined,
        schoolSideB: schoolSideB.length > 0 ? schoolSideB : undefined,
      }),
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

  async function createManualMatch() {
    const ids = [...selectedForMatch]
    if (ids.length < 2) return
    const names = participants.filter((p) => selectedForMatch.has(p.id)).map((p) => p.fullName).join(', ')
    if (!confirm(`Create an approved match for:\n${names}?`)) return
    const res = await fetch('/api/admin/matches/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIds: ids, programId: selectedProgramId }),
    })
    if (res.ok) {
      setSelectedForMatch(new Set())
      setManualMatchMode(false)
      await fetchMatches()
      await fetchParticipants()
    }
  }

  async function rejectAllDrafts() {
    if (!confirm(`Reject all ${draftMatches.length} draft matches?`)) return
    await Promise.all(draftMatches.map((m) => fetch(`/api/admin/matches/${m.id}/reject`, { method: 'POST' })))
    fetchMatches()
  }

  async function breakMatch(id: string) {
    if (!confirm('Break this match and return participants to the pool?')) return
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

  async function updateFieldMatching(id: string, patch: Partial<{ matchingMode: string; matchingType: string; matchingWeight: number }>) {
    await fetch(`/api/admin/custom-fields/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
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

  async function deleteParticipant(p: Participant) {
    if (!confirm(`Permanently delete ${p.fullName}?\nThis cannot be undone (GDPR right to erasure).`)) return
    await fetch(`/api/admin/participants/${p.id}`, { method: 'DELETE' })
    if (detailParticipant?.id === p.id) setDetailParticipant(null)
    fetchParticipants()
  }

  async function deleteAllParticipants() {
    const programName = programs.find(p => p.id === selectedProgramId)?.name ?? 'this program'
    if (!confirm(`Delete ALL participants and matches in "${programName}"?\n\nThis cannot be undone.`)) return
    const url = selectedProgramId ? `/api/admin/participants?programId=${selectedProgramId}` : '/api/admin/participants'
    await fetch(url, { method: 'DELETE' })
    fetchParticipants()
    fetchMatches()
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
    if (a.schoolName !== b.schoolName) pros.push('Different schools')
    else cons.push(`Same school: ${a.schoolName}`)
    if (a.country !== b.country) pros.push(`Different countries: ${a.country} / ${b.country}`)
    else cons.push(`Same country: ${a.country}`)
    // Dynamic custom fields
    const aMap = Object.fromEntries((a.customFields || []).map((cf) => [parseFieldLabel(cf.field.label), cf.value]))
    const bMap = Object.fromEntries((b.customFields || []).map((cf) => [parseFieldLabel(cf.field.label), cf.value]))
    const labels = new Set([...(a.customFields || []).map((cf) => parseFieldLabel(cf.field.label)), ...(b.customFields || []).map((cf) => parseFieldLabel(cf.field.label))])
    for (const label of labels) {
      const va = aMap[label]
      const vb = bMap[label]
      if (!va && !vb) continue
      if (va && vb && va === vb) pros.push(`${label}: ${va}`)
      else if (va && vb) cons.push(`${label}: ${va} / ${vb}`)
    }
    return { pros, cons }
  }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

  function parseFieldLabel(raw: string): string {
    try { const p = JSON.parse(raw); return p.en ?? raw } catch { return raw }
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const timeSlots: string[] = []
  for (let h = 6; h <= 23; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 23) timeSlots.push(`${String(h).padStart(2, '0')}:30`)
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

  const filteredParticipants = participants
    .filter(p => showMatchedParticipants || p.status !== 'MATCHED')
    .filter(p => {
      if (!participantSearch.trim()) return true
      const q = participantSearch.toLowerCase()
      return p.fullName?.toLowerCase().includes(q) || p.schoolName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    })

  const uniqueCountries = uniqueCountriesList
  const uniqueSchools = uniqueSchoolsList
  const draftMatches = matches.filter((m) => m.status === 'DRAFT')
  const approvedMatches = matches.filter((m) => m.status === 'APPROVED')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Scheduling & Matching Platform</h1>
        <div className="flex gap-3">
          <a href="/admin/generate-link" className="text-sm text-blue-600 hover:underline">
            Programs
          </a>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
            Logout
          </button>
        </div>
      </header>

      {/* Program selector */}
      <div className="sticky top-[65px] z-20 bg-blue-950 px-6 py-2 flex items-center gap-2 overflow-x-auto">
        {programs.map((prog) => (
          <button
            key={prog.id}
            onClick={() => setSelectedProgramId(prog.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              selectedProgramId === prog.id
                ? 'bg-white text-blue-900'
                : 'bg-blue-800 text-blue-100 hover:bg-blue-700'
            }`}
          >
            {prog.name}
          </button>
        ))}
        <a
          href="/admin/generate-link"
          className="ml-auto text-xs text-blue-300 hover:text-white whitespace-nowrap transition-colors"
        >
          + New Program
        </a>
      </div>

      {/* Tabs */}
      <div className="sticky top-[105px] z-20 bg-white border-b border-gray-200 px-6">
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
              <div className="flex gap-3 flex-wrap items-center">
                <button
                  onClick={() => setShowMatchedParticipants(!showMatchedParticipants)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showMatchedParticipants ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                >
                  {showMatchedParticipants ? '✓ Showing matched' : `Show matched (${participants.filter(p => p.status === 'MATCHED').length})`}
                </button>
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
                <button
                  onClick={deleteAllParticipants}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded-lg"
                >
                  Delete All
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
                        <th className="px-4 py-3 font-medium text-gray-600">School</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Country</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Slots</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Submitted</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Toggle</th>
                        <th className="px-4 py-3 font-medium text-gray-600">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParticipants.map((p) => (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${p.status === 'INACTIVE' ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3">
                            <button onClick={() => setDetailParticipant(p)} className="font-medium text-blue-600 hover:underline text-left">
                              {p.fullName || '(empty)'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.schoolName}</td>
                          <td className="px-4 py-3 text-gray-600">{p.country}</td>
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
                          <td className="px-4 py-3">
                            <button onClick={() => deleteParticipant(p)}
                              className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="GDPR right to erasure">
                              Delete
                            </button>
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
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => { setManualMatchMode(!manualMatchMode); setSelectedForMatch(new Set()) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${manualMatchMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400 hover:text-orange-600'}`}
                    >
                      {manualMatchMode ? '✕ Cancel Selection' : '⊕ Manual Match Mode'}
                    </button>
                  </div>
                </div>

                {/* Manual match selection panel */}
                {manualMatchMode && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-orange-700">
                      {selectedForMatch.size === 0
                        ? 'Click participants in the calendar to select them for a manual match'
                        : `Selected (${selectedForMatch.size}): ${participants.filter((p) => selectedForMatch.has(p.id)).map((p) => p.fullName).join(', ')}`
                      }
                    </span>
                    {selectedForMatch.size >= 2 && (
                      <button
                        onClick={createManualMatch}
                        className="ml-auto bg-orange-500 hover:bg-orange-600 text-white text-xs px-4 py-1.5 rounded-lg font-medium"
                      >
                        Create Match ({selectedForMatch.size} participants)
                      </button>
                    )}
                    {selectedForMatch.size > 0 && (
                      <button onClick={() => setSelectedForMatch(new Set())} className="text-xs text-orange-500 hover:underline">Clear</button>
                    )}
                  </div>
                )}

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
                    <div className="sticky left-0 bg-white z-10 border-r border-gray-200">
                      <div className="h-14 border-b border-gray-200" />
                      {timeSlots.map((t) => (
                        <div key={t} className={`h-10 flex items-center px-2 text-xs w-16 ${t.endsWith(':00') ? 'text-gray-600 font-medium border-b border-gray-200' : 'text-gray-400 border-b border-gray-100'}`}>
                          {t.endsWith(':00') ? t : ''}
                        </div>
                      ))}
                    </div>
                    {DAY_LABELS.map((dayLabel, dayIndex) => (
                      <div key={dayIndex} className="border-r border-gray-200 min-w-[140px]">
                        <div className="h-14 border-b border-gray-200 flex items-center justify-center">
                          <div className="text-sm font-semibold text-gray-700">{dayLabel}</div>
                        </div>
                        {timeSlots.map((time) => {
                          const occupants = visibleParticipants.filter((p) => isSlotOccupied(p.id, dayIndex, time))
                          const isHour = time.endsWith(':00')
                          return (
                            <div
                              key={time}
                              className={`h-10 relative flex gap-px p-px ${isHour ? 'border-b border-gray-200 bg-gray-50' : 'border-b border-gray-100 bg-white'}`}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              {occupants.map((p) => {
                                const initials = p.fullName
                                  ? p.fullName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                                  : (p.email?.[0] ?? '?').toUpperCase()
                                const isSelected = selectedForMatch.has(p.id)
                                return (
                                  <div
                                    key={p.id}
                                    className={`flex-1 min-w-0 rounded-sm cursor-pointer flex items-center justify-center overflow-hidden transition-all ${isSelected ? 'ring-2 ring-white ring-offset-1 brightness-110' : 'opacity-85 hover:opacity-100'}`}
                                    style={{ backgroundColor: getGroupColor(p) }}
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setTooltip({ x: rect.left, y: rect.top - 30, name: occupants.map((o) => o.fullName || o.email).join(', ') })
                                    }}
                                    onClick={(e) => {
                                      if (manualMatchMode) {
                                        setSelectedForMatch((prev) => {
                                          const next = new Set(prev)
                                          next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                                          return next
                                        })
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        setCalendarPopup((prev) => prev?.participant.id === p.id ? null : { participant: p, x: rect.left, y: rect.bottom + 8 })
                                      }
                                    }}
                                  >
                                    <span className="text-white text-[9px] font-bold leading-none select-none drop-shadow-sm truncate px-0.5">
                                      {isSelected ? '✓' : initials}
                                    </span>
                                  </div>
                                )
                              })}
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

                {calendarPopup && (
                  <div className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-64 text-sm"
                    style={{ left: Math.min(calendarPopup.x, window.innerWidth - 280), top: Math.min(calendarPopup.y, window.innerHeight - 220) }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">{calendarPopup.participant.fullName}</span>
                      <button onClick={() => setCalendarPopup(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex gap-1"><span className="text-gray-400 w-16">School</span><span>{calendarPopup.participant.schoolName}</span></div>
                      <div className="flex gap-1"><span className="text-gray-400 w-16">Country</span><span>{calendarPopup.participant.country}</span></div>
                      <div className="flex gap-1"><span className="text-gray-400 w-16">City</span><span>{calendarPopup.participant.city}</span></div>
                      <div className="flex gap-1"><span className="text-gray-400 w-16">Status</span>
                        <span className={`px-1.5 rounded-full text-[10px] font-medium ${calendarPopup.participant.status === 'MATCHED' ? 'bg-green-100 text-green-700' : calendarPopup.participant.status === 'INACTIVE' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                          {calendarPopup.participant.status}
                        </span>
                      </div>
                      <div className="flex gap-1"><span className="text-gray-400 w-16">Slots</span><span>{calendarPopup.participant.availability.length} slots</span></div>
                      {calendarPopup.participant.customFields?.length > 0 && (
                        <div className="pt-1 border-t border-gray-100 space-y-0.5">
                          {calendarPopup.participant.customFields.map((cf) => (
                            <div key={cf.field.label} className="flex gap-1">
                              <span className="text-gray-400 w-16 shrink-0 truncate">{parseFieldLabel(cf.field.label)}</span>
                              <span>{cf.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Custom Fields */}
        {tab === 'fields' && (
          <div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-sm text-blue-800">
              <strong>Custom Fields</strong> — Define which questions appear in the registration form (e.g. grade, gender, English level). For each field you can also set <strong>how it affects matching</strong>: <em>Off</em> = ignored, <em>Preferred</em> = adds score points when condition is met, <em>Mandatory</em> = must be satisfied for a match to be created.
            </div>
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
                <div key={field.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{parseFieldLabel(field.label)}</div>
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
                      <button onClick={() => deleteField(field.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                    </div>
                  </div>
                  {/* Matching config */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-gray-500 w-16 shrink-0">Matching:</span>
                    {(['OFF', 'PREFERRED', 'MANDATORY'] as const).map((mode) => (
                      <button key={mode} onClick={() => updateFieldMatching(field.id, { matchingMode: mode })}
                        className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-colors ${field.matchingMode === mode
                          ? mode === 'MANDATORY' ? 'bg-red-500 text-white border-red-500'
                          : mode === 'PREFERRED' ? 'bg-yellow-400 text-white border-yellow-400'
                          : 'bg-gray-200 text-gray-600 border-gray-300'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                        {mode}
                      </button>
                    ))}
                    {field.matchingMode !== 'OFF' && (
                      <>
                        <span className="text-xs text-gray-400 ml-2">Compare:</span>
                        {(['SAME_VALUE', 'DIFFERENT_VALUE', 'NUMERIC_GAP', 'ANY_VALUE'] as const).map((type) => (
                          <button key={type} onClick={() => updateFieldMatching(field.id, { matchingType: type })}
                            className={`px-2 py-0.5 rounded text-xs border transition-colors ${field.matchingType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                            {type === 'SAME_VALUE' ? 'Same' : type === 'DIFFERENT_VALUE' ? 'Different' : type === 'NUMERIC_GAP' ? 'Numeric gap' : 'Any value'}
                          </button>
                        ))}
                        {field.matchingMode === 'PREFERRED' && (
                          <label className="flex items-center gap-1.5 ml-2 text-xs text-gray-500">
                            Weight:
                            <input type="number" min={1} max={20} value={field.matchingWeight}
                              onChange={(e) => updateFieldMatching(field.id, { matchingWeight: Number(e.target.value) })}
                              className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </label>
                        )}
                      </>
                    )}
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-sm text-blue-800">
              <strong>Matching Engine</strong> — Run the matching algorithm. Select populations (Side A vs Side B), configure 3 structural rules (availability, school, country), then click Run. Rules defined in <strong>Custom Fields</strong> are applied automatically on every run.
            </div>
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

              {/* Max match limits (optional) */}
              {matchType === 'BOTH' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Match Limits <span className="text-gray-400 font-normal">(optional — leave blank for auto)</span></label>
                  <div className="flex gap-3 mt-2">
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      Max PAIR matches:
                      <input type="number" min={0} value={maxPairs}
                        onChange={(e) => setMaxPairs(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="auto"
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      Max GROUP matches:
                      <input type="number" min={0} value={maxGroups}
                        onChange={(e) => setMaxGroups(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="auto"
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </label>
                  </div>
                </div>
              )}

              {/* Population selection: Side A vs Side B */}
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Select populations for matching — Side A vs Side B. If nothing is selected, all participants are included.</p>

                {/* Countries */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Countries</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['A', 'B'] as const).map((side) => {
                      const selected = side === 'A' ? countrySideA : countrySideB
                      const setSelected = side === 'A' ? setCountrySideA : setCountrySideB
                      return (
                        <div key={side} className={`border-2 rounded-xl p-3 ${side === 'A' ? 'border-blue-200 bg-blue-50/40' : 'border-orange-200 bg-orange-50/40'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${side === 'A' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>Side {side}</span>
                            <div className="flex gap-2">
                              <button onClick={() => setSelected([...uniqueCountries])} className="text-xs text-gray-500 hover:underline">All</button>
                              <button onClick={() => setSelected([])} className="text-xs text-gray-400 hover:underline">Clear</button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {uniqueCountries.map((c) => (
                              <button key={c} onClick={() => setSelected(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selected.includes(c)
                                  ? side === 'A' ? 'bg-blue-600 text-white border-blue-600' : 'bg-orange-500 text-white border-orange-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                                {c}
                              </button>
                            ))}
                          </div>
                          {selected.length === 0 && <p className="text-xs text-gray-400 mt-2 italic">All countries</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Schools */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Schools</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['A', 'B'] as const).map((side) => {
                      const selected = side === 'A' ? schoolSideA : schoolSideB
                      const setSelected = side === 'A' ? setSchoolSideA : setSchoolSideB
                      return (
                        <div key={side} className={`border-2 rounded-xl p-3 ${side === 'A' ? 'border-blue-200 bg-blue-50/40' : 'border-orange-200 bg-orange-50/40'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${side === 'A' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>Side {side}</span>
                            <div className="flex gap-2">
                              <button onClick={() => setSelected([...uniqueSchools])} className="text-xs text-gray-500 hover:underline">All</button>
                              <button onClick={() => setSelected([])} className="text-xs text-gray-400 hover:underline">Clear</button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {uniqueSchools.map((s) => (
                              <button key={s} onClick={() => setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selected.includes(s)
                                  ? side === 'A' ? 'bg-blue-600 text-white border-blue-600' : 'bg-orange-500 text-white border-orange-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                          {selected.length === 0 && <p className="text-xs text-gray-400 mt-2 italic">All schools</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Built-in Matching Rules */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Built-in Rules</label>
                <p className="text-xs text-gray-400 mb-3">Custom field matching rules are configured in the Custom Fields tab.</p>
                <div className="text-xs text-gray-400 flex gap-4 mb-2 px-1">
                  <span className="w-52">Rule</span>
                  <span className="w-24 text-center">Off</span>
                  <span className="w-24 text-center text-yellow-600">Preferred</span>
                  <span className="w-24 text-center text-red-600">Mandatory</span>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {[
                    { key: 'availability', label: 'Overlapping availability', desc: 'Must have a common free slot', value: availabilityRule, set: setAvailabilityRule },
                    { key: 'differentSchool', label: 'Different schools', desc: 'Participants from different schools', value: differentSchoolRule, set: setDifferentSchoolRule },
                    { key: 'differentCountry', label: 'Different countries', desc: 'Participants from different countries', value: differentCountryRule, set: setDifferentCountryRule },
                  ].map(({ key, label, desc, value, set }) => (
                    <div key={key} className="flex items-center px-3 py-2.5 gap-4">
                      <div className="w-52">
                        <div className="text-sm text-gray-800">{label}</div>
                        <div className="text-xs text-gray-400">{desc}</div>
                      </div>
                      {(['off', 'preferred', 'mandatory'] as const).map((mode) => (
                        <button key={mode} onClick={() => set(mode)}
                          className={`w-24 py-1 rounded text-xs font-medium border transition-colors ${
                            value === mode
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

              {/* Summary of active custom field rules */}
              {customFields.some((f) => f.matchingMode !== 'OFF') && (
                <div className="border border-blue-100 bg-blue-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-blue-700 mb-2">Active field rules (configured in Custom Fields tab)</p>
                  <div className="space-y-1">
                    {customFields.filter((f) => f.matchingMode !== 'OFF').map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-xs text-blue-800">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${f.matchingMode === 'MANDATORY' ? 'bg-red-500 text-white' : 'bg-yellow-400 text-white'}`}>{f.matchingMode}</span>
                        <span>{parseFieldLabel(f.label)}</span>
                        <span className="text-blue-400">· {f.matchingType}{f.matchingMode === 'PREFERRED' ? ` · weight ${f.matchingWeight}` : ''}</span>
                      </div>
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
                    ✓ Created <strong>{matchResult.matchesCreated}</strong> matches. Check the Matches Review tab.
                  </div>
                  {matchResult.unmatchedCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                      <p className="font-medium mb-2">⚠️ {matchResult.unmatchedCount} participants could not be matched</p>
                      <div className="space-y-2">
                        {matchResult.unmatched.map((u: { id: string; fullName: string; schoolName: string; country: string; warnings: string[]; blockers: string[] }) => (
                          <div key={u.id} className="bg-white border border-yellow-200 rounded-lg px-3 py-2 text-xs">
                            <div className="font-medium text-gray-900 mb-1">{u.fullName} <span className="font-normal text-gray-500">· {u.schoolName} · {u.country}</span></div>
                            {u.blockers && u.blockers.length > 0 && (
                              <div className="space-y-0.5">
                                {u.blockers.map((b, i) => (
                                  <div key={i} className="flex items-start gap-1 text-red-700">
                                    <span className="shrink-0">🔒</span><span>{b}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {u.warnings && u.warnings.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {u.warnings.map((w, i) => (
                                  <div key={i} className="flex items-start gap-1 text-yellow-700">
                                    <span className="shrink-0">⚠️</span><span>{w}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    Draft ({draftMatches.length})
                  </h3>
                  <button
                    onClick={rejectAllDrafts}
                    className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1.5 rounded-lg"
                  >
                    Reject All
                  </button>
                </div>
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
                            <button onClick={() => approveMatch(match.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">Approve</button>
                            <button onClick={() => rejectMatch(match.id)} className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1.5 rounded-lg">Reject</button>
                            <button onClick={() => breakMatch(match.id)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg">Break</button>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50">
                            {/* Date & Time */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Date & Time (Israel time)</p>
                              <p className="text-sm text-gray-800 font-medium">
                                {utcToIst(match.scheduledStartUtc)} – {DateTime.fromISO(match.scheduledEndUtc, { zone: 'utc' }).setZone('Asia/Jerusalem').toFormat('HH:mm')} IST
                              </p>
                            </div>

                            {/* Participants details + availability */}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Participants & Availability</p>
                              <div className="grid grid-cols-1 gap-2">
                                {match.members.map((mm) => {
                                  const p = mm.participant as Participant & { availability: AvailabilitySlot[] }
                                  // Compute participant's local time for the match
                                  const matchLocal = DateTime.fromISO(match.scheduledStartUtc, { zone: 'utc' }).setZone(p.confirmedTz)
                                  const matchEndLocal = DateTime.fromISO(match.scheduledEndUtc, { zone: 'utc' }).setZone(p.confirmedTz)
                                  const matchLocalStr = `${matchLocal.toFormat('cccc, dd MMM HH:mm')} – ${matchEndLocal.toFormat('HH:mm')}`
                                  return (
                                    <div key={mm.role + p.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                      <div className="font-semibold text-gray-900 mb-0.5">{p.fullName} <span className="font-normal text-gray-400">· {p.schoolName} · {p.country}</span></div>
                                      <div className="text-gray-400 mb-0.5">{p.confirmedTz}</div>
                                      <div className="text-green-700 font-medium mb-1.5">📅 {matchLocalStr} (local)</div>
                                      {p.availability && p.availability.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {p.availability.map((slot) => {
                                            const isMatch = slot.dayOfWeek === matchLocal.weekday % 7 &&
                                              slot.startTime <= matchLocal.toFormat('HH:mm') &&
                                              slot.endTime >= matchEndLocal.toFormat('HH:mm')
                                            return (
                                              <span key={slot.id} className={`rounded px-1.5 py-0.5 text-[11px] border ${isMatch ? 'bg-green-100 border-green-400 text-green-800 font-semibold' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                                                {DAY_NAMES[slot.dayOfWeek]} {slot.startTime}–{slot.endTime}
                                                {isMatch && ' ✓'}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic">No availability recorded</span>
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
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pros & Cons</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-green-700 mb-1">Pros</p>
                                      {pros.length === 0 && <p className="text-xs text-gray-400 italic">None</p>}
                                      {pros.map((pro, i) => (
                                        <div key={i} className="flex items-start gap-1 text-xs text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1">
                                          <span className="shrink-0">✓</span><span>{pro}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-red-700 mb-1">Cons</p>
                                      {cons.length === 0 && <p className="text-xs text-gray-400 italic">None</p>}
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
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">System Warnings</p>
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
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Admin Notes</p>
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="Add a note..."
                                  value={editingNotes[match.id] ?? match.adminNotes ?? ''}
                                  onChange={(e) => setEditingNotes((n) => ({ ...n, [match.id]: e.target.value }))}
                                />
                                <button onClick={() => saveNotes(match.id)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded">Save</button>
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
                    <div key={match.id} className="bg-white rounded-xl border border-green-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-green-600 font-bold">✓</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${match.matchType === 'PAIR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {match.matchType}
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {match.members.map(mm => mm.participant.fullName).join(' + ')}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {utcToIst(match.scheduledStartUtc)} IST
                          </span>
                        </div>
                        <button
                          onClick={() => breakMatch(match.id)}
                          className="shrink-0 ml-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 text-xs px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Break
                        </button>
                      </div>
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

      {/* ── Participant Detail Modal ── */}
      {detailParticipant && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setDetailParticipant(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{detailParticipant.fullName}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Submitted {DateTime.fromISO(detailParticipant.submittedAt).toFormat('dd MMM yyyy, HH:mm')}</p>
              </div>
              <button onClick={() => setDetailParticipant(null)} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Personal info */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Personal Information</h3>
                <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    {[
                      ['Full Name', detailParticipant.fullName],
                      ['Email', detailParticipant.email],
                      ['Phone', detailParticipant.phone || '—'],
                      ['School', detailParticipant.schoolName],
                      ['City', detailParticipant.city],
                      ['Country', detailParticipant.country],
                      ['Timezone', detailParticipant.confirmedTz],
                      ['Status', detailParticipant.status],
                      ['Availability Slots', String(detailParticipant.availability.length)],
                    ].map(([label, value]) => (
                      <tr key={label} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-600 w-40">{label}</td>
                        <td className="px-4 py-2.5 text-gray-900">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Custom fields */}
              {detailParticipant.customFields && detailParticipant.customFields.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Questionnaire Answers</h3>
                  <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                    <tbody className="divide-y divide-gray-100">
                      {detailParticipant.customFields.map((cf) => (
                        <tr key={cf.field.label} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-600 w-40">{parseFieldLabel(cf.field.label)}</td>
                          <td className="px-4 py-2.5 text-gray-900">{cf.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Availability */}
              {detailParticipant.availability && detailParticipant.availability.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Availability ({detailParticipant.availability.length} slots)</h3>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIdx) => {
                      const slots = detailParticipant.availability.filter(s => s.dayOfWeek === dayIdx)
                      if (slots.length === 0) return null
                      return (
                        <div key={day} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <span className="text-xs font-semibold text-gray-500 w-8 pt-0.5">{day}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {slots.map(s => (
                              <span key={s.id} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">{s.startTime}–{s.endTime}</span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <button
                  onClick={() => { deleteParticipant(detailParticipant) }}
                  className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                >
                  Delete (GDPR erasure)
                </button>
                <button onClick={() => setDetailParticipant(null)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
