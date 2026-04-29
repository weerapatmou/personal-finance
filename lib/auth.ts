import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

declare module "next-auth" {
  // eslint-disable-next-line no-unused-vars
  interface Session {
    user: {
      id: string;
      username: string;
    } & DefaultSession["user"];
  }
  // eslint-disable-next-line no-unused-vars
  interface User {
    id?: string;
    username?: string;
  }
}

// JWT shape augmentation: in Auth.js v5 the JWT type lives on the same
// next-auth module surface; we cast in callbacks rather than augment a
// non-existent submodule.

const credentialsSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // No adapter — Credentials uses JWT sessions only.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: eq(users.username, username),
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.id;
        token.username = (user as { username?: string }).username ?? token.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id ?? "") as string;
        session.user.username = (token.username ?? "") as string;
      }
      return session;
    },
  },
});
