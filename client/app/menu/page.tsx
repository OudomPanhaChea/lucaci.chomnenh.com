"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, PackageOpen, Phone, MapPin, Store, Eye, ChevronLeft, ChevronRight,
} from "lucide-react";
import axios from "axios";
import ThemeToggle from "@/components/theme/theme-toggle";
import { money, khr, unitPrice } from "@/lib/format";

interface MenuData {
  business: {
    name: string; logo_url: string | null; banners: string[]; phone: string | null;
    address: string | null; currency: string; exchange_rate: number;
  };
  categories: { id: number; name: string }[];
  products: {
    id: number; name: string; category_id: number | null;
    sell_price: number; discount_pct: number; image_url: string | null; description: string | null;
  }[];
}

type MenuProduct = MenuData["products"][0];

// Swipeable banner slideshow (max 4 images, managed in Settings). The track
// slides with a transform instead of native scroll, so no scrollbar can ever
// appear and the slides loop: past the last one it wraps back to the first.
function BannerCarousel({ images }: { images: string[] }) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState<{ startX: number; dx: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (i: number) => setIndex(((i % count) + count) % count),
    [count]
  );

  // Auto-advance, paused while the customer holds a slide; depending on
  // `index` restarts the timer so a manual swipe gets a full interval.
  useEffect(() => {
    if (count < 2 || drag) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearInterval(timer);
  }, [count, drag, index]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, dx: 0 });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX;
    setDrag((d) => (d ? { ...d, dx: x - d.startX } : d));
  };
  const endDrag = () => {
    if (!drag) return;
    const width = frameRef.current?.clientWidth || 1;
    if (Math.abs(drag.dx) > Math.min(width * 0.15, 80)) {
      go(index + (drag.dx < 0 ? 1 : -1));
    }
    setDrag(null);
  };

  const dragPct = drag ? (drag.dx / (frameRef.current?.clientWidth || 1)) * 100 : 0;

  return (
    <div className="relative mb-5">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`overflow-hidden rounded-2xl border border-line shadow-card ${
          count > 1 ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={`flex ${drag ? "" : "transition-transform duration-500 ease-out"}`}
          style={{ transform: `translateX(calc(${dragPct}% - ${index * 100}%))` }}
        >
          {images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="Promotion banner" draggable={false}
              className="aspect-[3/1] w-full flex-none select-none object-cover" />
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors duration-200 hover:bg-black/55 sm:flex"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors duration-200 hover:bg-black/55 sm:flex"
          >
            <ChevronRight className="h-4.5 w-4.5" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Go to banner ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 cursor-pointer rounded-full transition-all duration-200 ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCard({ product, exchangeRate }: { product: MenuProduct; exchangeRate: number }) {
  const price = unitPrice(product.sell_price, product.discount_pct);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card">
      <div className="relative aspect-square w-full bg-surface-sunken">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} loading="lazy"
            className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PackageOpen className="h-8 w-8 text-fg-subtle" />
          </div>
        )}
        {product.discount_pct > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">
            -{product.discount_pct}%
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate font-medium text-fg">{product.name}</p>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{product.description}</p>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="tabular font-semibold text-brand dark:text-brand-soft-foreground">
            {money(price)}
          </span>
          {product.discount_pct > 0 && (
            <s className="tabular text-xs text-fg-subtle">{money(product.sell_price)}</s>
          )}
        </div>
        <p className="tabular text-xs text-fg-subtle">{khr(price, exchangeRate)}</p>
      </div>
    </div>
  );
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

// Public read-only menu. No auth cookie needed, no ordering — customers can
// only browse what the business chose to show (show_in_menu products).
export default function MenuPage() {
  const [data, setData] = useState<MenuData | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    axios.get("/api/public/menu")
      .then(({ data }) => setData(data))
      .catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.products.filter(
      (p) =>
        (!categoryId || p.category_id === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    );
  }, [data, search, categoryId]);

  // Only show categories that actually contain menu products
  const categories = useMemo(() => {
    if (!data) return [];
    const used = new Set(data.products.map((p) => p.category_id));
    return data.categories.filter((c) => used.has(c.id));
  }, [data]);

  // Browsing everything: products grouped under category headings. Searching
  // or picking a chip switches to a single flat grid of the matches.
  const showSections = !search.trim() && categoryId === null;
  const grouped = useMemo(() => {
    if (!data) return [];
    const catIds = new Set(categories.map((c) => c.id));
    const groups = categories.map((c) => ({
      id: c.id,
      name: c.name,
      products: data.products.filter((p) => p.category_id === c.id),
    }));
    const other = data.products.filter((p) => !p.category_id || !catIds.has(p.category_id));
    if (other.length) groups.push({ id: 0, name: "Other", products: other });
    return groups.filter((g) => g.products.length > 0);
  }, [data, categories]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
        <Store className="h-10 w-10 text-fg-subtle" />
        <h1 className="mt-3 text-lg font-semibold text-fg">Menu unavailable</h1>
        <p className="mt-1 text-sm text-fg-muted">This menu is currently not public. Please check back later.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/95 shadow-card backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data?.business.logo_url || "/images/chomnenh-mark.png"}
              alt={data?.business.name ?? "Chomnenh"}
              className="h-9 w-9 shrink-0 rounded-lg bg-white object-cover" />
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-fg">{data?.business.name ?? "Menu"}</h1>
              <p className="flex items-center gap-1 text-xs text-fg-subtle">
                <Eye className="h-3 w-3" /> Menu preview
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-10 pt-4">
        {/* Promotion banners */}
        {data && data.business.banners?.length > 0 && (
          <BannerCarousel images={data.business.banners} />
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className="w-full rounded-xl border border-line bg-surface-raised py-2.5 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {/* Category chips */}
        <div className="no-scrollbar sticky top-16 z-20 -mx-4 mb-4 overflow-x-auto bg-surface px-4 py-2">
          <div className="flex gap-1.5">
            {[{ id: null as number | null, name: "All" }, ...categories].map((c) => (
              <button
                key={c.id ?? "all"}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200 ${
                  categoryId === c.id
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-line bg-surface-raised text-fg-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products */}
        {!data ? (
          <div className={GRID}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-line bg-surface-raised">
                <div className="aspect-square bg-surface-sunken" />
                <div className="space-y-2 p-3">
                  <div className="h-3.5 w-3/4 rounded bg-surface-sunken" />
                  <div className="h-3.5 w-1/3 rounded bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <PackageOpen className="h-10 w-10 text-fg-subtle" />
            <p className="mt-3 text-fg-muted">Nothing matches your search.</p>
          </div>
        ) : showSections ? (
          grouped.map((g) => (
            <section key={g.id} className="mb-8 last:mb-0">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-base font-semibold text-fg">{g.name}</h2>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {g.products.length} {g.products.length === 1 ? "item" : "items"}
                </span>
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>
              <div className={GRID}>
                {g.products.map((p) => (
                  <ProductCard key={p.id} product={p} exchangeRate={data.business.exchange_rate} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className={GRID}>
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} exchangeRate={data.business.exchange_rate} />
            ))}
          </div>
        )}

        {/* Footer */}
        {data && (
          <footer className="mt-14 border-t border-line pt-8 text-center text-sm text-fg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.business.logo_url || "/images/chomnenh-mark.png"}
              alt={data.business.name}
              className="mx-auto h-12 w-12 rounded-xl bg-white object-cover shadow-card" />
            <p className="mt-2.5 font-semibold text-fg">{data.business.name}</p>
            <div className="mt-2 flex flex-col items-center gap-1.5">
              {data.business.phone && (
                <a href={`tel:${data.business.phone}`}
                  className="flex items-center gap-2 transition-colors duration-200 hover:text-fg">
                  <Phone className="h-3.5 w-3.5" /> {data.business.phone}
                </a>
              )}
              {data.business.address && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" /> {data.business.address}
                </p>
              )}
            </div>
            <p className="mt-5 text-xs text-fg-subtle">
              Menu preview only. Visit us in store or call to order.
            </p>
            <p className="mt-1 pb-2 text-xs text-fg-subtle">
              © {new Date().getFullYear()} {data.business.name}
            </p>
          </footer>
        )}
      </main>
    </div>
  );
}
