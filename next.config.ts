import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // Fonds lus sur disque par la route Cerfa, y compris dans son artefact de déploiement.
  outputFileTracingIncludes: {
    "/api/lmnp/declaration/cerfa-pdf": ["./src/lib/lmnp/services/liasse-pdf/assets/**/*.pdf"],
  },
};

export default nextConfig;
