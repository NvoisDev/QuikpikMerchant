import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { User, Settings2, Building2, Bell, Upload, Image, AlertTriangle, Info, ExternalLink, Save, Download, Printer, QrCode, Lock, Eye, EyeOff, Truck, Plus, Pencil, Trash2, Star, X, MapPin, Receipt, CheckCircle2, XCircle, Link2, Loader2 } from "lucide-react";
import Logo from '@/components/ui/logo';
import { LogoUploader } from '@/components/LogoUploader';
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getNextAlertDate, ALERT_DAY_NAMES } from "@/lib/stockAlertSchedule";

interface BusinessProfile {
  id: number;
  wholesalerId: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function BusinessProfilesSection() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<BusinessProfile | null>(null);
  const [form, setForm] = useState({ name: '', logoUrl: '', address: '' });
  const [profileToDelete, setProfileToDelete] = useState<BusinessProfile | null>(null);

  const { data: profiles = [], isLoading } = useQuery<BusinessProfile[]>({
    queryKey: ["/api/business-profiles"],
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', logoUrl: '', address: '' });
    setShowDialog(true);
  };

  const openEdit = (p: BusinessProfile) => {
    setEditing(p);
    setForm({ name: p.name, logoUrl: p.logoUrl || '', address: p.address || '' });
    setShowDialog(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: number; name: string; logoUrl: string; address: string }) => {
      const payload = {
        name: data.name,
        logoUrl: data.logoUrl || null,
        address: data.address || null,
      };
      if (data.id != null) {
        const r = await apiRequest("PATCH", `/api/business-profiles/${data.id}`, payload);
        return r.json();
      } else {
        const r = await apiRequest("POST", "/api/business-profiles", payload);
        return r.json();
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profiles"] });
      toast({ title: variables.id ? "Profile updated" : "Profile created" });
      setShowDialog(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/business-profiles/${id}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profiles"] });
      toast({ title: "Profile deleted" });
      setProfileToDelete(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/business-profiles/${id}/set-default`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profiles"] });
      toast({ title: "Default profile updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900">Business Profiles</h3>
          <p className="text-sm text-gray-500 mt-0.5">Create multiple trading identities. Choose one when creating a quote or order. These are separate from your main business settings.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" />Add Profile
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading profiles…</div>
      ) : (
        <div className="space-y-3">
          {profiles.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-4 flex items-start gap-3">
              {p.logoUrl ? (
                <img src={p.logoUrl} alt={p.name} className="h-10 w-10 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-blue-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  {p.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded">
                      <Star className="h-2.5 w-2.5" />Default
                    </span>
                  )}
                </div>
                {p.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.address}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!p.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setDefaultMutation.mutate(p.id)}
                    disabled={setDefaultMutation.isPending}
                  >
                    Set default
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!p.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:border-red-200"
                    onClick={() => setProfileToDelete(p)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              {editing ? "Edit Profile" : "Add Profile"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-gray-600">Profile name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Main Trading Co."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Logo (optional)</Label>
              <div className="mt-1">
                <LogoUploader
                  currentLogoUrl={form.logoUrl}
                  onUploadComplete={(url) => setForm(f => ({ ...f, logoUrl: url }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Address (optional)</Label>
              <Input
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="123 High Street, London, EC1A 1BB"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate({ ...form, id: editing?.id })}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!profileToDelete} onOpenChange={(open) => { if (!open) setProfileToDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              Delete profile
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 pt-1">
              Are you sure you want to delete <span className="font-medium text-gray-900">{profileToDelete?.name}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setProfileToDelete(null)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => profileToDelete && deleteMutation.mutate(profileToDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface BankDetailsData {
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  sortCode: string | null;
  iban: string | null;
  swift: string | null;
}

function BankDetailsSection() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const canManage = authUser?.role !== 'team_member' || authUser?.teamMemberRole === 'admin';

  const { data: saved, isLoading } = useQuery<BankDetailsData>({
    queryKey: ["/api/business-profile/bank-details"],
  });

  const [form, setForm] = useState({ bankName: '', accountName: '', accountNumber: '', sortCode: '', iban: '', swift: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (saved && !loaded) {
      setForm({
        bankName: saved.bankName || '',
        accountName: saved.accountName || '',
        accountNumber: saved.accountNumber || '',
        sortCode: saved.sortCode || '',
        iban: saved.iban || '',
        swift: saved.swift || '',
      });
      setLoaded(true);
    }
  }, [saved, loaded]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await apiRequest("PUT", "/api/business-profile/bank-details", {
        bankName: data.bankName.trim() || null,
        accountName: data.accountName.trim() || null,
        accountNumber: data.accountNumber.trim() || null,
        sortCode: data.sortCode.trim() || null,
        iban: data.iban.trim() || null,
        swift: data.swift.trim() || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed to save"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile/bank-details"] });
      toast({ title: "Bank details saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const LIMITS: Record<keyof typeof form, number> = {
    bankName: 100, accountName: 100, accountNumber: 100,
    sortCode: 20, iban: 100, swift: 20,
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, hint?: string) => (
    <div>
      <Label className="text-xs text-gray-600">{label}</Label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <Input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="mt-1"
        maxLength={LIMITS[key]}
        disabled={!canManage}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base sm:text-lg font-medium text-gray-900">Bank Details</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          These details appear in the Payment Details section of every invoice PDF you generate. Leave fields blank to hide them.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {field('Bank Name', 'bankName', 'e.g. Barclays Bank')}
          {field('Account Name', 'accountName', 'e.g. Acme Wholesale Ltd')}
          <div className="grid grid-cols-2 gap-3">
            {field('Account Number', 'accountNumber', 'e.g. 12345678')}
            {field('Sort Code', 'sortCode', 'e.g. 20-00-00', 'UK — will format as XX-XX-XX')}
          </div>
          {field('IBAN', 'iban', 'e.g. GB29NWBK60161331926819')}
          {field('SWIFT / BIC', 'swift', 'e.g. BARCGB22')}
        </div>
      )}

      {canManage && (
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-1.5" />Save Bank Details</>}
          </Button>
        </div>
      )}
    </div>
  );
}

interface CollectionAddress {
  id: number;
  wholesalerId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  isDefault: boolean;
  isActive: boolean;
}

function CollectionAddressesSection() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  // Only owner or team admin may create/edit/delete/set-default
  const canManage = authUser?.role !== 'team_member' || authUser?.teamMemberRole === 'admin';
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CollectionAddress | null>(null);
  const [toDelete, setToDelete] = useState<CollectionAddress | null>(null);
  const [deleteBlockedFor, setDeleteBlockedFor] = useState<CollectionAddress | null>(null);
  const emptyForm = { name: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: 'United Kingdom' };
  const [form, setForm] = useState(emptyForm);

  const { data: addresses = [], isLoading } = useQuery<CollectionAddress[]>({
    queryKey: ["/api/collection-addresses"],
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowDialog(true); };
  const openEdit = (a: CollectionAddress) => {
    setEditing(a);
    setForm({ name: a.name, addressLine1: a.addressLine1, addressLine2: a.addressLine2 || '', city: a.city, postcode: a.postcode, country: a.country || 'United Kingdom' });
    setShowDialog(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: number }) => {
      const payload = { name: data.name, addressLine1: data.addressLine1, addressLine2: data.addressLine2 || null, city: data.city, postcode: data.postcode, country: data.country };
      const r = data.id != null
        ? await apiRequest("PATCH", `/api/collection-addresses/${data.id}`, payload)
        : await apiRequest("POST", "/api/collection-addresses", payload);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed to save"); }
      return r.json();
    },
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collection-addresses"] });
      toast({ title: v.id != null ? "Address updated" : "Address added" });
      setShowDialog(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/collection-addresses/${id}`);
      if (r.status === 409) {
        const e = await r.json();
        throw new Error("IN_USE:" + (e.error || "Address is in use"));
      }
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed to delete"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collection-addresses"] });
      toast({ title: "Address deleted" });
      setToDelete(null);
    },
    onError: (e: Error) => {
      if (e.message.startsWith("IN_USE:")) {
        setDeleteBlockedFor(toDelete);
        setToDelete(null);
      } else {
        toast({ title: e.message, variant: "destructive" });
        setToDelete(null);
      }
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("PATCH", `/api/collection-addresses/${id}`, { isActive: false });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collection-addresses"] });
      toast({ title: "Address deactivated — hidden from customers" });
      setDeleteBlockedFor(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("PATCH", `/api/collection-addresses/${id}/set-default`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collection-addresses"] });
      toast({ title: "Default collection address updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const valid = form.name.trim() && form.addressLine1.trim() && form.city.trim() && form.postcode.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900">Collection Addresses</h3>
          <p className="text-sm text-gray-500 mt-0.5">Add multiple pickup locations. Customers and quotes will show the selected address. Orders without a specific address fall back to your registered business address.</p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" />Add Address
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading addresses…</div>
      ) : addresses.length === 0 ? (
        <div className="text-sm text-gray-400 italic">No collection addresses yet. Add one to let customers know where to collect orders.</div>
      ) : (
        <div className="space-y-3">
          {addresses.map(a => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded bg-green-50 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{a.name}</p>
                  {a.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded">
                      <Star className="h-2.5 w-2.5" />Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[a.addressLine1, a.addressLine2, a.city, a.postcode].filter(Boolean).join(', ')}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!a.isDefault && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDefaultMutation.mutate(a.id)} disabled={setDefaultMutation.isPending}>
                      Set default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => openEdit(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:border-red-200" onClick={() => setToDelete(a)} disabled={deleteMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              {editing ? "Edit Collection Address" : "Add Collection Address"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-gray-600">Location name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Warehouse, City Centre Store" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Address line 1 *</Label>
              <Input value={form.addressLine1} onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} placeholder="Unit 4, Trade Estate" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Address line 2 (optional)</Label>
              <Input value={form.addressLine2} onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))} placeholder="Building / Floor" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600">City *</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="London" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Postcode *</Label>
                <Input value={form.postcode} onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))} placeholder="E1 2AB" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Country</Label>
              <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="United Kingdom" className="mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button size="sm" disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate({ ...form, id: editing?.id })}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />Delete address
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 pt-1">
              Delete <span className="font-medium text-gray-900">{toDelete?.name}</span>? This cannot be undone. Addresses linked to active orders cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setToDelete(null)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteBlockedFor} onOpenChange={(open) => { if (!open) setDeleteBlockedFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-amber-500" />Cannot delete address
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 pt-1">
              <span className="font-medium text-gray-900">{deleteBlockedFor?.name}</span> is linked to active or pending orders and cannot be deleted right now.
              <br /><br />
              You can <strong>deactivate</strong> it instead — it will be hidden from customers and quotes but kept for historical records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteBlockedFor(null)} disabled={deactivateMutation.isPending}>Cancel</Button>
            <Button size="sm" disabled={deactivateMutation.isPending} onClick={() => deleteBlockedFor && deactivateMutation.mutate(deleteBlockedFor.id)}>
              {deactivateMutation.isPending ? "Deactivating…" : "Deactivate instead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const qrRef = useRef<HTMLCanvasElement>(null);
  
  // Get tab from URL parameter or default to "account"
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || "account");
  const [thresholdInput, setThresholdInput] = useState("");

  const { data: notifPrefs, isLoading: notifPrefsLoading } = useQuery<{
    stockAlertFrequency: string;
    stockAlertChannel: string;
    paymentReminderEnabled: boolean;
    promotionReminderEnabled: boolean;
  }>({
    queryKey: ["/api/settings/notification-preferences"],
    enabled: user?.role !== 'team_member',
  });

  const [notifForm, setNotifForm] = useState({
    stockAlertFrequency: 'daily',
    stockAlertChannel: 'email',
    stockAlertDay: 1,
    lastWeeklyStockAlertSentAt: null as string | null,
    paymentReminderEnabled: true,
    paymentReminderChannel: 'email',
    promotionReminderEnabled: true,
    promotionReminderChannel: 'email',
  });

  useEffect(() => {
    if (notifPrefs) {
      setNotifForm({
        stockAlertFrequency: notifPrefs.stockAlertFrequency || 'daily',
        stockAlertChannel: notifPrefs.stockAlertChannel || 'email',
        stockAlertDay: (notifPrefs as any).stockAlertDay ?? 1,
        lastWeeklyStockAlertSentAt: (notifPrefs as any).lastWeeklyStockAlertSentAt ?? null,
        paymentReminderEnabled: notifPrefs.paymentReminderEnabled !== false,
        paymentReminderChannel: (notifPrefs as any).paymentReminderChannel || 'email',
        promotionReminderEnabled: notifPrefs.promotionReminderEnabled !== false,
        promotionReminderChannel: (notifPrefs as any).promotionReminderChannel || 'email',
      });
    }
  }, [notifPrefs]);

  const saveNotifPrefsMutation = useMutation({
    mutationFn: async (prefs: typeof notifForm) => {
      const r = await apiRequest("PATCH", "/api/settings/notification-preferences", prefs);
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Failed to save"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notification-preferences"] });
      toast({ title: "Notification preferences saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // Team member notification preferences
  const isTeamMember = user?.role === 'team_member';
  const { data: myTeamMemberRecord } = useQuery<{
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    status: string;
    phoneNumber: string | null;
    notificationPreferences: Record<string, string>;
  }>({
    queryKey: ["/api/team-members/me"],
    enabled: isTeamMember,
  });

  const [memberNotifForm, setMemberNotifForm] = useState<{
    stockAlertFrequency: string;
    stockAlertChannel: string;
    stockAlertDay: number | null;
  }>({
    stockAlertFrequency: 'inherit',
    stockAlertChannel: 'inherit',
    stockAlertDay: null,
  });

  useEffect(() => {
    if (myTeamMemberRecord?.notificationPreferences) {
      const prefs = myTeamMemberRecord.notificationPreferences as Record<string, any>;
      setMemberNotifForm({
        stockAlertFrequency: prefs.stockAlertFrequency || 'inherit',
        stockAlertChannel: prefs.stockAlertChannel || 'inherit',
        stockAlertDay: typeof prefs.stockAlertDay === 'number' ? prefs.stockAlertDay : null,
      });
    }
  }, [myTeamMemberRecord]);

  const saveMemberNotifPrefsMutation = useMutation({
    mutationFn: async (prefs: typeof memberNotifForm) => {
      if (!myTeamMemberRecord?.id) throw new Error("Team member record not found");
      const payload: Record<string, unknown> = {
        stockAlertFrequency: prefs.stockAlertFrequency,
        stockAlertChannel: prefs.stockAlertChannel,
      };
      if (prefs.stockAlertFrequency === 'inherit' || prefs.stockAlertFrequency !== 'weekly') {
        // Not explicitly weekly — omit day so any stale stored value doesn't persist as an override
      } else if (prefs.stockAlertDay !== null) {
        payload.stockAlertDay = prefs.stockAlertDay;
      } else {
        payload.stockAlertDay = 1;
      }
      const r = await apiRequest("PATCH", `/api/team-members/${myTeamMemberRecord.id}/notification-preferences`, payload);
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Failed to save"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members/me"] });
      toast({ title: "Your notification preferences saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const downloadQR = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user?.businessName || 'store'}-qr-code.png`;
    a.click();
  };

  const printQR = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const storeUrl = storeShareUrl;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Store QR Code</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:Arial,sans-serif;background:#fff}.business{font-size:20px;font-weight:bold;margin-bottom:12px}.tagline{font-size:14px;font-weight:600;color:#374151;margin-top:8px;text-align:center}.url{font-size:12px;color:#666;margin-top:12px;word-break:break-all;max-width:240px;text-align:center}</style></head><body><div class="business">${user?.businessName || 'My Store'}</div><img src="${url}" width="240" height="240"/><div class="tagline">Scan to sign up for my store</div><div class="url">${storeUrl}</div></body></html>`);
    win.document.close();
    win.onload = () => { win.print(); };
  };

  const generateInitialsDataUrl = (name: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(40, 40, 40, 0, Math.PI * 2);
    ctx.fill();
    const initials = name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 40, 40);
    return canvas.toDataURL();
  };

  // Custom store URL (slug) state
  const [slugInput, setSlugInput] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise slug input from user data
  useEffect(() => {
    if (user?.storeSlug) setSlugInput(user.storeSlug);
  }, [user?.storeSlug]);

  const storeIdentifier = user?.storeSlug || user?.id || '';
  const storeShareUrl = `https://quikpik.app/customer/${storeIdentifier}`;

  const checkSlugAvailability = useCallback((value: string) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    const trimmed = value.toLowerCase().trim();
    if (!trimmed || trimmed === user?.storeSlug) { setSlugStatus('idle'); return; }
    if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(trimmed)) { setSlugStatus('invalid'); return; }
    setSlugStatus('checking');
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/marketplace/check-slug/${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch { setSlugStatus('idle'); }
    }, 400);
  }, [user?.storeSlug]);

  const saveSlugMutation = useMutation({
    mutationFn: async (slug: string) => apiRequest('PUT', '/api/user/profile', { storeSlug: slug || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setSlugStatus('idle');
      toast({ title: 'Store URL saved', description: `Your store link is now quikpik.app/customer/${slugInput.trim() || user?.id}` });
    },
    onError: (err: any) => {
      const msg = err?.message || 'Failed to save store URL.';
      toast({ title: 'Could not save', description: msg, variant: 'destructive' });
    },
  });

  const { data: userSettings } = useQuery<{ defaultLowStockThreshold: number }>({
    queryKey: ["/api/auth/user"],
  });

  const updateThresholdMutation = useMutation({
    mutationFn: async (threshold: number) =>
      apiRequest("PATCH", "/api/settings/default-low-stock-threshold", { threshold }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
      setThresholdInput("");
      toast({ title: "Threshold updated", description: "Default low stock threshold has been saved." });
    },
    onError: () => {
      toast({ title: "Failed to update", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleSaveThreshold = () => {
    const val = parseInt(thresholdInput);
    if (!thresholdInput || isNaN(val) || val < 0) {
      toast({ title: "Invalid value", description: "Please enter a number of 0 or more.", variant: "destructive" });
      return;
    }
    updateThresholdMutation.mutate(val);
  };
  
  // Update active tab when URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const tabFromUrl = urlParams.get('tab');
    if (tabFromUrl && ['account', 'business', 'notifications'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [location]);

  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);

  const { data: orderCounterData, isLoading: isLoadingCounter } = useQuery<{ counter: number; prefix: string }>({
    queryKey: ["/api/settings/order-counter"],
    enabled: isEditingBusiness,
    staleTime: 0,
  });

  const [useCustomCollectionAddress, setUseCustomCollectionAddress] = useState(!!user?.pickupAddress);
  const [deliveryEnabled, setDeliveryEnabled] = useState(user?.enableDelivery ?? true);
  const [deliveryFlatRate, setDeliveryFlatRateState] = useState(user?.deliveryFlatRate || '');
  const [deliveryNote, setDeliveryNote] = useState(user?.deliveryNote || '');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [allowPayLater, setAllowPayLater] = useState(user?.allowPayLater ?? false);
  const [savingPayLater, setSavingPayLater] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(user?.vatEnabled ?? false);
  const [vatRateInput, setVatRateInput] = useState(
    user?.vatRate ? String(Math.round(parseFloat(user.vatRate) * 100)) : '20'
  );
  const [savingVat, setSavingVat] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/team-members/change-password", data),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
    },
    onError: async (error: any) => {
      let msg = "Failed to change password. Please try again.";
      try { const d = await error.json?.(); if (d?.message) msg = d.message; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({ title: "Missing fields", description: "Please fill in all password fields.", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast({ title: "Too short", description: "New password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirm password must match.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
  };

  const [accountForm, setAccountForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || '',
    preferredCurrency: user?.preferredCurrency || 'GBP'
  });
  const [businessForm, setBusinessForm] = useState({
    businessName: user?.businessName || '',
    storeTagline: user?.storeTagline ?? '',
    businessPhone: user?.businessPhone || '',
    businessAddress: user?.businessAddress || '',
    city: user?.city || '',
    postalCode: user?.postalCode || '',
    country: user?.country || 'United Kingdom',
    timezone: user?.timezone || 'UTC',
    logoType: user?.logoType || 'business',
    logoUrl: user?.logoUrl || '',
    pickupAddress: user?.pickupAddress || '',
    orderNumberPrefix: user?.orderNumberPrefix || 'INV',
    defaultCountryCode: user?.defaultCountryCode || '+44',
    legalBusinessName: user?.legalBusinessName || '',
    vatNumber: user?.vatNumber || '',
    companyRegistrationNumber: user?.companyRegistrationNumber || '',
  });

  // Sync form state with user data when user loads
  useEffect(() => {
    if (user) {
      setAccountForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        preferredCurrency: user.preferredCurrency || 'GBP'
      });
      setBusinessForm({
        businessName: user.businessName || '',
        storeTagline: user.storeTagline ?? '',
        businessPhone: user.businessPhone || '',
        businessAddress: user.businessAddress || '',
        city: user.city || '',
        postalCode: user.postalCode || '',
        country: user.country || 'United Kingdom',
        timezone: user.timezone || 'UTC',
        logoType: user.logoType || 'business',
        logoUrl: user.logoUrl || '',
        pickupAddress: user.pickupAddress || '',
        orderNumberPrefix: user.orderNumberPrefix || 'INV',
        defaultCountryCode: user.defaultCountryCode || '+44',
        legalBusinessName: user.legalBusinessName || '',
        vatNumber: user.vatNumber || '',
        companyRegistrationNumber: user.companyRegistrationNumber || '',
      });
      setUseCustomCollectionAddress(!!user.pickupAddress);
      setDeliveryEnabled(user.enableDelivery ?? true);
      setDeliveryFlatRateState(user.deliveryFlatRate || '');
      setDeliveryNote(user.deliveryNote || '');
      setAllowPayLater(user.allowPayLater ?? false);
      setVatEnabled(user.vatEnabled ?? false);
      setVatRateInput(user.vatRate ? String(Math.round(parseFloat(user.vatRate) * 100)) : '20');
    }
  }, [user]);

  const handleSaveDelivery = async () => {
    setSavingDelivery(true);
    try {
      const response = await apiRequest('PUT', '/api/user/profile', {
        enableDelivery: deliveryEnabled,
        deliveryFlatRate: deliveryEnabled && deliveryFlatRate ? parseFloat(deliveryFlatRate) : null,
        deliveryNote: deliveryNote.trim() || null,
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Delivery settings saved", description: "Your delivery preferences have been updated." });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSavingDelivery(false);
    }
  };

  const handleSavePayLater = async () => {
    setSavingPayLater(true);
    try {
      const response = await apiRequest('PUT', '/api/user/profile', { allowPayLater });
      const data = await response.json();
      if (data.success) {
        toast({ title: allowPayLater ? "Pay Later enabled" : "Pay Later disabled", description: allowPayLater ? "Customers can now choose to pay later at checkout." : "Pay Later option has been removed from checkout." });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSavingPayLater(false);
    }
  };

  const handleSaveVat = async () => {
    const rateAsDecimal = parseFloat(vatRateInput) / 100;
    if (isNaN(rateAsDecimal) || rateAsDecimal < 0 || rateAsDecimal > 1) {
      toast({ title: "Invalid VAT rate", description: "Enter a percentage between 0 and 100.", variant: "destructive" });
      return;
    }
    setSavingVat(true);
    try {
      const response = await apiRequest('PUT', '/api/user/profile', {
        vatEnabled,
        vatRate: rateAsDecimal,
        vatNumber: businessForm.vatNumber || null,
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Tax settings saved", description: "Your VAT configuration has been updated." });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSavingVat(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const handleSaveAccount = async () => {
    try {
      const response = await apiRequest('PUT', '/api/user/profile', accountForm);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Account Updated",
          description: "Your account information has been saved successfully.",
        });
        setIsEditingAccount(false);
        window.location.reload(); // Refresh to show updated data
      }
    } catch (error) {
      console.error('Error updating account:', error);
      toast({
        title: "Update Failed",
        description: "Unable to update account information. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveBusiness = async () => {
    const prefixVal = businessForm.orderNumberPrefix.trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(prefixVal)) {
      toast({
        title: "Invalid prefix",
        description: "Order number prefix must be 1–6 uppercase letters (A–Z) with no spaces or special characters.",
        variant: "destructive",
      });
      return;
    }
    try {
      const payload = {
        ...businessForm,
        pickupAddress: businessForm.pickupAddress.trim() || null,
        orderNumberPrefix: prefixVal,
      };
      const response = await apiRequest('PUT', '/api/user/profile', payload);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Business Updated",
          description: "Your business information has been saved successfully.",
        });
        setIsEditingBusiness(false);
        window.location.reload(); // Refresh to show updated data
      }
    } catch (error) {
      console.error('Error updating business:', error);
      toast({
        title: "Update Failed",
        description: "Unable to update business information. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Settings" description="Manage your account preferences and business settings" />
      <div className="space-y-8 p-4 sm:p-6">

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-3 sm:p-6">
              <nav className="space-y-2">
                {/* Account Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "account" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("account")}
                >
                  <User className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="font-medium text-sm sm:text-base">Account</span>
                </div>

                {/* Business Settings - visible to all roles; management actions gated below */}
                {(
                  <div 
                    className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                      activeTab === "business" 
                        ? "bg-blue-50 text-blue-700" 
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => setActiveTab("business")}
                  >
                    <Building2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                    <span className="text-sm sm:text-base">Business</span>
                  </div>
                )}

                {/* Business Profiles - only when enableMultiProfile is on */}
                {user.role !== 'team_member' && user.enableMultiProfile && (
                  <div
                    className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                      activeTab === "profiles"
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => setActiveTab("profiles")}
                  >
                    <Building2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                    <span className="text-sm sm:text-base">Business Profiles</span>
                  </div>
                )}

                {/* Notification Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "notifications" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("notifications")}
                >
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base">Notifications</span>
                </div>
                
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Settings Form */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg sm:text-xl">
                <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
                <span className="text-base sm:text-xl">
                  {activeTab === "account" && "Account Settings"}
                  {activeTab === "business" && "Business Settings"}
                  {activeTab === "profiles" && "Business Profiles"}
                  {activeTab === "notifications" && "Notification Settings"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {activeTab === "account" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900">Account Information</h3>
                    {!isEditingAccount ? (
                      <button
                        onClick={() => setIsEditingAccount(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button
                          onClick={handleSaveAccount}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingAccount(false);
                            setAccountForm({
                              firstName: user?.firstName || '',
                              lastName: user?.lastName || '',
                              email: user?.email || '',
                              phoneNumber: user?.phoneNumber || '',
                              preferredCurrency: user?.preferredCurrency || 'GBP'
                            });
                          }}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    {!isEditingAccount ? (
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Name</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Email</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.email || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Phone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.phoneNumber || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Currency</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.preferredCurrency || 'GBP'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Role</dt>
                          <dd className="mt-1 text-sm text-gray-900 capitalize">{user.role || 'Wholesaler'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Subscription</dt>
                        </div>
                      </dl>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-gray-500">First Name</label>
                          <input
                            type="text"
                            value={accountForm.firstName}
                            onChange={(e) => setAccountForm({...accountForm, firstName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Last Name</label>
                          <input
                            type="text"
                            value={accountForm.lastName}
                            onChange={(e) => setAccountForm({...accountForm, lastName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Email</label>
                          <input
                            type="email"
                            value={accountForm.email}
                            onChange={(e) => setAccountForm({...accountForm, email: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Phone</label>
                          <input
                            type="tel"
                            value={accountForm.phoneNumber}
                            onChange={(e) => setAccountForm({...accountForm, phoneNumber: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="+44XXXXXXXXXX"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Currency</label>
                          <select
                            value={accountForm.preferredCurrency}
                            onChange={(e) => setAccountForm({...accountForm, preferredCurrency: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="GBP">GBP (£)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Change Password — only for team members */}
                  {user.role === 'team_member' && (
                    <div>
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                        <Lock className="h-5 w-5 text-gray-500" />
                        Change Password
                      </h3>
                      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Current Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.current ? "text" : "password"}
                              value={passwordForm.currentPassword}
                              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                              className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Enter current password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">New Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.new ? "text" : "password"}
                              value={passwordForm.newPassword}
                              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                              className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              placeholder="At least 8 characters"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Confirm New Password</label>
                          <div className="relative">
                            <input
                              type={showPasswords.confirm ? "text" : "password"}
                              value={passwordForm.confirmPassword}
                              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                              className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Re-enter new password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                              {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={handleChangePassword}
                          disabled={changePasswordMutation.isPending}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 text-sm font-medium"
                        >
                          {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "business" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900">Business Information</h3>
                    {!isEditingBusiness ? (
                      <button
                        onClick={() => setIsEditingBusiness(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button
                          onClick={handleSaveBusiness}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingBusiness(false);
                            setBusinessForm({
                              businessName: user?.businessName || '',
                              storeTagline: user?.storeTagline ?? '',
                              businessPhone: user?.businessPhone || '',
                              businessAddress: user?.businessAddress || '',
                              city: user?.city || '',
                              postalCode: user?.postalCode || '',
                              country: user?.country || 'United Kingdom',
                              timezone: user?.timezone || 'UTC',
                              logoType: user?.logoType || 'business',
                              logoUrl: user?.logoUrl || '',
                              pickupAddress: user?.pickupAddress || '',
                              orderNumberPrefix: user?.orderNumberPrefix || 'INV',
                              defaultCountryCode: user?.defaultCountryCode || '+44',
                              legalBusinessName: user?.legalBusinessName || '',
                              vatNumber: user?.vatNumber || '',
                              companyRegistrationNumber: user?.companyRegistrationNumber || '',
                            });
                            setUseCustomCollectionAddress(!!user?.pickupAddress);
                          }}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    {!isEditingBusiness ? (
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Trading Name</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.businessName || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Store Tagline</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.storeTagline || <span className="text-gray-400 italic">None (hidden on portal)</span>}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Business Phone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.businessPhone || 'Not set'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Registered Address</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {user.businessAddress || 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">City</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.city || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Postal Code</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.postalCode || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Country</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.country || 'United Kingdom'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Collection Addresses</dt>
                          <dd className="mt-1 text-sm text-gray-500 italic">Manage multiple pickup locations in the Collection Addresses section below.</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Timezone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.timezone || 'UTC'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Invoice Number Prefix</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {user.orderNumberPrefix || 'INV'}
                            <span className="ml-2 text-gray-400 text-xs">(e.g. {(user.orderNumberPrefix || 'INV').toUpperCase()}-{String((user.orderNumberCounter ?? 0) + 1).padStart(3, '0')})</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Default Country Code</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.defaultCountryCode || '+44'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Company Logo / Business Initials</dt>
                          <dd className="mt-1">
                            <div className="flex items-center space-x-4">
                              <Logo size="lg" user={user} />
                              <div className="text-sm text-gray-600">
                                {user.logoType === 'custom' && user.logoUrl ? (
                                  <span>Custom logo uploaded</span>
                                ) : user.logoType === 'business' && user.businessName ? (
                                  <span>Business initials from: {user.businessName}</span>
                                ) : (
                                  <span>Default Quikpik logo</span>
                                )}
                              </div>
                            </div>
                          </dd>
                        </div>
                        <div className="sm:col-span-2 border-t pt-4">
                          <dt className="text-sm font-semibold text-gray-700 mb-3">Legal Business Information</dt>
                          <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 gap-x-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Legal Business Name</dt>
                              <dd className="mt-1 text-sm text-gray-900">{user.legalBusinessName || <span className="text-gray-400 italic">Not set</span>}</dd>
                            </div>
                            <div>
                              <dt className="text-sm font-medium text-gray-500">VAT Number</dt>
                              <dd className="mt-1 text-sm text-gray-900">{user.vatNumber || <span className="text-gray-400 italic">Not set</span>}</dd>
                            </div>
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Company Registration Number</dt>
                              <dd className="mt-1 text-sm text-gray-900">{user.companyRegistrationNumber || <span className="text-gray-400 italic">Not set</span>}</dd>
                            </div>
                          </div>
                        </div>
                      </dl>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Trading Name</label>
                          <p className="text-xs text-gray-400 mb-1">The name your customers see</p>
                          <input
                            type="text"
                            value={businessForm.businessName}
                            onChange={(e) => setBusinessForm({...businessForm, businessName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Store Tagline</label>
                          <p className="text-xs text-gray-400 mb-1">Shown beneath your business name on the customer portal. Leave blank to hide it.</p>
                          <input
                            type="text"
                            value={businessForm.storeTagline}
                            onChange={(e) => setBusinessForm({...businessForm, storeTagline: e.target.value})}
                            maxLength={120}
                            placeholder="e.g. Premium wholesale products"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Business Phone</label>
                          <input
                            type="tel"
                            value={businessForm.businessPhone}
                            onChange={(e) => setBusinessForm({...businessForm, businessPhone: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="+44XXXXXXXXXX"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-gray-500">Registered Address</label>
                          <textarea
                            value={businessForm.businessAddress}
                            onChange={(e) => setBusinessForm({...businessForm, businessAddress: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">City</label>
                          <input
                            type="text"
                            value={businessForm.city}
                            onChange={(e) => setBusinessForm({...businessForm, city: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Postal Code</label>
                          <input
                            type="text"
                            value={businessForm.postalCode}
                            onChange={(e) => setBusinessForm({...businessForm, postalCode: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Country</label>
                          <select
                            value={businessForm.country}
                            onChange={(e) => setBusinessForm({...businessForm, country: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="United States">United States</option>
                            <option value="Canada">Canada</option>
                            <option value="Australia">Australia</option>
                            <option value="Ireland">Ireland</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Timezone</label>
                          <select
                            value={businessForm.timezone}
                            onChange={(e) => setBusinessForm({...businessForm, timezone: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="UTC">UTC</option>
                            <option value="Europe/London">London (GMT/BST)</option>
                            <option value="America/New_York">New York (EST/EDT)</option>
                            <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                            <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Invoice Number Prefix</label>
                          <input
                            type="text"
                            value={businessForm.orderNumberPrefix}
                            onChange={(e) => setBusinessForm({...businessForm, orderNumberPrefix: e.target.value.toUpperCase()})}
                            maxLength={6}
                            placeholder="INV"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 uppercase"
                          />
                          <p className="mt-1 text-xs text-gray-400">
                            1–6 uppercase letters. Next invoice:{' '}
                            {isLoadingCounter ? (
                              <span className="font-medium text-gray-400">…</span>
                            ) : (
                              <span className="font-medium text-gray-600">
                                {(businessForm.orderNumberPrefix.trim() || 'INV').toUpperCase()}-{String((orderCounterData?.counter ?? 0) + 1).padStart(3, '0')}
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Default Country Code</label>
                          <select
                            value={businessForm.defaultCountryCode}
                            onChange={(e) => setBusinessForm({...businessForm, defaultCountryCode: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="+44">+44 (United Kingdom)</option>
                            <option value="+353">+353 (Ireland)</option>
                            <option value="+1">+1 (United States / Canada)</option>
                            <option value="+61">+61 (Australia)</option>
                            <option value="+64">+64 (New Zealand)</option>
                            <option value="+33">+33 (France)</option>
                            <option value="+49">+49 (Germany)</option>
                            <option value="+34">+34 (Spain)</option>
                            <option value="+39">+39 (Italy)</option>
                            <option value="+31">+31 (Netherlands)</option>
                            <option value="+32">+32 (Belgium)</option>
                            <option value="+27">+27 (South Africa)</option>
                            <option value="+91">+91 (India)</option>
                            <option value="+971">+971 (UAE)</option>
                            <option value="+966">+966 (Saudi Arabia)</option>
                          </select>
                          <p className="mt-1 text-xs text-gray-400">Pre-selected country code on your customer login screen</p>
                        </div>

                        <div className="sm:col-span-2 border-t pt-4">
                          <label className="text-sm font-medium text-gray-700 block mb-1">Collection Addresses</label>
                          <p className="text-xs text-gray-400">Manage multiple pickup locations from the <span className="font-medium text-green-700">Collection Addresses</span> section below — no need to save this form first.</p>
                        </div>
                        
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-gray-500 mb-4 block">Company Logo / Business Initials</label>
                          <div className="space-y-4">
                            <div className="flex items-center space-x-4">
                              <Logo size="lg" user={{...user, ...businessForm}} />
                              <div className="text-sm text-gray-600">
                                Current display preview
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="business"
                                    checked={businessForm.logoType === 'business'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Use business initials from business name</span>
                                </label>
                                {businessForm.logoType === 'business' && (
                                  <p className="text-xs text-gray-500 ml-6 mt-1">
                                    Will show: {businessForm.businessName ? 
                                      businessForm.businessName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase()
                                      : 'QP'
                                    }
                                  </p>
                                )}
                              </div>
                              
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="custom"
                                    checked={businessForm.logoType === 'custom'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Upload custom logo</span>
                                </label>
                                {businessForm.logoType === 'custom' && (
                                  <div className="ml-6 mt-2 space-y-4">
                                    <LogoUploader 
                                      onUploadComplete={(logoUrl) => setBusinessForm({...businessForm, logoUrl})}
                                      currentLogoUrl={businessForm.logoUrl}
                                    />
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-gray-600">Or enter logo URL manually:</label>
                                      <input
                                        type="url"
                                        placeholder="https://example.com/logo.png"
                                        value={businessForm.logoUrl}
                                        onChange={(e) => setBusinessForm({...businessForm, logoUrl: e.target.value})}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                                      />
                                      <div className="text-xs text-gray-500">
                                        💡 Upload your image to any free image hosting service (like Imgur, PostImages, etc.) and paste the direct link here
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="default"
                                    checked={businessForm.logoType === 'default'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Use default Quikpik logo</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="sm:col-span-2 border-t pt-4">
                          <label className="text-sm font-semibold text-gray-700 block mb-3">Legal Business Information</label>
                          <p className="text-xs text-gray-400 mb-3">These fields appear on invoices for legal compliance. All optional.</p>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className="text-sm font-medium text-gray-500">Legal Business Name</label>
                              <p className="text-xs text-gray-400 mb-1">Your registered company name</p>
                              <input
                                type="text"
                                value={businessForm.legalBusinessName}
                                onChange={(e) => setBusinessForm({...businessForm, legalBusinessName: e.target.value})}
                                placeholder="e.g. Acme Trading Ltd"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">VAT Number</label>
                              <input
                                type="text"
                                value={businessForm.vatNumber}
                                onChange={(e) => setBusinessForm({...businessForm, vatNumber: e.target.value})}
                                placeholder="e.g. GB123456789"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Company Registration Number</label>
                              <input
                                type="text"
                                value={businessForm.companyRegistrationNumber}
                                onChange={(e) => setBusinessForm({...businessForm, companyRegistrationNumber: e.target.value})}
                                placeholder="e.g. 12345678"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                  

                  {/* Collection Addresses Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <CollectionAddressesSection />
                  </div>

                  {/* Bank Details Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <BankDetailsSection />
                  </div>

                  {/* Delivery Settings Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Truck className="h-5 w-5 text-gray-600" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900">Delivery Options</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Control whether you offer delivery to customers, and set your flat delivery rate.</p>
                    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Offer Delivery</p>
                          <p className="text-xs text-gray-500 mt-0.5">When enabled, customers can choose delivery at checkout</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeliveryEnabled(!deliveryEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${deliveryEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${deliveryEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">Flat Delivery Rate</label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">£</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 5.99"
                              value={deliveryFlatRate}
                              onChange={(e) => setDeliveryFlatRateState(e.target.value)}
                              className="w-32"
                            />
                            <span className="text-xs text-gray-400">per order</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Leave blank to show delivery as "contact to arrange"</p>
                        </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Delivery Note <span className="text-gray-400 font-normal">(shown to customers at checkout)</span></label>
                        <textarea
                          value={deliveryNote}
                          onChange={(e) => setDeliveryNote(e.target.value)}
                          placeholder='e.g. "Free delivery on orders over £100" or "Allow 2–3 working days"'
                          rows={2}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-green-500 resize-none"
                        />
                        <p className="text-xs text-gray-400 mt-1">Customers will see this in the Order Summary during checkout</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveDelivery}
                        disabled={savingDelivery}
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingDelivery ? "Saving..." : "Save Delivery Settings"}
                      </Button>
                    </div>
                  </div>

                  {/* Pay Later Settings Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="h-5 w-5 text-gray-600" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900">Pay Later</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Allow customers to place orders without paying upfront. You will be responsible for collecting payment separately.</p>
                    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Enable Pay Later</p>
                          <p className="text-xs text-gray-500 mt-0.5">When on, customers see a "Pay Later" option at checkout alongside the standard payment flow</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAllowPayLater(!allowPayLater)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${allowPayLater ? 'bg-green-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${allowPayLater ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSavePayLater}
                        disabled={savingPayLater}
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingPayLater ? "Saving..." : "Save Pay Later Settings"}
                      </Button>
                    </div>
                  </div>

                  {/* Tax / VAT Settings Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="h-5 w-5 text-gray-600" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900">Tax Settings</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Configure VAT for your orders. When enabled, VAT is calculated at order creation and shown on invoices.</p>
                    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">VAT Registered</p>
                          <p className="text-xs text-gray-500 mt-0.5">Enable to add VAT to new orders automatically</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const enabling = !vatEnabled;
                            setVatEnabled(enabling);
                            if (enabling && (!vatRateInput || vatRateInput === '0')) {
                              setVatRateInput('20');
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vatEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${vatEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {vatEnabled && (
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">VAT Rate (%)</label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="20"
                              value={vatRateInput}
                              onChange={(e) => setVatRateInput(e.target.value)}
                              className="w-24"
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Standard UK VAT is 20%</p>
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">VAT Number <span className="text-gray-400 font-normal">(optional)</span></label>
                        <Input
                          type="text"
                          placeholder="e.g. GB123456789"
                          value={businessForm.vatNumber}
                          onChange={(e) => setBusinessForm({ ...businessForm, vatNumber: e.target.value })}
                          className="w-full max-w-xs"
                        />
                        <p className="text-xs text-gray-400 mt-1">Printed on PDF invoices for legal compliance</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveVat}
                        disabled={savingVat}
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingVat ? "Saving..." : "Save Tax Settings"}
                      </Button>
                    </div>
                  </div>

                  {/* Custom Store URL Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Link2 className="h-5 w-5 text-gray-600" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900">Custom Store URL</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Give your store a short, memorable link instead of the auto-generated one. Only lowercase letters, numbers, and hyphens allowed.
                    </p>

                    {/* Current live URL */}
                    <div className="flex items-center gap-2 mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <ExternalLink className="h-3.5 w-3.5 text-green-700 flex-shrink-0" />
                      <span className="text-xs text-green-800 font-mono break-all">{storeShareUrl}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 px-2 text-xs text-green-700 hover:text-green-900"
                        onClick={() => { navigator.clipboard.writeText(storeShareUrl); toast({ title: 'Copied!', description: 'Store link copied to clipboard.' }); }}
                      >
                        Copy
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">Your custom URL slug</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">quikpik.app/customer/</span>
                          <Input
                            className="pl-[172px] pr-8 text-sm font-mono"
                            placeholder="my-store"
                            value={slugInput}
                            onChange={e => {
                              const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                              setSlugInput(val);
                              checkSlugAvailability(val);
                            }}
                            maxLength={60}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2">
                            {slugStatus === 'checking' && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
                            {slugStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            {slugStatus === 'taken' && <XCircle className="h-4 w-4 text-red-500" />}
                            {slugStatus === 'invalid' && <XCircle className="h-4 w-4 text-amber-500" />}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          disabled={saveSlugMutation.isPending || slugStatus === 'checking' || slugStatus === 'taken' || slugStatus === 'invalid'}
                          onClick={() => saveSlugMutation.mutate(slugInput.trim())}
                        >
                          {saveSlugMutation.isPending ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                      {slugStatus === 'taken' && <p className="text-xs text-red-600">That URL is already taken — try another one.</p>}
                      {slugStatus === 'invalid' && <p className="text-xs text-amber-600">Must be at least 3 characters, letters/numbers/hyphens only, no leading or trailing hyphens.</p>}
                      {slugStatus === 'available' && <p className="text-xs text-green-600">Available! Hit Save to use this URL.</p>}
                      {user?.storeSlug && (
                        <p className="text-xs text-gray-400">
                          Old link still works: quikpik.app/customer/{user?.id}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Store QR Code Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <QrCode className="h-5 w-5 text-gray-600" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900">Your Store QR Code</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-6">Customers scan this to go straight to your store and request access. Print it, share it, or put it on your packaging.</p>
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-white border-2 border-gray-200 rounded-xl shadow-sm flex flex-col items-center">
                        {(() => {
                          const logoSrc = (() => {
                            if (user?.logoType === 'custom' && user?.logoUrl) {
                              return user.logoUrl as string;
                            }
                            if (user?.businessName) {
                              return generateInitialsDataUrl(user.businessName);
                            }
                            return null;
                          })();
                          return (
                            <QRCodeCanvas
                              ref={qrRef}
                              value={storeShareUrl}
                              size={200}
                              level="H"
                              includeMargin={true}
                              imageSettings={logoSrc ? { src: logoSrc, height: 48, width: 48, excavate: true } : undefined}
                            />
                          );
                        })()}
                        <p className="text-xs font-semibold text-gray-600 text-center mt-2 tracking-wide">
                          Scan to sign up for my store
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 text-center break-all max-w-xs">
                        quikpik.app/customer/{storeIdentifier}
                      </p>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={downloadQR} className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Download PNG
                        </Button>
                        <Button variant="outline" onClick={printQR} className="flex items-center gap-2">
                          <Printer className="h-4 w-4" />
                          Print
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "profiles" && (
                <BusinessProfilesSection />
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base sm:text-lg font-medium mb-1">Notification Preferences</h3>
                    <p className="text-gray-500 text-sm">Control how and when you receive alerts from the platform.</p>
                  </div>

                  {/* Team member: own stock alert preferences */}
                  {isTeamMember && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <h4 className="font-semibold text-gray-800 text-sm sm:text-base">My Stock Alert Preferences</h4>
                      </div>
                      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 text-sm text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                        <p className="text-blue-700">
                          Set your own alert channel and frequency. Choosing <strong>Inherit from account</strong> will use whatever the account owner has configured.
                        </p>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-800 mb-1">Alert frequency</p>
                          <p className="text-xs text-gray-500 mb-2">How often you want to receive stock alerts</p>
                          <Select
                            value={memberNotifForm.stockAlertFrequency}
                            onValueChange={(v) => setMemberNotifForm(f => ({ ...f, stockAlertFrequency: v }))}
                            disabled={!myTeamMemberRecord}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Inherit from account</SelectItem>
                              <SelectItem value="daily">Daily — as soon as stock drops below threshold</SelectItem>
                              <SelectItem value="weekly">Weekly — on a chosen day each week</SelectItem>
                              <SelectItem value="critical_only">Critical only — only when stock hits zero or near-zero</SelectItem>
                            </SelectContent>
                          </Select>
                          {memberNotifForm.stockAlertFrequency === 'weekly' && (
                            <div className="mt-2 space-y-1.5">
                              <p className="text-xs text-gray-500">Send on</p>
                              <Select
                                value={String(memberNotifForm.stockAlertDay ?? 1)}
                                onValueChange={(v) => setMemberNotifForm(f => ({ ...f, stockAlertDay: parseInt(v) }))}
                                disabled={!myTeamMemberRecord}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ALERT_DAY_NAMES.map((name, i) => (
                                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-400">
                                Next alert: <span className="font-medium text-gray-600">{getNextAlertDate(memberNotifForm.stockAlertDay ?? 1)}</span>
                              </p>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800 mb-1">Alert channel</p>
                          <p className="text-xs text-gray-500 mb-2">How you want to be notified</p>
                          <Select
                            value={memberNotifForm.stockAlertChannel}
                            onValueChange={(v) => setMemberNotifForm(f => ({ ...f, stockAlertChannel: v }))}
                            disabled={!myTeamMemberRecord}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Inherit from account</SelectItem>
                              <SelectItem value="email">Email only</SelectItem>
                              <SelectItem value="sms">SMS / WhatsApp only</SelectItem>
                              <SelectItem value="both">Both email and SMS</SelectItem>
                              <SelectItem value="off">Off — no stock alerts for me</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => saveMemberNotifPrefsMutation.mutate(memberNotifForm)}
                          disabled={saveMemberNotifPrefsMutation.isPending || !myTeamMemberRecord}
                          className="flex items-center gap-1.5"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {saveMemberNotifPrefsMutation.isPending ? "Saving..." : "Save preferences"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Stock Alerts Section (owner/admin only) */}
                  {!isTeamMember && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <h4 className="font-semibold text-gray-800 text-sm sm:text-base">Stock Alerts</h4>
                      </div>

                      {/* How it works */}
                      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 text-sm text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                        <ul className="space-y-1 text-blue-700">
                          <li>• Stock levels are checked automatically every day at <strong>8 AM</strong></li>
                          <li>• <strong>Daily</strong> alerts send as soon as a product drops to or below its threshold</li>
                          <li>• <strong>Weekly</strong> alerts send a single digest on your chosen day — each product can only appear once per calendar week</li>
                          <li>• <strong>Critical only</strong> sends immediately for products at zero or critically low stock</li>
                        </ul>
                      </div>

                      {/* Default threshold setting */}
                      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Default Low Stock Threshold</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Used for any product that doesn't have its own threshold set. Also applied automatically to all new products you create. Current default:{" "}
                            <strong>{userSettings?.defaultLowStockThreshold ?? user?.defaultLowStockThreshold ?? 50} units</strong>
                          </p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            min="0"
                            placeholder={String(userSettings?.defaultLowStockThreshold ?? user?.defaultLowStockThreshold ?? 50)}
                            value={thresholdInput}
                            onChange={(e) => setThresholdInput(e.target.value)}
                            className="w-32"
                          />
                          <span className="text-sm text-gray-500">units</span>
                          <Button
                            size="sm"
                            onClick={handleSaveThreshold}
                            disabled={!thresholdInput || updateThresholdMutation.isPending}
                            className="flex items-center gap-1.5"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {updateThresholdMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-400">
                          To set a custom threshold per product, visit the{" "}
                          <Link href="/stock-alerts" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                            Stock Alerts page <ExternalLink className="h-3 w-3" />
                          </Link>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stock alert controls (owner/wholesaler only) */}
                  {!isTeamMember && <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-800 mb-1">Alert frequency</p>
                        <p className="text-xs text-gray-500 mb-2">How often you want to receive stock alerts</p>
                        <Select
                          value={notifForm.stockAlertFrequency}
                          onValueChange={(v) => setNotifForm(f => ({ ...f, stockAlertFrequency: v }))}
                          disabled={notifPrefsLoading}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily — as soon as stock drops below threshold</SelectItem>
                            <SelectItem value="weekly">Weekly — on a chosen day each week</SelectItem>
                            <SelectItem value="critical_only">Critical only — only when stock hits zero or near-zero</SelectItem>
                          </SelectContent>
                        </Select>
                        {notifForm.stockAlertFrequency === 'weekly' && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-xs text-gray-500">Send on</p>
                            <Select
                              value={String(notifForm.stockAlertDay)}
                              onValueChange={(v) => setNotifForm(f => ({ ...f, stockAlertDay: parseInt(v) }))}
                              disabled={notifPrefsLoading}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALERT_DAY_NAMES.map((name, i) => (
                                  <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-400">
                              Next alert: <span className="font-medium text-gray-600">{getNextAlertDate(notifForm.stockAlertDay, notifForm.lastWeeklyStockAlertSentAt)}</span>
                            </p>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 mb-1">Alert channel</p>
                        <p className="text-xs text-gray-500 mb-2">How you want to be notified</p>
                        <Select
                          value={notifForm.stockAlertChannel}
                          onValueChange={(v) => setNotifForm(f => ({ ...f, stockAlertChannel: v }))}
                          disabled={notifPrefsLoading}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email only</SelectItem>
                            <SelectItem value="sms">SMS / WhatsApp only</SelectItem>
                            <SelectItem value="both">Both email and SMS</SelectItem>
                            <SelectItem value="off">Off — no stock alerts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>}

                  {/* Customer-facing automated messages (owner/wholesaler only) */}
                  {!isTeamMember && <div className="space-y-3 pt-2">
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm sm:text-base">Automated Customer Messages</h4>
                      <p className="text-xs text-gray-500 mt-0.5">These are sent automatically to your customers. Toggle them off to stop sending.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">Payment reminders</p>
                            <p className="text-xs text-gray-500 mt-0.5">Remind customers 3 days before, on the day, and when a balance payment becomes overdue</p>
                          </div>
                          <Switch
                            checked={notifForm.paymentReminderEnabled}
                            onCheckedChange={(v) => setNotifForm(f => ({ ...f, paymentReminderEnabled: v }))}
                            disabled={notifPrefsLoading}
                          />
                        </div>
                        {notifForm.paymentReminderEnabled && (
                          <Select
                            value={notifForm.paymentReminderChannel}
                            onValueChange={(v) => setNotifForm(f => ({ ...f, paymentReminderChannel: v }))}
                            disabled={notifPrefsLoading}
                          >
                            <SelectTrigger className="w-full sm:w-56">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email only</SelectItem>
                              <SelectItem value="sms">SMS / WhatsApp only</SelectItem>
                              <SelectItem value="both">Both email and SMS</SelectItem>
                              <SelectItem value="off">Off — no payment reminders</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">Promotion alerts</p>
                            <p className="text-xs text-gray-500 mt-0.5">Notify customers when one of your promotions starts or ends today</p>
                          </div>
                          <Switch
                            checked={notifForm.promotionReminderEnabled}
                            onCheckedChange={(v) => setNotifForm(f => ({ ...f, promotionReminderEnabled: v }))}
                            disabled={notifPrefsLoading}
                          />
                        </div>
                        {notifForm.promotionReminderEnabled && (
                          <Select
                            value={notifForm.promotionReminderChannel}
                            onValueChange={(v) => setNotifForm(f => ({ ...f, promotionReminderChannel: v }))}
                            disabled={notifPrefsLoading}
                          >
                            <SelectTrigger className="w-full sm:w-56">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email only</SelectItem>
                              <SelectItem value="sms">SMS / WhatsApp only</SelectItem>
                              <SelectItem value="both">Both email and SMS</SelectItem>
                              <SelectItem value="off">Off — no promotion alerts</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>}

                  {!isTeamMember && <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => saveNotifPrefsMutation.mutate(notifForm)}
                      disabled={saveNotifPrefsMutation.isPending || notifPrefsLoading}
                      className="flex items-center gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saveNotifPrefsMutation.isPending ? "Saving..." : "Save preferences"}
                    </Button>
                  </div>}
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
  );
}

