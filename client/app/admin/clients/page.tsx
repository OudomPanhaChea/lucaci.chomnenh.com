"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Pagination, Segmented } from "antd";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { Plus, UsersRound } from "lucide-react";
import api, { apiError } from "@/services/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { SectionHeader } from "@/components/ui/section-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientCard } from "@/components/clients/client-card";
import ClientFormModal from "@/components/clients/client-form-modal";
import type { Client } from "@/lib/types";

const PAGE_SIZE = 12;

// Clients as a card grid (same shape as the bonus page); a card opens the
// client details page at /admin/clients/[id].
export default function ClientsPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "owner" || user?.role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "normal" | "partner" | "owing">("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const load = useCallback(() => {
    api.get("/clients").then(({ data }) => setClients(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useRealtime(["client:changed", "sale:created", "sale:updated", "sale:voided"], load);

  // Best client first: rank by money actually received, then items bought.
  // The rank is global (computed over all clients), so it stays stable when
  // the list is searched or filtered.
  const rankOf = useMemo(() => {
    const sorted = [...clients].sort(
      (a, b) =>
        Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0) ||
        Number(b.total_items ?? 0) - Number(a.total_items ?? 0) ||
        Number(b.purchase_count ?? 0) - Number(a.purchase_count ?? 0)
    );
    return new Map(sorted.map((c, i) => [c.id, i + 1]));
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(
        (c) =>
          (typeFilter === "all" ||
            (typeFilter === "owing" ? Number(c.outstanding) > 0 : c.client_type === typeFilter)) &&
          (!q ||
            c.name.toLowerCase().includes(q) || c.phone?.includes(q) ||
            c.email?.toLowerCase().includes(q) || c.id_card?.toLowerCase().includes(q))
      )
      .sort((a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0));
  }, [clients, search, typeFilter, rankOf]);

  const partnerCount = useMemo(
    () => clients.filter((c) => c.client_type === "partner").length,
    [clients]
  );
  const owingCount = useMemo(
    () => clients.filter((c) => Number(c.outstanding) > 0).length,
    [clients]
  );

  // Snap back to page 1 whenever the visible set changes
  useEffect(() => setPage(1), [search, typeFilter]);
  const pageClients = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setFormOpen(true);
  };
  const remove = async (c: Client) => {
    try {
      await api.delete(`/clients/${c.id}`);
      toast.success("Client deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Clients"
        subtitle={`${clients.length} saved customers`}
        actions={
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add client
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input allowClear className="!w-72" placeholder="Search name, phone, email, ID"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <Segmented
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { label: `All (${clients.length})`, value: "all" },
            { label: `Normal (${clients.length - partnerCount})`, value: "normal" },
            { label: `Partners (${partnerCount})`, value: "partner" },
            { label: `Owing (${owingCount})`, value: "owing" },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={clients.length === 0 ? "No clients yet" : "No clients match your filters"}
          description={
            clients.length === 0
              ? "Save a customer here (or from the POS) to track their purchases and balances."
              : "Try a different search or filter."
          }
          action={
            clients.length === 0 ? (
              <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Add client
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4">
            {pageClients.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                rank={rankOf.get(c.id) ?? 0}
                canDelete={canDelete}
                onEdit={() => openEdit(c)}
                onDelete={() => remove(c)}
              />
            ))}
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="mt-4 flex justify-center">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <ClientFormModal
        open={formOpen}
        client={editing}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
