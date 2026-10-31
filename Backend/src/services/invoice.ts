import { prisma } from '../lib/prisma';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const inr = (v: unknown) => '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Simple printable tax invoice. Company GSTIN / address are placeholders to fill in. */
export async function renderInvoice(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } }, member: { include: { user: true } } },
  });
  const pkg = o.packageId ? await prisma.package.findUnique({ where: { id: o.packageId } }) : null;
  const rows = pkg
    ? `<tr><td>1</td><td>${esc(pkg.name)}<div class="muted">Includes: ${o.items.map((i) => `${esc(i.product.name)} × ${i.qty}`).join(', ') || 'products as per package'}</div></td><td>—</td><td>1</td><td>${inr(o.grandTotal)}</td><td>${esc(o.bvTotal)}</td><td>${inr(o.grandTotal)}</td></tr>`
    : o.items
        .map(
          (i, n) =>
            `<tr><td>${n + 1}</td><td>${esc(i.product.name)}<div class="muted">${esc(i.product.sku)}</div></td><td>${esc(i.product.hsnCode ?? '—')}</td><td>${i.qty}</td><td>${inr(i.unitPrice)}</td><td>${esc(i.unitBv.mul(i.qty))}</td><td>${inr(i.unitPrice.mul(i.qty))}</td></tr>`,
        )
        .join('');
  const half = Number(o.gstTotal) / 2;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(o.invoiceNo)}</title>
<style>body{font-family:Arial,sans-serif;color:#1f2937;margin:32px;font-size:13px}h1{color:#14532d;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#ecfdf5}.muted{color:#6b7280;font-size:11px}.right{text-align:right}.top{display:flex;justify-content:space-between;gap:24px}
.tot td{border:none;padding:4px 8px}.badge{display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;font-size:11px}@media print{button{display:none}}</style></head>
<body><button onclick="window.print()" style="float:right;padding:8px 14px">Print / Save PDF</button>
<div class="top"><div><h1>Navarth Wellness Pvt. Ltd.</h1><div class="muted">Jiyo Zindagi Shaan Se · GSTIN: <b>TO-BE-FILLED</b> · Registered office: TO BE FILLED</div></div>
<div><h2 style="margin:0">TAX INVOICE</h2><div>No: <b>${esc(o.invoiceNo)}</b></div><div>Date: ${o.paidAt?.toLocaleDateString('en-IN')}</div><div>Order: ${esc(o.orderNo)}</div></div></div>
<p><b>Bill to:</b> ${esc(o.member?.fullName)} (${esc(o.member?.distributorCode)}) · ${esc(o.member?.user.mobile)}</p>
<table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate (incl. GST)</th><th>BV</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot" style="width:320px;margin-left:auto"><tr><td>Taxable value</td><td class="right">${inr(o.subTotal)}</td></tr>
<tr><td>CGST</td><td class="right">${inr(half)}</td></tr><tr><td>SGST</td><td class="right">${inr(half)}</td></tr>
<tr><td><b>Grand total</b></td><td class="right"><b>${inr(o.grandTotal)}</b></td></tr><tr><td>Total BV</td><td class="right">${esc(o.bvTotal)}</td></tr></table>
<p class="muted">Goods once sold can be returned within the cooling-off period as per the company return policy. This is a computer-generated invoice. <span class="badge">DEMO</span> Fill in GSTIN, address, HSN codes and use IGST for inter-state supply before going live.</p>
</body></html>`;
}
