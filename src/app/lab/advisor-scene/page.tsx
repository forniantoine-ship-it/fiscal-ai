import { AdvisorLab } from "@/lab/advisor-scene/AdvisorLab";

export const metadata = {
  title: "Laboratoire — Advisor Scene",
};

/**
 * Route isolée, jamais liée depuis la navigation réelle. Aucune dépendance au
 * Dashboard, au Workflow Engine, ni à resolveDashboardWorkflow/HeroState.
 */
export default function AdvisorSceneLabPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        backgroundColor: "#FBF8F3",
      }}
    >
      <AdvisorLab />
    </main>
  );
}
