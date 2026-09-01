import { Button, type ButtonProps } from "@/design-system/components/Button";

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}
