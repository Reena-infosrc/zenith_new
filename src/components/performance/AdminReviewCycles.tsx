import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Plus,
  Edit,
  Archive,
  Play,
  Clock,
  CheckCircle2,
  X,
  Save,
  AlertCircle,
  Filter,
  Search,
  Users,
  FileText,
  Target,
  BarChart3,
  Send,
  Eye,
  CheckCircle,
  XCircle,
  History,
  Bell,
  Settings,
  UserCheck,
  TrendingUp,
  Award,
  MessageSquare,
  Link as LinkIcon,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  ArrowRight,
  ChevronRight,
  Mail,
  UserPlus,
  UserMinus
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { toast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/use-employees";

// Types
interface ReviewCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  createdAt: string;
  createdBy: string;
  employeeCount?: number;
  completionRate?: number;
  selfReviewEnabled: boolean;
  managerReviewEnabled: boolean;
  competencyWeightages?: Record<string, number>;
  assignments?: EmployeeAssignment[];
}

interface EmployeeAssignment {
  employeeId: string;
  employeeName: string;
  managerId: string;
  managerName: string;
  status: 'not_started' | 'self_submitted' | 'manager_submitted' | 'hr_approved' | 'hr_rejected';
  selfReviewSubmittedAt?: string;
  managerReviewSubmittedAt?: string;
  hrApprovedAt?: string;
}

interface CycleFormData {
  name: string;
  startDate: string;
  endDate: string;
  selfReviewEnabled: boolean;
  managerReviewEnabled: boolean;
  competencyWeightages: Record<string, number>;
  assignments: EmployeeAssignment[];
}

interface CycleStats {
  total: number;
  pending: number;
  submitted: number;
  managerPending: number;
  finalized: number;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
  cycleId: string;
  cycleName: string;
}

interface Competency {
  id: string;
  name: string;
  description?: string;
}

const DEFAULT_COMPETENCIES: Competency[] = [
  { id: 'technical', name: 'Technical Skills' },
  { id: 'communication', name: 'Communication' },
  { id: 'leadership', name: 'Leadership' },
  { id: 'collaboration', name: 'Collaboration' },
  { id: 'problem_solving', name: 'Problem Solving' },
  { id: 'initiative', name: 'Initiative' },
  { id: 'adaptability', name: 'Adaptability' }
];

export function AdminReviewCycles() {
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<ReviewCycle | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [editingCycle, setEditingCycle] = useState<ReviewCycle | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<CycleStats>({
    total: 0,
    pending: 0,
    submitted: 0,
    managerPending: 0,
    finalized: 0
  });
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { preserveScroll } = usePreserveScroll();
  const { employees, loading: employeesLoading } = useEmployees();

  const [formData, setFormData] = useState<CycleFormData>({
    name: '',
    startDate: '',
    endDate: '',
    selfReviewEnabled: true,
    managerReviewEnabled: true,
    competencyWeightages: {},
    assignments: []
  });

  // Initialize competency weightages
  useEffect(() => {
    if (Object.keys(formData.competencyWeightages).length === 0) {
      const initialWeightages: Record<string, number> = {};
      DEFAULT_COMPETENCIES.forEach(comp => {
        initialWeightages[comp.id] = 0;
      });
      setFormData(prev => ({
        ...prev,
        competencyWeightages: initialWeightages
      }));
    }
  }, []);

  // Fetch cycles
  const fetchCycles = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await authenticatedFetch(`${API_BASE_URL}/review-cycles`);
      // const data = await response.json();
      
      // Mock data for now
      const mockCycles: ReviewCycle[] = [
        {
          id: '1',
          name: '2024 Annual Performance Review',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          status: 'active',
          createdAt: '2023-12-15',
          createdBy: 'HR Admin',
          employeeCount: 150,
          completionRate: 72,
          selfReviewEnabled: true,
          managerReviewEnabled: true,
          competencyWeightages: {
            technical: 20,
            communication: 15,
            leadership: 15,
            collaboration: 15,
            problem_solving: 15,
            initiative: 10,
            adaptability: 10
          }
        }
      ];
      setCycles(mockCycles);
      calculateStats(mockCycles);
    } catch (error) {
      console.error('Error fetching cycles:', error);
      toast({
        title: "Error",
        description: "Failed to load review cycles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  const calculateStats = (cyclesList: ReviewCycle[]) => {
    const activeCycle = cyclesList.find(c => c.status === 'active');
    if (!activeCycle) {
      setStats({
        total: cyclesList.length,
        pending: 0,
        submitted: 0,
        managerPending: 0,
        finalized: 0
      });
      return;
    }

    // Mock stats calculation - replace with actual API data
    const totalEmployees = activeCycle.employeeCount || 0;
    const submitted = Math.floor(totalEmployees * 0.4);
    const managerPending = Math.floor(totalEmployees * 0.3);
    const finalized = Math.floor(totalEmployees * 0.2);
    const pending = totalEmployees - submitted - managerPending - finalized;

    setStats({
      total: cyclesList.length,
      pending,
      submitted,
      managerPending,
      finalized
    });
  };

  const filteredCycles = cycles.filter(cycle => {
    const matchesStatus = filterStatus === 'all' || cycle.status === filterStatus;
    const matchesSearch = cycle.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: ReviewCycle['status']) => {
    const variants: Record<string, { variant: any; icon: any; label: string; className: string }> = {
      draft: { variant: 'secondary', icon: Edit, label: 'Draft', className: 'bg-muted/50 text-muted-foreground' },
      active: { variant: 'default', icon: Play, label: 'Active', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
      closed: { variant: 'outline', icon: CheckCircle2, label: 'Closed', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
      archived: { variant: 'secondary', icon: Archive, label: 'Archived', className: 'bg-muted/30 text-muted-foreground' }
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={cn("flex items-center gap-1", config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleCreateCycle = async () => {
    try {
      setLoading(true);
      // TODO: API call
      // const response = await authenticatedFetch(`${API_BASE_URL}/review-cycles`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // });

      const newCycle: ReviewCycle = {
        id: Date.now().toString(),
        name: formData.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: 'draft',
        createdAt: new Date().toISOString().split('T')[0],
        createdBy: 'Current User',
        selfReviewEnabled: formData.selfReviewEnabled,
        managerReviewEnabled: formData.managerReviewEnabled,
        competencyWeightages: formData.competencyWeightages,
        assignments: formData.assignments
      };

      setCycles([...cycles, newCycle]);
      setShowCreateModal(false);
      resetForm();
      toast({
        title: "Success",
        description: "Review cycle created successfully"
      });
    } catch (error) {
      console.error('Error creating cycle:', error);
      toast({
        title: "Error",
        description: "Failed to create review cycle",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCycle = async () => {
    if (!editingCycle) return;
    try {
      setLoading(true);
      // TODO: API call
      setCycles(cycles.map(c => c.id === editingCycle.id ? { ...c, ...formData } : c));
      setEditingCycle(null);
      setShowCreateModal(false);
      resetForm();
      toast({
        title: "Success",
        description: "Review cycle updated successfully"
      });
    } catch (error) {
      console.error('Error updating cycle:', error);
      toast({
        title: "Error",
        description: "Failed to update review cycle",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateCycle = async (cycleId: string) => {
    try {
      // TODO: API call
      setCycles(cycles.map(c => {
        if (c.id === cycleId) return { ...c, status: 'active' };
        if (c.status === 'active') return { ...c, status: 'closed' };
        return c;
      }));
      toast({
        title: "Success",
        description: "Review cycle activated. Notifications sent to employees."
      });
    } catch (error) {
      console.error('Error activating cycle:', error);
      toast({
        title: "Error",
        description: "Failed to activate review cycle",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: '',
      endDate: '',
      selfReviewEnabled: true,
      managerReviewEnabled: true,
      competencyWeightages: {},
      assignments: []
    });
  };

  const openEditModal = (cycle: ReviewCycle) => {
    setEditingCycle(cycle);
    setFormData({
      name: cycle.name,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      selfReviewEnabled: cycle.selfReviewEnabled,
      managerReviewEnabled: cycle.managerReviewEnabled,
      competencyWeightages: cycle.competencyWeightages || {},
      assignments: cycle.assignments || []
    });
    setShowCreateModal(true);
  };

  const openRosterModal = (cycle: ReviewCycle) => {
    setSelectedCycle(cycle);
    setShowRosterModal(true);
  };

  const totalWeightage = Object.values(formData.competencyWeightages).reduce((sum, val) => sum + (val || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Yearly Performance Review Cycles
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create, manage, and track annual performance review cycles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const activeCycle = cycles.find(c => c.status === 'active');
              if (activeCycle) {
                setSelectedCycle(activeCycle);
                setShowApprovalModal(true);
              } else {
                toast({
                  title: "No Active Cycle",
                  description: "Please activate a review cycle first",
                  variant: "destructive"
                });
              }
            }}
            className="hover:bg-primary/10"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Final Approval
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAuditLog(true)}
            className="hover:bg-primary/10"
          >
            <History className="h-4 w-4 mr-2" />
            Audit Log
          </Button>
          <Button
            onClick={() => {
              setEditingCycle(null);
              resetForm();
              setShowCreateModal(true);
            }}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Review Cycle
          </Button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cycles</p>
                <p className="text-3xl font-bold mt-2">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold mt-2">{stats.pending}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                <p className="text-3xl font-bold mt-2">{stats.submitted}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Send className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Manager Pending</p>
                <p className="text-3xl font-bold mt-2">{stats.managerPending}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Finalized</p>
                <p className="text-3xl font-bold mt-2">{stats.finalized}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cycles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] bg-background/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cycles List */}
      <Tabs defaultValue="all" className="space-y-4" onValueChange={() => preserveScroll()}>
        <TabsList className="bg-muted/50 backdrop-blur-sm">
          <TabsTrigger value="all">All Cycles</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredCycles.map((cycle) => (
            <Card
              key={cycle.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{cycle.name}</h3>
                      {getStatusBadge(cycle.status)}
                    </div>

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(cycle.startDate).toLocaleDateString()} - {new Date(cycle.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      {cycle.employeeCount && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{cycle.employeeCount} employees</span>
                        </div>
                      )}
                      {cycle.completionRate !== undefined && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{cycle.completionRate}% complete</span>
                        </div>
                      )}
                    </div>

                    {cycle.status === 'active' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">
                          Days remaining: {Math.ceil((new Date(cycle.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRosterModal(cycle)}
                      className="hover:bg-primary/10"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Roster
                    </Button>
                    {cycle.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleActivateCycle(cycle.id)}
                        className="hover:bg-green-500/10 hover:text-green-600"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Activate
                      </Button>
                    )}
                    {cycle.status !== 'archived' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(cycle)}
                        className="hover:bg-primary/10"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Cycle Modal */}
      <CreateEditCycleModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        formData={formData}
        setFormData={setFormData}
        editingCycle={editingCycle}
        onSubmit={editingCycle ? handleUpdateCycle : handleCreateCycle}
        loading={loading}
        employees={employees}
        totalWeightage={totalWeightage}
      />

      {/* Cycle Roster Modal */}
      {selectedCycle && (
        <CycleRosterModal
          open={showRosterModal}
          onOpenChange={setShowRosterModal}
          cycle={selectedCycle}
          employees={employees}
        />
      )}

      {/* Final Approval Modal */}
      {selectedCycle && (
        <FinalApprovalModal
          open={showApprovalModal}
          onOpenChange={setShowApprovalModal}
          cycle={selectedCycle}
        />
      )}

      {/* Audit Log Modal */}
      <AuditLogModal
        open={showAuditLog}
        onOpenChange={setShowAuditLog}
        logs={auditLogs}
      />
    </div>
  );
}

// Create/Edit Cycle Modal Component
interface CreateEditCycleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CycleFormData;
  setFormData: (data: CycleFormData) => void;
  editingCycle: ReviewCycle | null;
  onSubmit: () => void;
  loading: boolean;
  employees: any[];
  totalWeightage: number;
}

function CreateEditCycleModal({
  open,
  onOpenChange,
  formData,
  setFormData,
  editingCycle,
  onSubmit,
  loading,
  employees,
  totalWeightage
}: CreateEditCycleModalProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (formData.assignments) {
      setSelectedEmployees(formData.assignments.map(a => a.employeeId));
      const assignments: Record<string, string> = {};
      formData.assignments.forEach(a => {
        assignments[a.employeeId] = a.managerId;
      });
      setManagerAssignments(assignments);
    }
  }, [formData.assignments]);

  const handleWeightageChange = (competencyId: string, value: number) => {
    setFormData({
      ...formData,
      competencyWeightages: {
        ...formData.competencyWeightages,
        [competencyId]: Math.max(0, Math.min(100, value))
      }
    });
  };

  const handleEmployeeToggle = (employeeId: string) => {
    if (selectedEmployees.includes(employeeId)) {
      setSelectedEmployees(selectedEmployees.filter(id => id !== employeeId));
      const newAssignments = { ...managerAssignments };
      delete newAssignments[employeeId];
      setManagerAssignments(newAssignments);
    } else {
      setSelectedEmployees([...selectedEmployees, employeeId]);
    }
  };

  const handleManagerAssign = (employeeId: string, managerId: string) => {
    setManagerAssignments({
      ...managerAssignments,
      [employeeId]: managerId
    });
  };

  const saveAssignments = () => {
    const assignments: EmployeeAssignment[] = selectedEmployees
      .filter(empId => managerAssignments[empId])
      .map(empId => {
        const employee = employees.find(e => e.id === empId);
        const manager = employees.find(e => e.id === managerAssignments[empId]);
        return {
          employeeId: empId,
          employeeName: employee?.name || '',
          managerId: managerAssignments[empId],
          managerName: manager?.name || '',
          status: 'not_started' as const
        };
      });

    setFormData({
      ...formData,
      assignments
    });
  };

  const managers = employees.filter(emp => {
    // Filter employees who have direct reports (are managers)
    return employees.some(e => e.reporting_to === emp.id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {editingCycle ? 'Edit Review Cycle' : 'Create New Review Cycle'}
          </DialogTitle>
          <DialogDescription>
            Configure the yearly performance review cycle with all required settings
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="weightages">Weightages</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="name">Cycle Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 2024 Annual Performance Review"
                className="mt-1 bg-background/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="mt-1 bg-background/50"
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="mt-1 bg-background/50"
                />
              </div>
            </div>

            {formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate) && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                End date must be after start date
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="selfReview">Enable 7-Point Self-Review</Label>
                    <p className="text-sm text-muted-foreground">
                      Employees fill out the mandatory self-review form
                    </p>
                  </div>
                  <Switch
                    id="selfReview"
                    checked={formData.selfReviewEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, selfReviewEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="managerReview">Enable Manager Review Form</Label>
                    <p className="text-sm text-muted-foreground">
                      Managers provide ratings and feedback
                    </p>
                  </div>
                  <Switch
                    id="managerReview"
                    checked={formData.managerReviewEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, managerReviewEnabled: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {formData.selfReviewEnabled && (
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardHeader>
                  <CardTitle className="text-sm">7-Point Self-Review Fields (Mandatory)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Key accomplishments since last review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Contributions beyond job responsibilities</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Challenges faced (with examples)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Areas for development / improvement</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>New skills or knowledge acquired</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Certifications or trainings completed last year</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Trainings / certifications employee wants to pursue next</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>Tools & Technologies table (test type – tool – rating 1–3)</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {formData.managerReviewEnabled && (
              <Card className="bg-purple-500/5 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-sm">Manager Review Form Fields (Mandatory)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Rating for each employee goal (5→1)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Rating for each competency</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Rating for employee overall performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Manager feedback for each section</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Final Manager Rating (5→1)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Manager comments & recommendations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Evidence attachments or G-Drive links</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    <span>Option to Request Clarification from employee</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="weightages" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm">Competency Weightages</CardTitle>
                <CardDescription>
                  Set weightages for each competency (must total 100%)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {DEFAULT_COMPETENCIES.map((comp) => (
                  <div key={comp.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={comp.id}>{comp.name}</Label>
                      <span className="text-sm font-medium text-primary">
                        {formData.competencyWeightages[comp.id] || 0}%
                      </span>
                    </div>
                    <Input
                      id={comp.id}
                      type="number"
                      min="0"
                      max="100"
                      value={formData.competencyWeightages[comp.id] || 0}
                      onChange={(e) => handleWeightageChange(comp.id, parseInt(e.target.value) || 0)}
                      className="bg-background/50"
                    />
                  </div>
                ))}
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Total</span>
                    <span className={cn(
                      "font-bold text-lg",
                      totalWeightage === 100 ? "text-green-600" : "text-destructive"
                    )}>
                      {totalWeightage}%
                    </span>
                  </div>
                  {totalWeightage !== 100 && (
                    <p className="text-sm text-destructive mt-2">
                      Weightages must total exactly 100%
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm">Assign Employees to Managers</CardTitle>
                <CardDescription>
                  Select employees and assign their review managers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        selectedEmployees.includes(employee.id)
                          ? "bg-primary/10 border-primary/30"
                          : "bg-background/50 border-border/50"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(employee.id)}
                          onChange={() => handleEmployeeToggle(employee.id)}
                          className="rounded border-border"
                        />
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {employee.name?.split(' ').map(n => n[0]).join('') || 'E'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">{employee.position || employee.department}</p>
                        </div>
                      </div>
                      {selectedEmployees.includes(employee.id) && (
                        <Select
                          value={managerAssignments[employee.id] || ''}
                          onValueChange={(value) => handleManagerAssign(employee.id, value)}
                        >
                          <SelectTrigger className="w-[200px] bg-background/50">
                            <SelectValue placeholder="Select Manager" />
                          </SelectTrigger>
                          <SelectContent>
                            {managers.map((manager) => (
                              <SelectItem key={manager.id} value={manager.id}>
                                {manager.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={saveAssignments}
                  className="w-full bg-gradient-to-r from-primary to-primary/80"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Assignments
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              loading ||
              !formData.name ||
              !formData.startDate ||
              !formData.endDate ||
              (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate)) ||
              totalWeightage !== 100 ||
              formData.assignments.length === 0
            }
            className="bg-gradient-to-r from-primary to-primary/80"
          >
            <Save className="h-4 w-4 mr-2" />
            {editingCycle ? 'Update' : 'Create'} Cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Cycle Roster Modal Component
interface CycleRosterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: ReviewCycle;
  employees: any[];
}

function CycleRosterModal({ open, onOpenChange, cycle, employees }: CycleRosterModalProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock roster data - replace with API call
  const rosterData: EmployeeAssignment[] = cycle.assignments || [];

  const filteredRoster = rosterData.filter(assignment => {
    const matchesStatus = filterStatus === 'all' || assignment.status === filterStatus;
    const matchesSearch = assignment.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.managerName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: EmployeeAssignment['status']) => {
    const variants: Record<string, { label: string; className: string; icon: any }> = {
      not_started: { label: 'Not Started', className: 'bg-muted/50 text-muted-foreground', icon: Clock },
      self_submitted: { label: 'Self Submitted', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Send },
      manager_submitted: { label: 'Manager Submitted', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: UserCheck },
      hr_approved: { label: 'HR Approved', className: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle2 },
      hr_rejected: { label: 'HR Rejected', className: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle }
    };
    const config = variants[status] || variants.not_started;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("flex items-center gap-1", config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleSendReminder = (employeeId: string) => {
    // TODO: API call
    toast({
      title: "Reminder Sent",
      description: "Reminder notification sent to employee"
    });
  };

  const handleReassignManager = (assignment: EmployeeAssignment) => {
    // TODO: Open reassign modal
    toast({
      title: "Manager Reassignment",
      description: "Manager reassignment feature coming soon"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{cycle.name} - Roster</DialogTitle>
          <DialogDescription>
            Track review status for all employees in this cycle
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees or managers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px] bg-background/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="self_submitted">Self Submitted</SelectItem>
                <SelectItem value="manager_submitted">Manager Submitted</SelectItem>
                <SelectItem value="hr_approved">HR Approved</SelectItem>
                <SelectItem value="hr_rejected">HR Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Roster Table */}
          <div className="border border-border/50 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Employee</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Self Review</TableHead>
                  <TableHead>Manager Review</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoster.map((assignment) => (
                  <TableRow key={assignment.employeeId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {assignment.employeeName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{assignment.employeeName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-purple-500/10 text-purple-600 text-xs">
                            {assignment.managerName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{assignment.managerName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                    <TableCell>
                      {assignment.selfReviewSubmittedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {new Date(assignment.selfReviewSubmittedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {assignment.managerReviewSubmittedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {new Date(assignment.managerReviewSubmittedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendReminder(assignment.employeeId)}
                          className="h-8 w-8 p-0"
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReassignManager(assignment)}
                          className="h-8 w-8 p-0"
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Final Approval Modal Component
interface FinalApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: ReviewCycle;
}

function FinalApprovalModal({ open, onOpenChange, cycle }: FinalApprovalModalProps) {
  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState('');

  // Mock manager-submitted reviews - replace with API call
  const managerSubmittedReviews: EmployeeAssignment[] = [];

  const handleApprove = async (reviewId: string) => {
    // TODO: API call
    toast({
      title: "Approved",
      description: "Review approved and archived"
    });
  };

  const handleReject = async (reviewId: string) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      });
      return;
    }
    // TODO: API call
    toast({
      title: "Rejected",
      description: "Review rejected and sent back to manager"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Final Approval - {cycle.name}</DialogTitle>
          <DialogDescription>
            Review and approve manager-submitted performance reviews
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {managerSubmittedReviews.length === 0 ? (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No reviews pending approval</p>
              </CardContent>
            </Card>
          ) : (
            managerSubmittedReviews.map((review) => (
              <Card key={review.employeeId} className="bg-background/50 border-border/50">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{review.employeeName}</h4>
                      <p className="text-sm text-muted-foreground">Manager: {review.managerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(review.employeeId)}
                        className="hover:bg-green-500/10 hover:text-green-600"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(review.employeeId)}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Audit Log Modal Component
interface AuditLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: AuditLogEntry[];
}

function AuditLogModal({ open, onOpenChange, logs }: AuditLogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Audit Log</DialogTitle>
          <DialogDescription>
            Track all actions and changes in review cycles
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {logs.length === 0 ? (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-8 text-center">
                <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No audit logs available</p>
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => (
              <Card key={log.id} className="bg-background/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{log.action}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.cycleName}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{log.details}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.user} • {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

