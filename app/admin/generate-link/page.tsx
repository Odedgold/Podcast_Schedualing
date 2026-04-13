'use client'

import { useState, useEffect } from 'react'

interface Program {
  id: string
  name: string
  slug: string
  isActive: boolean
  createdAt: string
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  function getUrl(slug: string) {
    return `${window.location.origin}/form/${slug}`
  }

  async function fetchPrograms() {
    const res = await fetch('/api/admin/programs')
    if (res.ok) setPrograms(await res.json())
  }

  useEffect(() => { fetchPrograms() }, [])

  async function createProgram() {
    if (!newName.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (res.ok) {
      setNewName('')
      await fetchPrograms()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to create program')
    }
    setLoading(false)
  }

  async function copyToClipboard(slug: string) {
    await navigator.clipboard.writeText(getUrl(slug))
    setCopied(slug)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <a href="/admin" className="text-sm text-blue-600 hover:underline">← Dashboard</a>
        <h1 className="text-xl font-bold text-gray-900">Programs</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Create */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Create New Program</h2>
          <p className="text-xs text-gray-400 mb-4">
            Each program gets a unique link. All participants who submit via that link are grouped together.
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='e.g. "Season 2 – Israel"'
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProgram()}
            />
            <button
              onClick={createProgram}
              disabled={loading || !newName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : '+ Create'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>

        {/* List */}
        {programs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Programs ({programs.length})
            </h2>
            <div className="space-y-3">
              {programs.map((prog) => (
                <div key={prog.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{prog.name}</div>
                      <div className="text-xs font-mono text-gray-500 truncate mt-0.5">
                        /form/{prog.slug}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Created {new Date(prog.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(prog.slug)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        copied === prog.slug
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {copied === prog.slug ? '✓ Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {programs.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">
            No programs yet. Create one above.
          </div>
        )}
      </main>
    </div>
  )
}
