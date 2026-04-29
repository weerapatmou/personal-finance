import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createMonth } from "../actions";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

export default async function NewMonthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-md mx-auto space-y-6">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/months" label="Months" />
          <h1 className="text-2xl font-bold tracking-tight">New Month</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <form
            action={async (formData) => {
              "use server";
              const year = Number(formData.get("year"));
              const month = Number(formData.get("month"));
              const copyPlanFromPrevious = formData.get("copyPlan") === "on";
              await createMonth({ year, month, copyPlanFromPrevious });
              const slug = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
              redirect(`/months/${slug}`);
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Year</span>
              <input
                type="number"
                name="year"
                required
                min={2020}
                max={2100}
                defaultValue={new Date().getFullYear()}
                className="rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Month</span>
              <input
                type="number"
                name="month"
                required
                min={1}
                max={12}
                defaultValue={new Date().getMonth() + 1}
                className="rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="copyPlan" defaultChecked className="rounded" />
              Copy plan from previous month
            </label>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Create
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
