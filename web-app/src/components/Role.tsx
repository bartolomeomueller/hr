import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { H1 } from "@/components/ui/typography";
import { orpc } from "@/orpc/client";
import { Button } from "./ui/button";

export function Role({
  slug,
  onResourceNotFound,
}: {
  slug: string;
  onResourceNotFound: () => never;
}) {
  const roleQuery = useSuspenseQuery(
    orpc.getRoleAndItsFlowVersionBySlug.queryOptions({ input: { slug } }),
  );
  const roleData = roleQuery.data;

  if (!roleData) {
    return onResourceNotFound();
  }

  return (
    <div className="flex justify-center">
      <div className="flex w-[75ch] flex-col items-center gap-8">
        <H1>{roleData.role.roleName}</H1>
        <Button asChild>
          <Link from="/roles/$slug/" to="create-interview" params={{ slug }}>
            Interview starten
          </Link>
        </Button>
      </div>
    </div>
  );
}
