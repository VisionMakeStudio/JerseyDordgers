/**
 * Jersey Dodgers branded website inquiry email builder.
 * Works in Node/serverless environments.
 *
 * Example:
 * const { buildJerseyDodgersEmail } = require('./jersey-dodgers-email');
 * const result = buildJerseyDodgersEmail({
 *   type: 'player',
 *   name: 'John Martinez',
 *   email: 'john@example.com',
 *   phone: '(201) 555-1234',
 *   message: 'Interested in joining for Fall 2026.',
 *   details: { Position: 'SS / 2B', 'Bats / Throws': 'R / R' }
 * });
 */

const fs = require('fs');
const path = require('path');

const TYPES = {
  player: {
    icon: '⚾',
    typeLabel: 'New Player Inquiry',
    headline: 'A new player wants to connect.',
    detailsTitle: 'Player Information',
    accentColor: '#2563EB',
    accentSoft: '#EFF6FF',
    accentBorder: '#BFDBFE'
  },
  tryout: {
    icon: '🔥',
    typeLabel: 'New Tryout Submission',
    headline: 'A new player is interested in tryouts.',
    detailsTitle: 'Tryout Information',
    accentColor: '#DC2626',
    accentSoft: '#FEF2F2',
    accentBorder: '#FECACA'
  },
  sponsor: {
    icon: '🤝',
    typeLabel: 'New Sponsor Inquiry',
    headline: 'A potential sponsor reached out.',
    detailsTitle: 'Sponsor Information',
    accentColor: '#2563EB',
    accentSoft: '#EFF6FF',
    accentBorder: '#BFDBFE'
  },
  partnership: {
    icon: '💼',
    typeLabel: 'New Partnership Inquiry',
    headline: 'A new partnership opportunity came in.',
    detailsTitle: 'Partnership Information',
    accentColor: '#7C3AED',
    accentSoft: '#F5F3FF',
    accentBorder: '#DDD6FE'
  },
  contact: {
    icon: '✉️',
    typeLabel: 'New Contact Message',
    headline: 'You received a new website message.',
    detailsTitle: 'Inquiry Details',
    accentColor: '#2563EB',
    accentSoft: '#EFF6FF',
    accentBorder: '#BFDBFE'
  }
};

function esc(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function row(label, value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  return `
    <tr>
      <td style="width:145px;padding:8px 10px 8px 0;color:#6b7280;font-size:12px;font-weight:800;vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:700;vertical-align:top;">${esc(value)}</td>
    </tr>`;
}

function buildJerseyDodgersEmail(payload = {}) {
  const type = TYPES[payload.type] ? payload.type : 'contact';
  const cfg = TYPES[type];
  const name = payload.name || 'Website Visitor';
  const firstName = name.trim().split(/\s+/)[0] || 'Visitor';
  const submittedAt = payload.submittedAt ||
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/New_York'
    }).format(new Date());

  const contactRows = [
    row('Name', name),
    row('Email', payload.email),
    row('Phone', payload.phone),
    row('Company / Organization', payload.company)
  ].join('');

  const details = payload.details || {};
  const detailRows = Object.entries(details).map(([k,v]) => row(k, v)).join('') ||
    row('Inquiry Type', cfg.typeLabel);

  const templatePath = path.join(__dirname, 'email-template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const replacements = {
    '{{accentColor}}': cfg.accentColor,
    '{{accentSoft}}': cfg.accentSoft,
    '{{accentBorder}}': cfg.accentBorder,
    '{{icon}}': cfg.icon,
    '{{typeLabel}}': cfg.typeLabel,
    '{{headline}}': cfg.headline,
    '{{submittedAt}}': esc(submittedAt),
    '{{contactRows}}': contactRows,
    '{{detailsTitle}}': cfg.detailsTitle,
    '{{detailRows}}': detailRows,
    '{{message}}': esc(payload.message || 'No message provided.').replace(/\n/g, '<br>'),
    '{{email}}': esc(payload.email || ''),
    '{{firstName}}': esc(firstName)
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  const subjectMap = {
    player: `⚾ New Player Inquiry — ${name}`,
    tryout: `🔥 New Tryout Submission — ${name}`,
    sponsor: `🤝 New Sponsor Inquiry — ${payload.company || name}`,
    partnership: `💼 New Partnership Inquiry — ${payload.company || name}`,
    contact: `✉️ New Website Message — ${name}`
  };

  return {
    subject: subjectMap[type],
    html
  };
}

module.exports = { buildJerseyDodgersEmail };
