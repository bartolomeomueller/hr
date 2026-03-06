import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";

export function Role({
  slug,
  onRoleNotFound,
  onNavigateToInterview,
}: {
  slug: string;
  onRoleNotFound: () => never;
  onNavigateToInterview: (interviewUuid: string) => Promise<void>;
}) {
  const roleQuery = useSuspenseQuery(
    orpc.getRoleAndItsQuestionsBySlug.queryOptions({
      input: { slug },
    }),
  );

  // TODO for a better flow change this mutation process to directly redirect to the interview page since the questions are already fetched -> so optimistic update
  const createInterviewMutation = useMutation(
    orpc.createInterviewForRoleAndQuestionSet.mutationOptions(),
  );

  const roleData = roleQuery.data;
  if (!roleData) {
    return onRoleNotFound();
  }

  const handleStartInterview = async () => {
    const interview = await createInterviewMutation.mutateAsync({
      roleUuid: roleData.role.uuid,
      questionSetVersion: roleData.questionSet.version,
    });

    await onNavigateToInterview(interview.uuid);
  };

  return (
    <div>
      <h2>
        Role {roleData.role.uuid}: {roleData.role.roleName}
      </h2>
      <div>
        <button
          type="button"
          onClick={() => handleStartInterview()}
          disabled={createInterviewMutation.isPending}
        >
          {createInterviewMutation.isPending
            ? "Starting interview..."
            : "Start interview"}
        </button>
      </div>
    </div>
  );
}
