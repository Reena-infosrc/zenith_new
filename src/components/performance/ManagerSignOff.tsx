import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Send,
  FileText,
  ChevronRight,
  ArrowUp,
  Bell
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ReviewSubmission {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto?: string;
  cycleId: string;
  cycleName: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  managerId?: string;
  managerName?: string;
  managerPhoto?: string;
  escalationLevel?: number;
  comments?: string;
  rejectionReason?: string;
}

export function ManagerSignOff() {
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<ReviewSubmission | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [actionComment, setActionComment] = useState('');

  // Mock data
  useEffect(() => {
    setSubmissions([
      {
        id: '1',
        employeeId: 'emp1',
        employeeName: 'John Doe',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        submittedAt: '2024-03-20T10:30:00',
        status: 'pending',
        managerId: 'mgr1',
        managerName: 'Jane Smith'
      },
      {
        id: '2',
        employeeId: 'emp2',
        employeeName: 'Mike Johnson',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        submittedAt: '2024-03-18T14:20:00',
        status: 'pending',
        managerId: 'mgr1',
        managerName: 'Jane Smith'
      },
      {
        id: '3',
        employeeId: 'emp3',
        employeeName: 'Sarah Wilson',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        submittedAt: '2024-03-15T09:15:00',
        status: 'approved',
        managerId: 'mgr1',
        managerName: 'Jane Smith',
        comments: 'Excellent work this quarter!'
      },
      {
        id: '4',
        employeeId: 'emp4',
        employeeName: 'Tom Brown',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        submittedAt: '2024-03-10T16:45:00',
        status: 'escalated',
        escalationLevel: 2,
        managerId: 'mgr2',
        managerName: 'Director'
      }
    ]);
  }, []);

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const overdueCount = submissions.filter(s => {
    if (s.status !== 'pending') return false;
    const daysSince = Math.floor((Date.now() - new Date(s.submittedAt).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 7;
  }).length;

  const getStatusBadge = (status: string, escalationLevel?: number) => {
    const configs: Record<string, { label: string; variant: any; icon: any }> = {
      pending: { label: 'Pending', variant: 'secondary', icon: Clock },
      approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
      rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
      escalated: { label: `Escalated (Level ${escalationLevel})`, variant: 'outline', icon: ArrowUp }
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleApprove = (submissionId: string) => {
    // TODO: API call
    setSubmissions(submissions.map(s => 
      s.id === submissionId 
        ? { ...s, status: 'approved', comments: actionComment }
        : s
    ));
    setShowActionModal(false);
    setActionComment('');
  };

  const handleReject = (submissionId: string) => {
    // TODO: API call
    setSubmissions(submissions.map(s => 
      s.id === submissionId 
        ? { ...s, status: 'rejected', rejectionReason: actionComment }
        : s
    ));
    setShowActionModal(false);
    setActionComment('');
  };

  const handleEscalate = (submissionId: string) => {
    // TODO: API call - escalate to manager's manager or HR
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;
    
    setSubmissions(submissions.map(s => 
      s.id === submissionId 
        ? { ...s, status: 'escalated', escalationLevel: (submission.escalationLevel || 1) + 1 }
        : s
    ));
  };

  const getDaysPending = (submittedAt: string) => {
    return Math.floor((Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Manager Sign-Off
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Review and approve employee performance submissions
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-500">
                  {submissions.filter(s => s.status === 'approved').length}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submissions */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="escalated">Escalated</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {submissions.filter(s => s.status === 'pending').map((submission) => {
            const daysPending = getDaysPending(submission.submittedAt);
            const isOverdue = daysPending > 7;
            
            return (
              <Card
                key={submission.id}
                className={cn(
                  "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all",
                  isOverdue && "border-destructive/50"
                )}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={submission.employeePhoto} />
                        <AvatarFallback>
                          {submission.employeeName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{submission.employeeName}</h3>
                          {getStatusBadge(submission.status)}
                          {isOverdue && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {daysPending} days overdue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{submission.cycleName}</p>
                        <p className="text-xs text-muted-foreground">
                          Submitted: {new Date(submission.submittedAt).toLocaleDateString()} ({daysPending} days ago)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setActionType('approve');
                          setShowActionModal(true);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setActionType('reject');
                          setShowActionModal(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Request Changes
                      </Button>
                      {isOverdue && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEscalate(submission.id)}
                          className="text-orange-600 border-orange-600"
                        >
                          <ArrowUp className="h-4 w-4 mr-2" />
                          Escalate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {submissions.filter(s => s.status === 'approved').map((submission) => (
            <Card
              key={submission.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={submission.employeePhoto} />
                    <AvatarFallback>
                      {submission.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{submission.employeeName}</h3>
                      {getStatusBadge(submission.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{submission.cycleName}</p>
                    {submission.comments && (
                      <p className="text-sm mt-2 text-foreground">{submission.comments}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {submissions.filter(s => s.status === 'rejected').map((submission) => (
            <Card
              key={submission.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={submission.employeePhoto} />
                    <AvatarFallback>
                      {submission.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{submission.employeeName}</h3>
                      {getStatusBadge(submission.status)}
                    </div>
                    {submission.rejectionReason && (
                      <p className="text-sm text-destructive mt-2">{submission.rejectionReason}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="escalated" className="space-y-4">
          {submissions.filter(s => s.status === 'escalated').map((submission) => (
            <Card
              key={submission.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={submission.employeePhoto} />
                    <AvatarFallback>
                      {submission.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{submission.employeeName}</h3>
                      {getStatusBadge(submission.status, submission.escalationLevel)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Escalated to: {submission.managerName || 'HR'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Review' : 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              {selectedSubmission?.employeeName} - {selectedSubmission?.cycleName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Comments</Label>
              <Textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={actionType === 'approve' ? 'Add approval comments (optional)...' : 'Explain what needs to be changed...'}
                className="mt-1 min-h-[100px] bg-background/50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (actionType === 'approve' && selectedSubmission) {
                  handleApprove(selectedSubmission.id);
                } else if (actionType === 'reject' && selectedSubmission) {
                  handleReject(selectedSubmission.id);
                }
              }}
              className={cn(
                "bg-gradient-to-r from-primary to-primary/80",
                actionType === 'reject' && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {actionType === 'approve' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Request Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

