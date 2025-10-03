'use client'

import { useState, useEffect } from 'react'
import { Session, Message, SessionDetailResponse } from '@/types/dashboard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Download, X, User, Bot, Calendar, MessageSquare } from 'lucide-react'

interface SessionDetailProps {
  sessionId: string
  onClose: () => void
}

export function SessionDetail({ sessionId, onClose }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessionDetail = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/sessions/${sessionId}`)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error('Session detail fetch error:', response.status, errorData)
          throw new Error(`Failed to fetch session details: ${response.status} ${errorData.error || 'Unknown error'}`)
        }

        const data: SessionDetailResponse = await response.json()
        setSession(data.session)
        setMessages(data.messages)
      } catch (err) {
        console.error('Error fetching session detail:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch session details')
      } finally {
        setLoading(false)
      }
    }

    if (sessionId) {
      fetchSessionDetail()
    }
  }, [sessionId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'questioning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'generating':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'questioning':
        return '❓'
      case 'generating':
        return '⚡'
      case 'completed':
        return '✅'
      default:
        return '❓'
    }
  }

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const handleExportSession = () => {
    if (!session) return

    const exportData = {
      session: {
        id: session.id,
        domain: session.domain,
        status: session.status,
        created_at: session.created_at,
        final_brief: session.final_brief,
        final_output: session.final_output
      },
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at
      }))
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${session.id}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatMessageTime = (timestamp: string | null) => {
    if (!timestamp) return 'Unknown time'
    return new Date(timestamp).toLocaleString()
  }

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
            <DialogDescription>Loading session information...</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (error || !session) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>Failed to load session details</DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Session not found'}</AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                {session.domain.charAt(0).toUpperCase() + session.domain.slice(1)}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(session.created_at!).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {messages.length} messages
                </span>
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(session.status)}>
                {getStatusIcon(session.status)} {session.status}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSession}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] overflow-auto">
          <div className="space-y-6">
            {/* Session Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {session.final_brief && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Brief</h4>
                    <div className="bg-gray-50 p-3 rounded-md max-h-64 overflow-y-auto">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                        {session.final_brief}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleCopyToClipboard(session.final_brief!)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                )}
                
                {session.final_output && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Output</h4>
                    <div className="bg-gray-50 p-3 rounded-md max-h-64 overflow-y-auto">
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                        {JSON.stringify(session.final_output, null, 2)}
                      </pre>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleCopyToClipboard(JSON.stringify(session.final_output, null, 2))}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                )}

                {!session.final_brief && !session.final_output && (
                  <p className="text-sm text-gray-500 italic">No summary available for this session.</p>
                )}
              </CardContent>
            </Card>

            {/* Conversation History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conversation History</CardTitle>
                <CardDescription>
                  Complete message history for this session
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-500 italic text-center py-8">
                    No messages found for this session.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 p-4 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-blue-50 border-l-4 border-blue-200'
                            : 'bg-gray-50 border-l-4 border-gray-200'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {message.role === 'user' ? (
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                              <Bot className="h-4 w-4 text-gray-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {message.role === 'user' ? 'You' : 'Assistant'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatMessageTime(message.created_at)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap break-words max-w-full overflow-hidden">
                            {message.content}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-6 px-2"
                            onClick={() => handleCopyToClipboard(message.content)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
