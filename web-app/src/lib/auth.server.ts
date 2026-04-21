import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
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
import { sendEmail } from "@/lib/email.server";

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
  emailVerification: {
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url }) {
      void sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email address: ${url}`,
        html: renderEmailHtml({
          intro:
            "Please verify your email address to finish setting up your account.",
          ctaLabel: "Verify email address",
          url,
        }),
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      void sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
        html: renderEmailHtml({
          intro: "A password reset was requested for your account.",
          ctaLabel: "Reset password",
          url,
        }),
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_AUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET as string,
    },
  },
  // TODO add email otp (maybe), passkey, generic oauth (maybe), one tap (maybe)
  // TODO add admin,
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        void sendEmail({
          to: email,
          subject: "Your sign-in link",
          text: `Click the link to sign in: ${url}`,
          html: renderEmailHtml({
            intro: "Use this secure link to sign in to your account.",
            ctaLabel: "Sign in",
            url,
          }),
        });
      },
    }),
    organization({
      teams: {
        enabled: true,
      },
    }),
    tanstackStartCookies(),
  ],
});

function renderEmailHtml({
  intro,
  ctaLabel,
  url,
}: {
  intro: string;
  ctaLabel: string;
  url: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>${intro}</p>
      <p>
        <a href="${url}" style="display: inline-block; padding: 12px 18px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
          ${ctaLabel}
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${url}">${url}</a></p>
    </div>
  `;
}

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
