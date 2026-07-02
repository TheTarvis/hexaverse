# DropdownV2 Component

A refined, elegant dropdown component that strictly adheres to Flywheel's color palette guidelines with smooth spring-based animations and delightful interactions.

## Features

### Design Excellence
- **Color Palette Compliance**: Follows Flywheel's refined aesthetic exactly
  - Menu backgrounds: `bg-white/75 dark:bg-zinc-700/75` with `backdrop-blur-xl`
  - Hover states: `hover:bg-white dark:hover:bg-white/8`
  - Trigger backgrounds: `bg-white/80 dark:bg-white/[0.10]`
  - Soft borders: `border-zinc-200 dark:border-zinc-800/50`

- **Vibrant Gradient Icons**: Following the palette's icon-only gradient rule
  - Sky/Blue: Primary actions, processing
  - Emerald/Green: Success, active states
  - Amber/Orange: Warning, pending
  - Rose/Red: Error, destructive
  - Violet/Purple: Special features
  - All gradients include matching colored shadows

- **Spring Physics Animations**:
  - Smooth open/close with spring stiffness: 500, damping: 30
  - Selected indicator scales in with spring physics
  - Hover states with smooth 150ms transitions

### Functionality
- **Full Keyboard Navigation**:
  - `Enter/Space`: Open dropdown or select option
  - `Escape`: Close dropdown
  - `↑/↓`: Navigate options (skips disabled)
  - `Tab`: Close and move to next element

- **Mouse Interactions**:
  - Click trigger to toggle
  - Click option to select
  - Click outside to close
  - Hover to focus

- **States**:
  - Default, Hover, Focus, Open, Disabled
  - Error state with rose-colored styling
  - Selected state with gradient check icon
  - Disabled options (visual + functional)

- **Accessibility**:
  - ARIA attributes (haspopup, expanded, selected)
  - Keyboard navigation
  - Focus management
  - Screen reader friendly
  - data-testid support

## Usage

### Basic Example

```tsx
import { DropdownV2 } from '@/components/catalyst/dropdown-v2'
import { CloudIcon } from '@heroicons/react/16/solid'

const options = [
  {
    value: 'aws',
    label: 'Amazon Web Services',
    description: 'S3, DynamoDB, Lambda',
    icon: CloudIcon,
    gradient: 'amber',
  },
  {
    value: 'gcp',
    label: 'Google Cloud Platform',
    description: 'Firestore, Cloud Functions',
    icon: ServerIcon,
    gradient: 'sky',
  },
]

const [value, setValue] = useState<string>()

<DropdownV2
  options={options}
  value={value}
  onChange={setValue}
  placeholder="Select a cloud provider"
/>
```

### With Label and Description

```tsx
<DropdownV2
  options={options}
  value={value}
  onChange={setValue}
  label="Cloud Provider"
  description="Choose your preferred cloud infrastructure"
  placeholder="Select a provider"
/>
```

### With Error State

```tsx
<DropdownV2
  options={options}
  value={value}
  onChange={setValue}
  label="Database"
  error="Please select a database to continue"
/>
```

### Disabled State

```tsx
<DropdownV2
  options={options}
  value={value}
  onChange={setValue}
  disabled
/>
```

### Status Indicators

```tsx
const statusOptions = [
  {
    value: 'active',
    label: 'Active',
    description: 'Connection is running',
    icon: BoltIcon,
    gradient: 'emerald', // Green for success
  },
  {
    value: 'pending',
    label: 'Pending',
    description: 'Waiting to start',
    icon: CogIcon,
    gradient: 'amber', // Orange for warning
  },
  {
    value: 'error',
    label: 'Error',
    description: 'Connection failed',
    icon: CloudIcon,
    gradient: 'rose', // Red for error
  },
]
```

## Search and Filtering

DropdownV2 supports optional search/filter functionality for large option lists. This is opt-in via the `searchable` prop.

### Basic Search

Enable search with the `searchable` prop:

```tsx
<DropdownV2
  options={options}
  value={value}
  onChange={setValue}
  searchable
  searchPlaceholder="Search options..."
  label="Select Database"
  description="Filter options by typing"
/>
```

When `searchable={true}`:
- Search input appears at the top of the dropdown menu
- Options filter as you type
- Default filter matches both label and description (case-insensitive)
- Search input auto-focuses when menu opens (if `openOnFocus` enabled)
- Keyboard navigation works between search input and options

### Custom Filter

Provide a custom filter function for advanced filtering:

```tsx
<DropdownV2
  options={schemaOptions}
  value={selectedSchema}
  onChange={setSelectedSchema}
  searchable
  searchPlaceholder="Search schemas..."
  filter={(option, query) => {
    const lowerQuery = query.toLowerCase()
    return (
      option.label.toLowerCase().includes(lowerQuery) ||
      option.description?.toLowerCase().includes(lowerQuery) ||
      // Custom: also search by schema ID
      option.value.toLowerCase().includes(lowerQuery)
    )
  }}
/>
```

### Create Custom Values

Allow users to create custom values when no match is found:

```tsx
const [tags, setTags] = useState(tagOptions)
const [selectedTag, setSelectedTag] = useState<string>()

<DropdownV2
  options={tags}
  value={selectedTag}
  onChange={setSelectedTag}
  searchable
  searchPlaceholder="Search or create tag..."
  onCustomValueCreate={(query) => {
    const newTag = {
      value: query.toLowerCase().replace(/\s+/g, '-'),
      label: query,
      gradient: 'violet' as const
    }
    setTags([...tags, newTag])
    setSelectedTag(newTag.value)
  }}
  createLabel={(query) => `Create tag "${query}"`}
  label="Tags"
/>
```

When `onCustomValueCreate` is provided:
- "Create" button appears when query doesn't match any existing option
- Styled with violet gradient (special action)
- Separated by border-top
- Click or Enter to create
- Custom label via `createLabel` prop

### Keyboard Navigation with Search

| Key | Behavior |
|-----|----------|
| Any letter (when closed) | Open dropdown + focus search + start typing |
| Enter/Space on trigger | Open dropdown + focus search input |
| ArrowDown from input | Move to first option |
| ArrowUp from first option | Move back to search input |
| Enter in search input | Select focused option or create custom value |
| Escape with text | Clear search query |
| Escape without text | Close dropdown |

### Search Configuration

```typescript
<DropdownV2
  searchable              // Enable search
  searchPlaceholder="Search..."  // Placeholder for search input
  openOnFocus={true}     // Auto-focus search when dropdown opens
  noResultsMessage="No matching options found"  // Custom empty state
  filter={(option, query) => { /* custom */ }}  // Custom filter function
  onCustomValueCreate={(query) => { /* create */ }}  // Enable custom values
  createLabel={(query) => `Create "${query}"`}  // Custom create label
/>
```

### Real-World Examples

**Schema Selection:**
```tsx
const schemaOptions: DropdownOption<string>[] = schemas.map(schema => ({
  value: schema.schemaId,
  label: generateSchemaDisplayName(schema),
  description: getSchemaDescription(schema),
}))

<DropdownV2
  options={schemaOptions}
  value={selectedSchemaId}
  onChange={setSelectedSchemaId}
  searchable
  searchPlaceholder="Search schemas..."
  filter={(option, query) => {
    const lowerQuery = query.toLowerCase()
    return (
      option.label.toLowerCase().includes(lowerQuery) ||
      option.description?.toLowerCase().includes(lowerQuery)
    )
  }}
/>
```

**Field Selection:**
```tsx
const fieldOptions: DropdownOption<string>[] = fields.map(field => ({
  value: field,
  label: field,
}))

<DropdownV2
  options={fieldOptions}
  value={selectedField}
  onChange={setSelectedField}
  searchable
  searchPlaceholder="Search fields..."
  // Uses default filter (label-based)
/>
```

## Props

```typescript
interface DropdownV2Props<T = string> {
  // Required
  options: DropdownOption<T>[]

  // Optional - Basic
  value?: T
  onChange?: (value: T) => void
  placeholder?: string
  label?: string
  description?: string
  error?: string
  disabled?: boolean
  className?: string
  'data-testid'?: string

  // Optional - Search/Filter
  searchable?: boolean
  searchPlaceholder?: string
  filter?: (option: DropdownOption<T>, query: string) => boolean
  onCustomValueCreate?: (query: string) => void
  createLabel?: (query: string) => string
  openOnFocus?: boolean
  noResultsMessage?: string
}

interface DropdownOption<T = string> {
  value: T
  label: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  gradient?: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'
  disabled?: boolean
}
```

## Gradient Color Mapping

Following Flywheel's semantic color system:

| Gradient | Use Case | Example |
|----------|----------|---------|
| `sky` | Primary actions, info, processing | Database, general features |
| `emerald` | Success, active, completed | Active connections, syncing |
| `amber` | Warning, pending, attention | Pending actions, warnings |
| `rose` | Error, failed, destructive | Failed connections, errors |
| `violet` | Premium, special features | Advanced features, highlights |

## Color Palette Adherence

### Backgrounds
- **Page**: `bg-zinc-50 dark:bg-zinc-700`
- **Trigger**: `bg-white/80 dark:bg-white/[0.10]` with `backdrop-blur-sm`
- **Menu**: `bg-white/75 dark:bg-zinc-700/75` with `backdrop-blur-xl`
- **Hover**: `hover:bg-white dark:hover:bg-white/8`

### Borders
- **Default**: `border-zinc-200 dark:border-zinc-800/50`
- **Focus**: `ring-2 ring-sky-500/20 dark:ring-sky-400/20`
- **Error**: `border-rose-500/40 dark:border-rose-500/40`

### Text
- **Primary**: `text-zinc-900 dark:text-white`
- **Secondary**: `text-zinc-600 dark:text-zinc-400`
- **Muted**: `text-zinc-500 dark:text-zinc-500`
- **Selected**: `text-sky-600 dark:text-sky-400`
- **Error**: `text-rose-600 dark:text-rose-400`

### Shadows
- **Cards**: `shadow-xl` for menu
- **Gradient Icons**: `shadow-lg shadow-{color}-500/20` (e.g., `shadow-sky-500/20`)
- **Selected Badge**: `shadow-lg shadow-sky-500/30`

## Animation Details

### Menu Open/Close
```typescript
// Open
initial: { opacity: 0, y: -8, scale: 0.96 }
animate: {
  opacity: 1,
  y: 0,
  scale: 1,
  transition: {
    type: 'spring',
    stiffness: 500,
    damping: 30,
    mass: 0.8,
  },
}

// Close
exit: {
  opacity: 0,
  y: -8,
  scale: 0.96,
  transition: { duration: 0.15 },
}
```

### Selected Badge
```typescript
initial: { scale: 0, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: {
  type: 'spring',
  stiffness: 500,
  damping: 25,
}
```

### Chevron Rotation
```css
transition: transform 200ms
rotate-0 → rotate-180
```

## Testing

The component includes comprehensive data-testid support:

```tsx
<DropdownV2
  options={options}
  data-testid="my-dropdown"
/>

// Generates:
// [data-testid="my-dropdown"] - Container
// [data-testid="my-dropdown-trigger"] - Trigger button
// [data-testid="my-dropdown-menu"] - Menu container
// [data-testid="my-dropdown-option-{value}"] - Each option
```

### Test Example

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { DropdownV2 } from './dropdown-v2'

test('selects option on click', async () => {
  const handleChange = jest.fn()

  render(
    <DropdownV2
      options={options}
      onChange={handleChange}
      data-testid="test-dropdown"
    />
  )

  // Open dropdown
  fireEvent.click(screen.getByTestId('test-dropdown-trigger'))

  // Select option
  fireEvent.click(screen.getByTestId('test-dropdown-option-aws'))

  expect(handleChange).toHaveBeenCalledWith('aws')
})
```

## Accessibility Features

- Full keyboard navigation with arrow keys
- Proper ARIA roles and attributes
- Focus management (returns to trigger on close)
- Skip disabled options in keyboard navigation
- Screen reader announcements
- Visible focus indicators

## Comparison to Old Dropdowns

### Why Start Fresh?

The old dropdown/combobox/listbox components had:
- Outdated color schemes (not following the refined palette)
- Inconsistent backgrounds and transparency
- Missing backdrop blur effects
- Generic animations (no spring physics)
- Inconsistent gradient usage
- Mixed dark mode support

### DropdownV2 Improvements

- ✅ Strict adherence to Flywheel color palette
- ✅ Consistent `bg-white/75 dark:bg-zinc-700/75` with `backdrop-blur-xl`
- ✅ Gradient icons with matching shadows (icon-only, never backgrounds)
- ✅ Spring-based physics for delightful motion
- ✅ Both light and dark modes fully designed
- ✅ Refined, elegant aesthetic
- ✅ Modern interaction patterns
- ✅ Comprehensive accessibility

## Demo

View the live demo at `/dropdown-v2-demo` to see:
- Various configurations (cloud, database, status, features)
- Error and disabled states
- Keyboard navigation
- Light and dark mode
- All gradient color options
- Smooth animations

## Future Enhancements

Potential additions (if needed):
- Multi-select variant
- Custom option rendering beyond icon + label + description
- Option groups/categories
- Virtualization for very long lists (1000+ items)
- Custom positioning (top/bottom/left/right)

## Related Components

- `Combobox` (old) - Legacy searchable dropdown (being replaced by DropdownV2 with searchable)
- `Dropdown` (old) - Legacy dropdown component
- `Select` (old) - Legacy select component

**Migration Note:** DropdownV2 with `searchable={true}` replaces the old Combobox component with better dark mode colors and a cleaner API.

## References

- [Flywheel Color Palette](../../../docs/design/color-palette.md)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Headless UI Patterns](https://headlessui.com/react/menu)
