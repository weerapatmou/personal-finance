"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function setDisplayCurrency(userId: string, currency: "THB" | "USD") {
  const session = await auth();
  if (!session?.user || session.user.id !== userId) {
    throw new Error("Unauthorized");
  }
  await db
    .update(users)
    .set({ displayCurrency: currency, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/");
}
