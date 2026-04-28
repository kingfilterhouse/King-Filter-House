/* ==========================================
   JS START: Invoice Template Module
   3 built-in templates + custom drag-to-position
   ========================================== */

(function () {

const STORAGE_KEY = 'kfh_invoice_settings';

// ===== FIELD DEFINITIONS =====
const FIELDS = [
    { key: 'business_name',    label: '🏢 Business Name',    sample: 'King Filter House' },
    { key: 'business_tagline', label: '📝 Tagline',           sample: 'Your Filter Specialists' },
    { key: 'business_phone',   label: '📞 Business Phone',   sample: '0300-0000000' },
    { key: 'invoice_no',       label: '🔖 Invoice / PO No.', sample: 'INV-2026-001' },
    { key: 'date',             label: '📅 Date',             sample: '07 Mar 2026' },
    { key: 'party_label',      label: '🏷️ Party Label',      sample: 'Customer:' },
    { key: 'party_name',       label: '👤 Party Name',       sample: 'Ahmed Khan' },
    { key: 'party_phone',      label: '📱 Party Phone',      sample: '0321-1234567' },
    { key: 'items_table',      label: '📦 Items Table',      sample: null },
    { key: 'subtotal',         label: '💰 Subtotal',         sample: 'PKR 5,000' },
    { key: 'discount',         label: '🏷️ Discount',         sample: 'PKR 200' },
    { key: 'total',            label: '💵 Grand Total',      sample: 'PKR 4,800' },
    { key: 'paid',             label: '✅ Amount Paid',      sample: 'PKR 4,800' },
    { key: 'balance',          label: '⚠️ Balance Due',      sample: 'PKR 0' },
    { key: 'status_badge',     label: '🔵 Status',           sample: 'PAID' },
    { key: 'notes',            label: '📋 Notes',            sample: 'Thank you!' },
    { key: 'thank_you',        label: '🙏 Thank You Line',   sample: 'Thank you for your business!' },
];

// ===== SETTINGS =====
let settings = {
    template: 'modern',
    customBg: null,
    layout: {},
    businessName:    '',
    businessTagline: 'Your Trusted Filter Specialists',
    businessPhone:   '',
    businessAddress: '',
    thankYouText:    'Thank you for your business!',
};

function loadSettings() {
    try {
        // Use user-specific storage key to prevent cross-user data leakage
        const uid = window._currentUserId || 'default';
        const key = STORAGE_KEY + '_' + uid;
        const s = localStorage.getItem(key) || localStorage.getItem(STORAGE_KEY);
        if (s) {
            const parsed = JSON.parse(s);
            Object.assign(settings, parsed);
        }
    } catch (e) {}
}

function saveSettings() {
    try {
        const uid = window._currentUserId || 'default';
        const key = STORAGE_KEY + '_' + uid;
        localStorage.setItem(key, JSON.stringify(settings));
    } catch (e) {}
}

loadSettings();

// Called by app.js after login — syncs Supabase profile data into invoice template
window.InvoiceTemplate = window.InvoiceTemplate || {};
window.InvoiceTemplate._syncBizFromProfile = function(biz) {
    if (!biz) return;
    if (biz.name)    settings.businessName    = biz.name;
    if (biz.phone)   settings.businessPhone   = biz.phone;
    if (biz.address) settings.businessAddress = biz.address;
    saveSettings();
    window.log('✅ Invoice biz info synced from profile:', biz.name);
};

// ===== SAMPLE DATA FOR PREVIEW =====
function buildSampleData() {
    return {
        type: 'sale',
        invoice_no: 'INV-2026-001',
        date: '07 Mar 2026',
        party_label: 'Customer',
        party_name: 'Ahmed Khan',
        party_phone: '0321-1234567',
        items: [
            { name: 'Air Filter X200',       qty: 2, unit_price: 750,  total: 1500 },
            { name: 'Oil Filter Heavy Duty', qty: 1, unit_price: 1200, total: 1200 },
            { name: 'Cabin Filter F100',     qty: 3, unit_price: 450,  total: 1350 },
        ],
        subtotal: 4050,
        discount: 200,
        total: 3850,
        paid: 3850,
        balance: 0,
        status: 'paid',
        notes: '',
    };
}

// ===== BIZ HELPER =====
function getBiz() {
    return {
        name:    settings.businessName    || (function(){ const uid=window._currentUserId||'anon'; return localStorage.getItem('kfh_biz_name_'+uid) || localStorage.getItem('kfh_biz_name') || 'My Business'; })(),
        tagline: settings.businessTagline || '',
        phone:   settings.businessPhone   || '',
        address: settings.businessAddress || '',
        thankYou: settings.thankYouText   || 'Thank you for your business!',
    };
}

// ===================================================
//   TEMPLATE 1: MODERN (dark gradient header)
// ===================================================
function tplModern(data, biz) {
    const sc = { paid: '#10b981', partial: '#f59e0b', unpaid: '#ef4444' }[data.status] || '#6b7280';
    const docTitle = data.type === 'purchase' ? 'PURCHASE ORDER' : 'INVOICE';

    return `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',Arial,sans-serif;background:#fff;color:#1a1a2e}
.w{max-width:800px;margin:0 auto}
.hd{background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);color:#fff;padding:2.5rem;display:flex;justify-content:space-between;align-items:flex-start}
.bname{font-size:1.6rem;font-weight:800;letter-spacing:-0.02em}
.btag{font-size:0.78rem;opacity:0.65;margin-top:0.2rem}
.bcontact{font-size:0.75rem;opacity:0.55;margin-top:0.3rem}
.rt{text-align:right}
.doctitle{font-size:2rem;font-weight:800;letter-spacing:0.05em;opacity:0.9}
.invno{font-size:0.82rem;opacity:0.65;margin-top:0.25rem}
.invdate{font-size:0.78rem;opacity:0.55;margin-top:0.2rem}
.body{padding:2rem 2.5rem}
.parties{display:flex;justify-content:space-between;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:2px solid #f0f0f0}
.plbl{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;font-weight:700;margin-bottom:0.35rem}
.pname{font-size:1.05rem;font-weight:700}
.pphone{font-size:0.82rem;color:#6b7280;margin-top:0.15rem}
.sbadge{display:inline-block;padding:0.25rem 0.8rem;border-radius:999px;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${sc}20;color:${sc};border:1px solid ${sc}60;margin-top:0.5rem}
table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
thead tr{background:linear-gradient(135deg,#0f0c29,#302b63);color:#fff}
thead th{padding:0.8rem 1rem;text-align:left;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em}
thead th:last-child{text-align:right}
tbody tr:nth-child(even){background:#f8f9ff}
tbody td{padding:0.8rem 1rem;font-size:0.88rem;border-bottom:1px solid #f0f0f0}
tbody td:last-child{text-align:right;font-weight:600}
.tfoot-row td{padding:0.55rem 1rem;font-size:0.86rem;color:#6b7280}
.tfoot-row td:last-child{text-align:right;font-weight:600;color:#1a1a2e}
.tfoot-grand td{font-size:1.05rem;font-weight:800;border-top:2px solid #302b63;padding-top:0.85rem;color:#302b63}
.footer{background:#f8f9ff;padding:1.1rem 2.5rem;display:flex;justify-content:space-between;align-items:center;border-top:3px solid #302b63}
.fthanks{font-size:0.82rem;color:#6b7280;font-style:italic}
.fnote{font-size:0.7rem;color:#d1d5db}
@media print{@page{margin:0;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
<div class="w">
  <div class="hd">
    <div>
      <div class="bname">${biz.name}</div>
      ${biz.tagline  ? `<div class="btag">${biz.tagline}</div>` : ''}
      ${biz.phone    ? `<div class="bcontact">📞 ${biz.phone}</div>` : ''}
      ${biz.address  ? `<div class="bcontact">📍 ${biz.address}</div>` : ''}
    </div>
    <div class="rt">
      <div class="doctitle">${docTitle}</div>
      <div class="invno"># ${data.invoice_no}</div>
      <div class="invdate">📅 ${data.date}</div>
    </div>
  </div>
  <div class="body">
    <div class="parties">
      <div>
        <div class="plbl">${data.party_label || (data.type === 'purchase' ? 'Supplier' : 'Customer')}</div>
        <div class="pname">${data.party_name || '—'}</div>
        ${data.party_phone ? `<div class="pphone">📞 ${data.party_phone}</div>` : ''}
        <div class="sbadge">${data.status || 'unpaid'}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Item</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map((it, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${it.name}</td>
          <td style="text-align:right">${it.qty}</td>
          <td style="text-align:right">PKR ${(it.unit_price || 0).toLocaleString()}</td>
          <td>PKR ${(it.total || 0).toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr class="tfoot-row"><td colspan="4">Subtotal</td><td>PKR ${(data.subtotal||0).toLocaleString()}</td></tr>
        ${data.discount ? `<tr class="tfoot-row"><td colspan="4">Discount</td><td>− PKR ${(data.discount||0).toLocaleString()}</td></tr>` : ''}
        <tr class="tfoot-grand"><td colspan="4">Grand Total</td><td>PKR ${(data.total||0).toLocaleString()}</td></tr>
        <tr class="tfoot-row"><td colspan="4">Amount Paid</td><td>PKR ${(data.paid||0).toLocaleString()}</td></tr>
        ${data.balance > 0 ? `<tr class="tfoot-row" style="color:#ef4444"><td colspan="4">Balance Due</td><td>PKR ${(data.balance||0).toLocaleString()}</td></tr>` : ''}
      </tfoot>
    </table>
    ${data.notes ? `<div style="padding:0.85rem 1rem;background:#f8f9ff;border-left:3px solid #302b63;border-radius:4px;font-size:0.83rem;color:#555;margin-top:0.5rem"><strong>Notes:</strong> ${data.notes}</div>` : ''}
  </div>
  <div class="footer">
    <div class="fthanks">${biz.thankYou}</div>
    <div class="fnote">${biz.name}</div>
  </div>
</div>`;
}

// ===================================================
//   TEMPLATE 2: MINIMAL (clean white, thin lines)
// ===================================================
function tplMinimal(data, biz) {
    const sc = { paid: '#10b981', partial: '#f59e0b', unpaid: '#ef4444' }[data.status] || '#6b7280';
    const docTitle = data.type === 'purchase' ? 'P.O.' : 'INV';

    return `
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',Arial,sans-serif;background:#fff;color:#111}
.w{max-width:800px;margin:0 auto;padding:3rem}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3rem}
.bname{font-size:1.3rem;font-weight:700}
.bsub{font-size:0.78rem;color:#9ca3af;margin-top:0.15rem}
.doctitle{font-size:3rem;font-weight:800;color:#f3f4f6;letter-spacing:-0.04em;line-height:1;text-align:right}
.invno-badge{display:inline-block;background:#111;color:#fff;padding:0.25rem 0.75rem;border-radius:4px;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;float:right;clear:right;margin-top:0.4rem}
.invdate{font-size:0.78rem;color:#9ca3af;clear:right;float:right;margin-top:0.35rem}
.divider{height:1px;background:#f0f0f0;margin:1.5rem 0;clear:both}
.parties{display:flex;gap:3rem;margin-bottom:2.5rem}
.plbl{font-size:0.62rem;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:0.4rem}
.pname{font-size:0.95rem;font-weight:600}
.pphone{font-size:0.78rem;color:#6b7280}
.spill{display:inline-block;border:1.5px solid ${sc};color:${sc};padding:0.15rem 0.6rem;border-radius:999px;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-top:0.35rem}
table{width:100%;border-collapse:collapse}
thead th{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;font-weight:700;padding:0.65rem 0;border-bottom:1px solid #e5e7eb;text-align:left}
thead th:last-child{text-align:right}
tbody td{padding:0.9rem 0;border-bottom:1px solid #f9fafb;font-size:0.88rem}
tbody td:last-child{text-align:right;font-weight:600}
.iname{font-weight:500}
.imeta{font-size:0.75rem;color:#9ca3af;margin-top:0.1rem}
tfoot td{padding:0.45rem 0;font-size:0.85rem;color:#6b7280}
tfoot td:last-child{text-align:right}
tfoot tr.grand td{font-size:1rem;font-weight:700;color:#111;border-top:1px solid #e5e7eb;padding-top:0.85rem}
.bottom{margin-top:3rem;display:flex;justify-content:space-between;align-items:flex-end}
.bnotes{font-size:0.8rem;color:#9ca3af;max-width:280px;line-height:1.6}
.bthanks{font-size:0.88rem;color:#111;font-weight:500}
@media print{@page{margin:1.5cm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
<div class="w">
  <div class="top">
    <div>
      <div class="bname">${biz.name}</div>
      ${biz.tagline ? `<div class="bsub">${biz.tagline}</div>` : ''}
      ${biz.phone   ? `<div class="bsub">📞 ${biz.phone}</div>` : ''}
    </div>
    <div>
      <div class="doctitle">${docTitle}</div>
      <div class="invno-badge">${data.invoice_no}</div>
      <div class="invdate">${data.date}</div>
    </div>
  </div>
  <div class="parties">
    <div>
      <div class="plbl">${data.party_label || (data.type === 'purchase' ? 'Supplier' : 'Customer')}</div>
      <div class="pname">${data.party_name || '—'}</div>
      ${data.party_phone ? `<div class="pphone">${data.party_phone}</div>` : ''}
      <div class="spill">${data.status || 'unpaid'}</div>
    </div>
    <div>
      <div class="plbl">From</div>
      <div class="pname">${biz.name}</div>
      ${biz.address ? `<div class="pphone">${biz.address}</div>` : ''}
    </div>
  </div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Rate</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map(it => `
      <tr>
        <td><div class="iname">${it.name}</div><div class="imeta">@ PKR ${(it.unit_price||0).toLocaleString()} each</div></td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right">PKR ${(it.unit_price||0).toLocaleString()}</td>
        <td>PKR ${(it.total||0).toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Subtotal</td><td>PKR ${(data.subtotal||0).toLocaleString()}</td></tr>
      ${data.discount ? `<tr><td colspan="3">Discount</td><td>− PKR ${(data.discount||0).toLocaleString()}</td></tr>` : ''}
      <tr class="grand"><td colspan="3">Total</td><td>PKR ${(data.total||0).toLocaleString()}</td></tr>
      <tr><td colspan="3">Paid</td><td>PKR ${(data.paid||0).toLocaleString()}</td></tr>
      ${data.balance > 0 ? `<tr style="color:#ef4444"><td colspan="3">Balance Due</td><td>PKR ${(data.balance||0).toLocaleString()}</td></tr>` : ''}
    </tfoot>
  </table>
  <div class="bottom">
    ${data.notes ? `<div class="bnotes"><strong>Notes:</strong><br>${data.notes}</div>` : '<div></div>'}
    <div class="bthanks">${biz.thankYou}</div>
  </div>
</div>`;
}

// ===================================================
//   TEMPLATE 3: CLASSIC (serif, traditional)
// ===================================================
function tplClassic(data, biz) {
    const sc  = { paid: '#166534', partial: '#92400e', unpaid: '#991b1b' }[data.status] || '#374151';
    const sbg = { paid: '#dcfce7', partial: '#fef3c7', unpaid: '#fee2e2' }[data.status] || '#f3f4f6';
    const docTitle = data.type === 'purchase' ? 'Purchase Order' : 'Tax Invoice';

    return `
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',Georgia,serif;background:#fff;color:#111}
.w{max-width:800px;margin:0 auto;padding:2.5rem;border:1px solid #ccc}
.hd{text-align:center;border-bottom:3px double #333;padding-bottom:1.2rem;margin-bottom:1.5rem}
.bname{font-size:1.9rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase}
.bsub{font-size:0.82rem;color:#555;margin-top:0.25rem}
.doctitle{font-size:1.15rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-top:0.85rem;color:#333}
.metabar{display:flex;justify-content:space-between;background:#f5f5f0;border:1px solid #ddd;padding:0.65rem 1rem;margin-bottom:1.5rem;font-size:0.86rem}
.metabar label{font-weight:700;margin-right:0.35rem}
.sbadge{display:inline-block;padding:0.12rem 0.5rem;background:${sbg};color:${sc};border:1px solid ${sc}50;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.5rem}
.pbox{border:1px solid #ddd;padding:0.7rem 0.9rem}
.ptitle{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#666;border-bottom:1px solid #ddd;padding-bottom:0.35rem;margin-bottom:0.45rem}
.pname{font-size:0.95rem;font-weight:700}
.pphone{font-size:0.82rem;color:#555;margin-top:0.15rem}
table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
thead tr{background:#1a1a1a;color:#fff}
thead th{padding:0.7rem 0.75rem;text-align:left;font-size:0.8rem;font-weight:600;letter-spacing:0.04em}
thead th:last-child{text-align:right}
tbody tr:nth-child(odd){background:#fafaf8}
tbody td{padding:0.6rem 0.75rem;font-size:0.88rem;border-bottom:1px solid #e5e7eb}
tbody td:last-child{text-align:right;font-weight:600}
.ttable{width:240px;margin-left:auto;border:1px solid #ddd;border-collapse:collapse}
.ttable td{padding:0.45rem 0.75rem;font-size:0.86rem;border-bottom:1px solid #eee}
.ttable td:last-child{text-align:right;font-weight:600}
.ttable tr.grand td{background:#1a1a1a;color:#fff;font-weight:700;font-size:0.95rem}
.ttable tr.bal td{background:${sbg};color:${sc};font-weight:700}
.ft{border-top:3px double #333;margin-top:1.5rem;padding-top:0.7rem;text-align:center;font-size:0.8rem;color:#666;font-style:italic}
@media print{@page{margin:1cm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.w{border:none}}
</style>
<div class="w">
  <div class="hd">
    <div class="bname">${biz.name}</div>
    ${biz.tagline ? `<div class="bsub">${biz.tagline}</div>` : ''}
    ${biz.phone || biz.address ? `<div class="bsub">${[biz.phone, biz.address].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>` : ''}
    <div class="doctitle">— ${docTitle} —</div>
  </div>
  <div class="metabar">
    <div><label>${data.type === 'purchase' ? 'PO#:' : 'Invoice#:'}</label>${data.invoice_no}</div>
    <div><label>Date:</label>${data.date}</div>
    <div><label>Status:</label> <span class="sbadge">${data.status || 'unpaid'}</span></div>
  </div>
  <div class="parties">
    <div class="pbox">
      <div class="ptitle">${data.party_label || (data.type === 'purchase' ? 'Supplier' : 'Customer')}</div>
      <div class="pname">${data.party_name || '—'}</div>
      ${data.party_phone ? `<div class="pphone">Tel: ${data.party_phone}</div>` : ''}
    </div>
    <div class="pbox">
      <div class="ptitle">From</div>
      <div class="pname">${biz.name}</div>
      ${biz.phone   ? `<div class="pphone">Tel: ${biz.phone}</div>` : ''}
      ${biz.address ? `<div class="pphone">${biz.address}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:2.2rem">#</th>
        <th>Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${it.name}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right">PKR ${(it.unit_price||0).toLocaleString()}</td>
        <td>PKR ${(it.total||0).toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <table class="ttable">
    <tr><td>Subtotal</td><td>PKR ${(data.subtotal||0).toLocaleString()}</td></tr>
    ${data.discount ? `<tr><td>Discount</td><td>− PKR ${(data.discount||0).toLocaleString()}</td></tr>` : ''}
    <tr class="grand"><td>GRAND TOTAL</td><td>PKR ${(data.total||0).toLocaleString()}</td></tr>
    <tr><td>Amount Paid</td><td>PKR ${(data.paid||0).toLocaleString()}</td></tr>
    ${data.balance > 0 ? `<tr class="bal"><td>Balance Due</td><td>PKR ${(data.balance||0).toLocaleString()}</td></tr>` : ''}
  </table>
  ${data.notes ? `<div style="border:1px dashed #ccc;padding:0.65rem;font-size:0.83rem;color:#555;margin-top:1rem"><strong>Notes:</strong> ${data.notes}</div>` : ''}
  <div class="ft">${biz.thankYou}</div>
</div>`;
}

// ===================================================
//   TEMPLATE 4: CUSTOM (drag-positioned fields)
// ===================================================
function tplCustom(data, biz, layout, bgUrl) {
    const sc = { paid: '#10b981', partial: '#f59e0b', unpaid: '#ef4444' }[data.status] || '#333';

    const vals = {
        business_name:    biz.name,
        business_tagline: biz.tagline,
        business_phone:   biz.phone,
        invoice_no:       data.invoice_no,
        date:             data.date,
        party_label:      (data.party_label || (data.type === 'purchase' ? 'Supplier' : 'Customer')) + ':',
        party_name:       data.party_name || '—',
        party_phone:      data.party_phone || '',
        subtotal:         'PKR ' + (data.subtotal||0).toLocaleString(),
        discount:         '− PKR ' + (data.discount||0).toLocaleString(),
        total:            'PKR ' + (data.total||0).toLocaleString(),
        paid:             'PKR ' + (data.paid||0).toLocaleString(),
        balance:          'PKR ' + (data.balance||0).toLocaleString(),
        status_badge:     (data.status || 'unpaid').toUpperCase(),
        notes:            data.notes || '',
        thank_you:        biz.thankYou,
    };

    const itemsTableHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;background:rgba(255,255,255,0.88);border-radius:4px;overflow:hidden">
      <thead><tr style="background:rgba(0,0,0,0.82);color:#fff">
        <th style="padding:0.5rem 0.65rem;text-align:left;font-weight:600">#</th>
        <th style="padding:0.5rem 0.65rem;text-align:left;font-weight:600">Item</th>
        <th style="padding:0.5rem 0.65rem;text-align:right;font-weight:600">Qty</th>
        <th style="padding:0.5rem 0.65rem;text-align:right;font-weight:600">Price</th>
        <th style="padding:0.5rem 0.65rem;text-align:right;font-weight:600">Total</th>
      </tr></thead>
      <tbody>${data.items.map((it, i) => `
        <tr style="background:${i % 2 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(248,249,255,0.9)'}">
          <td style="padding:0.42rem 0.65rem;border-bottom:1px solid rgba(0,0,0,0.06)">${i + 1}</td>
          <td style="padding:0.42rem 0.65rem;border-bottom:1px solid rgba(0,0,0,0.06);font-weight:600">${it.name}</td>
          <td style="padding:0.42rem 0.65rem;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right">${it.qty}</td>
          <td style="padding:0.42rem 0.65rem;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right">PKR ${(it.unit_price||0).toLocaleString()}</td>
          <td style="padding:0.42rem 0.65rem;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right;font-weight:700">PKR ${(it.total||0).toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

    let placed = '';
    Object.entries(layout || {}).forEach(([key, pos]) => {
        if (!pos) return;
        const isTable  = key === 'items_table';
        const isStatus = key === 'status_badge';
        const val = isTable ? itemsTableHTML : (vals[key] || '');
        if (!val) return;

        const statusStyle = isStatus
            ? `background:${sc}20;color:${sc};border:1px solid ${sc}60;padding:0.2rem 0.7rem;border-radius:999px;font-weight:700;text-transform:uppercase;font-size:0.68rem;letter-spacing:0.08em;`
            : '';

        placed += `<div style="position:absolute;left:${pos.x}%;top:${pos.y}%;
          ${isTable ? 'width:90%;left:5%;transform:none;' : 'transform:translateX(-50%);white-space:nowrap;'}
          font-family:Arial,sans-serif;font-size:0.88rem;color:#111;${statusStyle}">${val}</div>`;
    });

    return `
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff;margin:0}
.pg{position:relative;width:794px;min-height:1123px;margin:0 auto;overflow:hidden}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cnt{position:absolute;inset:0;z-index:1}
@media print{@page{margin:0;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pg{width:100%;min-height:100vh}}
</style>
<div class="pg">
  ${bgUrl ? `<img class="bg" src="${bgUrl}" alt="">` : '<div style="position:absolute;inset:0;background:#f9f9f9"></div>'}
  <div class="cnt" style="position:relative;width:100%;height:1123px">${placed}</div>
</div>`;
}

// ===== GENERATE HTML =====
function generateHTML(data) {
    const biz = getBiz();
    switch (settings.template) {
        case 'minimal': return tplMinimal(data, biz);
        case 'classic': return tplClassic(data, biz);
        case 'custom':  return tplCustom(data, biz, settings.layout || {}, settings.customBg || null);
        default:        return tplModern(data, biz);
    }
}

// ===================================================
//   PUBLIC API
// ===================================================
window.InvoiceTemplate = window.InvoiceTemplate || {};

// Print a sale or purchase
window.InvoiceTemplate.print = function (data) {
    const html = generateHTML(data);
    const title = (data.type === 'purchase' ? 'PO' : 'Invoice') + ' - ' + data.invoice_no;
    const win = window.open('', '_blank');
    if (!win) { window.Utils.showToast('Pop-up blocked — please allow pop-ups for this site.', 'info'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print();window.onafterprint=function(){window.close()};},400)};<\/script></body></html>`);
    win.document.close();
};

// Open template manager modal
window.InvoiceTemplate._managerRendered = false;

window.InvoiceTemplate.openManager = function () {
    const m = document.getElementById('invoice-template-manager');
    if (!m) return;
    // Only build HTML once — reuse on 2nd+ open (instant)
    if (!window.InvoiceTemplate._managerRendered) {
        _renderManager();
        window.InvoiceTemplate._managerRendered = true;
    }
    m.classList.add('active');
};

// Call this if business info changes so template rebuilds with new info
window.InvoiceTemplate.invalidateManagerCache = function() {
    window.InvoiceTemplate._managerRendered = false;
};

// ===================================================
//   TEMPLATE MANAGER UI
// ===================================================

function _renderManager() {
    const inner = document.getElementById('itm-inner');
    if (!inner) return;

    const tabs = [
        { key: 'modern',  label: '✨ Modern'  },
        { key: 'minimal', label: '🌿 Minimal' },
        { key: 'classic', label: '📜 Classic' },
        { key: 'custom',  label: '🖼️ Custom'  },
    ];

    inner.innerHTML = `
    <!-- Business Info Row -->
    <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:0.65rem;">🏢 Business Info — appears on all templates</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.5rem;">
        <input id="itm-bname"    class="form-control" style="font-size:0.82rem" placeholder="Business Name"  value="${settings.businessName    || ''}">
        <input id="itm-btag"     class="form-control" style="font-size:0.82rem" placeholder="Tagline"         value="${settings.businessTagline || ''}">
        <input id="itm-bphone"   class="form-control" style="font-size:0.82rem" placeholder="Phone"           value="${settings.businessPhone   || ''}">
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:0.5rem;">
        <input id="itm-baddress" class="form-control" style="font-size:0.82rem" placeholder="Address"         value="${settings.businessAddress || ''}">
        <input id="itm-bthanks"  class="form-control" style="font-size:0.82rem" placeholder="Thank you text"  value="${settings.thankYouText    || 'Thank you for your business!'}">
      </div>
      <button onclick="window.InvoiceTemplate._saveBiz()" style="margin-top:0.5rem;padding:0.35rem 0.85rem;background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-size:0.78rem;font-weight:600;">💾 Save Info</button>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:0.4rem;margin-bottom:1rem;">
      ${tabs.map(t => `
        <button id="itm-tab-${t.key}" onclick="window.InvoiceTemplate._tab('${t.key}')"
          style="padding:0.45rem 1rem;border-radius:var(--radius-sm);border:1px solid ${settings.template === t.key ? 'var(--color-primary)' : 'var(--color-border)'};
          background:${settings.template === t.key ? 'var(--color-primary)' : 'var(--color-surface)'};
          color:${settings.template === t.key ? '#fff' : 'var(--color-text-primary)'};
          cursor:pointer;font-size:0.82rem;font-weight:600;transition:all 0.15s;">
          ${t.label}${settings.template === t.key ? ' ✓' : ''}
        </button>`).join('')}
    </div>

    <!-- Tab body -->
    <div id="itm-body"></div>`;

    _renderTabBody(settings.template);
}

function _renderTabBody(tab) {
    const body = document.getElementById('itm-body');
    if (!body) return;

    if (tab === 'custom') { _renderCustom(body); return; }

    const sample = buildSampleData();
    const biz    = getBiz();
    let html = '';
    if      (tab === 'minimal') html = tplMinimal(sample, biz);
    else if (tab === 'classic') html = tplClassic(sample, biz);
    else                        html = tplModern(sample, biz);

    body.innerHTML = `
    <div style="border:1px solid var(--color-border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:1rem;">
      <iframe id="itm-frame" style="width:100%;height:460px;border:none;background:#fff"></iframe>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:0.8rem;color:var(--color-text-muted);">${tab === settings.template ? '✅ This template is active' : 'Preview only — click to activate'}</span>
      <button onclick="window.InvoiceTemplate._use('${tab}')"
        style="padding:0.5rem 1.25rem;background:${tab === settings.template ? 'var(--color-success)' : 'var(--color-primary)'};color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:700;font-size:0.875rem;">
        ${tab === settings.template ? '✅ Active' : '🎨 Use This Template'}
      </button>
    </div>`;

    setTimeout(() => {
        const f = document.getElementById('itm-frame');
        if (f) f.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
          <body style="margin:0;padding:0;transform:scale(0.72);transform-origin:top left;width:138.9%">${html}</body></html>`;
    }, 40);
}

function _renderCustom(body) {
    const layoutKeys = Object.keys(settings.layout || {}).filter(k => settings.layout[k]);

    body.innerHTML = `
    <div style="display:grid;grid-template-columns:230px 1fr;gap:1rem;align-items:start">

      <!-- LEFT -->
      <div>
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:0.6rem">📤 Background Image</div>
        <button onclick="document.getElementById('itm-bg-inp').click()"
          style="width:100%;padding:0.5rem;border:1px dashed var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);cursor:pointer;font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:0.3rem">
          ${settings.customBg ? '🖼️ Change Background' : '📤 Upload JPG / PNG'}
        </button>
        <input type="file" id="itm-bg-inp" accept="image/*" style="display:none" onchange="window.InvoiceTemplate._bgUpload(this)">
        ${settings.customBg ? `<button onclick="window.InvoiceTemplate._bgClear()" style="width:100%;padding:0.3rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:none;cursor:pointer;font-size:0.72rem;color:var(--color-danger);margin-bottom:0.6rem">✕ Remove Background</button>` : ''}

        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin:0.75rem 0 0.5rem">🖱️ Drag fields onto canvas</div>
        <div style="display:flex;flex-direction:column;gap:0.25rem;max-height:340px;overflow-y:auto">
          ${FIELDS.map(f => {
              const placed = !!(settings.layout && settings.layout[f.key]);
              return `<div draggable="true" data-field="${f.key}" ondragstart="window.InvoiceTemplate._ds(event)"
                style="padding:0.35rem 0.6rem;background:${placed ? 'rgba(0,102,255,0.08)' : 'var(--color-surface)'};
                border:1px solid ${placed ? 'var(--color-primary)' : 'var(--color-border)'};
                border-radius:var(--radius-sm);cursor:grab;font-size:0.75rem;font-weight:500;
                color:${placed ? 'var(--color-primary)' : 'var(--color-text-secondary)'}">
                ${placed ? '✓ ' : ''}${f.label}
              </div>`;
          }).join('')}
        </div>
        <button onclick="window.InvoiceTemplate._clearLayout()"
          style="width:100%;margin-top:0.5rem;padding:0.35rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:none;cursor:pointer;font-size:0.72rem;color:var(--color-danger)">
          🗑️ Clear All Positions
        </button>
      </div>

      <!-- RIGHT: Canvas -->
      <div>
        <div style="font-size:0.72rem;color:var(--color-text-muted);margin-bottom:0.4rem">
          Drop fields anywhere on the canvas. <strong>Double-click</strong> a placed label to remove it.
        </div>
        <div id="itm-canvas" ondragover="event.preventDefault()" ondrop="window.InvoiceTemplate._drop(event)"
          style="position:relative;width:100%;padding-top:141.4%;border:1px solid var(--color-border);border-radius:var(--radius-sm);overflow:hidden;background:#fff;cursor:crosshair">
          ${settings.customBg
            ? `<img src="${settings.customBg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none">`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0.5rem;color:var(--color-text-muted)"><div style="font-size:2.5rem">🖼️</div><div style="font-size:0.82rem">Upload a background to see it here</div></div>`}
          <div id="itm-placed" style="position:absolute;inset:0;pointer-events:none"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.75rem">
          <button onclick="window.InvoiceTemplate._previewCustom()"
            style="padding:0.45rem 0.9rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);cursor:pointer;font-size:0.82rem;font-weight:600">
            👁️ Test Print
          </button>
          <button onclick="window.InvoiceTemplate._use('custom')"
            style="padding:0.45rem 1.1rem;background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:700;font-size:0.875rem">
            ✅ Use Custom Template
          </button>
        </div>
      </div>
    </div>`;

    _renderPlaced();
}

function _renderPlaced() {
    const c = document.getElementById('itm-placed');
    if (!c) return;
    c.style.pointerEvents = 'auto';
    c.innerHTML = '';

    Object.entries(settings.layout || {}).forEach(([key, pos]) => {
        if (!pos) return;
        const f = FIELDS.find(x => x.key === key);
        if (!f) return;

        const el = document.createElement('div');
        el.style.cssText = `position:absolute;left:${pos.x}%;top:${pos.y}%;
          transform:translate(-50%,-50%);
          background:rgba(0,102,255,0.88);color:#fff;
          padding:0.2rem 0.45rem;border-radius:3px;
          font-size:0.65rem;font-weight:700;white-space:nowrap;
          cursor:move;user-select:none;z-index:10;
          box-shadow:0 2px 8px rgba(0,0,0,0.25)`;
        el.textContent = f.label;
        el.title = 'Double-click to remove';
        el.ondblclick = () => {
            delete settings.layout[key];
            saveSettings();
            _renderCustom(document.getElementById('itm-body'));
        };
        el.draggable = true;
        el.ondragstart = e => {
            e.dataTransfer.setData('field', key);
            e.dataTransfer.effectAllowed = 'move';
        };
        c.appendChild(el);
    });
}

// ===== TAB ACTIONS =====
window.InvoiceTemplate._tab = function (tab) {
    _renderTabBody(tab);
    ['modern','minimal','classic','custom'].forEach(t => {
        const b = document.getElementById(`itm-tab-${t}`);
        if (!b) return;
        const on = t === tab;
        b.style.background   = on ? 'var(--color-primary)' : 'var(--color-surface)';
        b.style.color        = on ? '#fff' : 'var(--color-text-primary)';
        b.style.borderColor  = on ? 'var(--color-primary)' : 'var(--color-border)';
    });
};

window.InvoiceTemplate._use = function (tab) {
    settings.template = tab;
    saveSettings();
    // Update checkmarks on tab buttons
    ['modern','minimal','classic','custom'].forEach(t => {
        const b = document.getElementById(`itm-tab-${t}`);
        if (!b) return;
        const on = t === tab;
        b.style.background  = on ? 'var(--color-primary)' : 'var(--color-surface)';
        b.style.color       = on ? '#fff' : 'var(--color-text-primary)';
        b.style.borderColor = on ? 'var(--color-primary)' : 'var(--color-border)';
        // update label text
        const labelMap = { modern:'✨ Modern', minimal:'🌿 Minimal', classic:'📜 Classic', custom:'🖼️ Custom' };
        b.textContent = labelMap[t] + (on ? ' ✓' : '');
    });
    if (window.showNotification) window.showNotification('✅ Template activated!', 'success');
};

window.InvoiceTemplate._saveBiz = function () {
    settings.businessName    = document.getElementById('itm-bname')?.value.trim()    || settings.businessName || '';
    settings.businessTagline = document.getElementById('itm-btag')?.value.trim()     || '';
    settings.businessPhone   = document.getElementById('itm-bphone')?.value.trim()   || '';
    settings.businessAddress = document.getElementById('itm-baddress')?.value.trim() || '';
    settings.thankYouText    = document.getElementById('itm-bthanks')?.value.trim()  || 'Thank you for your business!';
    saveSettings();
    if (window.showNotification) window.showNotification('✅ Business info saved!', 'success');
};

window.InvoiceTemplate._bgUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        settings.customBg = e.target.result;
        saveSettings();
        _renderCustom(document.getElementById('itm-body'));
    };
    reader.readAsDataURL(file);
};

window.InvoiceTemplate._bgClear = function () {
    settings.customBg = null;
    saveSettings();
    _renderCustom(document.getElementById('itm-body'));
};

window.InvoiceTemplate._clearLayout = function () {
    settings.layout = {};
    saveSettings();
    _renderCustom(document.getElementById('itm-body'));
};

window.InvoiceTemplate._previewCustom = function () {
    window.InvoiceTemplate.print(buildSampleData());
};

// ===== DRAG + DROP =====
window.InvoiceTemplate._ds = function (e) {
    e.dataTransfer.setData('field', e.currentTarget.dataset.field);
    e.dataTransfer.effectAllowed = 'move';
};

window.InvoiceTemplate._drop = function (e) {
    e.preventDefault();
    const canvas = document.getElementById('itm-canvas');
    if (!canvas) return;
    const field = e.dataTransfer.getData('field');
    if (!field) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;
    if (!settings.layout) settings.layout = {};
    settings.layout[field] = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
    };
    saveSettings();
    _renderPlaced();
    // Refresh field list colours
    document.querySelectorAll('[data-field]').forEach(el => {
        const k = el.dataset.field;
        if (!k) return;
        const placed = !!(settings.layout && settings.layout[k]);
        el.style.background  = placed ? 'rgba(0,102,255,0.08)' : 'var(--color-surface)';
        el.style.borderColor = placed ? 'var(--color-primary)' : 'var(--color-border)';
        el.style.color       = placed ? 'var(--color-primary)' : 'var(--color-text-secondary)';
        const fieldDef = FIELDS.find(f => f.key === k);
        if (fieldDef) el.textContent = (placed ? '✓ ' : '') + fieldDef.label;
    });
};

window.log('✅ Invoice Template Module Loaded');

})();

/* ==========================================
   JS END: Invoice Template Module
   ========================================== */