'use client'

import { useState, useEffect } from 'react'
import { SessionFilters as FiltersType } from '@/types/dashboard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, X } from 'lucide-react'

interface SessionFiltersProps {
  filters: FiltersType
  onFiltersChange: (filters: Partial<FiltersType>) => void
  total: number
}

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'generating', label: 'Generating' },
  { value: 'completed', label: 'Completed' }
]

const sortOptions = [
  { value: 'created_at', label: 'Date Created' },
  { value: 'domain', label: 'Domain' },
  { value: 'status', label: 'Status' }
]

const sortOrderOptions = [
  { value: 'desc', label: 'Newest First' },
  { value: 'asc', label: 'Oldest First' }
]

export function SessionFilters({ filters, onFiltersChange, total }: SessionFiltersProps) {
  const [localFilters, setLocalFilters] = useState<Partial<FiltersType>>({})
  const [hasActiveFilters, setHasActiveFilters] = useState(false)

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  // Check if there are active filters
  useEffect(() => {
    const active = Object.entries(filters).some(([key, value]) => {
      if (key === 'page' || key === 'limit' || key === 'sortBy' || key === 'sortOrder') {
        return false
      }
      return value !== undefined && value !== null && value !== ''
    })
    setHasActiveFilters(active)
  }, [filters])

  const handleFilterChange = (key: keyof FiltersType, value: string | number | undefined) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
  }

  const handleApplyFilters = () => {
    onFiltersChange(localFilters)
  }

  const handleClearFilters = () => {
    const clearedFilters = {
      search: '',
      domain: undefined,
      status: undefined,
      page: 1
    }
    setLocalFilters(clearedFilters)
    onFiltersChange(clearedFilters)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleApplyFilters()
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.search) count++
    if (filters.domain) count++
    if (filters.status) count++
    return count
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>
              {total} session{total !== 1 ? 's' : ''} found
            </CardDescription>
          </div>
          {hasActiveFilters && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {getActiveFilterCount()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              placeholder="Search sessions..."
              value={localFilters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-10"
            />
          </div>
        </form>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={localFilters.status || 'all'}
            onValueChange={(value) => handleFilterChange('status', value === 'all' ? undefined : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="space-y-2">
          <Label htmlFor="sortBy">Sort By</Label>
          <Select
            value={localFilters.sortBy || 'created_at'}
            onValueChange={(value) => handleFilterChange('sortBy', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Order */}
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Order</Label>
          <Select
            value={localFilters.sortOrder || 'desc'}
            onValueChange={(value) => handleFilterChange('sortOrder', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOrderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleApplyFilters}
            className="flex-1"
            size="sm"
          >
            Apply Filters
          </Button>
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              size="sm"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="pt-4 border-t">
            <div className="text-sm font-medium text-gray-700 mb-2">Active Filters:</div>
            <div className="flex flex-wrap gap-2">
              {filters.search && (
                <Badge variant="secondary" className="text-xs">
                  Search: &quot;{filters.search}&quot;
                </Badge>
              )}
              {filters.status && (
                <Badge variant="secondary" className="text-xs">
                  Status: {statusOptions.find(opt => opt.value === filters.status)?.label || filters.status}
                </Badge>
              )}
              {filters.domain && (
                <Badge variant="secondary" className="text-xs">
                  Domain: {filters.domain}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
