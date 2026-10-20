import { redirect } from "next/navigation";

export default function LegacyGovernanceRedirect() {
  redirect("/console/governance");
}
