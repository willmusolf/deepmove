// ResponsiveLayout.tsx — Main layout wrapper
// Desktop: board center, coach panel right
// Mobile: board top, coach panel below
// TODO: Implement responsive grid

interface ResponsiveLayoutProps {
  children: React.ReactNode
}

export default function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  return <div className="layout">{children}</div>
}
