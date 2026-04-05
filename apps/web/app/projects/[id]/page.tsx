import { redirect } from "next/navigation";

export default async function LegacyProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/collections/${id}`);
}
