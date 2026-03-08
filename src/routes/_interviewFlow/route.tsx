import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CandidateFlowFormProvider } from "@/components/CandidateFlowFormContext";

export const Route = createFileRoute("/_interviewFlow")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <CandidateFlowFormProvider>
      <Outlet />
    </CandidateFlowFormProvider>
  );
}
