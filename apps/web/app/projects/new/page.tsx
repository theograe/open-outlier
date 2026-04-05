import { redirect } from "next/navigation";

export default function DeprecatedProjectNewPage() {
  redirect("/collections/new");
}
