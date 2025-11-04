import { useState, useEffect } from "react";
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
  Users
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface PerformanceCycle {
  id: string;
  name: string;
  type: 'quarterly' | 'bi-annual' | 'annual';
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  createdAt: string;
  createdBy: string;
  employeeCount?: number;
  completionRate?: number;
}

interface CycleFormData {
  name: string;
  type: 'quarterly' | 'bi-annual' | 'annual';
  startDate: string;
  endDate: string;
}

export function PerformanceCycles() {
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCycle, setEditingCycle] = useState<PerformanceCycle | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<CycleFormData>({
    name: '',
    type: 'quarterly',
    startDate: '',
    endDate: ''
  });

  // Mock data - replace with API calls
  useEffect(() => {
    setCycles([
      {
        id: '1',
        name: 'Q1 2024 Performance Review',
        type: 'quarterly',
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        status: 'active',
        createdAt: '2023-12-15',
        createdBy: 'Admin User',
        employeeCount: 150,
        completionRate: 72
      },
      {
        id: '2',
        name: 'Q2 2024 Performance Review',
        type: 'quarterly',
        startDate: '2024-04-01',
        endDate: '2024-06-30',
        status: 'draft',
        createdAt: '2024-03-15',
        createdBy: 'Admin User',
        employeeCount: 150,
        completionRate: 0
      },
      {
        id: '3',
        name: 'H1 2023 Performance Review',
        type: 'bi-annual',
        startDate: '2023-01-01',
        endDate: '2023-06-30',
        status: 'archived',
        createdAt: '2022-12-15',
        createdBy: 'Admin User',
        employeeCount: 145,
        completionRate: 95
      }
    ]);
  }, []);

  const filteredCycles = cycles.filter(cycle => {
    const matchesStatus = filterStatus === 'all' || cycle.status === filterStatus;
    const matchesSearch = cycle.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: PerformanceCycle['status']) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      draft: { variant: 'secondary', icon: Edit, label: 'Draft' },
      active: { variant: 'default', icon: Play, label: 'Active' },
      closed: { variant: 'outline', icon: CheckCircle2, label: 'Closed' },
      archived: { variant: 'secondary', icon: Archive, label: 'Archived' }
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      quarterly: 'Quarterly',
      'bi-annual': 'Bi-Annual',
      annual: 'Annual'
    };
    return labels[type] || type;
  };

  const handleCreateCycle = () => {
    // TODO: API call
    const newCycle: PerformanceCycle = {
      id: Date.now().toString(),
      ...formData,
      status: 'draft',
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: 'Current User'
    };
    setCycles([...cycles, newCycle]);
    setShowCreateModal(false);
    setFormData({ name: '', type: 'quarterly', startDate: '', endDate: '' });
  };

  const handleUpdateCycle = () => {
    if (!editingCycle) return;
    // TODO: API call
    setCycles(cycles.map(c => c.id === editingCycle.id ? { ...c, ...formData } : c));
    setEditingCycle(null);
    setFormData({ name: '', type: 'quarterly', startDate: '', endDate: '' });
  };

  const handleArchiveCycle = (cycleId: string) => {
    // TODO: API call
    setCycles(cycles.map(c => c.id === cycleId ? { ...c, status: 'archived' } : c));
  };

  const handleActivateCycle = (cycleId: string) => {
    // TODO: API call - deactivate other active cycles first
    setCycles(cycles.map(c => {
      if (c.id === cycleId) return { ...c, status: 'active' };
      if (c.status === 'active') return { ...c, status: 'closed' };
      return c;
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Performance Cycles
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage performance review cycles and timelines
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingCycle(null);
            setFormData({ name: '', type: 'quarterly', startDate: '', endDate: '' });
            setShowCreateModal(true);
          }}
          className="bg-gradient-to-r from-primary to-primary/80"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Cycle
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
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
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Cycles</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredCycles.map((cycle) => (
            <Card
              key={cycle.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all duration-300"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{cycle.name}</h3>
                      {getStatusBadge(cycle.status)}
                      <Badge variant="outline">{getTypeLabel(cycle.type)}</Badge>
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
                    {cycle.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleActivateCycle(cycle.id)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Activate
                      </Button>
                    )}
                    {cycle.status !== 'archived' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCycle(cycle);
                          setFormData({
                            name: cycle.name,
                            type: cycle.type,
                            startDate: cycle.startDate,
                            endDate: cycle.endDate
                          });
                          setShowCreateModal(true);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                    {cycle.status === 'closed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveCycle(cycle.id)}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCycle ? 'Edit Performance Cycle' : 'Create New Performance Cycle'}
            </DialogTitle>
            <DialogDescription>
              Define the timeline and parameters for a performance review cycle
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Cycle Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Q1 2024 Performance Review"
                className="mt-1 bg-background/50"
              />
            </div>

            <div>
              <Label htmlFor="type">Cycle Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className="mt-1 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="bi-annual">Bi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="mt-1 bg-background/50"
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
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
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                End date must be after start date
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingCycle ? handleUpdateCycle : handleCreateCycle}
              disabled={!formData.name || !formData.startDate || !formData.endDate}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              <Save className="h-4 w-4 mr-2" />
              {editingCycle ? 'Update' : 'Create'} Cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

