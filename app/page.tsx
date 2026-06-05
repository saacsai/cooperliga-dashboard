import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function Home() {
  const ua = (await headers()).get('user-agent') ?? ''
  const isMobile = /mobile|android|iphone|ipad/i.test(ua)
  redirect(isMobile ? '/login?next=%2Fmobile%2Festoque' : '/login')
}
