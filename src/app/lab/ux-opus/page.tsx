import type { Metadata } from "next";

import UxOpusLab from "@/lab/ux-opus/UxOpusLab";

export const metadata: Metadata = {
  title: "Lab UX (Opus) — Assistant du Réel",
  robots: { index: false, follow: false },
};

export default function UxOpusLabPage() {
  return <UxOpusLab />;
}
