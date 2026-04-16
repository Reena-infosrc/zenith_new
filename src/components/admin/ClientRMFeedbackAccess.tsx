import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";
import { authenticatedFetch } from "@/utils/auth-utils";

type Props = {
  onClose?: () => void;
};

export function ClientRMFeedbackAccess({ onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const normalizedEmails = useMemo(
    () => emails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    [emails]
  );

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/access/leadership`);
      if (!res.ok) throw new Error("Failed to fetch leadership access emails");
      const data = await res.json();
      setEmails(Array.isArray(data.emails) ? data.emails : []);
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to load leadership access list.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const addEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (normalizedEmails.includes(email)) {
      toast({ title: "Already added", description: "That email is already in the list." });
      return;
    }
    setSaving(true);
    try {
      const res = await authenticatedFetch(
        `${API_BASE_URL}/client-rm-feedback/access/leadership?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to add email");
      }
      toast({ title: "Added", description: "Leadership email added successfully." });
      setNewEmail("");
      fetchEmails();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to add leadership email.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeEmail = async (email: string) => {
    if (!confirm(`Remove leadership access for ${email}?`)) return;
    setSaving(true);
    try {
      const res = await authenticatedFetch(
        `${API_BASE_URL}/client-rm-feedback/access/leadership?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to remove email");
      }
      toast({ title: "Removed", description: "Leadership email removed successfully." });
      fetchEmails();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to remove leadership email.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Leadership Access</h2>
          <p className="text-muted-foreground">Manage leadership members who can view monthly feedback/reviews.</p>
        </div>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Leadership Email</CardTitle>
          <CardDescription>Only these emails will have leadership visibility for monthly feedback/reviews.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 items-end">
          <div className="w-full space-y-2">
            <Label>Email</Label>
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="leader.name@infoservices.com"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <Button onClick={addEmail} disabled={saving || !newEmail.trim()}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leadership Viewers</CardTitle>
          <CardDescription>
            Emails allowed to view monthly feedback/reviews ({emails.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email}>
                    <TableCell className="font-medium">{email}</TableCell>
                    <TableCell>
                      <Badge variant="default">Active</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeEmail(email)}
                        className="text-destructive hover:text-destructive"
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {emails.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No leadership emails added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

