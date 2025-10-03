'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { SessionFilters, DashboardState } from '@/types/dashboard'
import { SessionList } from '@/components/SessionList'
import { SessionDetail } from '@/components/SessionDetail'
import { SessionFilters as FiltersComponent } from '@/components/SessionFilters'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, RefreshCw } from 'lucide-react'

const initialState: DashboardState = {
  sessions: [],
  loading: true,
  error: null,
  filters: {
    page: 1,
    limit: 10,
    sortBy: 'created_at',
    sortOrder: 'desc'
  },
  selectedSession: null,
  total: 0,
  hasMore: false
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}

function DashboardContent() {
  const router = useRouter()
  const [state, setState] = useState<DashboardState>(initialState)

  // Fetch sessions
  const fetchSessions = async (filters: SessionFilters = state.filters) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString())
        }
      })

      const response = await fetch(`/api/sessions?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch sessions')
      }

      const data = await response.json()
      
      setState(prev => ({
        ...prev,
        sessions: data.sessions,
        total: data.total,
        hasMore: data.hasMore,
        loading: false,
        error: null
      }))
    } catch (error) {
      console.error('Error fetching sessions:', error)
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sessions'
      }))
    }
  }

  // Handle filter changes
  const handleFiltersChange = (newFilters: Partial<SessionFilters>) => {
    const updatedFilters = { ...state.filters, ...newFilters, page: 1 }
    setState(prev => ({ ...prev, filters: updatedFilters }))
    fetchSessions(updatedFilters)
  }

  // Handle pagination
  const handleLoadMore = () => {
    const nextPage = state.filters.page! + 1
    const updatedFilters = { ...state.filters, page: nextPage }
    setState(prev => ({ ...prev, filters: updatedFilters }))
    fetchSessions(updatedFilters)
  }

  // Handle session selection
  const handleSessionSelect = (sessionId: string) => {
    setState(prev => ({ ...prev, selectedSession: sessionId }))
  }

  // Handle session actions
  const handleSessionDelete = async (sessionId: string) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      if (!response.ok) {
        throw new Error('Failed to delete session')
      }

      // Remove session from state
      setState(prev => ({
        ...prev,
        sessions: prev.sessions.filter(s => s.id !== sessionId),
        selectedSession: prev.selectedSession === sessionId ? null : prev.selectedSession
      }))
    } catch (error) {
      console.error('Error deleting session:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete session'
      }))
    }
  }

  const handleSessionRename = async (sessionId: string, newDomain: string) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, newDomain })
      })

      if (!response.ok) {
        throw new Error('Failed to rename session')
      }

      // Update session in state
      setState(prev => ({
        ...prev,
        sessions: prev.sessions.map(s => 
          s.id === sessionId 
            ? { ...s, domain: newDomain, formatted_domain: newDomain.charAt(0).toUpperCase() + newDomain.slice(1) }
            : s
        )
      }))
    } catch (error) {
      console.error('Error renaming session:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to rename session'
      }))
    }
  }

  // Load sessions on mount
  useEffect(() => {
    fetchSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Session History</h1>
              <p className="text-gray-600 mt-2">
                View and manage your conversation sessions
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fetchSessions()}
                disabled={state.loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${state.loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => router.push('/chat')}>
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {state.error && (
          <Alert className="mb-6" variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <FiltersComponent
              filters={state.filters}
              onFiltersChange={handleFiltersChange}
              total={state.total}
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {state.loading && state.sessions.length === 0 ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : state.sessions.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="text-gray-500">
                    <h3 className="text-lg font-medium mb-2">No sessions found</h3>
                    <p className="mb-4">Start a new conversation to see your sessions here.</p>
                    <Button onClick={() => router.push('/chat')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Start New Session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <SessionList
                  sessions={state.sessions}
                  onSessionSelect={handleSessionSelect}
                  onSessionDelete={handleSessionDelete}
                  onSessionRename={handleSessionRename}
                  selectedSession={state.selectedSession}
                />
                
                {state.hasMore && (
                  <div className="mt-6 text-center">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={state.loading}
                    >
                      {state.loading ? 'Loading...' : 'Load More'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Session Detail Modal */}
        {state.selectedSession && (
          <SessionDetail
            sessionId={state.selectedSession}
            onClose={() => setState(prev => ({ ...prev, selectedSession: null }))}
          />
        )}
      </div>
    </div>
  )
}
