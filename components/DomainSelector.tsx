'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Domain } from '@/lib/prompts'

// Domain interface matching the requirements
interface DomainOption {
  id: Domain
  title: string
  description: string
  icon: string
  example: string
}

// Domain data matching the specification
const DOMAINS: DomainOption[] = [
  {
    id: 'business',
    title: 'Business Idea',
    description: 'Validate and develop business concepts',
    icon: '💼',
    example: 'Explore a SaaS product idea',
  },
  {
    id: 'product',
    title: 'Product Feature',
    description: 'Design and specify product features',
    icon: '🎯',
    example: 'Design a user dashboard feature',
  },
  {
    id: 'creative',
    title: 'Creative Writing',
    description: 'Develop stories and creative content',
    icon: '✍️',
    example: 'Write a science fiction novel',
  },
  {
    id: 'research',
    title: 'Research Project',
    description: 'Plan and structure research studies',
    icon: '🔬',
    example: 'Study user behavior patterns',
  },
  {
    id: 'coding',
    title: 'Technical Project',
    description: 'Design and architect software solutions',
    icon: '💻',
    example: 'Build a real-time chat application',
  },
]

// Component props interface
interface DomainSelectorProps {
  onDomainSelect: (domain: string) => void
  className?: string
}

export default function DomainSelector({ onDomainSelect, className }: DomainSelectorProps) {
  const handleDomainClick = (domainId: string) => {
    onDomainSelect(domainId)
  }

  const handleKeyDown = (event: React.KeyboardEvent, domainId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onDomainSelect(domainId)
    }
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-2">
          Choose Your Domain
        </h2>
        <p className="text-muted-foreground text-lg">
          Select the type of project you&apos;d like to explore
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {DOMAINS.map((domain) => (
          <Card
            key={domain.id}
            className={cn(
              'cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
              'group border-2 hover:border-primary/50'
            )}
            onClick={() => handleDomainClick(domain.id)}
            onKeyDown={(e) => handleKeyDown(e, domain.id)}
            tabIndex={0}
            role="button"
            aria-label={`Select ${domain.title} domain`}
          >
            <CardHeader className="text-center pb-4">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-200">
                {domain.icon}
              </div>
              <CardTitle className="text-xl group-hover:text-primary transition-colors duration-200">
                {domain.title}
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {domain.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-center">
                <p className="text-xs text-muted-foreground italic">
                  Example: {domain.example}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
