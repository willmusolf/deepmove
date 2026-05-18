import type { SponsorConfig } from '../config/sponsor'

interface SponsorCardProps {
  sponsor: SponsorConfig
  variant?: 'rail' | 'inline' | 'mobile'
}

export default function SponsorCard({ sponsor, variant = 'rail' }: SponsorCardProps) {
  return (
    <a
      className={`sponsor-card sponsor-card--${variant}`}
      href={sponsor.url}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={`${sponsor.label}: ${sponsor.name}`}
    >
      <div className="sponsor-card__label">{sponsor.label}</div>
      <div className="sponsor-card__content">
        {sponsor.imageUrl && (
          <img
            className="sponsor-card__image"
            src={sponsor.imageUrl}
            alt={`${sponsor.name} logo`}
            loading="lazy"
          />
        )}
        <div className="sponsor-card__body">
          <div className="sponsor-card__name-row">
            <strong className="sponsor-card__name">{sponsor.name}</strong>
            <span className="sponsor-card__cta">{sponsor.cta}</span>
          </div>
          <p className="sponsor-card__copy">{sponsor.copy}</p>
        </div>
      </div>
    </a>
  )
}
