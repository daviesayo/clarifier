'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthGuardProps {
  children: React.ReactNode
  redirectTo?: string
  fallback?: React.ReactNode
}

export default function AuthGuard({ 
  children, 
  redirectTo = '/login',
  fallback = <div>Loading...</div>
}: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)

      if (!session?.user) {
        router.push(redirectTo)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)

        if (event === 'SIGNED_OUT' || !session?.user) {
          router.push(redirectTo)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, redirectTo])

  if (loading) {
    return <>{fallback}</>
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
