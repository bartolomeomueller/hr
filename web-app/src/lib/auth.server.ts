import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  Account,
  Invitation,
  Member,
  Organization,
  Session,
  Team,
  TeamMember,
  User,
  Verification,
} from "@/db/auth-schema";

// The databaseHooks and related functions are AI generated and not really comprehended.

export const auth = betterAuth({
  basePath: "/api/v1/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: User,
      session: Session,
      account: Account,
      verification: Verification,
      organization: Organization,
      member: Member,
      invitation: Invitation,
      team: Team,
      teamMember: TeamMember,
    },
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
            .update(User)
            .set({ lastSelectedTeamId })
            .where(eq(User.id, session.userId));
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
      .select({ id: Organization.id })
      .from(Organization)
      .where(eq(Organization.slug, slug))
      .limit(1);

    const organizationId = existingOrganization?.id ?? crypto.randomUUID();
    const now = new Date();

    if (!existingOrganization) {
      await tx.insert(Organization).values({
        id: organizationId,
        name: organizationName,
        slug,
        createdAt: now,
        metadata: JSON.stringify({ personal: true }),
      });
    }

    const [existingMembership] = await tx
      .select({
        id: Member.id,
        role: Member.role,
      })
      .from(Member)
      .where(
        and(
          eq(Member.organizationId, organizationId),
          eq(Member.userId, user.id),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await tx.insert(Member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: user.id,
        role: "owner",
        createdAt: now,
      });
    } else if (existingMembership.role !== "owner") {
      await tx
        .update(Member)
        .set({ role: "owner" })
        .where(eq(Member.id, existingMembership.id));
    }

    const [existingPersonalTeam] = await tx
      .select({ teamId: Team.id })
      .from(Team)
      .innerJoin(
        TeamMember,
        and(eq(TeamMember.teamId, Team.id), eq(TeamMember.userId, user.id)),
      )
      .where(eq(Team.organizationId, organizationId))
      .orderBy(asc(Team.createdAt))
      .limit(1);

    if (!existingPersonalTeam) {
      const teamId = crypto.randomUUID();

      await tx.insert(Team).values({
        id: teamId,
        name: teamName,
        organizationId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(TeamMember).values({
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
      organizationId: Organization.id,
      teamId: Team.id,
    })
    .from(User)
    .innerJoin(Team, eq(User.lastSelectedTeamId, Team.id))
    .innerJoin(Organization, eq(Team.organizationId, Organization.id))
    .innerJoin(
      TeamMember,
      and(eq(TeamMember.teamId, Team.id), eq(TeamMember.userId, userId)),
    )
    .where(eq(User.id, userId))
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
      id: User.id,
      name: User.name,
    })
    .from(User)
    .where(eq(User.id, userId))
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
      organizationId: Organization.id,
      teamId: Team.id,
    })
    .from(Organization)
    .innerJoin(Member, eq(Member.organizationId, Organization.id))
    .innerJoin(Team, eq(Team.organizationId, Organization.id))
    .innerJoin(
      TeamMember,
      and(eq(TeamMember.teamId, Team.id), eq(TeamMember.userId, userId)),
    )
    .where(
      and(
        eq(Organization.slug, slug),
        eq(Member.userId, userId),
        eq(Member.role, "owner"),
      ),
    )
    .orderBy(asc(Team.createdAt))
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
