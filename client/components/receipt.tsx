"use client";
import type { Sale, Settings } from "@/lib/types";
import { money, khr, fmtDate } from "@/lib/format";

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
      <table className="w-full">
        <tbody>
          {sale.items?.map((it) => (
            <tr key={it.id}>
              <td className="align-top">
                {it.name_snapshot}
                <br />
                <span>
                  {it.quantity} x {money(it.price)}
                  {it.discount_pct > 0 ? ` (-${it.discount_pct}%)` : ""}
                </span>
              </td>
              <td className="whitespace-nowrap text-right align-bottom">{money(it.line_total)}</td>
            </tr>
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
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <p className="text-center">{settings?.receipt_footer || "Thank you, see you again!"}</p>
    </div>
  );
}
