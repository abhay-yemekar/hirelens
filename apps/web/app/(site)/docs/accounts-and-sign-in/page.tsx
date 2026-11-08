import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Accounts & sign-in — CandidLens Docs",
  description:
    "Sign-in methods, passwords, password reset, email confirmation, changing your email and deleting your CandidLens account.",
};

export default function AccountsDocsPage() {
  return (
    <ProsePage
      eyebrow="Docs · Use"
      title="Accounts & sign-in"
      lede="Sign-in methods, passwords, email confirmation, changing your email and deleting your account. The same for recruiters and candidates."
    >
      <p>
        Everything here lives in <Link href="/settings">Settings</Link>, under{" "}
        <strong>Sign-in &amp; security</strong> and <strong>Delete account</strong>.
      </p>

      <h2>Ways to sign in</h2>
      <ul>
        <li>
          <strong>Email and password.</strong> Passwords are 8 to 128 characters, and every password
          field can show what you typed.
        </li>
        <li>
          <strong>Google or GitHub</strong>, when the server has their keys (see{" "}
          <Link href="/docs/configuration#sign-in">configuration</Link>).
        </li>
      </ul>
      <p>One account can use several methods. Settings lists them, and you can:</p>
      <ul>
        <li>
          <strong>Add a password</strong> to an account made with Google or GitHub, so you can also
          sign in with your email. This needs a sign-in within the last 15 minutes.
        </li>
        <li>
          <strong>Change your password</strong>, optionally signing out every other device.
        </li>
        <li>
          <strong>Remove your password</strong>, or <strong>connect and disconnect</strong> Google
          and GitHub. The last way to sign in can&apos;t be removed.
        </li>
        <li>
          <strong>Sign out other devices.</strong>
        </li>
      </ul>
      <p>
        Google or GitHub never joins an existing account on its own, even when the email matches:
        connect them from Settings while signed in. Otherwise someone could register a
        stranger&apos;s email first and share the account once its owner signed in with Google. The
        sign-in page explains this when it happens.
      </p>

      <h2 id="email-features">Email features</h2>
      <p>
        These need the server to send email (see{" "}
        <Link href="/docs/configuration#email">configuration</Link>). Without email, the links below
        are hidden.
      </p>
      <ul>
        <li>
          <strong>Forgot password.</strong> The link works once and expires after 1 hour. Following
          it sets a new password, or the first one for an account made with Google or GitHub, and
          signs the account out on every device. It also marks the address as confirmed, since the
          link reached the inbox.
        </li>
        <li>
          <strong>Email confirmation.</strong> Sign-up sends a link to confirm the address; Settings
          shows whether it is confirmed and can send it again. Opening the link only confirms the
          address; it never signs anyone in. Signing in never waits for confirmation.
        </li>
        <li>
          <strong>Change your email.</strong> Needs a sign-in within the last 15 minutes. A
          single-use link (1 hour) goes to the new address; it opens a page, and the change applies
          only when you press Confirm while signed in to the same account. Confirming cancels any
          open password-reset link, and the old address gets a notice.
        </li>
      </ul>
      <p>
        Each address receives at most 3 emails of each kind per hour, and the server sends a limited
        number per day, so nobody can flood an inbox or use up the sending quota. Mail from a new
        sender can land in spam at first; check there if a link doesn&apos;t arrive.
      </p>

      <h2>Deleting your account</h2>
      <p>
        <strong>Settings → Delete account</strong> shows what will happen before anything is
        deleted. It needs a sign-in within the last 15 minutes and your email typed back.
      </p>
      <table>
        <thead>
          <tr>
            <th>Organization</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Only you are a member</td>
            <td>Erased with everything in it: jobs, candidates, resumes and its audit log</td>
          </tr>
          <tr>
            <td>Others are members and you are the only owner</td>
            <td>
              Deletion is blocked until you make another member an owner (Settings → Members →
              Owner)
            </td>
          </tr>
          <tr>
            <td>Anything else</td>
            <td>
              You leave. Its data stays with the other members, its audit log records that you left,
              and API tokens you created there are revoked
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Your name, email, password, Google and GitHub links, sessions, memberships and pending
        invitations are removed, and your email is free for a new account. The account keeps only an
        anonymous random id, because each audit log entry&apos;s hash includes its author: removing
        the id would break the audit chain of every organization you worked in. Deletion is all or
        nothing, and it can&apos;t be undone.
      </p>
    </ProsePage>
  );
}
