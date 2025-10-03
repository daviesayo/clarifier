'use client'

import { useState } from 'react'
import { SessionWithDetails } from '@/types/dashboard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoreVertical, Trash2, Edit, Download, MessageSquare, Calendar } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface SessionListProps {
  sessions: SessionWithDetails[]
  onSessionSelect: (sessionId: string) => void
  onSessionDelete: (sessionId: string) => void
  onSessionRename: (sessionId: string, newDomain: string) => void
  selectedSession: string | null
}

export function SessionList({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
  selectedSession
}: SessionListProps) {
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; sessionId: string; currentDomain: string }>({
    open: false,
    sessionId: '',
    currentDomain: ''
  })
  const [newDomain, setNewDomain] = useState('')

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

  const handleRename = (sessionId: string, currentDomain: string) => {
    setRenameDialog({ open: true, sessionId, currentDomain })
    setNewDomain(currentDomain)
  }

  const handleRenameSubmit = () => {
    if (newDomain.trim() && newDomain !== renameDialog.currentDomain) {
      onSessionRename(renameDialog.sessionId, newDomain.trim())
    }
    setRenameDialog({ open: false, sessionId: '', currentDomain: '' })
    setNewDomain('')
  }

  const handleExport = (session: SessionWithDetails) => {
    const exportData = {
      id: session.id,
      domain: session.domain,
      status: session.status,
      created_at: session.created_at,
      final_brief: session.final_brief,
      final_output: session.final_output,
      message_count: session.message_count
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

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No sessions found</h3>
            <p>Your conversation sessions will appear here.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4">
        {sessions.map((session) => (
          <Card
            key={session.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedSession === session.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => onSessionSelect(session.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-semibold text-gray-900 truncate">
                    {session.formatted_domain}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {session.formatted_created_at}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {session.message_count} messages
                    </span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Badge className={getStatusColor(session.status)}>
                    {getStatusIcon(session.status)} {session.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRename(session.id, session.domain)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExport(session)
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {session.final_brief && (
                <p className="text-sm text-gray-600 line-clamp-2 break-words overflow-hidden">
                  {session.final_brief}
                </p>
              )}
              {!session.final_brief && (
                <p className="text-sm text-gray-400 italic">
                  No brief available
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Enter a new name for this session.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="domain">Session Name</Label>
            <Input
              id="domain"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Enter session name"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, sessionId: '', currentDomain: '' })}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {sessions.map((session) => (
        <AlertDialog key={`delete-${session.id}`}>
          <AlertDialogTrigger asChild>
            <div style={{ display: 'none' }} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Session</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{session.formatted_domain}&quot;? This action cannot be undone.
                All messages in this session will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onSessionDelete(session.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </>
  )
}
