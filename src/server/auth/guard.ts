import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { isAdmin, requireActor, type Actor } from "@/server/domain/authorization";
import { ErrorCodes, isDomainError } from "@/server/domain/errors";

export async function requirePageActor(): Promise<Actor> {
  try {
    return requireActor(await getCurrentActor());
  } catch (error) {
    if (isDomainError(error) && error.code === ErrorCodes.UNAUTHORIZED) {
      redirect("/login");
    }
    throw error;
  }
}

export async function requirePageAdmin(): Promise<Actor> {
  const actor = await requirePageActor();
  if (!isAdmin(actor)) redirect("/app");
  return actor;
}
