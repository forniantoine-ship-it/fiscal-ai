import type { ReactNode } from "react";

import { Input, Select, type InputProps, type SelectProps } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function FormField({ label, children, hint }: FormFieldProps) {
  return (
    <label className="block">
      <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? (
        <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          {hint}
        </p>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputProps) {
  return <Input {...props} />;
}

export function SelectInput(props: SelectProps) {
  return <Select {...props} />;
}
