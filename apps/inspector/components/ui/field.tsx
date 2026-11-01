"use client";

import type { ReactNode } from "react";
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField,
  type TextFieldProps,
} from "react-aria-components";
import { cn } from "../../lib/utils";

interface FieldProps extends Omit<TextFieldProps, "children"> {
  readonly label: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly className?: string;
  /** Toolbar style: the label stays for assistive tech but is visually hidden. */
  readonly compact?: boolean;
  readonly icon?: ReactNode;
}

export function Field({
  label,
  description,
  placeholder,
  className,
  compact = false,
  icon,
  ...props
}: FieldProps) {
  return (
    <TextField className={cn("grid gap-1.5", className)} {...props}>
      <Label className={compact ? "sr-only" : "text-xs font-medium text-foreground"}>{label}</Label>
      <div className="relative flex items-center">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 text-muted-foreground [&_svg]:size-3.5"
          >
            {icon}
          </span>
        ) : null}
        <Input
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25",
            icon && "pl-8",
          )}
          placeholder={placeholder}
        />
      </div>
      {description && (
        <Text className="text-xs text-muted-foreground" slot="description">
          {description}
        </Text>
      )}
      <FieldError className="text-xs text-danger" />
    </TextField>
  );
}
