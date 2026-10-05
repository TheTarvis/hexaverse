import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState, type ReactNode } from 'react'
import { ConsoleDock } from './ConsoleDock'

// RED-PHASE TESTS - openspec change add-console-dock, tasks 1.1-1.5
// (system-console: "The Console Dock Extends Beneath the Strip...", "The Dock
// Carries These Tabs", "The Dock Is Keyboard-Operable").
//
// The shell is rendered STANDALONE, nothing mocked. `Harness` plays the
// owner: it holds { expanded, openSeq } and wires onOpen/onCollapse exactly as
// the impl contract (section 3.1) specifies for the view. Not shown is an
// attribute (the `hidden` attribute), never an absence (contract 1.4).

function Harness({
  initialExpanded = false,
  label = 'Log',
  children,
}: {
  initialExpanded?: boolean
  label?: string
  children?: ReactNode
}) {
  const [state, setState] = useState({ expanded: initialExpanded, openSeq: 0 })
  return (
    <ConsoleDock
      expanded={state.expanded}
      openSeq={state.openSeq}
      onOpen={() => setState((d) => ({ expanded: true, openSeq: d.openSeq + 1 }))}
      onCollapse={() => setState((d) => ({ ...d, expanded: false }))}
      strip={
        <div data-testid="vitals-strip">
          <button data-testid="strip-probe" />
        </div>
      }
      tabs={[{ id: 'log', label, content: children }]}
    />
  )
}

function Rows() {
  return (
    <div data-testid="stub-log">
      <button data-testid="stub-row-1">row 1</button>
      <button data-testid="stub-row-2">row 2</button>
      <button data-testid="stub-row-3">row 3</button>
      <button data-testid="stub-load-more">Load more</button>
    </div>
  )
}

function TwoButtons() {
  return (
    <div>
      <button data-testid="child-a">a</button>
      <button data-testid="child-b">b</button>
    </div>
  )
}

const open = () => screen.getByTestId('console-dock-open')
const region = () => screen.getByTestId('console-dock-region')
const collapse = () => screen.getByTestId('console-dock-collapse')
const tab = () => screen.getByTestId('console-tab-log')
const panel = () => screen.getByTestId('console-panel-log')

function expectHidden(el: HTMLElement) {
  expect(el).toHaveAttribute('hidden')
  expect(el).not.toBeVisible()
}
/** Not shown because an ancestor (the region) carries `hidden`. */
function expectHiddenWithin(el: HTMLElement) {
  expect(el.closest('[hidden]')).not.toBeNull()
  expect(el).not.toBeVisible()
}
function expectShown(el: HTMLElement) {
  expect(el).not.toHaveAttribute('hidden')
  expect(el).toBeVisible()
}

/** Tab from `document.body` until focus returns to the body; the testids met, in order. */
async function walk(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  ;(document.activeElement as HTMLElement | null)?.blur()
  const seen: string[] = []
  for (let i = 0; i < 12; i++) {
    await user.tab()
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) break
    seen.push(el.getAttribute('data-testid') ?? el.tagName)
  }
  return seen
}

describe('ConsoleDock - task 1.1 collapsed and expanded rendering', () => {
  it('Scenario: Activating the Console control expands the dock / Scenario: Activating the collapse control returns the dock to the strip alone', async () => {
    const user = userEvent.setup()
    render(<Harness>{<Rows />}</Harness>)

    // collapsed: the strip and the Console control shown; the whole region hidden
    expect(screen.getByTestId('vitals-strip')).toBeVisible()
    expectShown(open())
    expectHidden(region())

    await user.click(open())

    // expanded: region shown with tab bar, panel and collapse control; the open control is hidden
    expectShown(region())
    expect(screen.getByRole('tablist')).toBeVisible()
    expectShown(panel())
    expectShown(collapse())
    expectShown(tab())
    expectHidden(open())
    expect(screen.getByTestId('vitals-strip')).toBeVisible()

    await user.click(collapse())

    // back to the strip alone
    expectShown(open())
    expectHidden(region())
    expectHiddenWithin(tab())
    expectHiddenWithin(collapse())
    expectHiddenWithin(panel())
    expect(screen.getByTestId('vitals-strip')).toBeVisible()
  })
})

describe('ConsoleDock - task 1.2 the tab bar', () => {
  it('Scenario: The tab bar lists the Log tab and no other / Scenario: The Log tab is selected and its panel is shown / Scenario: The Log tab\'s label carries no count however many rows are listed (standalone half)', () => {
    render(
      <Harness initialExpanded>
        <Rows />
      </Harness>,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toHaveTextContent(/^Log$/)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    // its controlled panel is the one that is shown, and holds the child
    const controlled = document.getElementById(tabs[0].getAttribute('aria-controls') ?? '')
    expect(controlled).toBe(panel())
    expect(controlled).toBeVisible()
    expect(within(panel()).getByTestId('stub-log')).toBeVisible()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)

    // three rows and a load-more control in the child: the label carries no digit
    expect(within(panel()).getAllByTestId(/^stub-row-/)).toHaveLength(3)
    expect(within(panel()).getByTestId('stub-load-more')).toBeInTheDocument()
    expect(tabs[0].textContent).not.toMatch(/\d/)
  })
})

describe('ConsoleDock - task 1.3 roles and attributes (read only)', () => {
  it('Scenario: The expand and collapse controls expose their state', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        <Rows />
      </Harness>,
    )

    // collapsed
    expect(open()).toHaveAttribute('type', 'button')
    expect(open()).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(open().getAttribute('aria-controls') ?? '')).toBe(region())
    expect(screen.getByRole('button', { name: 'Console' })).toBe(open())
    expect(collapse()).toHaveAttribute('type', 'button')
    expect(collapse()).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(collapse().getAttribute('aria-controls') ?? '')).toBe(region())
    expect(collapse()).toHaveAttribute('aria-label', 'Collapse console')

    await user.click(open())

    // expanded: both values are fixed by control, not by state
    expect(open()).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(open().getAttribute('aria-controls') ?? '')).toBe(region())
    expect(collapse()).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(collapse().getAttribute('aria-controls') ?? '')).toBe(region())
    expect(screen.getByRole('button', { name: 'Collapse console' })).toBe(collapse())
  })

  it('Scenario: The tab bar is a tab list controlling the panel', () => {
    render(
      <Harness initialExpanded>
        <Rows />
      </Harness>,
    )
    const list = screen.getByRole('tablist')
    expect(within(list).getByRole('tab')).toBe(tab())
    expect(tab()).toHaveAttribute('type', 'button')
    expect(tab()).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById(tab().getAttribute('aria-controls') ?? '')).toBe(panel())
    // the collapse control is the tab list's sibling, never its child
    expect(list.contains(collapse())).toBe(false)
  })

  it('Scenario: The shown panel is exposed as the Log tab\'s panel and has an accessible name', () => {
    render(
      <Harness initialExpanded>
        <Rows />
      </Harness>,
    )
    expect(panel()).toHaveAttribute('role', 'tabpanel')
    expect(document.getElementById(panel().getAttribute('aria-labelledby') ?? '')).toBe(tab())
    expect(screen.getByRole('tabpanel', { name: 'Log' })).toBe(panel())
  })

  it('Scenario: Each dock control shows a visible focus indicator (class tokens on each of the three controls)', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        <Rows />
      </Harness>,
    )
    for (const el of [open(), tab(), collapse()]) {
      expect(el).toHaveClass('focus-visible:outline-2', 'min-h-6', 'min-w-6')
    }
    await user.click(open())
    for (const el of [open(), tab(), collapse()]) {
      expect(el).toHaveClass('focus-visible:outline-2', 'min-h-6', 'min-w-6')
    }
  })

  it('Scenario: The expand and collapse controls expose their state (the expanded dock holds no other interactive element: no resize control)', () => {
    render(
      <Harness initialExpanded>
        <TwoButtons />
      </Harness>,
    )
    const interactive = Array.from(
      region().querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'),
    )
    expect(interactive.map((el) => el.getAttribute('data-testid'))).toEqual([
      'console-tab-log',
      'console-dock-collapse',
      'child-a',
      'child-b',
    ])
    // SDET-added (contract 1.2): no positive tabindex anywhere in the dock; the panel takes no tabindex
    const root = screen.getByTestId('console-dock')
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[tabindex]'))) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0)
    }
    expect(panel()).not.toHaveAttribute('tabindex')
    // SDET-added (contract 1.2): the dock itself announces nothing
    expect(root.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')).toHaveLength(0)
    // SDET-added (contract 1.3): the panel is the scroll container; the region is a flex container
    expect(panel()).toHaveClass('overflow-y-auto')
    expect(region()).toHaveClass('flex')
  })
})

describe('ConsoleDock - task 1.4 keyboard activation and the Tab walk', () => {
  it('Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard (Enter on Console)', async () => {
    const user = userEvent.setup()
    render(<Harness><TwoButtons /></Harness>)
    open().focus()
    await user.keyboard('{Enter}')
    expectShown(region())
    expectHidden(open())
  })

  it('Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard (Space on Console)', async () => {
    const user = userEvent.setup()
    render(<Harness><TwoButtons /></Harness>)
    open().focus()
    await user.keyboard(' ')
    expectShown(region())
    expectHidden(open())
  })

  it('Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard (Enter on collapse)', async () => {
    const user = userEvent.setup()
    render(<Harness initialExpanded><TwoButtons /></Harness>)
    collapse().focus()
    await user.keyboard('{Enter}')
    expectHidden(region())
    expectShown(open())
  })

  it('Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard (Space on collapse)', async () => {
    const user = userEvent.setup()
    render(<Harness initialExpanded><TwoButtons /></Harness>)
    collapse().focus()
    await user.keyboard(' ')
    expectHidden(region())
    expectShown(open())
  })

  it('Scenario: Each dock control is reachable by Tab (collapsed: the Console control is reached, neither the Log tab nor the collapse control is)', async () => {
    const user = userEvent.setup()
    render(<Harness><TwoButtons /></Harness>)
    expect(await walk(user)).toEqual(['strip-probe', 'console-dock-open'])
  })

  it('Scenario: Tab from the Log tab reaches the collapse control and then the panel\'s controls (expanded: tab, collapse, then the child\'s two controls, each once, in order)', async () => {
    const user = userEvent.setup()
    render(<Harness initialExpanded><TwoButtons /></Harness>)
    expect(await walk(user)).toEqual([
      'strip-probe',
      'console-tab-log',
      'console-dock-collapse',
      'child-a',
      'child-b',
    ])
  })
})

describe('ConsoleDock - task 1.5 focus', () => {
  it('Scenario: Expanding moves keyboard focus to the selected tab', async () => {
    const user = userEvent.setup()
    render(<Harness><TwoButtons /></Harness>)
    open().focus()
    expect(document.activeElement).toBe(open())
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(tab())
  })

  it('Scenario: Collapsing with the collapse control moves focus to the Console control', async () => {
    const user = userEvent.setup()
    render(<Harness initialExpanded><TwoButtons /></Harness>)
    // reach the collapse control by Tab, as a keyboard user does
    for (let i = 0; i < 6 && document.activeElement !== collapse(); i++) await user.tab()
    expect(document.activeElement).toBe(collapse())
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(open())
    expect(document.activeElement).not.toBe(document.body)
  })
})
