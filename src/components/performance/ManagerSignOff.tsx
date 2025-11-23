import { useState, useEffect, useCallback } from "react";
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
  Bell,
  Loader2,
  Star,
  Search,
  Filter,
  SortAsc,
  SortDesc
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/use-employees";

interface ReviewSubmission {
  id: string;
  reviewId: string;
  employeeId: string;
  employeeName: string;
  employeePhoto?: string;
  cycleId: string;
  cycleYear: string;
  cycleName: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  managerId?: string;
  managerName?: string;
  managerPhoto?: string;
  escalationLevel?: number;
  comments?: string;
  rejectionReason?: string;
  managerRating?: number; // Overall manager rating (1-5)
}

export function ManagerSignOff() {
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<ReviewSubmission | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'rating' | 'daysPending'>('daysPending');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterRating, setFilterRating] = useState<string>('all');
  const { preserveScroll } = usePreserveScroll();
  const { toast } = useToast();
  const { employees } = useEmployees();

  // Fetch manager-submitted reviews from API
  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all manager reviews that are submitted (not drafts)
      const response = await authenticatedFetch(
        `${API_BASE_URL}/reviews?reviewType=manager&isDraft=false`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const reviews = await response.json();
      
      if (!Array.isArray(reviews)) {
        setSubmissions([]);
        return;
      }

      // Fetch all cycles to get cycle names
      const cyclesResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/cycles`,
        { method: 'GET' }
      );
      
      const cycles = cyclesResponse.ok ? await cyclesResponse.json() : [];

      // Map reviews to submissions
      const mappedSubmissions: ReviewSubmission[] = await Promise.all(
        reviews.map(async (review: any) => {
          // Find employee info
          const employee = employees.find(emp => emp.id === review.employeeId);
          const employeeName = employee?.name || 'Unknown Employee';
          
          // Find cycle info
          const cycle = cycles.find((c: any) => c.year === review.cycleYear);
          const cycleName = cycle?.name || `${review.cycleYear} Annual Performance Review`;
          
          // Determine status from metadata
          const metadataStatus = review.metadata?.status || '';
          let status: 'pending' | 'approved' | 'rejected' | 'escalated' = 'pending';
          
          if (metadataStatus === 'hr_approved' || metadataStatus === 'approved') {
            status = 'approved';
          } else if (metadataStatus === 'hr_rejected' || metadataStatus === 'rejected' || metadataStatus === 'changes_requested') {
            status = 'rejected';
          } else if (metadataStatus === 'escalated') {
            status = 'escalated';
          } else if (metadataStatus === 'manager_submitted' || review.submittedAt) {
            status = 'pending';
          }

          // Extract manager rating from review data
          const managerRating = review.ratings?.overall || 
                                review.metadata?.finalRating?.overallRating || 
                                review.metadata?.ratings?.overall || 
                                undefined;

          return {
            id: review.reviewId || review.id,
            reviewId: review.reviewId || review.id,
            employeeId: review.employeeId,
            employeeName,
            employeePhoto: employee?.photoUrl,
            cycleId: review.cycleYear,
            cycleYear: review.cycleYear,
            cycleName,
            submittedAt: review.submittedAt || review.updatedAt || review.createdAt,
            status,
            managerId: review.reviewerId,
            managerName: review.reviewerId, // Could fetch manager name if needed
            escalationLevel: review.metadata?.escalationLevel || (status === 'escalated' ? 1 : undefined),
            comments: review.metadata?.hrComments || review.comments,
            rejectionReason: review.metadata?.rejectionReason || review.metadata?.hrRejectionReason,
            managerRating
          };
        })
      );

      // Sort by submitted date (most recent first)
      mappedSubmissions.sort((a, b) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );

      setSubmissions(mappedSubmissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: "Error",
        description: "Failed to load manager submissions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [employees, toast]);

  useEffect(() => {
    if (employees.length > 0) {
      fetchSubmissions();
    }
  }, [employees, fetchSubmissions]);

  const getDaysPending = (submittedAt: string) => {
    return Math.floor((Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24));
  };

  // Filter and sort submissions
  const getFilteredAndSortedSubmissions = useCallback((status: 'pending' | 'approved' | 'rejected' | 'escalated') => {
    let filtered = submissions.filter(s => s.status === status);

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.employeeName.toLowerCase().includes(searchLower) ||
        s.cycleName.toLowerCase().includes(searchLower) ||
        s.employeeId.toLowerCase().includes(searchLower)
      );
    }

    // Apply rating filter
    if (filterRating !== 'all') {
      const ratingNum = parseInt(filterRating);
      filtered = filtered.filter(s => s.managerRating === ratingNum);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.employeeName.localeCompare(b.employeeName);
          break;
        case 'date':
          comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
          break;
        case 'rating':
          const ratingA = a.managerRating || 0;
          const ratingB = b.managerRating || 0;
          comparison = ratingA - ratingB;
          break;
        case 'daysPending':
          const daysA = getDaysPending(a.submittedAt);
          const daysB = getDaysPending(b.submittedAt);
          comparison = daysA - daysB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [submissions, searchTerm, sortBy, sortOrder, filterRating]);

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

  const handleApprove = async (submissionId: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;

    try {
      setActionLoading(true);
      
      // Fetch the current review to update it
      const reviewResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        { method: 'GET' }
      );

      if (!reviewResponse.ok) {
        throw new Error('Failed to fetch review');
      }

      const review = await reviewResponse.json();

      // Update review with approval status
      const updatedReview = {
        ...review,
        metadata: {
          ...review.metadata,
          status: 'hr_approved',
          hrComments: actionComment,
          hrApprovedAt: new Date().toISOString()
        }
      };

      const updateResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedReview)
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to approve review');
      }

      toast({
        title: "Success",
        description: "Review approved successfully"
      });

      // Refresh submissions
      await fetchSubmissions();
    setShowActionModal(false);
    setActionComment('');
    } catch (error) {
      console.error('Error approving review:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve review",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (submissionId: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;

    try {
      setActionLoading(true);
      
      // Fetch the current review to update it
      const reviewResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        { method: 'GET' }
      );

      if (!reviewResponse.ok) {
        throw new Error('Failed to fetch review');
      }

      const review = await reviewResponse.json();

      // Update review with rejection status
      const updatedReview = {
        ...review,
        metadata: {
          ...review.metadata,
          status: 'changes_requested',
          hrRejectionReason: actionComment,
          hrRejectedAt: new Date().toISOString()
        }
      };

      const updateResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedReview)
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to reject review');
      }

      toast({
        title: "Success",
        description: "Review rejected. Changes requested."
      });

      // Refresh submissions
      await fetchSubmissions();
    setShowActionModal(false);
    setActionComment('');
    } catch (error) {
      console.error('Error rejecting review:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reject review",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (submissionId: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;
    
    try {
      setActionLoading(true);
      
      // Fetch the current review to update it
      const reviewResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        { method: 'GET' }
      );

      if (!reviewResponse.ok) {
        throw new Error('Failed to fetch review');
      }

      const review = await reviewResponse.json();

      // Update review with escalation status
      const escalationLevel = (submission.escalationLevel || 0) + 1;
      const updatedReview = {
        ...review,
        metadata: {
          ...review.metadata,
          status: 'escalated',
          escalationLevel,
          escalatedAt: new Date().toISOString()
        }
      };

      const updateResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${submission.reviewId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedReview)
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to escalate review');
      }

      toast({
        title: "Success",
        description: "Review escalated successfully"
      });

      // Refresh submissions
      await fetchSubmissions();
    } catch (error) {
      console.error('Error escalating review:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to escalate review",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
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
      <Tabs defaultValue="pending" className="space-y-4" onValueChange={() => {
        preserveScroll();
      }}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by employee name, cycle, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Select value={filterRating} onValueChange={setFilterRating}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              <SelectItem value="5">5 Stars</SelectItem>
              <SelectItem value="4">4 Stars</SelectItem>
              <SelectItem value="3">3 Stars</SelectItem>
              <SelectItem value="2">2 Stars</SelectItem>
              <SelectItem value="1">1 Star</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
            <SelectTrigger className="w-full sm:w-[180px] h-10">
              {sortOrder === 'asc' ? (
                <SortAsc className="h-4 w-4 mr-2" />
              ) : (
                <SortDesc className="h-4 w-4 mr-2" />
              )}
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daysPending">Days Pending</SelectItem>
              <SelectItem value="name">Employee Name</SelectItem>
              <SelectItem value="date">Submission Date</SelectItem>
              <SelectItem value="rating">Manager Rating</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="h-10 px-3"
          >
            {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          </Button>
        </div>

        <TabsContent value="pending" className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : getFilteredAndSortedSubmissions('pending').length === 0 ? (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm || filterRating !== 'all' ? 'No reviews match your filters' : 'No pending reviews'}
                </p>
              </CardContent>
            </Card>
          ) : (
            getFilteredAndSortedSubmissions('pending').map((submission) => {
            const daysPending = getDaysPending(submission.submittedAt);
            const isOverdue = daysPending > 7;
            
            return (
              <Card
                key={submission.id}
                className={cn(
                  "bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-sm border-border/40 hover:border-primary/50 hover:shadow-md transition-all duration-200",
                  isOverdue && "border-destructive/30 bg-destructive/5"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={submission.employeePhoto} />
                        <AvatarFallback className="text-xs">
                          {submission.employeeName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{submission.employeeName}</h3>
                          {getStatusBadge(submission.status)}
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                              {daysPending}d
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="truncate">{submission.cycleName}</span>
                          <span>•</span>
                          <span>{new Date(submission.submittedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{daysPending} days ago</span>
                        </div>
                        {submission.managerRating && (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    "h-3 w-3",
                                    star <= submission.managerRating!
                                      ? "fill-yellow-400 text-yellow-400"
                                      : "text-muted-foreground/30"
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {submission.managerRating}/5
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setActionType('approve');
                          setShowActionModal(true);
                        }}
                        disabled={actionLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
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
                        disabled={actionLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Request Changes
                      </Button>
                      {isOverdue && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEscalate(submission.id)}
                          disabled={actionLoading}
                          className="h-8 px-3 text-xs text-orange-600 border-orange-600 hover:bg-orange-50"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Escalate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }))}
        </TabsContent>

        <TabsContent value="approved" className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : getFilteredAndSortedSubmissions('approved').length === 0 ? (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm || filterRating !== 'all' ? 'No reviews match your filters' : 'No approved reviews'}
                </p>
              </CardContent>
            </Card>
          ) : (
            getFilteredAndSortedSubmissions('approved').map((submission) => (
            <Card
              key={submission.id}
              className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-sm border-border/40 hover:border-primary/50 hover:shadow-md transition-all duration-200"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={submission.employeePhoto} />
                    <AvatarFallback className="text-xs">
                      {submission.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{submission.employeeName}</h3>
                      {getStatusBadge(submission.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate">{submission.cycleName}</span>
                      {submission.managerRating && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  "h-3 w-3",
                                  star <= submission.managerRating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                            <span className="ml-0.5 font-semibold text-foreground">
                              {submission.managerRating}/5
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {submission.comments && (
                      <p className="text-xs mt-1.5 text-foreground line-clamp-2">{submission.comments}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )))}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : getFilteredAndSortedSubmissions('rejected').length === 0 ? (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
              <CardContent className="p-12 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm || filterRating !== 'all' ? 'No reviews match your filters' : 'No rejected reviews'}
                </p>
              </CardContent>
            </Card>
          ) : (
            getFilteredAndSortedSubmissions('rejected').map((submission) => (
            <Card
              key={submission.id}
              className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-sm border-border/40 hover:border-destructive/50 hover:shadow-md transition-all duration-200"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={submission.employeePhoto} />
                    <AvatarFallback className="text-xs">
                      {submission.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{submission.employeeName}</h3>
                      {getStatusBadge(submission.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate">{submission.cycleName}</span>
                      {submission.managerRating && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  "h-3 w-3",
                                  star <= submission.managerRating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                            <span className="ml-0.5 font-semibold text-foreground">
                              {submission.managerRating}/5
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {submission.rejectionReason && (
                      <p className="text-xs text-destructive mt-1.5 line-clamp-2">{submission.rejectionReason}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )))}
        </TabsContent>
      </Tabs>

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Review' : 'Request Changes'}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <div>
              {selectedSubmission?.employeeName} - {selectedSubmission?.cycleName}
              </div>
              {selectedSubmission?.managerRating && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-sm font-medium text-muted-foreground">Manager Rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "h-4 w-4",
                          star <= selectedSubmission.managerRating!
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        )}
                      />
                    ))}
                    <span className="text-sm font-semibold text-foreground ml-1">
                      {selectedSubmission.managerRating}/5
                    </span>
                  </div>
                </div>
              )}
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
              disabled={actionLoading}
              className={cn(
                "bg-gradient-to-r from-primary to-primary/80",
                actionType === 'reject' && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : actionType === 'approve' ? (
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

