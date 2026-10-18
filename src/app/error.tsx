"use client";
import { StatePage } from "@/components/state-page";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <StatePage
      title="Halaman belum dapat dibuka"
      description="Silakan coba kembali. Jika kendala berlanjut, hubungi admin madrasah."
    >
      <Button onClick={reset}>Coba lagi</Button>
    </StatePage>
  );
}
