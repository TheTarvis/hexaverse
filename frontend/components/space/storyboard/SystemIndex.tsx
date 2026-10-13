import { SystemObjectIndex } from '../SystemObjectIndex'
import type { ComponentProps } from 'react'

export type { IndexedObject } from '../SystemObjectIndex'

export function SystemIndex(props: ComponentProps<typeof SystemObjectIndex>) {
  return <SystemObjectIndex systemName="Solace" tutorialTarget="Nereid" plotHint="This walkthrough plots its first course to Nereid." {...props} canPlot={props.canPlot && props.selected === 'Nereid'} />
}
