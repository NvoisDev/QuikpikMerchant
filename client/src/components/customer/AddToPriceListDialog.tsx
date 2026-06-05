import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tag, Plus } from "lucide-react";
import { Link } from "wouter";

interface PriceListSummary {
  id: number;
  name: string;
  isActive: boolean;
  isLocked: boolean;
  itemCount: number;
}

interface AddToPriceListDialogProps {
  customer: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
}

export function AddToPriceListDialog({ customer, open, onClose }: AddToPriceListDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: priceLists = [], isLoading: listsLoading } = useQuery<PriceListSummary[]>({
    queryKey: ['/api/price-lists'],
    enabled: open,
  });

  const { data: customerSummary = {} } = useQuery<Record<string, { count: number; names: string[]; ids: number[] }>>({
    queryKey: ['/api/price-lists/customer-summary'],
    enabled: open,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [originalIds, setOriginalIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && customer) {
      const ids = new Set<number>(customerSummary[customer.id]?.ids ?? []);
      setSelectedIds(ids);
      setOriginalIds(ids);
    }
  }, [open, customer, customerSummary]);

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const toAdd = [...selectedIds].filter(id => !originalIds.has(id));
      const toRemove = [...originalIds].filter(id => !selectedIds.has(id));

      await Promise.all([
        ...toAdd.map(id => apiRequest('POST', `/api/price-lists/${id}/customers/${customer.id}`)),
        ...toRemove.map(id => apiRequest('DELETE', `/api/price-lists/${id}/customers/${customer.id}`)),
      ]);

      await queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

      if (toAdd.length === 0 && toRemove.length === 0) {
        toast({ title: "No changes made" });
      } else {
        const parts: string[] = [];
        if (toAdd.length) parts.push(`Added to ${toAdd.length} list${toAdd.length !== 1 ? 's' : ''}`);
        if (toRemove.length) parts.push(`Removed from ${toRemove.length} list${toRemove.length !== 1 ? 's' : ''}`);
        toast({ title: "Saved", description: parts.join(', ') });
      }
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Price List</DialogTitle>
          <DialogDescription>
            Choose price lists for <strong>{customer?.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {listsLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : priceLists.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No price lists yet. Create one first.</p>
            <Link href="/customers?tab=price-lists">
              <Button size="sm" variant="outline" onClick={onClose}>
                <Plus className="h-4 w-4 mr-1" /> Create Price List
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
              {priceLists.map(list => (
                <label
                  key={list.id}
                  className={`flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer ${list.isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Checkbox
                    checked={selectedIds.has(list.id)}
                    onCheckedChange={() => !list.isLocked && toggle(list.id)}
                    disabled={list.isLocked}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{list.name}</p>
                    <p className="text-xs text-muted-foreground">{list.itemCount} product{list.itemCount !== 1 ? 's' : ''}</p>
                  </div>
                  {list.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs shrink-0">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs shrink-0">Inactive</Badge>
                  )}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
