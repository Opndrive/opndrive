'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * A password-style field with a reveal toggle.
 *
 * Three details here are easy to get wrong and all of them are deliberate.
 *
 * The button's accessible name never changes. Swapping it between "Show" and
 * "Hide" makes it read as a different control each time it is used, so the
 * state lives in `aria-pressed` instead and the name stays put. An icon-only
 * button with no name at all is the more common failure: sighted users see an
 * eye, screen reader users hear "button".
 *
 * Toggling does not move focus. `onMouseDown` is prevented so a pointer user
 * stays in the field they were typing in rather than being dumped on the
 * button.
 *
 * And it starts hidden. This is a credential that grants access to the user's
 * whole bucket, so revealing it is their decision, not our default.
 */
export function SecretInput({
  value,
  onChange,
  label,
  placeholder,
  required = false,
  id,
}: SecretInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const statusId = `${inputId}-status`;

  const [isVisible, setIsVisible] = useState(false);

  const Icon = isVisible ? EyeOff : Eye;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={isVisible ? 'text' : 'password'}
        required={required}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={statusId}
        className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      <button
        type="button"
        // Stable name, state in aria-pressed.
        aria-label={`Reveal ${label}`}
        aria-pressed={isVisible}
        aria-controls={inputId}
        // Keeps the caret where the user left it.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsVisible((prev) => !prev)}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Announces the change without the button's own name shifting. */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {isVisible ? `${label} is visible` : `${label} is hidden`}
      </span>
    </div>
  );
}
