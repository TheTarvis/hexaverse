import type { ComponentType, SVGProps } from 'react'
import clsx from 'clsx'
import styles from './hud-icon.module.css'

type HudIconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height'> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  size?: 16 | 20 | 24
}

/** Use installed Heroicons outlines. Label the containing control when interactive. */
export function HudIcon({ icon: Icon, size = 20, className, style, ...props }: HudIconProps) {
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      {...props}
      className={clsx(styles.icon, className)}
      style={{ width: size, height: size, ...style }}
    />
  )
}
