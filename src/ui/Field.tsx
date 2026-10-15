import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { centsFromDigits, formatBRL } from '@/domain/money';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type TextFieldProps = { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, className, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className={`input ${className ?? ''}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...props}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = { label: string; hint?: ReactNode; error?: string | null; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, hint, error, children, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select id={id} className="select" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = { label: string; hint?: ReactNode; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ label, hint, error, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} className="textarea" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...props} />
      )}
    </FieldShell>
  );
}

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  hint?: ReactNode;
  error?: string | null;
  autoFocus?: boolean;
  large?: boolean;
  disabled?: boolean;
  name?: string;
}

/**
 * Campo de valor em reais com máscara de centavos: digitar 6 0 0 0 0 mostra
 * R$ 600,00. Abre o teclado numérico no celular e nunca produz float.
 */
export function MoneyField({ label, value, onChange, hint, error, autoFocus, large, disabled, name }: MoneyFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          className={`input ${large ? 'input-money' : ''}`}
          inputMode="numeric"
          autoComplete="off"
          placeholder="R$ 0,00"
          value={value ? formatBRL(value) : ''}
          onChange={(e) => onChange(centsFromDigits(e.target.value))}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus}
          disabled={disabled}
        />
      )}
    </FieldShell>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}

export function Segmented<T extends string>({ label, value, options, onChange, hideLabel }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
