"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, PackageOpen, Phone, MapPin, Store, Eye } from "lucide-react";
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

// Swipeable banner slideshow (max 4 images, managed in Settings). Plain
// scroll-snap so the public page stays free of carousel libraries.
function BannerCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), 4500);
    return () => clearInterval(timer);
  }, [images.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
  }, [index]);

  // Keep the dots honest when the customer swipes by hand
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <div className="relative mb-4">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-line shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="Promotion banner"
            className="aspect-[3/1] w-full flex-none snap-center object-cover" />
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Go to banner ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 cursor-pointer rounded-full transition-all duration-200 ${
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
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
        <div className="sticky top-16 z-20 -mx-4 mb-4 overflow-x-auto bg-surface px-4 py-2">
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
        {data && filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <PackageOpen className="h-10 w-10 text-fg-subtle" />
            <p className="mt-3 text-fg-muted">Nothing matches your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(data ? filtered : Array.from({ length: 8 })).map((p, i) =>
              !data ? (
                <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-line bg-surface-raised">
                  <div className="aspect-square bg-surface-sunken" />
                  <div className="space-y-2 p-3">
                    <div className="h-3.5 w-3/4 rounded bg-surface-sunken" />
                    <div className="h-3.5 w-1/3 rounded bg-surface-sunken" />
                  </div>
                </div>
              ) : (
                <div key={(p as MenuData["products"][0]).id}
                  className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card">
                  {(() => {
                    const prod = p as MenuData["products"][0];
                    const price = unitPrice(prod.sell_price, prod.discount_pct);
                    return (
                      <>
                        <div className="relative aspect-square w-full bg-surface-sunken">
                          {prod.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={prod.image_url} alt={prod.name} loading="lazy"
                              className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <PackageOpen className="h-8 w-8 text-fg-subtle" />
                            </div>
                          )}
                          {prod.discount_pct > 0 && (
                            <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">
                              -{prod.discount_pct}%
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="truncate font-medium text-fg">{prod.name}</p>
                          {prod.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{prod.description}</p>
                          )}
                          <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="tabular font-semibold text-brand dark:text-brand-soft-foreground">
                              {money(price)}
                            </span>
                            {prod.discount_pct > 0 && (
                              <s className="tabular text-xs text-fg-subtle">{money(prod.sell_price)}</s>
                            )}
                          </div>
                          {data && (
                            <p className="tabular text-xs text-fg-subtle">
                              {khr(price, data.business.exchange_rate)}
                            </p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )
            )}
          </div>
        )}

        {/* Footer */}
        {data && (data.business.phone || data.business.address) && (
          <footer className="mt-10 rounded-xl border border-line bg-surface-raised p-4 text-sm text-fg-muted shadow-card">
            <p className="mb-2 font-medium text-fg">{data.business.name}</p>
            {data.business.phone && (
              <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {data.business.phone}</p>
            )}
            {data.business.address && (
              <p className="mt-1 flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {data.business.address}</p>
            )}
          </footer>
        )}
      </main>
    </div>
  );
}
