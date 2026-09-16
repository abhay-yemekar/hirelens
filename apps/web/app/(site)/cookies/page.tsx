import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Cookies — HireLens",
  description:
    "The complete cookie inventory for HireLens: one essential session cookie, optional opt-in analytics, and nothing else.",
};

export default function CookiesPage() {
  return (
    <ProsePage eyebrow="Legal" title="Cookie Policy" updated="Last updated: September 2026">
      <p>
        Most sites bury a hundred trackers behind a consent wall. HireLens has so few cookies that
        we can just list them.
      </p>

      <h2>The complete inventory</h2>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Set when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>better-auth.session_token</code>
            </td>
            <td>Essential</td>
            <td>Keeps you signed in to a self-hosted instance. HttpOnly, signed.</td>
            <td>On sign-in to the product</td>
          </tr>
          <tr>
            <td>
              <code>ph_* / posthog cookies</code>
            </td>
            <td>Optional analytics</td>
            <td>
              Distinguishes visits in product analytics. Autocapture is disabled — explicit product
              events only.
            </td>
            <td>
              Only if the operator sets <code>NEXT_PUBLIC_POSTHOG_KEY</code>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>What you will never find</h2>
      <ul>
        <li>No advertising or cross-site tracking cookies.</li>
        <li>No third-party pixel tags or data brokers.</li>
        <li>No consent banner — because there is nothing to consent to beyond the table above.</li>
      </ul>

      <h2>Managing analytics cookies</h2>
      <p>
        Because analytics activate only when an operator configures a PostHog key, the honest
        control is deployment-level: don't set the key, and no analytics exist anywhere in the
        stack. Self-hosters who enable it should disclose it to their own users in their own privacy
        notice.
      </p>

      <h2>Questions</h2>
      <p>
        The <a href="/contact">contact page</a> lists the fastest ways to reach a maintainer.
      </p>
    </ProsePage>
  );
}
