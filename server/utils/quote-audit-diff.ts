/**
 * Charge-item audit diff helpers for the quote-edit flow.
 *
 * When a wholesaler edits a quote, charge items (productId === null) need
 * to be diffed carefully:
 *
 *   - If the count of old charges equals the count of new charges, we pair
 *     them positionally.  A label change on the same-position item is reported
 *     as "Updated charge: OldLabel→NewLabel" rather than a spurious
 *     "Removed … / Added …" pair.
 *
 *   - If the counts differ we fall back to label-based matching so true
 *     additions and removals are still detected correctly.
 */

export interface AuditOldCharge {
  quantity: number;
  unitPrice?: string | null;
  customLabel?: string | null;
}

export interface AuditNewCharge {
  quantity: number;
  customPrice: number;
  customLabel?: string | null;
}

/**
 * Build the list of audit change strings for the charge-item portion of a
 * quote edit.
 *
 * @param oldCharges  Existing charge items (productId === null) from the DB.
 * @param newCharges  Incoming charge items from the PATCH request body.
 * @param fmtGBP      Currency formatter (value → "x.xx" string).
 * @returns           Array of human-readable change descriptions.
 */
export function buildChargeAuditEntries(
  oldCharges: AuditOldCharge[],
  newCharges: AuditNewCharge[],
  fmtGBP: (v: number) => string,
): string[] {
  const entries: string[] = [];

  if (oldCharges.length === newCharges.length) {
    for (let i = 0; i < oldCharges.length; i++) {
      const oi = oldCharges[i];
      const ni = newCharges[i];
      const oldLabel = oi!.customLabel?.trim() || 'Charge';
      const newLabel = ni!.customLabel?.trim() || 'Charge';

      const parts: string[] = [];
      if (oldLabel.toLowerCase() !== newLabel.toLowerCase()) {
        parts.push(`label: ${oldLabel}→${newLabel}`);
      }
      if (oi!.quantity !== ni!.quantity) {
        parts.push(`qty ${oi!.quantity}→${ni!.quantity}`);
      }
      if (Math.abs(parseFloat(oi!.unitPrice || '0') - ni!.customPrice) > 0.001) {
        parts.push(`price £${fmtGBP(parseFloat(oi!.unitPrice || '0'))}→£${fmtGBP(ni!.customPrice)}`);
      }

      if (parts.length > 0) {
        entries.push(`Updated charge: ${newLabel} (${parts.join(', ')})`);
      }
    }
  } else {
    for (const oi of oldCharges) {
      const oldLabel = (oi.customLabel?.trim() || '').toLowerCase();
      const inNew = newCharges.find(
        (ni) => (ni.customLabel?.trim() || '').toLowerCase() === oldLabel,
      );
      if (!inNew) {
        entries.push(`Removed charge: ${oi.customLabel?.trim() || 'Charge'}`);
      }
    }

    for (const ni of newCharges) {
      const chargeLabel = ni.customLabel?.trim() || '';
      const inOld = oldCharges.find(
        (oi) => (oi.customLabel?.trim() || '').toLowerCase() === chargeLabel.toLowerCase(),
      );
      if (!inOld) {
        entries.push(`Added charge: ${chargeLabel || 'Charge'} × ${ni.quantity} @ £${fmtGBP(ni.customPrice)}`);
      } else {
        const parts: string[] = [];
        if (inOld.quantity !== ni.quantity) {
          parts.push(`qty ${inOld.quantity}→${ni.quantity}`);
        }
        if (Math.abs(parseFloat(inOld.unitPrice || '0') - ni.customPrice) > 0.001) {
          parts.push(`price £${fmtGBP(parseFloat(inOld.unitPrice || '0'))}→£${fmtGBP(ni.customPrice)}`);
        }
        if (parts.length > 0) {
          entries.push(`Charge ${chargeLabel || 'item'}: ${parts.join(', ')}`);
        }
      }
    }
  }

  return entries;
}
