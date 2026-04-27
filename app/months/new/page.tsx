import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createMonth } from "../actions";

export default async function NewMonthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">New month</h1>
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
        <label className="flex flex-col gap-1 text-sm">
          Year
          <input
            type="number"
            name="year"
            required
            min={2020}
            max={2100}
            defaultValue={new Date().getFullYear()}
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Month
          <input
            type="number"
            name="month"
            required
            min={1}
            max={12}
            defaultValue={new Date().getMonth() + 1}
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="copyPlan" defaultChecked />
          Copy plan from previous month
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Create
        </button>
      </form>
    </main>
  );
}
