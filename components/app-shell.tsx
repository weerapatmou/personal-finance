import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        userName={session.user.name ?? ""}
        userUsername={session.user.username ?? ""}
        logoutAction={logoutAction}
      />
      {/* Main content offset for desktop sidebar */}
      <div className="lg:pl-64">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
