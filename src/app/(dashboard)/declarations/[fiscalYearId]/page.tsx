import { ArchivedDeclarationPageClient } from "./ArchivedDeclarationPageClient";

export default async function ArchivedDeclarationPage({
  params,
}: {
  params: Promise<{ fiscalYearId: string }>;
}) {
  const { fiscalYearId } = await params;
  return <ArchivedDeclarationPageClient fiscalYearId={fiscalYearId} />;
}
