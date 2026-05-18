/// <reference types="vite/client" />

declare const __DEEPMOVE_COMMIT_SHA__: string
declare const __DEEPMOVE_BUILD_TIME__: string

interface Window {
  ezstandalone: {
    cmd: Array<() => void>
    showAds: (...ids: number[]) => void
    destroyPlaceholders?: (...ids: number[]) => void
  }
}
