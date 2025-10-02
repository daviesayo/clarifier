import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntensitySelector } from '@/components/IntensitySelector';

describe('IntensitySelector', () => {
  const mockOnIntensityChange = jest.fn();

  beforeEach(() => {
    mockOnIntensityChange.mockClear();
  });

  it('renders with basic intensity selected', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    expect(screen.getByText('Questioning Style:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basic' })).toHaveClass('bg-blue-600');
    expect(screen.getByRole('button', { name: 'Deep' })).not.toHaveClass('bg-blue-600');
  });

  it('renders with deep intensity selected', () => {
    render(
      <IntensitySelector
        intensity="deep"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    expect(screen.getByRole('button', { name: 'Deep' })).toHaveClass('bg-blue-600');
    expect(screen.getByRole('button', { name: 'Basic' })).not.toHaveClass('bg-blue-600');
  });

  it('calls onIntensityChange when basic button is clicked', () => {
    render(
      <IntensitySelector
        intensity="deep"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Basic' }));
    expect(mockOnIntensityChange).toHaveBeenCalledWith('basic');
  });

  it('calls onIntensityChange when deep button is clicked', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deep' }));
    expect(mockOnIntensityChange).toHaveBeenCalledWith('deep');
  });

  it('does not call onIntensityChange when clicking the same intensity', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Basic' }));
    expect(mockOnIntensityChange).not.toHaveBeenCalled();
  });

  it('disables buttons when disabled prop is true', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
        disabled={true}
      />
    );

    expect(screen.getByRole('button', { name: 'Basic' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deep' })).toBeDisabled();
  });

  it('shows help tooltip when help button is clicked', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    const helpButton = screen.getByLabelText('Toggle help information');
    fireEvent.click(helpButton);

    expect(screen.getByText('Basic:')).toBeInTheDocument();
    expect(screen.getByText('Deep:')).toBeInTheDocument();
    expect(screen.getByText('Gentle, single-focus questions without calculations or complex analysis')).toBeInTheDocument();
    expect(screen.getByText('Thorough exploration with detailed questions, analysis, and multi-step reasoning')).toBeInTheDocument();
  });

  it('hides help tooltip when help button is clicked again', () => {
    render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
      />
    );

    const helpButton = screen.getByLabelText('Toggle help information');
    
    // Show tooltip
    fireEvent.click(helpButton);
    expect(screen.getByText('Basic:')).toBeInTheDocument();

    // Hide tooltip
    fireEvent.click(helpButton);
    expect(screen.queryByText('Basic:')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <IntensitySelector
        intensity="basic"
        onIntensityChange={mockOnIntensityChange}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
