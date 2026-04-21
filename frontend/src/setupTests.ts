import '@testing-library/jest-dom'

// Mock ResizeObserver
;(globalThis as any).ResizeObserver = class ResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
