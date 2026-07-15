"use client";
import { Fragment } from "react";
import type { Sale, Settings } from "@/lib/types";
import { money, khr, num, fmtDate } from "@/lib/format";

// 80mm receipt. Rendered inside a hidden container; @media print rules in
// globals.css make only #print-receipt visible when window.print() runs.
export default function Receipt({ sale, settings }: { sale: Sale; settings: Settings | null }) {
  return (
    <div id="print-receipt" className="bg-white p-3 font-mono text-[12px] leading-relaxed text-black">
      <div className="text-center">
        <p className="text-base font-bold">{settings?.business_name || "Chomnenh"}</p>
        {settings?.address ? <p>{settings.address}</p> : null}
        {settings?.phone ? <p>Tel: {settings.phone}</p> : null}
      </div>
      <hr className="my-2 border-dashed border-black" />
      <p>Invoice: {sale.invoice_number}</p>
      <p>Date: {fmtDate(sale.created_at)}</p>
      {sale.cashier_name ? <p>Cashier: {sale.cashier_name}</p> : null}
      {sale.client_name ? <p>Client: {sale.client_name}</p> : null}
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-left">
            <th className="w-1/4 font-normal">Qty</th>
            <th className="w-1/4 font-normal">Unit</th>
            <th className="w-1/4 text-right font-normal">Price</th>
            <th className="w-1/4 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((it) => (
            <Fragment key={it.id}>
              <tr>
                <td colSpan={4} className="pt-1 font-bold">
                  {it.name_snapshot}
                  {it.discount_pct > 0 && !it.is_bonus ? ` (-${it.discount_pct}%)` : ""}
                </td>
              </tr>
              <tr>
                <td className="align-top">{num(it.quantity)}</td>
                <td className="align-top">
                  {it.unit_name ?? it.base_unit ?? "pcs"}
                </td>
                <td className="whitespace-nowrap text-right align-top">{it.is_bonus ? "FREE" : money(it.price)}</td>
                <td className="whitespace-nowrap text-right align-top">{it.is_bonus ? "FREE" : money(it.line_total)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          <tr><td>Subtotal</td><td className="text-right">{money(sale.subtotal)}</td></tr>
          {Number(sale.discount_amount) > 0 && (
            <tr><td>Discount ({sale.discount_pct}%)</td><td className="text-right">-{money(sale.discount_amount)}</td></tr>
          )}
          {Number(sale.tax_amount) > 0 && (
            <tr><td>Tax ({sale.tax_rate}%)</td><td className="text-right">{money(sale.tax_amount)}</td></tr>
          )}
          <tr className="text-sm font-bold">
            <td>TOTAL</td><td className="text-right">{money(sale.total)}</td>
          </tr>
          <tr>
            <td>KHR</td>
            <td className="text-right">{khr(sale.total, sale.exchange_rate)}</td>
          </tr>
          <tr><td>Paid by</td><td className="text-right uppercase">{sale.payment_method}</td></tr>
          {sale.amount_received !== null && (
            <>
              <tr><td>Received</td><td className="text-right">{money(sale.amount_received)}</td></tr>
              <tr><td>Change</td><td className="text-right">{money(sale.change_due)}</td></tr>
            </>
          )}
          {Number(sale.amount_paid) < Number(sale.total) && (
            <>
              <tr><td>Paid</td><td className="text-right">{money(sale.amount_paid)}</td></tr>
              <tr className="font-bold">
                <td>BALANCE DUE</td><td className="text-right">{money(Number(sale.total) - Number(sale.amount_paid))}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <p className="text-center">{settings?.receipt_footer || "Thank you, see you again!"}</p>
    </div>
  );
}
