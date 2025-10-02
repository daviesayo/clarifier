import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '@/lib/hooks/useChat';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock the API functions
jest.mock('@/lib/api/chat', () => ({
  sendMessage: jest.fn(),
  generateIdeas: jest.fn(),
  createSession: jest.fn(),
}));

describe('useChat - Intensity Management', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  it('initializes with deep intensity by default', () => {
    localStorageMock.getItem.mockReturnValue(null);
    
    const { result } = renderHook(() => useChat());
    
    expect(result.current.intensity).toBe('deep');
  });

  it('initializes with saved intensity from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('basic');
    
    const { result } = renderHook(() => useChat());
    
    expect(result.current.intensity).toBe('basic');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('clarifier-intensity');
  });

  it('updates intensity and saves to localStorage', () => {
    localStorageMock.getItem.mockReturnValue('deep');
    
    const { result } = renderHook(() => useChat());
    
    act(() => {
      result.current.setIntensity('basic');
    });
    
    expect(result.current.intensity).toBe('basic');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('clarifier-intensity', 'basic');
  });

  it('handles invalid localStorage values gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid');
    
    const { result } = renderHook(() => useChat());
    
    expect(result.current.intensity).toBe('deep');
  });

  it('handles server-side rendering (no window object)', () => {
    // Mock server-side environment
    const originalWindow = global.window;
    delete (global as any).window;
    
    const { result } = renderHook(() => useChat());
    
    expect(result.current.intensity).toBe('deep');
    
    // Restore window
    global.window = originalWindow;
  });

  it('provides setIntensity function', () => {
    const { result } = renderHook(() => useChat());
    
    expect(typeof result.current.setIntensity).toBe('function');
  });

  it('can switch between basic and deep intensity', () => {
    localStorageMock.getItem.mockReturnValue('deep');
    
    const { result } = renderHook(() => useChat());
    
    // Start with deep
    expect(result.current.intensity).toBe('deep');
    
    // Switch to basic
    act(() => {
      result.current.setIntensity('basic');
    });
    expect(result.current.intensity).toBe('basic');
    
    // Switch back to deep
    act(() => {
      result.current.setIntensity('deep');
    });
    expect(result.current.intensity).toBe('deep');
  });
});
