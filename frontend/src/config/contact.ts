export const SUPPORT_EMAIL = 'willmusolf@gmail.com'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`
export const SUPPORT_GITHUB_URL = 'https://github.com/willmusolf/deepmove'
export const SUPPORT_GITHUB_ISSUES_URL = 'https://github.com/willmusolf/deepmove/issues/new'

interface SupportIssueContext {
  page?: string
  section?: string
}

export function buildSupportIssueUrl(context: SupportIssueContext = {}): string {
  const url = new URL(SUPPORT_GITHUB_ISSUES_URL)
  const label = [context.page, context.section].filter(Boolean).join(' / ') || 'app'

  url.searchParams.set('title', `[feedback] ${label}`)
  url.searchParams.set(
    'body',
    [
      'What happened?',
      '',
      'What did you expect instead?',
      '',
      'Context',
      `- Page: ${context.page ?? 'unknown'}`,
      `- Section: ${context.section ?? 'general'}`,
      `- Path: ${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`,
    ].join('\n'),
  )

  return url.toString()
}
