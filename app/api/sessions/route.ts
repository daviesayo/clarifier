import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SessionFilters, SessionsResponse, SessionWithDetails } from '@/types/dashboard'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const filters: SessionFilters = {
      domain: searchParams.get('domain') || undefined,
      status: searchParams.get('status') as 'questioning' | 'generating' | 'completed' | null || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: (searchParams.get('sortBy') as 'created_at' | 'domain' | 'status') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '10')
    }

    // Build query
    let query = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)

    // Apply filters
    if (filters.domain) {
      query = query.eq('domain', filters.domain)
    }
    
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    // Apply search (client-side for now as per design decision)
    if (filters.search) {
      query = query.or(`domain.ilike.%${filters.search}%,final_brief.ilike.%${filters.search}%`)
    }

    // Apply sorting
    query = query.order(filters.sortBy!, { ascending: filters.sortOrder === 'asc' })

    // Apply pagination
    const from = (filters.page! - 1) * filters.limit!
    const to = from + filters.limit! - 1
    query = query.range(from, to)

    const { data: sessions, error } = await query

    if (error) {
      console.error('Error fetching sessions:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    console.log('Fetched sessions:', sessions?.length || 0, 'sessions for user:', user.id)

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // Get message counts for each session
    const sessionsWithDetails: SessionWithDetails[] = await Promise.all(
      (sessions || []).map(async (session) => {
        const { count: messageCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id)
        
        return {
          ...session,
          message_count: messageCount || 0,
          last_message_at: null, // Will be populated if needed
          formatted_created_at: new Date(session.created_at!).toLocaleDateString(),
          formatted_domain: session.domain.charAt(0).toUpperCase() + session.domain.slice(1)
        }
      })
    )

    const response: SessionsResponse = {
      sessions: sessionsWithDetails,
      total: totalCount || 0,
      page: filters.page!,
      limit: filters.limit!,
      hasMore: (filters.page! * filters.limit!) < (totalCount || 0)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Sessions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Handle session deletion
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await request.json()
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Delete session (messages will be deleted via CASCADE)
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id) // Ensure user can only delete their own sessions

    if (error) {
      console.error('Error deleting session:', error)
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete session API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Handle session renaming
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId, newDomain } = await request.json()
    
    if (!sessionId || !newDomain) {
      return NextResponse.json({ error: 'Session ID and new domain are required' }, { status: 400 })
    }

    // Update session domain
    const { error } = await supabase
      .from('sessions')
      .update({ domain: newDomain })
      .eq('id', sessionId)
      .eq('user_id', user.id) // Ensure user can only update their own sessions

    if (error) {
      console.error('Error updating session:', error)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update session API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
