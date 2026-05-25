import { Button, type ButtonProps } from "@/design-system/components/Button";

export function PrimaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="primary" {...props} />;
}
