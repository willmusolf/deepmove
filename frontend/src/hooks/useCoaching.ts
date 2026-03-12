// useCoaching.ts — React hook for coaching panel state
// Manages: loading lessons, Socratic mode, Think First mode, lesson progression.
// TODO (Track C, Session 1): Implement after coaching pipeline is ready

export function useCoaching() {
  // TODO: Fetch lessons from backend, manage Think First mode state
  return {
    currentLesson: null,
    isThinkFirstMode: true,
    isWaitingForResponse: false,
    submitThinkFirstResponse: (_response: string) => {},
  }
}
