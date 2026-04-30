import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AddHoldingWizard } from "./add-holding-wizard";

export default async function NewHoldingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-6 sm:p-8">
        <AddHoldingWizard />
      </div>
    </AppShell>
  );
}
