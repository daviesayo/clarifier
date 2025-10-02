import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DomainSelector from '@/components/DomainSelector'

describe('DomainSelector', () => {
  const mockOnDomainSelect = jest.fn()

  beforeEach(() => {
    mockOnDomainSelect.mockClear()
  })

  it('renders all five domain options', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    expect(screen.getByText('Business Idea')).toBeInTheDocument()
    expect(screen.getByText('Product Feature')).toBeInTheDocument()
    expect(screen.getByText('Creative Writing')).toBeInTheDocument()
    expect(screen.getByText('Research Project')).toBeInTheDocument()
    expect(screen.getByText('Technical Project')).toBeInTheDocument()
  })

  it('displays domain descriptions and examples', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    expect(screen.getByText('Validate and develop business concepts')).toBeInTheDocument()
    expect(screen.getByText('Design and specify product features')).toBeInTheDocument()
    expect(screen.getByText('Develop stories and creative content')).toBeInTheDocument()
    expect(screen.getByText('Plan and structure research studies')).toBeInTheDocument()
    expect(screen.getByText('Design and architect software solutions')).toBeInTheDocument()
  })

  it('calls onDomainSelect when a domain card is clicked', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    const businessCard = screen.getByText('Business Idea').closest('[role="button"]')
    fireEvent.click(businessCard!)
    
    expect(mockOnDomainSelect).toHaveBeenCalledWith('business')
  })

  it('calls onDomainSelect when Enter key is pressed on a domain card', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    const productCard = screen.getByText('Product Feature').closest('[role="button"]')
    fireEvent.keyDown(productCard!, { key: 'Enter' })
    
    expect(mockOnDomainSelect).toHaveBeenCalledWith('product')
  })

  it('calls onDomainSelect when Space key is pressed on a domain card', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    const creativeCard = screen.getByText('Creative Writing').closest('[role="button"]')
    fireEvent.keyDown(creativeCard!, { key: ' ' })
    
    expect(mockOnDomainSelect).toHaveBeenCalledWith('creative')
  })

  it('has proper accessibility attributes', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    const businessCard = screen.getByText('Business Idea').closest('[role="button"]')
    expect(businessCard).toHaveAttribute('aria-label', 'Select Business Idea domain')
    expect(businessCard).toHaveAttribute('tabIndex', '0')
  })

  it('displays domain icons', () => {
    render(<DomainSelector onDomainSelect={mockOnDomainSelect} />)
    
    expect(screen.getByText('💼')).toBeInTheDocument()
    expect(screen.getByText('🎯')).toBeInTheDocument()
    expect(screen.getByText('✍️')).toBeInTheDocument()
    expect(screen.getByText('🔬')).toBeInTheDocument()
    expect(screen.getByText('💻')).toBeInTheDocument()
  })

  it('renders with custom className', () => {
    const { container } = render(
      <DomainSelector onDomainSelect={mockOnDomainSelect} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
