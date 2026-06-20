import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check, X, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CategoryRow {
  id: number;
  name: string;
  productCount: number;
}

export function CategoriesSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  const { data: categories = [], isLoading } = useQuery<CategoryRow[]>({
    queryKey: ["/api/categories"],
    enabled: isAdmin,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
  };

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/categories", { name });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add category");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Category added" });
      setNewName("");
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/categories/${id}`, { name });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename category");
      return data as { productsUpdated: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Category renamed",
        description: data.productsUpdated > 0
          ? `${data.productsUpdated} product${data.productsUpdated === 1 ? "" : "s"} updated`
          : undefined,
      });
      setEditingId(null);
      setEditValue("");
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/categories/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete category");
      return data as { productsCleared: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Category deleted",
        description: data.productsCleared > 0
          ? `${data.productsCleared} product${data.productsCleared === 1 ? "" : "s"} are now uncategorised`
          : undefined,
      });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addMutation.mutate(name);
  };

  const startEdit = (cat: CategoryRow) => {
    setEditingId(cat.id);
    setEditValue(cat.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = (cat: CategoryRow) => {
    const name = editValue.trim();
    if (!name || name === cat.name) { cancelEdit(); return; }
    renameMutation.mutate({ id: cat.id, name });
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tags className="h-4 w-4 text-emerald-600" />
            Product Categories
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            One shared list used across the product form, storefront and homepage. Renaming a
            category updates every product that uses it; deleting it clears the category from those products.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              maxLength={60}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 text-white gap-1.5 flex-shrink-0"
              style={{ background: "#1a7a3d" }}
              onClick={handleAdd}
              disabled={addMutation.isPending || !newName.trim()}
            >
              <Plus className="h-4 w-4" />Add
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No categories yet. Add one above.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 px-3 py-2.5">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(cat);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={60}
                        className="h-8 text-sm flex-1"
                      />
                      <button
                        onClick={() => saveEdit(cat)}
                        disabled={renameMutation.isPending}
                        className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{cat.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {cat.productCount} product{cat.productCount === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(cat)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.productCount > 0 ? (
                <>
                  {deleteTarget.productCount} product{deleteTarget.productCount === 1 ? "" : "s"} currently
                  use this category. They will become uncategorised — their category will be cleared.
                </>
              ) : (
                <>No products use this category. This action cannot be undone.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Delete category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
