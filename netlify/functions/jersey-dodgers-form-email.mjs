function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function row(label, value) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  return `
    <tr>
      <td style="padding:10px 12px 10px 0;width:145px;vertical-align:top;
        color:#7d8490;font-size:12px;font-weight:800;text-transform:uppercase;
        letter-spacing:.5px;">${esc(label)}</td>
      <td style="padding:10px 0;vertical-align:top;color:#111827;
        font-size:15px;font-weight:700;">${esc(value)}</td>
    </tr>`;
}

function buildEmail(data) {
  const isSponsor =
    Object.prototype.hasOwnProperty.call(data, "website") ||
    Object.prototype.hasOwnProperty.call(data, "message");

  const kind = isSponsor ? "sponsor" : "player";
  const accent = isSponsor ? "#E1261C" : "#1D5EFF";
  const soft = isSponsor ? "#FFF1F0" : "#EEF4FF";
  const border = isSponsor ? "#FFC9C5" : "#C8D8FF";
  const icon = isSponsor ? "🤝" : "⚾";
  const label = isSponsor ? "NEW SPONSOR INQUIRY" : "NEW PLAYER / TRYOUT INQUIRY";
  const headline = isSponsor
    ? "A potential Jersey Dodgers sponsor reached out."
    : "A player is interested in the Jersey Dodgers.";

  const name = data.name || "Website Visitor";
  const firstName = name.trim().split(/\s+/)[0] || "Visitor";

  const detailRows = isSponsor
    ? [
        row("Website", data.website),
        row("Inquiry", "Sponsorship / Partnership"),
      ].join("")
    : [
        row("Season", data.season),
        row("Position", data.position),
        row("Social", data.social),
      ].join("");

  const messageSection = isSponsor && data.message
    ? `
      <tr>
        <td style="padding:0 28px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
            style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:14px 18px;background:#f7f8fa;color:#69707d;
                font-size:11px;font-weight:900;letter-spacing:1.3px;text-transform:uppercase;">
                Message
              </td>
            </tr>
            <tr>
              <td style="padding:20px 18px;color:#2f3743;font-size:15px;
                line-height:1.7;">
                ${esc(data.message).replace(/\n/g, "<br>")}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const subject = isSponsor
    ? `🤝 New Sponsor Inquiry — ${name}`
    : `⚾ New Player / Tryout Inquiry — ${name}`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#090a0c;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
  style="background:#090a0c;padding:28px 12px;">
<tr><td align="center">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
  style="max-width:680px;background:#fff;border-radius:20px;overflow:hidden;
  border:1px solid #252932;box-shadow:0 16px 50px rgba(0,0,0,.28);">

  <tr>
    <td style="background:#08090b;padding:23px 28px;border-bottom:4px solid ${accent};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td width="66" valign="middle">
            <div style="width:50px;height:50px;border-radius:50%;
              background:#11141a;border:2px solid #fff;color:#fff;
              font-size:28px;line-height:50px;text-align:center;font-weight:900;
              font-style:italic;">D</div>
          </td>
          <td valign="middle">
            <div style="font-size:11px;letter-spacing:2.4px;color:#8b93a1;
              font-weight:800;text-transform:uppercase;">Jersey Dodgers</div>
            <div style="font-size:23px;color:#fff;font-weight:900;margin-top:3px;">
              Website Notification
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:28px 28px 12px;">
      <div style="display:inline-block;background:${soft};border:1px solid ${border};
        color:${accent};font-size:12px;font-weight:900;letter-spacing:1.1px;
        padding:10px 14px;border-radius:999px;">
        ${icon} ${label}
      </div>
      <div style="font-size:29px;line-height:1.2;font-weight:900;color:#0b0d11;
        margin-top:17px;">${headline}</div>
      <div style="font-size:14px;line-height:1.6;color:#7b828d;margin-top:8px;">
        Submitted through JerseyDodgers.com
      </div>
    </td>
  </tr>

  <tr>
    <td style="padding:14px 28px 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
        style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:14px 18px;background:#f7f8fa;color:#69707d;
            font-size:11px;font-weight:900;letter-spacing:1.3px;text-transform:uppercase;">
            Contact
          </td>
        </tr>
        <tr>
          <td style="padding:12px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${row("Name", name)}
              ${row("Email", data.email)}
              ${row("Phone", data.phone)}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:0 28px 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
        style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:14px 18px;background:#f7f8fa;color:#69707d;
            font-size:11px;font-weight:900;letter-spacing:1.3px;text-transform:uppercase;">
            ${isSponsor ? "Sponsor Information" : "Player Information"}
          </td>
        </tr>
        <tr>
          <td style="padding:12px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${detailRows}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${messageSection}

  <tr>
    <td align="center" style="padding:5px 28px 30px;">
      <a href="mailto:${esc(data.email || "")}"
        style="display:inline-block;background:${accent};color:#fff;text-decoration:none;
        font-size:14px;font-weight:900;padding:14px 24px;border-radius:12px;">
        Reply to ${esc(firstName)} →
      </a>
    </td>
  </tr>

  <tr>
    <td style="background:#08090b;padding:22px 28px;text-align:center;">
      <div style="color:#fff;font-size:13px;font-weight:900;letter-spacing:1.4px;">
        JERSEY DODGERS
      </div>
      <div style="color:#747c89;font-size:12px;line-height:1.6;margin-top:6px;">
        New Jersey Baseball • JerseyDodgers.com
      </div>
    </td>
  </tr>
</table>

</td></tr>
</table>
</body>
</html>`;

  return { subject, html, kind };
}

export default {
  async formSubmitted(event) {
    const data = event?.data || {};

    const isPlayer =
      Object.prototype.hasOwnProperty.call(data, "season") ||
      Object.prototype.hasOwnProperty.call(data, "position") ||
      Object.prototype.hasOwnProperty.call(data, "social");

    const isSponsor =
      Object.prototype.hasOwnProperty.call(data, "website") ||
      Object.prototype.hasOwnProperty.call(data, "message");

    if (!isPlayer && !isSponsor) return;

    const apiKey = Netlify.env.get("RESEND_API_KEY");
    const from = Netlify.env.get("JERSEY_DODGERS_FROM");
    const recipientsRaw = Netlify.env.get("JERSEY_DODGERS_TO");

    if (!apiKey || !from || !recipientsRaw) {
      console.error(
        "Jersey Dodgers email skipped: RESEND_API_KEY, JERSEY_DODGERS_FROM, or JERSEY_DODGERS_TO is missing."
      );
      return;
    }

    const to = recipientsRaw
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    const { subject, html, kind } = buildEmail(data);

    const payload = {
      from,
      to,
      subject,
      html,
      reply_to: data.email || undefined,
      tags: [
        { name: "site", value: "jersey-dodgers" },
        { name: "inquiry_type", value: kind }
      ]
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "JerseyDodgers-Netlify/1.0"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Resend Jersey Dodgers email failed:", response.status, body);
      throw new Error(`Resend email failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log("Jersey Dodgers branded email sent:", result.id);
  }
};
