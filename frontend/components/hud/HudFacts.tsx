import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import clsx from 'clsx'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@/components/catalyst/description-list'
import { HudText } from './HudTypography'
import styles from './hud-facts.module.css'

export type HudFact = {
  label: string
  value: ReactNode
}

type HudFactsProps = Omit<ComponentPropsWithoutRef<typeof DescriptionList>, 'children'> & {
  items: readonly HudFact[]
  layout?: 'columns' | 'rows'
}

/** Compact labeled facts; callers supply text or figures without domain-specific layout. */
export function HudFacts({ items, layout = 'columns', className, ...props }: HudFactsProps) {
  return (
    <DescriptionList {...props} className={clsx(styles.facts, layout === 'rows' && styles.rows, className)}>
      {items.map(({ label, value }) => (
        <div key={label} className={styles.fact}>
          <DescriptionTerm className={styles.term}>
            <HudText variant="label">{label}</HudText>
          </DescriptionTerm>
          <DescriptionDetails className={styles.details}>{value}</DescriptionDetails>
        </div>
      ))}
    </DescriptionList>
  )
}
