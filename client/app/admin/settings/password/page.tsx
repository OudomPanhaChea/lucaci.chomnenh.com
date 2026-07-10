import { redirect } from "next/navigation";

// Password change now lives on the profile page
export default function ChangePasswordPage() {
  redirect("/admin/profile");
}
