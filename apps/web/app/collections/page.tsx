import { ProjectsDashboard, type ProjectSummary } from "../../components/projects-dashboard";

const API_URL = process.env.NEXT_PUBLIC_OPENOUTLIER_API_URL ?? "http://localhost:3001";
const API_KEY = process.env.NEXT_PUBLIC_OPENOUTLIER_API_KEY;

async function getCollections(): Promise<ProjectSummary[]> {
  try {
    const response = await fetch(`${API_URL}/api/collections`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {},
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

export default async function CollectionsPage() {
  const collections = await getCollections();
  return <ProjectsDashboard initialProjects={collections} mode="collections" />;
}
