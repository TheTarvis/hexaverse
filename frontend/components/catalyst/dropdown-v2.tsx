'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/16/solid'

export interface DropdownOption<T = string> {
  value: T
  label: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  gradient?: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'
  disabled?: boolean
}

interface DropdownV2Props<T = string> {
  options: DropdownOption<T>[]
  value?: T
  onChange?: (value: T) => void
  placeholder?: string
  label?: string
  description?: string
  error?: string
  disabled?: boolean
  className?: string
  'data-testid'?: string

  // Search/filter props
  searchable?: boolean
  searchPlaceholder?: string
  filter?: (option: DropdownOption<T>, query: string) => boolean
  onCustomValueCreate?: (query: string) => void
  createLabel?: (query: string) => string
  openOnFocus?: boolean
  noResultsMessage?: string

  // Layout props
  compact?: boolean
  hideDescriptionInButton?: boolean
}

const gradientClasses = {
  sky: 'bg-gradient-to-br from-sky-500 to-blue-500 shadow-sky-500/20',
  emerald: 'bg-gradient-to-br from-emerald-500 to-green-500 shadow-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20',
  rose: 'bg-gradient-to-br from-rose-500 to-red-500 shadow-rose-500/20',
  violet: 'bg-gradient-to-br from-violet-500 to-purple-500 shadow-violet-500/20',
}

export function DropdownV2<T = string>({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  description,
  error,
  disabled = false,
  className = '',
  'data-testid': testId,
  searchable = false,
  searchPlaceholder = 'Search...',
  filter,
  onCustomValueCreate,
  createLabel,
  openOnFocus = false,
  noResultsMessage,
  compact = false,
  hideDescriptionInButton = false,
}: DropdownV2Props<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchable || !query) return options

    // Default filter function
    const defaultFilter = (option: DropdownOption<T>, searchQuery: string): boolean => {
      if (!searchQuery.trim()) return true
      const lowerQuery = searchQuery.toLowerCase()
      return (
        option.label.toLowerCase().includes(lowerQuery) ||
        option.description?.toLowerCase().includes(lowerQuery) ||
        false
      )
    }

    const filterFn = filter || defaultFilter
    return options.filter((opt) => filterFn(opt, query))
  }, [options, query, searchable, filter])

  // Show create option when onCustomValueCreate is provided and query doesn't match
  const showCreateOption =
    searchable &&
    onCustomValueCreate &&
    query.trim() !== '' &&
    !filteredOptions.some((opt) => opt.label.toLowerCase() === query.toLowerCase())

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Auto-focus search input when menu opens
  useEffect(() => {
    if (isOpen && searchable && openOnFocus && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, searchable, openOnFocus])

  // Reset query when menu closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('')
    }
  }, [isOpen])

  // Keyboard navigation for trigger button
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    // Type to search - any letter opens and focuses search
    if (searchable && /^[a-z0-9]$/i.test(e.key) && !isOpen) {
      e.preventDefault()
      setIsOpen(true)
      setQuery(e.key)
      return
    }

    switch (e.key) {
      case 'Enter':
      case ' ':
        if (!isOpen) {
          e.preventDefault()
          setIsOpen(true)
          if (searchable) {
            setFocusedIndex(-1) // -1 = search input focused
          } else {
            setFocusedIndex(selectedOption ? options.indexOf(selectedOption) : 0)
          }
        } else if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          e.preventDefault()
          const option = filteredOptions[focusedIndex]
          if (!option.disabled) {
            onChange?.(option.value)
            setIsOpen(false)
          }
        }
        break
      case 'Escape':
        setIsOpen(false)
        setFocusedIndex(-1)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setFocusedIndex(searchable ? -1 : 0)
        } else {
          setFocusedIndex((prev) => {
            let next = prev + 1
            while (next < filteredOptions.length && filteredOptions[next].disabled) {
              next++
            }
            return next < filteredOptions.length ? next : prev
          })
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) {
          setFocusedIndex((prev) => {
            if (prev <= 0) {
              return searchable ? -1 : 0 // Go to search input or stay at first option
            }
            let next = prev - 1
            while (next >= 0 && filteredOptions[next].disabled) {
              next--
            }
            return next >= 0 ? next : (searchable ? -1 : 0)
          })
        }
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  // Keyboard navigation for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        // Move to first non-disabled option
        const firstEnabledIndex = filteredOptions.findIndex((opt) => !opt.disabled)
        if (firstEnabledIndex >= 0) {
          setFocusedIndex(firstEnabledIndex)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        // Stay in search input
        break
      case 'Enter':
        e.preventDefault()
        if (showCreateOption && onCustomValueCreate) {
          onCustomValueCreate(query)
          setQuery('')
          setIsOpen(false)
        } else if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          const option = filteredOptions[focusedIndex]
          if (!option.disabled) {
            onChange?.(option.value)
            setIsOpen(false)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        if (query) {
          setQuery('')
        } else {
          setIsOpen(false)
        }
        break
    }
  }

  const handleOptionClick = (option: DropdownOption<T>) => {
    if (option.disabled) return
    onChange?.(option.value)
    setIsOpen(false)
    setFocusedIndex(-1)
    triggerRef.current?.focus()
  }

  return (
    <div className={`relative ${isOpen ? 'z-50' : ''} ${className}`} data-testid={testId}>
      {/* Label */}
      {label && (
        <label className="mb-2 block text-sm font-medium text-zinc-900 dark:text-white">
          {label}
        </label>
      )}

      {/* Description */}
      {description && !error && (
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          group relative w-full rounded-xl border text-left transition-all duration-200
          ${compact ? 'px-3 py-1.5' : 'px-4 py-3'}
          ${
            error
              ? 'border-rose-500/40 bg-rose-500/5 dark:border-rose-500/40 dark:bg-rose-500/10'
              : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-700/90 dark:hover:bg-zinc-800'
          }
          ${isOpen ? 'ring-2 ring-sky-500/20 dark:ring-sky-400/30' : ''}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <div className={`flex items-center justify-between ${compact ? 'gap-2' : 'gap-3'}`}>
          <div className={`flex min-w-0 flex-1 items-center ${compact ? 'gap-2' : 'gap-3'}`}>
            {/* Icon or Gradient Badge */}
            {selectedOption?.icon && (
              <div
                className={`flex flex-shrink-0 items-center justify-center rounded-lg shadow-lg ${
                  compact ? 'h-6 w-6' : 'h-8 w-8'
                } ${
                  selectedOption.gradient
                    ? gradientClasses[selectedOption.gradient]
                    : 'bg-zinc-100 dark:bg-zinc-800/80'
                }`}
              >
                <selectedOption.icon
                  className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
                    selectedOption.gradient ? 'text-white' : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                />
              </div>
            )}

            {/* Selected Text */}
            <div className="min-w-0 flex-1">
              {selectedOption ? (
                <>
                  <div className={`truncate font-medium text-zinc-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
                    {selectedOption.label}
                  </div>
                  {selectedOption.description && !hideDescriptionInButton && (
                    <div className={`truncate text-zinc-500 dark:text-zinc-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                      {selectedOption.description}
                    </div>
                  )}
                </>
              ) : (
                <div className={`text-zinc-500 dark:text-zinc-400 ${compact ? 'text-xs' : 'text-sm'}`}>{placeholder}</div>
              )}
            </div>
          </div>

          {/* Chevron */}
          <ChevronDownIcon
            className={`flex-shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${compact ? 'h-4 w-4' : 'h-5 w-5'} ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Error Message */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-rose-600 dark:text-rose-400"
        >
          {error}
        </motion.p>
      )}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                type: 'spring',
                stiffness: 500,
                damping: 30,
                mass: 0.8,
              },
            }}
            exit={{
              opacity: 0,
              y: -8,
              scale: 0.96,
              transition: { duration: 0.15 },
            }}
            className="absolute z-50 mt-2 w-full origin-top"
            data-testid={testId ? `${testId}-menu` : undefined}
          >
            <div
              className="
                overflow-hidden rounded-xl border border-zinc-200 bg-white/95
                shadow-xl backdrop-blur-xl
                dark:border-zinc-800/50 dark:bg-zinc-700/95
              "
              role="listbox"
            >
              {/* Search Input */}
              {searchable && (
                <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800/50 dark:bg-zinc-700/95">
                  <div className="relative p-1.5">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={searchPlaceholder}
                      className="
                        w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-8 text-sm
                        text-zinc-900 placeholder:text-zinc-500
                        transition-all duration-200
                        focus:outline-none focus:ring-1 focus:ring-sky-500/20
                        dark:border-zinc-800/50 dark:bg-white/5 dark:text-white
                        dark:placeholder:text-zinc-400 dark:focus:ring-sky-400/20
                      "
                      data-testid={testId ? `${testId}-search-input` : undefined}
                    />
                    <MagnifyingGlassIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                  </div>
                </div>
              )}

              {/* Options List */}
              <div className="max-h-80 overflow-y-auto p-1.5">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => {
                    const isSelected = option.value === value
                    const isFocused = index === focusedIndex
                    const OptionIcon = option.icon

                    return (
                      <motion.button
                        key={String(option.value)}
                        type="button"
                        onClick={() => handleOptionClick(option)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        disabled={option.disabled}
                        initial={false}
                        animate={{
                          backgroundColor: isFocused
                            ? 'var(--hover-bg)'
                            : 'transparent',
                        }}
                        transition={{ duration: 0.15 }}
                        className={`
                          group relative w-full rounded-lg px-3 py-2.5
                          text-left transition-all duration-150
                          ${
                            option.disabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'cursor-pointer hover:bg-white dark:hover:bg-white/8'
                          }
                          ${isFocused && !option.disabled ? 'bg-white dark:bg-white/8' : ''}
                        `}
                        role="option"
                        aria-selected={isSelected}
                        data-testid={testId ? `${testId}-option-${String(option.value)}` : undefined}
                        style={
                          {
                            '--hover-bg': 'rgba(255, 255, 255, 0.5)',
                          } as React.CSSProperties
                        }
                      >
                        <div className="flex items-center gap-3">
                          {/* Icon or Gradient Badge */}
                          {OptionIcon && (
                            <div
                              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-lg transition-all duration-200 ${
                                option.gradient
                                  ? gradientClasses[option.gradient]
                                  : 'bg-zinc-100 dark:bg-zinc-800/80'
                              } ${
                                isFocused && option.gradient
                                  ? 'shadow-lg'
                                  : 'shadow-sm'
                              }`}
                            >
                              <OptionIcon
                                className={`h-4 w-4 ${
                                  option.gradient
                                    ? 'text-white'
                                    : 'text-zinc-600 dark:text-zinc-400'
                                }`}
                              />
                            </div>
                          )}

                          {/* Text Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`truncate text-sm font-medium ${
                                  isSelected
                                    ? 'text-sky-600 dark:text-sky-400'
                                    : 'text-zinc-900 dark:text-white'
                                }`}
                              >
                                {option.label}
                              </span>
                            </div>
                            {option.description && (
                              <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {option.description}
                              </div>
                            )}
                          </div>

                          {/* Check Icon for Selected */}
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 25,
                              }}
                              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-500 shadow-lg shadow-sky-500/30"
                            >
                              <CheckIcon className="h-3 w-3 text-white" />
                            </motion.div>
                          )}
                        </div>
                      </motion.button>
                    )
                  })
                ) : (
                  /* Empty State */
                  !showCreateOption && (
                    <div className="p-8 text-center" data-testid={testId ? `${testId}-no-results` : undefined}>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {noResultsMessage || `No results for "${query}"`}
                      </p>
                    </div>
                  )
                )}

                {/* Create Custom Value Option */}
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={() => {
                      onCustomValueCreate?.(query)
                      setQuery('')
                      setIsOpen(false)
                    }}
                    className="
                      w-full border-t border-zinc-200 px-3 py-2.5 text-left
                      transition-all duration-150
                      hover:bg-white dark:border-zinc-800/50 dark:hover:bg-white/8
                    "
                    data-testid={testId ? `${testId}-create-option` : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-purple-500 shadow-sm shadow-violet-500/30">
                        <PlusIcon className="h-3 w-3 text-white" />
                      </div>
                      <span className="text-sm text-zinc-900 dark:text-white">
                        {createLabel ? createLabel(query) : `Create "${query}"`}
                      </span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}