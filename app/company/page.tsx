import CompanySearch from "@/components/CompanySearch";

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  return (
    <main className="pt-4">
      <CompanySearch autoFocus={focus === "1"} />
    </main>
  );
}
