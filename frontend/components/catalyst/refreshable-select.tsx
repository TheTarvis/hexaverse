'use client'

import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Select } from './select'
import { Button } from './button'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export interface RefreshableSelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'children'> {
  /** Current selected value */
  value: string
  /** Change handler */
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  /** Options to display in the dropdown */
  options: Array<{
    value: string
    label: string
    disabled?: boolean
  }>
  /** Placeholder text when no option is selected */
  placeholder?: string
  /** Loading state */
  isLoading?: boolean
  /** Error state */
  hasError?: boolean
  /** Refresh handler */
  onRefresh?: () => void
  /**
   * Test ID for the component. If provided, generates test IDs:
   * - Wrapper div: `{testId}`
   * - Select element: `{testId}-select`
   * - Refresh button: `{testId}-refresh-button`
   */
  testId?: string
}

/**
 * RefreshableSelect - Catalyst component combining a Select dropdown with a Refresh button
 *
 * A reusable pattern extracted from BigQuery config components that provides:
 * - Select dropdown with loading/error states
 * - Refresh button with spinning indicator
 * - Flexible layout with flex-1 dropdown and flex-shrink-0 button
 * - Empty and error state messaging
 *
 * @example
 * ```tsx
 * const { data: datasets, isLoading, error, refetch } = useDatasets()
 *
 * <RefreshableSelect
 *   value={datasetId}
 *   onChange={(e) => setDatasetId(e.target.value)}
 *   options={datasets.map(d => ({ value: d.id, label: d.name }))}
 *   placeholder="Select a dataset..."
 *   isLoading={isLoading}
 *   hasError={!!error}
 *   onRefresh={() => void refetch()}
 *   testId="dataset-field"
 * />
 * ```
 */
export const RefreshableSelect = forwardRef<HTMLSelectElement, RefreshableSelectProps>(
  function RefreshableSelect(
    {
      value,
      onChange,
      options,
      placeholder = 'Select an option...',
      isLoading = false,
      hasError = false,
      onRefresh,
      testId,
      disabled,
      required,
      className,
      ...props
    },
    ref
  ) {
    // Determine the placeholder text based on state
    const getPlaceholderText = () => {
      if (isLoading) return 'Loading...'
      if (hasError) return 'Error loading data'
      return placeholder
    }

    return (
      <div className="flex gap-2" data-testid={testId}>
        <Select
          ref={ref}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled || isLoading || hasError}
          data-testid={testId ? `${testId}-select` : 'refreshable-select-undefined'}
          className={className ? `flex-1 ${className}` : 'flex-1'}
          {...props}
        >
          <option value="">{getPlaceholderText()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </Select>

        {onRefresh && (
          <Button
            type="button"
            outline
            onClick={onRefresh}
            disabled={isLoading || disabled}
            data-testid={testId ? `${testId}-refresh-button` : undefined}
            className="flex-shrink-0"
          >
            {isLoading ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    )
  }
)