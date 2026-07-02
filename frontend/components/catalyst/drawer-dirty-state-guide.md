# Drawer Dirty State & ConsentModal Guide

This guide explains how to use the `isDirty` prop with `DrawerForm` and `DrawerMultiStep` to show unsaved changes warnings using the `ConsentModal` component.

## How It Works

When a drawer has the `isDirty={true}` prop and the user tries to close it (via X button, Cancel button, clicking outside, or pressing Escape), a `ConsentModal` will automatically appear asking the user to confirm they want to discard their unsaved changes.

## DrawerForm Example

```tsx
import { useState } from 'react'
import { DrawerForm } from '@/components/catalyst/drawer-form'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'

function EditItemDrawer({ open, onClose, item }) {
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description)

  // Track if form has been modified
  const isDirty = name !== item.name || description !== item.description

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateItem({ id: item.id, name, description })
    onClose()
  }

  return (
    <DrawerForm
      open={open}
      onClose={onClose}
      title="Edit Item"
      onSubmit={handleSubmit}
      isDirty={isDirty} // 🎯 This triggers the consent modal
      mode="edit"
    >
      <Field>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </DrawerForm>
  )
}
```

## DrawerMultiStep Example

```tsx
import { useState } from 'react'
import { DrawerMultiStep } from '@/components/catalyst/drawer-multistep'

function CreateConnectionDrawer({ open, onClose }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    config: {},
  })

  // Track if user has started filling out the form
  const isDirty = formData.name !== '' || formData.type !== ''

  const steps = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'config', label: 'Configuration' },
    { id: 'confirm', label: 'Confirm' },
  ]

  const handleSubmit = async () => {
    await createConnection(formData)
    onClose()
  }

  return (
    <DrawerMultiStep
      open={open}
      onClose={onClose}
      title="Create Connection"
      steps={steps}
      currentStep={currentStep}
      onNext={() => setCurrentStep(currentStep + 1)}
      onBack={() => setCurrentStep(currentStep - 1)}
      onSubmit={handleSubmit}
      isDirty={isDirty} // 🎯 This triggers the consent modal
    >
      {/* Step content */}
    </DrawerMultiStep>
  )
}
```

## Dirty State Tracking Strategies

### Strategy 1: Compare to Original Values

```tsx
const isDirty =
  name !== originalItem.name ||
  description !== originalItem.description
```

**Use when**: Editing existing data

### Strategy 2: Check if Any Field is Filled

```tsx
const isDirty =
  name !== '' ||
  description !== '' ||
  selectedOption !== null
```

**Use when**: Creating new data

### Strategy 3: Using Form Libraries

```tsx
import { useForm } from 'react-hook-form'

const { formState: { isDirty } } = useForm({
  defaultValues: item
})

// Pass isDirty directly to drawer
<DrawerForm isDirty={isDirty} ... />
```

**Use when**: Using form validation libraries

### Strategy 4: Custom Dirty Tracker

```tsx
const [isDirty, setIsDirty] = useState(false)

const handleChange = (field: string, value: any) => {
  setFormData({ ...formData, [field]: value })
  setIsDirty(true) // Mark as dirty on any change
}

const handleSubmit = async () => {
  await saveData()
  setIsDirty(false) // Clear dirty flag after save
  onClose()
}
```

**Use when**: Need explicit control over dirty state

## Important Notes

### 1. Dirty State is Automatically Cleared on Successful Submit

When the user clicks the submit button and the form is successfully saved, the drawer will close **without** showing the consent modal, even if `isDirty={true}`.

This is because the user explicitly saved their changes, so there are no "unsaved" changes anymore.

### 2. Prevent Close During Submission

Use `isSubmitting` to prevent closing while saving:

```tsx
<DrawerForm
  isDirty={isDirty}
  isSubmitting={mutation.isPending} // Disables close during save
  onSubmit={handleSubmit}
/>
```

### 3. Custom Consent Modal (Advanced)

If you need custom consent logic, use `onConfirmClose`:

```tsx
<DrawerForm
  isDirty={isDirty}
  onConfirmClose={() => {
    // Custom consent logic
    if (hasImportantChanges()) {
      setShowCustomWarning(true)
    } else {
      onClose()
    }
  }}
/>
```

When `onConfirmClose` is provided, the default `ConsentModal` is **not** shown. You're responsible for handling the confirmation.

## What Triggers the Consent Modal?

The consent modal appears when `isDirty={true}` and the user attempts to close via:

- ✅ Clicking the X button in the drawer header
- ✅ Clicking the Cancel button in the footer
- ✅ Clicking outside the drawer (if `closeOnClickOutside={true}`)
- ✅ Pressing the Escape key
- ❌ Clicking the submit button (closes normally after save)

## Consent Modal Behavior

When the consent modal appears:

1. **User clicks "Discard Changes"**: Drawer closes immediately, changes are lost
2. **User clicks "Keep Editing"**: Modal disappears, drawer stays open, user can continue editing
3. **User clicks outside the consent modal**: Same as "Keep Editing"

## Testing

When writing tests for drawers with `isDirty`, verify:

```tsx
it('should show consent modal when closing with unsaved changes', async () => {
  const onClose = vi.fn()

  render(
    <MyDrawer
      open={true}
      onClose={onClose}
      isDirty={true}
    />
  )

  // Attempt to close
  const closeButton = screen.getByRole('button', { name: /close panel/i })
  await user.click(closeButton)

  // Consent modal should appear
  expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()

  // Drawer should NOT close yet
  expect(onClose).not.toHaveBeenCalled()

  // User confirms discard
  const discardButton = screen.getByRole('button', { name: /discard changes/i })
  await user.click(discardButton)

  // Now drawer closes
  expect(onClose).toHaveBeenCalled()
})
```

## Best Practices

1. **Always track dirty state** for forms with user input
2. **Reset dirty state after successful save**
3. **Use `isSubmitting` to prevent close during save**
4. **Test both "Discard" and "Keep Editing" flows**
5. **Don't show consent modal for read-only drawers**

## Common Pitfalls

### ❌ Forgetting to reset dirty state after save

```tsx
const handleSubmit = async () => {
  await saveData()
  onClose() // Still shows consent modal!
}
```

**Solution**: The drawer automatically handles this when you submit via the form. Just ensure `onClose()` is called after successful save.

### ❌ Setting isDirty based on pristine form

```tsx
// Wrong: This is always false for new items
const isDirty = name !== item.name // item.name is empty for new items!
```

**Solution**: For create forms, check if any field has been filled:
```tsx
const isDirty = name !== '' || description !== ''
```

### ❌ Showing consent modal on read-only drawers

```tsx
<DrawerDetails isDirty={true}> {/* Why is this dirty? */}
```

**Solution**: Only use `isDirty` for forms where users can edit data.
