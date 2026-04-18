import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Search, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";
import { authenticatedFetch } from "@/utils/auth-utils";
import { cn } from "@/lib/utils";

type Props = {
  onClose?: () => void;
};

type Employee = {
  id: string;
  employeeId?: string;
  employee_id?: string;
  name: string;
  email?: string;
  department?: string;
  position?: string;
};

type LeadershipEntry = {
  email: string;
  created_at?: string | null;
  /** Populated by GET /access/leadership so the table does not need the full employee directory. */
  employee?: {
    employee_id: string;
    name: string;
    department: string;
    position: string;
  } | null;
};

function resolveEmployeeByEmail(employees: Employee[], email: string): Employee | undefined {
  const target = email.trim().toLowerCase();
  return employees.find((x) => (x.email || "").trim().toLowerCase() === target);
}

function employeeIdDisplay(e: Employee): string {
  return (e.employee_id || e.employeeId || "").trim() || "—";
}

/** Prefer server-enriched snapshot; avoids loading /employees/ for the main table. */
function employeeFromLeadershipSnapshot(entry: LeadershipEntry): Employee | undefined {
  const snap = entry.employee;
  if (!snap) return undefined;
  return {
    id: entry.email,
    employee_id: snap.employee_id,
    name: snap.name || "—",
    email: entry.email,
    department: snap.department,
    position: snap.position,
  };
}

function formatEntryCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function ClientRMFeedbackAccess({ onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeadershipEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingEmployeeId, setAddingEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  /** Highlights the row we just added and drives the “success” banner. */
  const [lastAddedEmail, setLastAddedEmail] = useState<string | null>(null);
  const [lastAddedLabel, setLastAddedLabel] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  const normalizedEmails = useMemo(
    () => entries.map((e) => e.email.trim().toLowerCase()).filter(Boolean),
    [entries]
  );

  const fetchEntries = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/access/leadership`);
        if (!res.ok) throw new Error("Failed to fetch leadership access list");
        const data = await res.json();
        if (Array.isArray(data.entries)) {
          setEntries(data.entries as LeadershipEntry[]);
        } else if (Array.isArray(data.emails)) {
          setEntries((data.emails as string[]).map((email) => ({ email, created_at: null })));
        } else {
          setEntries([]);
        }
      } catch {
        toast({
          title: "Error",
          description: "Failed to load leadership access list.",
          variant: "destructive",
        });
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [toast]
  );

  /** Full directory — only needed for the “Add Leadership” search dialog (large payload). */
  const fetchEmployees = useCallback(async () => {
    setDirectoryLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/employees/`);
      if (!res.ok) return;
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      // keep screen usable even if employee list fails
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  /** Load directory lazily when the add dialog opens (not on initial dashboard paint). */
  useEffect(() => {
    if (!isAddDialogOpen) return;
    if (employees.length > 0) return;
    void fetchEmployees();
  }, [isAddDialogOpen, employees.length, fetchEmployees]);

  /** Clear highlight + banner after a few seconds */
  useEffect(() => {
    if (!lastAddedEmail) return;
    const t = window.setTimeout(() => {
      setLastAddedEmail(null);
      setLastAddedLabel(null);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [lastAddedEmail]);

  /** Scroll the newly added row into view */
  useEffect(() => {
    if (!lastAddedEmail) return;
    const id = window.requestAnimationFrame(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [lastAddedEmail, entries]);

  const postLeadershipEmail = useCallback(
    async (emailRaw: string, opts?: { displayName?: string }): Promise<boolean> => {
      const email = emailRaw.trim().toLowerCase();
      if (!email) return false;
      if (normalizedEmails.includes(email)) {
        toast({
          title: "Already on the list",
          description: `${email} already has leadership access — check the table below.`,
        });
        return false;
      }
      setSaving(true);
      try {
        const res = await authenticatedFetch(
          `${API_BASE_URL}/client-rm-feedback/access/leadership?email=${encodeURIComponent(email)}`,
          { method: "POST" }
        );
        const payload = (await res.json().catch(() => ({}))) as {
          already_exists?: boolean;
          detail?: string;
        };
        if (!res.ok) {
          throw new Error(payload.detail || "Failed to add email");
        }
        if (payload.already_exists) {
          toast({
            title: "Already on the list",
            description: `${email} already has leadership access.`,
          });
          await fetchEntries({ silent: true });
          return false;
        }
        setLastAddedEmail(email);
        setLastAddedLabel(opts?.displayName?.trim() || null);
        const who = opts?.displayName?.trim()
          ? `${opts.displayName.trim()} (${email})`
          : email;
        toast({
          title: "Successfully added",
          description: `${who} now has leadership access. The new row is highlighted below.`,
        });
        setIsAddDialogOpen(false);
        await fetchEntries({ silent: true });
        return true;
      } catch (e) {
        toast({
          title: "Could not add",
          description: e instanceof Error ? e.message : "Failed to add leadership email.",
          variant: "destructive",
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [normalizedEmails, toast, fetchEntries]
  );

  const addFromEmployeeRow = async (employee: Employee) => {
    const email = (employee.email || "").trim().toLowerCase();
    if (!email) {
      toast({ title: "Missing email", description: "This employee record has no email.", variant: "destructive" });
      return;
    }
    setAddingEmployeeId(employee.id);
    try {
      await postLeadershipEmail(email, { displayName: employee.name });
      setSearchTerm("");
    } finally {
      setAddingEmployeeId(null);
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
      toast({ title: "Removed", description: "Leadership access removed successfully." });
      setLastAddedEmail(null);
      setLastAddedLabel(null);
      fetchEntries({ silent: true });
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

  const filteredEmployees = useMemo(() => {
    const already = new Set(normalizedEmails);
    const base = employees.filter((e) => {
      const em = (e.email || "").trim().toLowerCase();
      return em && !already.has(em);
    });
    if (!searchTerm) return base;
    const s = searchTerm.toLowerCase();
    return base.filter((e) => {
      const id = (e.employeeId || e.employee_id || "").toLowerCase();
      const name = (e.name || "").toLowerCase();
      const email = (e.email || "").toLowerCase();
      const dept = (e.department || "").toLowerCase();
      const pos = (e.position || "").toLowerCase();
      return id.includes(s) || name.includes(s) || email.includes(s) || dept.includes(s) || pos.includes(s);
    });
  }, [employees, searchTerm, normalizedEmails]);

  const leadershipRows = useMemo(() => {
    return entries.map((entry) => ({
      ...entry,
      resolved:
        employeeFromLeadershipSnapshot(entry) ?? resolveEmployeeByEmail(employees, entry.email),
    }));
  }, [entries, employees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leadership Access</h2>
        </div>

        <div className="flex gap-2 shrink-0">
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setSearchTerm("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Leadership
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Leadership</DialogTitle>
                <DialogDescription>
                  Search the employee directory and click <span className="font-medium text-foreground">Add</span> on a
                  row. Only people listed here can be granted leadership access. New entries show in the list below
                  with the date they were added.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="leadership-search">Search Employees</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="leadership-search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, email, or employee ID..."
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Employee ID</TableHead>
                        <TableHead className="min-w-[10rem] max-w-[18rem]">Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="min-w-[8rem]">Department</TableHead>
                        <TableHead className="min-w-[8rem]">Position</TableHead>
                        <TableHead className="w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {directoryLoading && employees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-36 text-center align-middle">
                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              <span>Loading employee directory…</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {filteredEmployees.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="font-mono text-sm">{employeeIdDisplay(e)}</TableCell>
                              <TableCell className="min-w-[10rem] max-w-[18rem]">
                                <span className="line-clamp-2 break-words" title={e.name}>
                                  {e.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{e.email || "—"}</TableCell>
                              <TableCell>{e.department || "—"}</TableCell>
                              <TableCell>{e.position || "—"}</TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  disabled={saving || Boolean(addingEmployeeId)}
                                  onClick={() => addFromEmployeeRow(e)}
                                >
                                  {addingEmployeeId === e.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-1 inline" />
                                      Adding
                                    </>
                                  ) : (
                                    "Add"
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredEmployees.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                {employees.length === 0 && !directoryLoading
                                  ? "Employee directory not available."
                                  : "No matching employees, or everyone listed is already a leadership viewer."}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {onClose && (
            <Button variant="outline" type="button" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Current leadership viewers</CardTitle>
          <CardDescription>
            Users with leadership visibility for Monthly feedback ({entries.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {lastAddedEmail && (
            <div
              className="flex items-start gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-foreground"
              role="status"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">Added successfully</p>
                <p className="text-muted-foreground mt-0.5">
                  {lastAddedLabel ? (
                    <>
                      <span className="font-medium text-foreground">{lastAddedLabel}</span> ({lastAddedEmail}) is now in
                      this list with <span className="font-medium">Active</span> status. The row is highlighted.
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{lastAddedEmail}</span> is now in this list with{" "}
                      <span className="font-medium">Active</span> status. The row is highlighted.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-52">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead className="min-w-[10rem] max-w-[14rem]">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadershipRows.map(({ email, created_at, resolved }) => (
                    <TableRow
                      key={email}
                      ref={email === lastAddedEmail ? highlightedRowRef : undefined}
                      className={cn(
                        "even:bg-muted/25 transition-colors",
                        email === lastAddedEmail &&
                          "ring-2 ring-inset ring-primary/50 bg-primary/[0.08] dark:bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
                      )}
                    >
                      <TableCell className="font-mono text-sm">
                        {resolved ? employeeIdDisplay(resolved) : "—"}
                      </TableCell>
                      <TableCell className="font-medium min-w-[10rem] max-w-[14rem]">
                        <span className="line-clamp-2 break-words" title={resolved?.name ?? email}>
                          {resolved?.name ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{email}</TableCell>
                      <TableCell className="text-muted-foreground">{resolved?.department || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{resolved?.position || "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatEntryCreatedAt(created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="font-normal">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeEmail(email)}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                          disabled={saving}
                          aria-label={`Remove ${email}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        No leadership viewers yet. Use <span className="font-medium text-foreground">Add Leadership</span>{" "}
                        to grant access.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
