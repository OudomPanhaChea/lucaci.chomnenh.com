"use client";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import api from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { paperSlug } from "@/components/paper/paper";
import StatementPaper from "@/components/clients/statement-paper";
import type { Client, Sale } from "@/lib/types";

// Loads the selected invoices in full (items included) and previews them as
// one downloadable A4 statement (multi-sheet when they don't fit one page).
export default function StatementPaperModal({
  client,
  saleIds,
  onClose,
}: {
  client: Client | null;
  saleIds: number[] | null; // null = closed
  onClose: () => void;
}) {
  const { user } = useAuth();
  const open = !!client && !!saleIds?.length;
  const settings = usePaperSettings(open);
  const [sales, setSales] = useState<Sale[] | null>(null);

  useEffect(() => {
    if (!saleIds?.length) {
      setSales(null);
      return;
    }
    let stale = false;
    Promise.all(saleIds.map((id) => api.get(`/sales/${id}`)))
      .then((rs) => {
        if (stale) return;
        const full = rs.map((r) => r.data as Sale);
        full.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
        setSales(full);
      })
      .catch(() => !stale && setSales([]));
    return () => { stale = true; };
  }, [saleIds]);

  return (
    <PaperModal
      open={open}
      onClose={onClose}
      title="Statement paper"
      canDownload={!!sales?.length}
      filename={client ? `statement-${paperSlug(client.name)}-${dayjs().format("YYYYMMDD")}.jpg` : "statement.jpg"}
    >
      {client && sales?.length ? (
        <StatementPaper
          client={client}
          sales={sales}
          settings={settings}
          preparedBy={user?.name ?? ""}
        />
      ) : (
        <div className="flex h-64 w-96 items-center justify-center bg-white">
          <Spinner />
        </div>
      )}
    </PaperModal>
  );
}
