import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function FormField({ label, children, hint }: FormFieldProps) {
  return (
    <label className="block">
      <span className="text-[13px] text-stone-600">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] text-stone-400">{hint}</p>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-stone-400 focus:border-primary/50 focus:ring-2 focus:ring-primary-muted";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={inputClass} {...props}>
      {props.children}
    </select>
  );
}
