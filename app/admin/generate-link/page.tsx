'use client'

import { useState, useEffect } from 'react'

interface GeneratedLink {
  token: string
  url: string
  createdAt: string
}

export default function GenerateLinkPage() {
  const [links, setLinks] = useState<GeneratedLink[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('generated_links')
    if (stored) setLinks(JSON.parse(stored))
  }, [])

  async function generateLink() {
    setLoading(true)
    try {
      const res = await fetch('/api/participants/generate-token', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const newLink: GeneratedLink = {
          token: data.token,
          url: data.url,
          createdAt: new Date().toISOString(),
        }
        const updated = [newLink, ...links]
        setLinks(updated)
        localStorage.setItem('generated_links', JSON.stringify(updated))
      }
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <a href="/admin" className="text-sm text-blue-600 hover:underline">← Dashboard</a>
        <h1 className="text-xl font-bold text-gray-900">Generate Submission Links</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <p className="text-gray-600 text-sm mb-4">
            Generate unique submission links to share with participants. Each link is pre-filled with a unique token.
          </p>
          <button
            onClick={generateLink}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Generating...' : '+ Generate New Link'}
          </button>
        </div>

        {links.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Generated Links ({links.length})
            </h2>
            <div className="space-y-3">
              {links.map((link) => (
                <div key={link.token} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-gray-700 truncate">{link.url}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Token: {link.token.slice(0, 8)}... · {new Date(link.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(link.url)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        copied === link.url
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {copied === link.url ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {links.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            No links generated yet. Click the button above to create one.
          </div>
        )}
      </main>
    </div>
  )
}
