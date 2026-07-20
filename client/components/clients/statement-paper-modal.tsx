"use client";
import { useEffect, useState } from "react";
import { Checkbox } from "antd";
import dayjs from "dayjs";
import api from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { paperSlug } from "@/components/paper/paper";
import StatementPaper from "@/components/clients/statement-paper";
import { money } from "@/lib/format";
import type { Client, Sale } from "@/lib/types";

// Loads the selected invoices in full (items included) and previews them as
// one downloadable A4 statement (multi-sheet when they don't fit one page).
// Clients with remaining previous owing get a toggle to fold it into the
// totals; saleIds = [] prints the previous owing on its own (no invoices).
export default function StatementPaperModal({
  client,
  saleIds,
  onClose,
}: {
  client: Client | null;
  saleIds: number[] | null; // null = closed; [] = previous owing only
  onClose: () => void;
}) {
  const { user } = useAuth();
  const owingAlone = !!saleIds && saleIds.length === 0;
  const open = !!client && !!saleIds;
  const settings = usePaperSettings(open);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const oldOwing = Number(client?.opening_owing) || 0;
  const [includeOld, setIncludeOld] = useState(true);

  useEffect(() => {
    if (!saleIds) {
      setSales(null);
      setIncludeOld(true); // fresh default next open
      return;
    }
    if (saleIds.length === 0) {
      setSales([]); // owing-only paper, nothing to fetch
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

  const ready = !!sales && (sales.length > 0 || (owingAlone && oldOwing > 0));

  return (
    <PaperModal
      open={open}
      onClose={onClose}
      title="Statement paper"
      canDownload={ready}
      filename={client ? `statement-${paperSlug(client.name)}-${dayjs().format("YYYYMMDD")}.jpg` : "statement.jpg"}
      toolbar={oldOwing > 0 && !owingAlone ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <Checkbox
            checked={includeOld}
            onChange={(e) => setIncludeOld(e.target.checked)}
          />
          Include {money(oldOwing)} owing in the total
        </label>
      ) : null}
    >
      {client && ready ? (
        <StatementPaper
          client={client}
          sales={sales}
          settings={settings}
          preparedBy={user?.name ?? ""}
          oldOwing={owingAlone || includeOld ? oldOwing : 0}
        />
      ) : (
        <div className="flex h-64 w-96 items-center justify-center bg-white">
          <Spinner />
        </div>
      )}
    </PaperModal>
  );
}
