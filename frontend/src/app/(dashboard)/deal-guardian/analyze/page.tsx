import { redirect } from "next/navigation";

// The main Deal Guardian page (src/app/(dashboard)/deal-guardian/page.tsx)
// already handles contract analysis inline via ContractUploadForm — this
// sub-route would be a duplicate of that same form. Redirecting instead of
// building a second copy, per the handoff doc's note to confirm with the
// frontend lead before building this one; if a distinct page is wanted
// later, replace this redirect.
export default function AnalyzeRedirectPage() {
  redirect("/deal-guardian");
}
