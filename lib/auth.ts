import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import { db } from "@/db";
import {
  users,
  authAccounts,
  sessions,
  verificationTokens,
} from "@/db/schema";

const allowedEmail = process.env.ALLOWED_EMAIL?.toLowerCase().trim();

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
    }),
  ],
  callbacks: {
    async signIn({ user, email }) {
      // Reject any non-allowlisted email at the signIn callback (per SPEC §9).
      const candidate = (user.email ?? email?.verificationRequest ? user.email : null)?.toLowerCase().trim();
      if (!allowedEmail) return false;
      if (!candidate) return false;
      return candidate === allowedEmail;
    },
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
