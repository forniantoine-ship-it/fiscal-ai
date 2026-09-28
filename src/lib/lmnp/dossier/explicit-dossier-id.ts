export function isDossierId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** undefined = legacy navigation; null = explicit but invalid, so fail closed. */
export function readExplicitDossierId(params: URLSearchParams): string | null | undefined {
  const values = params.getAll("dossierId");
  if (values.length === 0) return undefined;
  return values.length === 1 && isDossierId(values[0]) ? values[0].toLowerCase() : null;
}
