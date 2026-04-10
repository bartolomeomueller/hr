import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  member,
  organization as organizationTable,
  team,
  teamMember,
  user as userTable,
} from "@/db/auth-schema";

// The databaseHooks and related functions are AI generated and not really comprehended.

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await ensurePersonalOrganizationForUser(user);
        },
      },
    },
    session: {
      create: {
        async before(session) {
          const selectedTeamContext =
            (await getLastSelectedTeamContext(session.userId)) ??
            (await getOrCreatePersonalOrganizationContext(session.userId));

          if (!selectedTeamContext) {
            return;
          }

          return {
            data: {
              ...session,
              activeOrganizationId:
                session.activeOrganizationId ??
                selectedTeamContext.organizationId,
              activeTeamId: session.activeTeamId ?? selectedTeamContext.teamId,
            },
          };
        },
      },
      update: {
        async after(session) {
          if (!session?.userId) {
            return;
          }

          const lastSelectedTeamId =
            typeof session.activeTeamId === "string"
              ? session.activeTeamId
              : null;

          await db
            .update(userTable)
            .set({ lastSelectedTeamId })
            .where(eq(userTable.id, session.userId));
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_AUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET as string,
    },
  },
  // TODO add magic link, email otp (maybe), passkey, generic oauth (maybe), one tap (maybe)
  // TODO add admin,
  plugins: [
    organization({
      teams: {
        enabled: true,
      },
    }),
    tanstackStartCookies(),
  ],
});

async function ensurePersonalOrganizationForUser(user: {
  id: string;
  name?: string | null;
}) {
  const slug = getPersonalOrganizationSlug(user.id);
  const organizationName = getPersonalOrganizationName(user.name);
  const teamName = getPersonalTeamName(user.name);

  await db.transaction(async (tx) => {
    const [existingOrganization] = await tx
      .select({ id: organizationTable.id })
      .from(organizationTable)
      .where(eq(organizationTable.slug, slug))
      .limit(1);

    const organizationId = existingOrganization?.id ?? crypto.randomUUID();
    const now = new Date();

    if (!existingOrganization) {
      await tx.insert(organizationTable).values({
        id: organizationId,
        name: organizationName,
        slug,
        createdAt: now,
        metadata: JSON.stringify({ personal: true }),
      });
    }

    const [existingMembership] = await tx
      .select({
        id: member.id,
        role: member.role,
      })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, user.id),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await tx.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: user.id,
        role: "owner",
        createdAt: now,
      });
    } else if (existingMembership.role !== "owner") {
      await tx
        .update(member)
        .set({ role: "owner" })
        .where(eq(member.id, existingMembership.id));
    }

    const [existingPersonalTeam] = await tx
      .select({ teamId: team.id })
      .from(team)
      .innerJoin(
        teamMember,
        and(eq(teamMember.teamId, team.id), eq(teamMember.userId, user.id)),
      )
      .where(eq(team.organizationId, organizationId))
      .orderBy(asc(team.createdAt))
      .limit(1);

    if (!existingPersonalTeam) {
      const teamId = crypto.randomUUID();

      await tx.insert(team).values({
        id: teamId,
        name: teamName,
        organizationId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(teamMember).values({
        id: crypto.randomUUID(),
        teamId,
        userId: user.id,
        createdAt: now,
      });
    }
  });
}

async function getLastSelectedTeamContext(userId: string) {
  const [lastSelectedTeam] = await db
    .select({
      organizationId: organizationTable.id,
      teamId: team.id,
    })
    .from(userTable)
    .innerJoin(team, eq(userTable.lastSelectedTeamId, team.id))
    .innerJoin(organizationTable, eq(team.organizationId, organizationTable.id))
    .innerJoin(
      teamMember,
      and(eq(teamMember.teamId, team.id), eq(teamMember.userId, userId)),
    )
    .where(eq(userTable.id, userId))
    .limit(1);

  return lastSelectedTeam;
}

async function getOrCreatePersonalOrganizationContext(userId: string) {
  let personalContext = await getPersonalOrganizationContext(userId);

  if (personalContext) {
    return personalContext;
  }

  const [existingUser] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!existingUser) {
    return null;
  }

  await ensurePersonalOrganizationForUser(existingUser);
  personalContext = await getPersonalOrganizationContext(userId);

  return personalContext;
}

async function getPersonalOrganizationContext(userId: string) {
  const slug = getPersonalOrganizationSlug(userId);

  const [personalTeam] = await db
    .select({
      organizationId: organizationTable.id,
      teamId: team.id,
    })
    .from(organizationTable)
    .innerJoin(member, eq(member.organizationId, organizationTable.id))
    .innerJoin(team, eq(team.organizationId, organizationTable.id))
    .innerJoin(
      teamMember,
      and(eq(teamMember.teamId, team.id), eq(teamMember.userId, userId)),
    )
    .where(
      and(
        eq(organizationTable.slug, slug),
        eq(member.userId, userId),
        eq(member.role, "owner"),
      ),
    )
    .orderBy(asc(team.createdAt))
    .limit(1);

  return personalTeam;
}

function getPersonalOrganizationSlug(userId: string) {
  return `personal-${normalizeSlugPart(userId)}`;
}

function getPersonalOrganizationName(name?: string | null) {
  const displayName = normalizeDisplayName(name);
  return displayName
    ? `${displayName} Personal Organization`
    : "Personal Organization";
}

function getPersonalTeamName(name?: string | null) {
  const displayName = normalizeDisplayName(name);
  return displayName ? `${displayName} Personal Team` : "Personal Team";
}

function normalizeDisplayName(name?: string | null) {
  const trimmedName = name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : null;
}

function normalizeSlugPart(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 ? normalized : crypto.randomUUID();
}
