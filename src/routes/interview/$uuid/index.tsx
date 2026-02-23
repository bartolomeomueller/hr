import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/interview/$uuid/")({
	component: RouteComponent,
});

function isInterview(
	value: unknown,
): value is { uuid: string; roleName: string } {
	if (!value || typeof value !== "object") {
		return false;
	}

	return "uuid" in value && "roleName" in value;
}

function RouteComponent() {
	const { uuid } = Route.useParams();
	const interviewQuery = useQuery(
		orpc.getInterviewByUuid.queryOptions({
			input: { uuid },
		}),
	);

	if (interviewQuery.isPending) {
		return <div>Loading interview...</div>;
	}

	if (interviewQuery.isError) {
		return <div>Could not load interview.</div>;
	}

	if (!interviewQuery.data) {
		return <div>No interview found for {uuid}</div>;
	}

	if (!isInterview(interviewQuery.data)) {
		return <div>Interview response has an unexpected shape.</div>;
	}

	return (
		<div>
			Interview {interviewQuery.data.uuid}: {interviewQuery.data.roleName}
		</div>
	);
}
