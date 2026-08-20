"use client";

import {
  FieldError,
  Input,
  Label,
  Text,
  TextField,
  type TextFieldProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";

interface FieldProps extends Omit<TextFieldProps, "children"> {
  readonly label: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly className?: string;
}

export function Field({ label, description, placeholder, className, ...props }: FieldProps) {
  return (
    <TextField className={cx("grid gap-1.5", className)} {...props}>
      <Label className="text-xs font-semibold text-[var(--ink)]">{label}</Label>
      <Input
        className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        placeholder={placeholder}
      />
      {description && (
        <Text className="text-xs text-[var(--muted)]" slot="description">
          {description}
        </Text>
      )}
      <FieldError className="text-xs text-[var(--danger)]" />
    </TextField>
  );
}
