'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized || normalized === '.' || normalized === '-') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function formatMoneyInput(value: string | number | null | undefined): string {
  if (value === '' || value === null || value === undefined) return '';
  const raw = String(value).replace(/,/g, '').replace(/[^0-9.-]/g, '');
  if (!raw) return '';
  const negative = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const [integerPart = '', ...fractionParts] = unsigned.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '');
  const grouped = (integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative}${grouped}${fractionParts.length ? `.${fractionParts.join('')}` : ''}`;
}

export type MoneyInputProps = Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: string | number | null | undefined;
  onValueChange: (value: number | '') => void;
};

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, className, ...props }, forwardedRef
) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [displayValue, setDisplayValue] = React.useState(() => formatMoneyInput(value));
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusedRef.current) setDisplayValue(formatMoneyInput(value));
  }, [value]);
  const setRef = React.useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  return <Input
    {...props}
    ref={setRef}
    type="text"
    inputMode="decimal"
    className={cn('min-w-0 tabular-nums', className)}
    value={displayValue}
    onFocus={(event) => {
      focusedRef.current = true;
      props.onFocus?.(event);
    }}
    onBlur={(event) => {
      focusedRef.current = false;
      if (displayValue !== '') setDisplayValue(formatMoneyInput(value));
      props.onBlur?.(event);
    }}
    onChange={(event) => {
      const input = event.currentTarget;
      const before = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/,/g, '').length;
      const cleaned = input.value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
      setDisplayValue(formatMoneyInput(cleaned));
      const parsed = parseMoneyInput(cleaned);
      onValueChange(parsed === null ? '' : parsed);
      requestAnimationFrame(() => {
        const node = inputRef.current;
        if (!node) return;
        let seen = 0;
        let caret = node.value.length;
        for (let index = 0; index < node.value.length; index += 1) {
          if (node.value[index] !== ',') seen += 1;
          if (seen >= before) { caret = index + 1; break; }
        }
        node.setSelectionRange(caret, caret);
      });
    }}
  />;
});
