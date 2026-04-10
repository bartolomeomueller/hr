import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/roles/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_protected/admin/roles/$slug"!</div>
}
