'use client';

import type { ReactNode } from 'react';
import { useLang } from '../lib/i18n';
import type { Errors } from '../lib/forms';

export function Field({
  label,
  error,
  children,
  className = '',
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface BaseProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  errors: Errors;
  className?: string;
}

export function TextField({
  label,
  name,
  value,
  onChange,
  errors,
  className,
  type = 'text',
  placeholder,
  inputMode,
  maxLength,
  onFocus,
}: BaseProps & {
  type?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'tel' | 'text';
  maxLength?: number;
  onFocus?: () => void;
}) {
  const { t } = useLang();
  const err = errors[name];
  return (
    <Field label={label} error={err ? t(err) : undefined} className={className} htmlFor={`f_${name}`}>
      <input
        id={`f_${name}`}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!err}
        className={`field ${err ? 'field-error' : ''}`}
      />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  errors,
  className,
  options,
  onFocus,
}: BaseProps & { options: Array<{ value: string; label: string }>; onFocus?: () => void }) {
  const { t } = useLang();
  const err = errors[name];
  return (
    <Field label={label} error={err ? t(err) : undefined} className={className} htmlFor={`f_${name}`}>
      <select
        id={`f_${name}`}
        name={name}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!err}
        className={`field ${err ? 'field-error' : ''}`}
      >
        <option value="">{t('select')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
        />
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SpecialGroups({
  value,
  onChange,
  groups,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  groups: readonly string[];
}) {
  const { t, opt } = useLang();
  return (
    <div>
      <p className="label">{t('specialTitle')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => (
          <CheckField
            key={g}
            checked={value.includes(g)}
            onChange={(c) => onChange(c ? [...value, g] : value.filter((x) => x !== g))}
          >
            {opt('sp', g)}
          </CheckField>
        ))}
      </div>
    </div>
  );
}
