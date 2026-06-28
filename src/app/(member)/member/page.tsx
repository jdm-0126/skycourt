import { redirect } from "next/navigation";

/**
 * /member → redirect to the member dashboard.
 */
export default function MemberIndexPage() {
  redirect("/member/dashboard");
}
