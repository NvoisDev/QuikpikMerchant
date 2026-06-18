import { describe, it, expect } from 'vitest';
import { getTemplateCatalog } from '../server/services/templateCatalog';

describe('template catalogue', () => {
  const templates = getTemplateCatalog();

  it('returns a substantial catalogue', () => {
    expect(templates.length).toBeGreaterThanOrEqual(40);
  });

  it('has unique keys', () => {
    const keys = templates.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses only valid channels and recipients', () => {
    for (const t of templates) {
      expect(['email', 'whatsapp_sms']).toContain(t.channel);
      expect(['customer', 'wholesaler']).toContain(t.recipient);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('email entries carry a subject and rendered html', () => {
    const emails = templates.filter((t) => t.channel === 'email');
    expect(emails.length).toBeGreaterThan(0);
    for (const t of emails) {
      expect(t.subject && t.subject.length > 0).toBe(true);
      expect(t.html && t.html.length > 200).toBe(true);
    }
  });

  it('whatsapp/sms entries carry rendered text', () => {
    const messages = templates.filter((t) => t.channel === 'whatsapp_sms');
    expect(messages.length).toBeGreaterThan(0);
    for (const t of messages) {
      expect(t.text && t.text.length > 0).toBe(true);
    }
  });

  it('covers both recipients on both channels', () => {
    const combos = new Set(templates.map((t) => `${t.channel}:${t.recipient}`));
    expect(combos.has('email:customer')).toBe(true);
    expect(combos.has('email:wholesaler')).toBe(true);
    expect(combos.has('whatsapp_sms:customer')).toBe(true);
    expect(combos.has('whatsapp_sms:wholesaler')).toBe(true);
  });

  it('includes the required marketing & promotion WhatsApp/SMS templates', () => {
    const keys = new Set(templates.map((t) => t.key));
    // Marketing broadcast and product promotion are core platform messages and
    // must always be previewable in the admin Templates section.
    expect(keys.has('wa-marketing-broadcast')).toBe(true);
    expect(keys.has('wa-promotion-launched')).toBe(true);
    expect(keys.has('wa-promotion-ending')).toBe(true);
  });
});
