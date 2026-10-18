import { OfflineWorkspace } from "@/components/offline-workspace";
import { Brand } from "@/components/brand";
import { PageHeading } from "@/components/page-heading";
export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-9">
        <Brand />
      </div>
      <PageHeading
        eyebrow="Belajar di perangkat Anda"
        title="Ruang offline"
        description="Buka materi tersimpan dan lanjutkan draf tugas. Kumpulkan draf ketika koneksi kembali tersedia."
      />
      <OfflineWorkspace />
    </main>
  );
}
