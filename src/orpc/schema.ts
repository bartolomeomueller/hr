import { roleSelectSchema } from "@/db/schema";

export const RoleSchema = roleSelectSchema;

export const GetRoleByUuidInputSchema = RoleSchema.pick({
  uuid: true,
});

export const NullableRoleSchema = RoleSchema.nullable();
