import { shouldGeoBlock } from '@pancakeswap/utils/geoBlock'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  if (shouldGeoBlock({ country: req.headers.get('x-vercel-ip-country') })) {
    return NextResponse.redirect(new URL('/451', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/',
    '/swap',
    '/liquidity',
    '/pools',
    '/farms',
    '/add',
    '/ifo',
    '/remove',
    '/prediction',
    '/find',
    '/limit-orders',
    '/lottery',
    '/nfts',
    '/info/:path*',
  ],
}
