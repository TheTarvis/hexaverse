import clsx from 'clsx'

type HeadingProps<Level extends 1 | 2 | 3 | 4 | 5 | 6 = 1> = {
  level?: Level
} & Omit<React.ComponentPropsWithoutRef<`h${Level}`>, 'level'>

export function Heading({ className, level = 1, ...props }: HeadingProps<1 | 2 | 3 | 4 | 5 | 6>) {
  const Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={clsx(className, 'text-2xl/8 font-semibold text-zinc-950 sm:text-xl/8 dark:text-white')}
    />
  )
}

export function Subheading({ className, level = 2, ...props }: HeadingProps<2 | 3 | 4 | 5 | 6>) {
  const Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={clsx(className, 'text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white')}
    />
  )
}
