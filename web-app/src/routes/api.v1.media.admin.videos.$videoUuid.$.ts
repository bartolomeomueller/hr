import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { TeamMember } from "@/db/auth-schema";
import { VideoAnswerPayloadType } from "@/db/payload-types";
import { Answer, FlowVersion, Interview, Role } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { logger } from "@/lib/logger";
import {
  createObjectDownloadResponse,
  getObjectKeyForProcessedVideoUuid,
} from "@/lib/s3.server";

export const Route = createFileRoute("/api/v1/media/admin/videos/$videoUuid/$")(
  {
    server: {
      handlers: {
        GET: handleGet,
        HEAD: handleGet,
      },
    },
  },
);

async function handleGet({
  request,
  params,
}: {
  request: Request;
  params: { videoUuid: string };
}) {
  const sessionData = await auth.api.getSession({ headers: request.headers });
  if (!sessionData?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const mediaPath = getMediaPathFromRequestUrl(request.url, params.videoUuid);
  if (!mediaPath) {
    return new Response("Not Found", { status: 404 });
  }

  const canAccessVideo = await userCanAccessProcessedVideo({
    userId: sessionData.user.id,
    videoUuid: params.videoUuid,
  });
  if (!canAccessVideo) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const response = await createObjectDownloadResponse({
      objectKey: `${getObjectKeyForProcessedVideoUuid(params.videoUuid)}/${mediaPath}`,
      range: request.headers.get("range"),
    });

    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }

    return response;
  } catch (error) {
    logger.error(
      { error, videoUuid: params.videoUuid, mediaPath },
      "Failed to stream processed video object.",
    );
    return new Response("Not Found", { status: 404 });
  }
}

function getMediaPathFromRequestUrl(requestUrl: string, videoUuid: string) {
  // Strip the known route prefix so only the object path below this video uuid
  // remains, and reject traversal-like paths before composing the storage key.
  const pathname = new URL(requestUrl).pathname;
  const routePrefix = `/api/v1/media/admin/videos/${videoUuid}/`;
  if (!pathname.startsWith(routePrefix)) return null;

  const mediaPath = decodeURIComponent(pathname.slice(routePrefix.length));
  if (!mediaPath || mediaPath.includes("..") || mediaPath.startsWith("/")) {
    return null;
  }

  return mediaPath;
}

async function userCanAccessProcessedVideo({
  userId,
  videoUuid,
}: {
  userId: string;
  videoUuid: string;
}) {
  const answerCandidates = await db
    .select({
      answerPayload: Answer.answerPayload,
    })
    .from(Answer)
    .innerJoin(Interview, eq(Interview.uuid, Answer.interviewUuid))
    .innerJoin(FlowVersion, eq(FlowVersion.uuid, Interview.flowVersionUuid))
    .innerJoin(Role, eq(Role.uuid, FlowVersion.roleUuid))
    .innerJoin(
      TeamMember,
      and(eq(TeamMember.teamId, Role.teamId), eq(TeamMember.userId, userId)),
    )
    .where(sql`${Answer.answerPayload}->>'videoUuid' = ${videoUuid}`);

  return answerCandidates.some((answerCandidate) => {
    const parseResult = VideoAnswerPayloadType.safeParse(
      answerCandidate.answerPayload,
    );

    return (
      parseResult.success &&
      parseResult.data.videoUuid === videoUuid &&
      parseResult.data.status === "processed"
    );
  });
}
