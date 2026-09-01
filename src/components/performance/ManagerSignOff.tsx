import { useState, useEffect, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewDetail, setReviewDetail] = useState<{ manager?: any; self?: any } | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewDetailLoading, setViewDetailLoading] = useState(false);
  const [viewDetailError, setViewDetailError] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<{ manager?: any; self?: any } | null>(null);
  const [viewSubmission, setViewSubmission] = useState<ReviewSubmission | null>(null);
  // Bulk approve (pending tab only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkComment, setBulkComment] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const { preserveScroll } = usePreserveScroll();
  const { toast } = useToast();
  const { employees } = useEmployees();
  // Read employees from a ref inside fetchSubmissions so the directory streaming
  // in incrementally doesn't re-trigger a full manager-review refetch per batch.
  const employeesRef = useRef(employees);
  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  // Fetch manager-submitted reviews from API
  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all manager reviews (both draft and submitted) to include rejected reviews
      // We'll filter on the frontend to only show submitted/rejected/approved reviews
      // Include inactive reviews to catch rejected reviews that might be marked inactive
      const [submittedResponse, draftResponse] = await Promise.all([
        authenticatedFetch(
          `${API_BASE_URL}/reviews?reviewType=manager&isDraft=false&includeInactive=true&activeEmployeesOnly=true`,
          { method: 'GET' }
        ),
        authenticatedFetch(
          `${API_BASE_URL}/reviews?reviewType=manager&isDraft=true&includeInactive=true&activeEmployeesOnly=true`,
          { method: 'GET' }
        )
      ]);

      if (!submittedResponse.ok || !draftResponse.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const submittedReviews = await submittedResponse.json();
      const draftReviews = await draftResponse.json();
      
      // Combine both arrays
      const allReviews = [
        ...(Array.isArray(submittedReviews) ? submittedReviews : []),
        ...(Array.isArray(draftReviews) ? draftReviews : [])
      ];
      
      // Filter to only include reviews that:
      // 1. Are active (unless they have a processed status), OR
      // 2. Have been submitted (have submittedAt), OR
      // 3. Have a status indicating they've been processed (changes_requested, hr_approved, etc.)
      const filteredReviews = allReviews.filter((review: any) => {
        const isActive = review.isActive !== false; // Default to true if not specified
        const hasSubmittedAt = !!review.submittedAt;
        const metadataStatus = getReviewStatus(review);
        const isProcessed = ['changes_requested', 'hr_approved', 'hr_rejected', 'approved', 'rejected', 'escalated', 'manager_submitted'].includes(metadataStatus);
        
        // Include if: active, OR has submittedAt, OR has processed status (even if inactive)
        return (isActive && (hasSubmittedAt || isProcessed)) || (!isActive && isProcessed);
      });
      
      // Deduplicate by reviewId - if same review exists in both tables, prefer:
      // 1. The one with a processed status (changes_requested, hr_approved, etc.) over manager_submitted
      // 2. The one with the most recent updatedAt
      const reviewMap = new Map<string, any>();
      for (const review of filteredReviews) {
        const reviewId = review.reviewId || review.id;
        if (!reviewId) continue;
        
        const existing = reviewMap.get(reviewId);
        if (!existing) {
          reviewMap.set(reviewId, review);
        } else {
          // Determine which version to keep
          const existingStatus = getReviewStatus(existing);
          const newStatus = getReviewStatus(review);
          
          // Priority: processed statuses > manager_submitted
          const processedStatuses = ['changes_requested', 'hr_approved', 'hr_rejected', 'approved', 'rejected', 'escalated'];
          const existingIsProcessed = processedStatuses.includes(existingStatus);
          const newIsProcessed = processedStatuses.includes(newStatus);
          
          if (newIsProcessed && !existingIsProcessed) {
            // New version has processed status, existing doesn't - use new
            reviewMap.set(reviewId, review);
          } else if (existingIsProcessed && !newIsProcessed) {
            // Existing has processed status, new doesn't - keep existing
            // Do nothing
          } else {
            // Both have same priority - use the one with more recent updatedAt
            const existingUpdated = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            const newUpdated = new Date(review.updatedAt || review.createdAt || 0).getTime();
            if (newUpdated > existingUpdated) {
              reviewMap.set(reviewId, review);
            }
          }
        }
      }
      
      const reviews = Array.from(reviewMap.values());
      
      // Debug: Log reviews with changes_requested status
      const rejectedReviews = reviews.filter((r: any) => getReviewStatus(r) === 'changes_requested');
      if (rejectedReviews.length > 0) {
        console.log('Found rejected reviews:', rejectedReviews.map((r: any) => ({
          reviewId: r.reviewId,
          status: getReviewStatus(r),
          isDraft: r.isDraft,
          updatedAt: r.updatedAt
        })));
      }
      
      if (reviews.length === 0) {
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
          const employee = employeesRef.current.find(emp => emp.id === review.employeeId);
          const employeeName = employee?.name || 'Unknown Employee';
          
          // Find cycle info
          const cycle = cycles.find((c: any) => c.year === review.cycleYear);
          const cycleName = cycle?.name || `${review.cycleYear} Annual Performance Review`;
          
          // Determine status from metadata
          // Priority: approved > rejected > escalated > pending
          const metadataStatus = getReviewStatus(review);
          let status: 'pending' | 'approved' | 'rejected' | 'escalated' = 'pending';
          
          if (metadataStatus === 'hr_approved' || metadataStatus === 'approved') {
            status = 'approved';
          } else if (metadataStatus === 'hr_rejected' || metadataStatus === 'rejected' || metadataStatus === 'changes_requested') {
            // If status is changes_requested, it's rejected (needs changes)
            status = 'rejected';
          } else if (metadataStatus === 'escalated') {
            status = 'escalated';
          } else if (metadataStatus === 'manager_submitted' || review.submittedAt) {
            // Only set to pending if it's been submitted and doesn't have another status
            status = 'pending';
          }

          // Extract manager rating from review data
          const managerRating = review.ratings?.overall ||
                                review.metadata?.finalRating?.overallRating ||
                                review.metadata?.ratings?.overall ||
                                undefined;

          // Reviewer of record: prefer the snapshot frozen at submission, then
          // resolve the id/email against the directory, then fall back to the id.
          const reviewerSnap = review.metadata?.reviewerSnapshot;
          const reviewerRef = reviewerSnap?.reviewerId || review.reviewerId || '';
          const reviewerFromDir = reviewerRef
            ? employeesRef.current.find(
                e =>
                  (e.email && e.email.toLowerCase() === String(reviewerRef).toLowerCase()) ||
                  e.id === reviewerRef,
              )
            : undefined;
          const managerName =
            reviewerSnap?.reviewerName || reviewerFromDir?.name || reviewerRef || 'Unknown';

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
            managerId: reviewerRef,
            managerName,
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
  }, [toast]);

  const employeesLoaded = employees.length > 0;
  useEffect(() => {
    if (employeesLoaded) {
      fetchSubmissions();
    }
  }, [employeesLoaded, fetchSubmissions]);

  // As the directory streams in, backfill names for rows that resolved to
  // "Unknown Employee" on the first pass — without refetching the reviews.
  useEffect(() => {
    setSubmissions((prev) => {
      if (!prev.some((s) => s.employeeName === 'Unknown Employee')) return prev;
      let changed = false;
      const next = prev.map((s) => {
        if (s.employeeName !== 'Unknown Employee') return s;
        const emp = employees.find((e) => e.id === s.employeeId);
        if (!emp) return s;
        changed = true;
        return { ...s, employeeName: emp.name, employeePhoto: emp.photoUrl };
      });
      return changed ? next : prev;
    });
  }, [employees]);

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
  const approvedCount = submissions.filter(s => s.status === 'approved').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

  const pendingVisible = getFilteredAndSortedSubmissions('pending');
  const allVisibleSelected = pendingVisible.length > 0 && pendingVisible.every(s => selectedIds.has(s.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (pendingVisible.every(s => next.has(s.id))) {
        pendingVisible.forEach(s => next.delete(s.id));
      } else {
        pendingVisible.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBulkApprove = async () => {
    const targets = pendingVisible
      .filter(s => selectedIds.has(s.id))
      .map(s => ({ id: s.id, reviewId: s.reviewId, name: s.employeeName }));
    if (targets.length === 0) return;

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length });

    const CONCURRENCY = 4;
    const failures: { name: string; reason: string }[] = [];
    let cursor = 0;
    let done = 0;

    const worker = async () => {
      while (cursor < targets.length) {
        const item = targets[cursor];
        cursor += 1;
        try {
          await approveOneReview(item.reviewId, bulkComment);
        } catch (e) {
          failures.push({ name: item.name, reason: e instanceof Error ? e.message : 'Unknown error' });
        } finally {
          done += 1;
          setBulkProgress({ done, total: targets.length });
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker())
      );
    } finally {
      await fetchSubmissions();
      setBulkRunning(false);
      setBulkProgress(null);
      setShowBulkModal(false);
      setBulkComment('');
      setSelectedIds(new Set());
    }

    const approved = targets.length - failures.length;
    if (failures.length === 0) {
      toast({
        title: "Bulk approve complete",
        description: `${approved} review${approved === 1 ? '' : 's'} approved.`
      });
    } else {
      console.warn('Bulk approve failures:', failures);
      toast({
        title: `Approved ${approved} of ${targets.length}`,
        description: `${failures.length} failed: ${failures.slice(0, 3).map(f => f.name).join(', ')}${failures.length > 3 ? '…' : ''}`,
        variant: "destructive"
      });
    }
  };

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

  const resetActionState = () => {
    setReviewDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setActionComment('');
    setActionType(null);
    setSelectedSubmission(null);
  };

  const resetViewState = () => {
    setViewDetail(null);
    setViewDetailError(null);
    setViewDetailLoading(false);
    setViewSubmission(null);
  };

  const retrieveReviewDetails = useCallback(async (submission: ReviewSubmission) => {
    const managerResponse = await authenticatedFetch(
      `${API_BASE_URL}/reviews/${submission.reviewId}`,
      { method: 'GET' }
    );

    if (!managerResponse.ok) {
      throw new Error('Failed to fetch manager review');
    }

    const managerReview = await managerResponse.json();
    let selfReview: any = null;

    if (submission.employeeId && managerReview?.cycleYear) {
      const selfResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews?employeeId=${submission.employeeId}&cycleYear=${managerReview.cycleYear}&reviewType=self`,
        { method: 'GET' }
      );

      if (selfResponse.ok) {
        const selfReviews = await selfResponse.json();
        if (Array.isArray(selfReviews) && selfReviews.length > 0) {
          const submitted = selfReviews.find((rev: any) => !rev.isDraft && rev.submittedAt);
          selfReview = submitted || selfReviews[0];
        }
      }
    }

    return { manager: managerReview, self: selfReview };
  }, []);

  const fetchReviewDetails = useCallback(async (submission: ReviewSubmission) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      setReviewDetail(null);

      const detail = await retrieveReviewDetails(submission);
      setReviewDetail(detail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Failed to load review details');
    } finally {
      setDetailLoading(false);
    }
  }, [retrieveReviewDetails]);

  const fetchViewDetails = useCallback(async (submission: ReviewSubmission) => {
    try {
      setViewDetailLoading(true);
      setViewDetailError(null);
      setViewDetail(null);
      const detail = await retrieveReviewDetails(submission);
      setViewDetail(detail);
    } catch (error) {
      setViewDetailError(error instanceof Error ? error.message : 'Failed to load review details');
    } finally {
      setViewDetailLoading(false);
    }
  }, [retrieveReviewDetails]);

  const handleOpenActionModal = useCallback((submission: ReviewSubmission, type: 'approve' | 'reject') => {
    setSelectedSubmission(submission);
    setActionType(type);
    setActionComment('');
    setShowActionModal(true);
    fetchReviewDetails(submission);
  }, [fetchReviewDetails]);

  const handleViewDetails = useCallback((submission: ReviewSubmission) => {
    resetViewState();
    setViewSubmission(submission);
    setShowViewModal(true);
    fetchViewDetails(submission);
  }, [fetchViewDetails]);

  // Approve a single review by id. Fetches the current review, then PUTs only
  // the fields that change (plus submittedAt so the backend doesn't read this as
  // an un-submit). Throws with a useful message on failure. Shared by the
  // single-row and bulk approve flows.
  const approveOneReview = useCallback(async (reviewId: string, comment: string) => {
    const reviewResponse = await authenticatedFetch(
      `${API_BASE_URL}/reviews/${reviewId}`,
      { method: 'GET' }
    );
    if (!reviewResponse.ok) {
      throw new Error(`Couldn't load review (${reviewResponse.status})`);
    }
    const review = await reviewResponse.json();

    const updatedReview = {
      submittedAt: review.submittedAt,
      status: 'hr_approved',
      metadata: {
        ...review.metadata,
        status: 'hr_approved',
        hrComments: comment,
        hrApprovedAt: new Date().toISOString()
      }
    };

    const updateResponse = await authenticatedFetch(
      `${API_BASE_URL}/reviews/${reviewId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedReview)
      }
    );
    if (!updateResponse.ok) {
      const detail = await updateResponse.text().catch(() => '');
      throw new Error(detail || `Approve failed (${updateResponse.status})`);
    }
  }, []);

  const handleApprove = async (submissionId: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;

    try {
      setActionLoading(true);
      await approveOneReview(submission.reviewId, actionComment);

      toast({
        title: "Success",
        description: "Review approved successfully"
      });

      // Refresh submissions
      await fetchSubmissions();
      setShowActionModal(false);
      resetActionState();
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
    if (!actionComment.trim()) {
      toast({
        title: "Comments required",
        description: "Please describe what needs to change before requesting updates.",
        variant: "destructive"
      });
      return;
    }

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

      // Update review with rejection status (delta only — see handleApprove).
      const updatedReview = {
        submittedAt: review.submittedAt,
        status: 'changes_requested',
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
      resetActionState();
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

      // Update review with escalation status (delta only — see handleApprove).
      const escalationLevel = (submission.escalationLevel || 0) + 1;
      const updatedReview = {
        submittedAt: review.submittedAt,
        status: 'escalated',
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
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-rose-600">{rejectedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-rose-500/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submissions */}
      <Tabs defaultValue="pending" className="space-y-4" onValueChange={() => {
        preserveScroll();
        clearSelection();
      }}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedCount})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({rejectedCount})
          </TabsTrigger>
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
          {!loading && pendingVisible.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label="Select all visible pending reviews"
                />
                <span className="text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </label>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={bulkRunning}
                    className="h-8 px-2 text-xs"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { setBulkComment(''); setShowBulkModal(true); }}
                    disabled={actionLoading || bulkRunning}
                    className="h-8 px-3 text-xs bg-gradient-to-r from-primary to-primary/80"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Approve selected ({selectedIds.size})
                  </Button>
                </div>
              )}
            </div>
          )}
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
                      <Checkbox
                        checked={selectedIds.has(submission.id)}
                        onCheckedChange={() => toggleSelect(submission.id)}
                        disabled={bulkRunning}
                        aria-label={`Select ${submission.employeeName}`}
                        className="shrink-0"
                      />
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
                        onClick={() => handleOpenActionModal(submission, 'approve')}
                        disabled={actionLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenActionModal(submission, 'reject')}
                        disabled={actionLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Request Changes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(submission)}
                        className="h-8 px-3 text-xs"
                      >
                        View
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
                  <div className="flex items-center self-stretch">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetails(submission)}
                      className="h-8 px-3 text-xs"
                    >
                      View
                    </Button>
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
                  <div className="flex items-center self-stretch">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetails(submission)}
                      className="h-8 px-3 text-xs"
                    >
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )))}
        </TabsContent>
      </Tabs>

      {/* Bulk Approve Modal */}
      <Dialog
        open={showBulkModal}
        onOpenChange={(open) => {
          if (bulkRunning) return;
          setShowBulkModal(open);
          if (!open) setBulkComment('');
        }}
      >
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Approve {selectedIds.size} review{selectedIds.size === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              Every selected review is marked HR-approved. The comment below is applied to all of them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label>Comment (optional)</Label>
            <Textarea
              value={bulkComment}
              onChange={(e) => setBulkComment(e.target.value)}
              placeholder="Applied to all selected reviews..."
              className="min-h-[90px] bg-background/50"
              disabled={bulkRunning}
            />
          </div>

          {bulkProgress && (
            <div className="space-y-1">
              <Progress value={(bulkProgress.done / bulkProgress.total) * 100} />
              <p className="text-xs text-muted-foreground text-center">
                {bulkProgress.done} / {bulkProgress.total} processed
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModal(false)} disabled={bulkRunning}>
              Cancel
            </Button>
            <Button
              onClick={runBulkApprove}
              disabled={bulkRunning || selectedIds.size === 0}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              {bulkRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve {selectedIds.size}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Modal */}
      <Dialog
        open={showActionModal}
        onOpenChange={(open) => {
          setShowActionModal(open);
          if (!open) {
            resetActionState();
          }
        }}
      >
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-h-[90vh] w-[95vw] max-w-5xl sm:max-w-5xl lg:max-w-6xl overflow-hidden flex flex-col">
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

          {actionType && (
            <ReviewDetailSection
              loading={detailLoading}
              error={detailError}
              detail={reviewDetail}
              submission={selectedSubmission}
            />
          )}

          <div className="space-y-4 py-4 border-t border-border/30 mt-4">
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

      <Dialog
        open={showViewModal}
        onOpenChange={(open) => {
          setShowViewModal(open);
          if (!open) {
            resetViewState();
          }
        }}
      >
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-h-[90vh] w-[95vw] max-w-5xl sm:max-w-5xl lg:max-w-6xl overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
            <DialogDescription>
              {viewSubmission?.employeeName} - {viewSubmission?.cycleName}
            </DialogDescription>
          </DialogHeader>

          <ReviewDetailSection
            loading={viewDetailLoading}
            error={viewDetailError}
            detail={viewDetail}
            submission={viewSubmission}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getReviewStatus(review?: any) {
  return review?.status || review?.metadata?.status || '';
}

interface ReviewDetailSectionProps {
  loading: boolean;
  error: string | null;
  detail: { manager?: any; self?: any } | null;
  submission: ReviewSubmission | null;
}

function ReviewDetailSection({ loading, error, detail, submission }: ReviewDetailSectionProps) {
  if (!submission) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!detail?.manager) {
    return (
      <Card className="border-border/40 bg-background/60">
        <CardContent className="p-4 text-sm text-muted-foreground">Review details unavailable.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
      <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 to-background/40 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Status</p>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {detail.manager.status || getReviewStatus(detail.manager) || submission.status}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Submitted</p>
              <p className="font-semibold">{formatDateTime(detail.manager.submittedAt || submission.submittedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Last Updated</p>
              <p className="font-semibold">{formatDateTime(detail.manager.updatedAt)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm">
          <InfoStat label="Employee" value={submission.employeeName} />
          <InfoStat label="Cycle" value={submission.cycleName} />
          <InfoStat
            label="Manager"
            value={
              detail.manager.metadata?.reviewerSnapshot?.reviewerName ||
              submission.managerName ||
              detail.manager.metadata?.reviewerSnapshot?.reviewerId ||
              detail.manager.reviewerId
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-amber-300/40 bg-gradient-to-br from-amber-50/80 via-amber-50/30 to-background/40 dark:from-amber-900/30 dark:via-amber-900/10 dark:to-background/30 backdrop-blur-sm shadow-[0_10px_25px_-15px_rgba(251,191,36,0.8)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-900 dark:text-amber-200">Self Review Highlights</CardTitle>
            <CardDescription>Key responses from the employee</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-64 overflow-auto pr-1">
            <SelfReviewHighlights selfReview={detail.self} />
          </CardContent>
        </Card>

        <Card className="border-emerald-300/40 bg-gradient-to-br from-emerald-50/80 via-emerald-50/30 to-background/40 dark:from-emerald-900/30 dark:via-emerald-900/10 dark:to-background/30 backdrop-blur-sm shadow-[0_10px_25px_-15px_rgba(16,185,129,0.8)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Manager Summary</CardTitle>
            <CardDescription>Overall assessment & recommendations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-64 overflow-auto pr-1">
            <ManagerSummary managerReview={detail.manager} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-300/40 bg-gradient-to-br from-slate-50/80 via-slate-50/30 to-background/40 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-background/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Goals & Ratings</CardTitle>
              <CardDescription>Completion & manager feedback</CardDescription>
            </div>
            <Badge variant="secondary">
              {(detail.manager.metadata?.goalReviews || []).length} goals
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-64 overflow-auto pr-1">
          <GoalReviewList goals={detail.manager.metadata?.goalReviews || []} />
        </CardContent>
      </Card>
    </div>
  );
}

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return value;
  }
};

function InfoStat({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{value ?? '—'}</p>
    </div>
  );
}

function SelfReviewHighlights({ selfReview }: { selfReview?: any }) {
  if (!selfReview?.metadata?.selfReviewFields) {
    return <p className="text-xs text-muted-foreground">No self-review responses available.</p>;
  }

  const fields = selfReview.metadata.selfReviewFields;
  const entries: { label: string; value?: string }[] = [
    { label: 'Key Accomplishments', value: fields.significantAccomplishments },
    { label: 'Beyond Role Contributions', value: fields.beyondRoleContributions },
    { label: 'Challenges & Solutions', value: fields.challengesAndSolutions },
    { label: 'Areas of Improvement', value: fields.areasNeedingImprovement },
    { label: 'Certifications Completed', value: fields.certificationsCompleted }
  ];

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-lg border border-border/30 bg-background/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{entry.label}</p>
          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
            {entry.value?.trim() || 'Not provided'}
          </p>
        </div>
      ))}
    </div>
  );
}

function ManagerSummary({ managerReview }: { managerReview?: any }) {
  if (!managerReview) {
    return <p className="text-xs text-muted-foreground">Manager review details unavailable.</p>;
  }

  const finalRating = managerReview.metadata?.finalRating || {};

  const summaryItems: { label: string; value?: string }[] = [
    { label: 'Summary Feedback', value: finalRating.summaryFeedback || managerReview.comments },
    { label: 'Development Need', value: finalRating.developmentNeed },
    { label: 'Action Plan', value: finalRating.actionPlan },
    { label: 'Recommendations', value: finalRating.developmentRecommendations }
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-primary/80">Overall Rating</p>
          <p className="text-lg font-semibold text-primary">
            {finalRating.overallRating ?? managerReview.ratings?.overall ?? '—'}/5
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
          <p className="text-sm font-semibold text-foreground">
            {getReviewStatus(managerReview) || 'manager_submitted'}
          </p>
        </div>
      </div>

      {summaryItems.map((item) => (
        <div key={item.label} className="rounded-lg border border-border/30 bg-background/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
            {item.value?.trim() || 'Not provided'}
          </p>
        </div>
      ))}
    </div>
  );
}

function GoalReviewList({ goals }: { goals: any[] }) {
  if (!goals.length) {
    return <p className="text-xs text-muted-foreground">No goal reviews found.</p>;
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => {
        const completion = goal.completion !== undefined ? Math.round(Number(goal.completion)) : 0;
        return (
          <div key={goal.goalId} className="rounded-xl border border-border/30 bg-background/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{goal.goalDescription}</p>
                <p className="text-xs text-muted-foreground">Weightage: {goal.weightage ?? 0}%</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold text-primary">
                  Rating: {goal.managerRating ?? '—'}/5
                </p>
                <p className="text-muted-foreground">
                  Completion: {completion}%
                </p>
              </div>
            </div>
            {goal.managerComments && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border/30 pt-2">
                {goal.managerComments}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
