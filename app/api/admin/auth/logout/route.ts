import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(_request: NextRequest) {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('admin_session')
    return Response.json({ success: true })
  } catch (error) {
    console.error('POST /api/admin/auth/logout error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
