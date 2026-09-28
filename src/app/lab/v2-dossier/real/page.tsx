import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RealWorkspaceRoute } from "@/lab/v2-dossier/RealWorkspaceRoute";
import { readV3ReturnQuery } from "@/lab/v2-dossier/correction-scope";

export const metadata: Metadata = {
  title: "Laboratoire V3.1 · Dossier réel",
  robots: { index: false, follow: false },
};

export default async function RealV2DossierPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.append(key, value);
  }
  return <RealWorkspaceRoute key={params.toString()} expectedReturn={readV3ReturnQuery(params)} />;
}
