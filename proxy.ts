import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isLoginPage = pathname === '/admin/login'
  const isApiAuth = pathname.startsWith('/api/admin/auth')
  const isAdminPage = pathname.startsWith('/admin') && !isLoginPage
  const isAdminApi = pathname.startsWith('/api/admin') && !isApiAuth

  if (isAdminPage || isAdminApi) {
    const session = request.cookies.get('admin_session')
    if (!session || session.value !== 'authenticated') {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
