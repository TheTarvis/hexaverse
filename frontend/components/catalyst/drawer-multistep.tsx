import type React from 'react'
import { Drawer, type DrawerProps } from './drawer'
import { Button } from './button'
import { CheckIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'

export interface Step {
  id: string
  label: string
  isComplete?: boolean
  isOptional?: boolean
}

export interface DrawerMultiStepProps
  extends Omit<DrawerProps, 'footer' | 'preventClose' | 'title' | 'description'> {
  // Content
  title: React.ReactNode
  description?: React.ReactNode

  // Steps
  steps: Step[]
  currentStep: number
  onStepChange?: (stepIndex: number) => void

  // Form handling
  onSubmit: (e: React.FormEvent) => void

  // Step navigation
  onNext?: () => void | Promise<void>
  onBack?: () => void
  canGoNext?: boolean
  canGoBack?: boolean

  // Final step
  submitLabel?: string
  isSubmitting?: boolean

  // Customization
  showStepIndicator?: boolean
  allowStepClick?: boolean // Allow clicking steps to navigate

  // Dirty state tracking (inherited from DrawerProps but listed here for visibility)
  // isDirty?: boolean - Already in DrawerProps, no need to redeclare
}

/**
 * DrawerMultiStep - A specialized drawer component for multi-step forms
 *
 * Use this component for complex wizards and multi-step processes like:
 * - Connection creation with multiple configuration steps
 * - Entity creation with schema mapping
 * - Import flows_old with preview and confirmation
 *
 * Features:
 * - Step indicator in header showing progress
 * - Next/Back navigation buttons
 * - Skip optional steps
 * - Validate before advancing
 * - Auto-detects final step (shows Submit instead of Next)
 * - Prevents close during submission
 * - Confirms close if form is dirty
 * - Optional clickable steps for navigation
 *
 * @example
 * ```tsx
 * const steps = [
 *   { id: 'basic', label: 'Basic Info' },
 *   { id: 'config', label: 'Configuration' },
 *   { id: 'confirm', label: 'Confirm' },
 * ]
 *
 * <DrawerMultiStep
 *   open={open}
 *   onClose={onClose}
 *   title="Create BigQuery Connection"
 *   description="Configure your BigQuery data source"
 *   steps={steps}
 *   currentStep={currentStep}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   onSubmit={handleSubmit}
 *   canGoNext={isStepValid}
 *   isDirty={isDirty}
 *   isSubmitting={mutation.isPending}
 *   size="2xl"
 * >
 *   {renderCurrentStep()}
 * </DrawerMultiStep>
 * ```
 */
export function DrawerMultiStep({
  steps,
  currentStep,
  onStepChange,
  onSubmit,
  onNext,
  onBack,
  canGoNext = true,
  canGoBack = true,
  submitLabel = 'Create',
  isSubmitting = false,
  showStepIndicator = true,
  allowStepClick = false,
  children,
  onClose,
  title,
  description,
  isDirty, // Extract isDirty to pass to Drawer
  ...drawerProps
}: DrawerMultiStepProps) {
  const isLastStep = currentStep === steps.length - 1

  // Handle next button click
  const handleNext = async () => {
    if (onNext) {
      await onNext()
    }
  }

  // Handle back button click
  const handleBack = () => {
    if (onBack) {
      onBack()
    }
  }

  // Handle form submission on final step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLastStep && !isSubmitting) {
      onSubmit(e)
    }
  }

  // Handle step click if allowed
  const handleStepClick = (stepIndex: number) => {
    if (allowStepClick && onStepChange) {
      onStepChange(stepIndex)
    }
  }

  return (
    <Drawer
      {...drawerProps}
      onClose={onClose}
      preventClose={isSubmitting}
      isDirty={isDirty}
      title={
        <div>
          {/* Title and description */}
          <div>
            {typeof title === 'string' ? (
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{title}</h2>
            ) : (
              title
            )}
            {description && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {typeof description === 'string' ? description : description}
              </p>
            )}
          </div>

          {/* Step Indicator */}
          {showStepIndicator && (
            <div className="mt-6 flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  {/* Step Circle */}
                  <button
                    type="button"
                    onClick={() => handleStepClick(index)}
                    disabled={!allowStepClick}
                    className={clsx(
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      index === currentStep &&
                        'bg-indigo-600 text-white dark:bg-indigo-500',
                      index < currentStep &&
                        'bg-green-600 text-white dark:bg-green-500',
                      index > currentStep &&
                        'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
                      allowStepClick && 'cursor-pointer hover:opacity-80',
                      !allowStepClick && 'cursor-default'
                    )}
                  >
                    {index < currentStep ? (
                      <CheckIcon className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </button>

                  {/* Step Label */}
                  <span
                    className={clsx(
                      'ml-2 text-sm font-medium',
                      index === currentStep && 'text-zinc-950 dark:text-white',
                      index !== currentStep && 'text-zinc-500 dark:text-zinc-400'
                    )}
                  >
                    {step.label}
                    {step.isOptional && (
                      <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">
                        (Optional)
                      </span>
                    )}
                  </span>

                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div
                      className={clsx(
                        'mx-3 h-0.5 w-12 transition-colors',
                        index < currentStep
                          ? 'bg-green-600 dark:bg-green-500'
                          : 'bg-zinc-200 dark:bg-zinc-700'
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      }
      footer={
        <div className="flex w-full justify-between">
          {/* Left side: Back button */}
          <div>
            {currentStep > 0 && canGoBack && (
              <Button plain onClick={handleBack} disabled={isSubmitting}>
                Back
              </Button>
            )}
          </div>

          {/* Right side: Cancel + Next/Submit */}
          <div className="flex gap-3">
            <Button plain onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              color="indigo"
              onClick={isLastStep ? handleFormSubmit : handleNext}
              disabled={isSubmitting || !canGoNext}
            >
              {isSubmitting ? 'Saving...' : isLastStep ? submitLabel : 'Next'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {children}
      </form>
    </Drawer>
  )
}
