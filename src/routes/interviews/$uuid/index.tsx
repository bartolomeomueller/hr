import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/interviews/$uuid/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "interview/$uuid/"!</div>;
}
