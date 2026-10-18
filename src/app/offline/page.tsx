import { OfflineWorkspace } from "@/components/offline-workspace";
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-emerald-800">LMS Nurul Falah</p>
      <h1 className="mb-5 mt-3 text-3xl font-semibold">Ruang offline</h1>
      <OfflineWorkspace />
    </main>
  );
}
