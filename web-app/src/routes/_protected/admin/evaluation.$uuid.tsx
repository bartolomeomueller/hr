import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/evaluation/$uuid')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_protected/admin/evaluation/$uuid"!</div>
}
