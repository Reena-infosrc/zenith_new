
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Download, 
  FileText, 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Eye
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LeaveRecord = {
  id: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  status: "approved" | "rejected" | "pending" | "cancelled";
  reason: string;
  approvedBy?: string;
  rejectionReason?: string;
  submittedDate: string;
};

export const LeaveHistory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("2025");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("dateFrom");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // This would come from an API in a real app
  const leaveHistory: LeaveRecord[] = [
    {
      id: "LEV-2025-0001",
      type: "Annual",
      dateFrom: "2025-03-15",
      dateTo: "2025-03-19",
      days: 5,
      status: "approved",
      reason: "Family vacation",
      approvedBy: "Jane Manager",
      submittedDate: "2025-02-10"
    },
    {
      id: "LEV-2025-0002",
      type: "Sick",
      dateFrom: "2025-04-05",
      dateTo: "2025-04-06",
      days: 2,
      status: "approved",
      reason: "Cold and fever",
      approvedBy: "Jane Manager",
      submittedDate: "2025-04-05"
    },
    {
      id: "LEV-2025-0003",
      type: "Personal",
      dateFrom: "2025-02-20",
      dateTo: "2025-02-20",
      days: 1,
      status: "approved",
      reason: "Family event",
      approvedBy: "Jane Manager",
      submittedDate: "2025-02-10"
    },
    {
      id: "LEV-2025-0004",
      type: "Annual",
      dateFrom: "2025-06-10",
      dateTo: "2025-06-12",
      days: 3,
      status: "pending",
      reason: "Summer trip",
      submittedDate: "2025-05-15"
    },
    {
      id: "LEV-2024-0012",
      type: "Annual",
      dateFrom: "2024-12-20",
      dateTo: "2024-12-31",
      days: 12,
      status: "approved",
      reason: "Year-end holiday",
      approvedBy: "Jane Manager",
      submittedDate: "2024-11-15"
    },
    {
      id: "LEV-2025-0005",
      type: "Unpaid",
      dateFrom: "2025-01-05",
      dateTo: "2025-01-12",
      days: 8,
      status: "rejected",
      reason: "Extended winter break",
      rejectionReason: "High workload during project kick-off",
      submittedDate: "2024-12-10"
    },
    {
      id: "LEV-2025-0006",
      type: "Sick",
      dateFrom: "2025-02-05",
      dateTo: "2025-02-05",
      days: 1,
      status: "cancelled",
      reason: "Doctor's appointment",
      submittedDate: "2025-02-01"
    },
  ];
  
  // Function to handle sorting when clicking on table headers
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Filter and sort leave records
  const filteredAndSortedRecords = leaveHistory
    .filter(record => {
      // Filter by search term
      const matchesSearch = record.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          record.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          record.reason.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter by year
      const recordYear = yearFilter === "all" ? true : 
                       new Date(record.dateFrom).getFullYear().toString() === yearFilter;
      
      // Filter by type
      const matchesType = typeFilter === "all" || 
                        record.type.toLowerCase() === typeFilter.toLowerCase();
      
      // Filter by status
      const matchesStatus = statusFilter === "all" || 
                          record.status === statusFilter;
      
      return matchesSearch && recordYear && matchesType && matchesStatus;
    })
    .sort((a, b) => {
      // Sort records based on current sort field and direction
      let comparison = 0;
      
      switch (sortField) {
        case "id":
          comparison = a.id.localeCompare(b.id);
          break;
        case "type":
          comparison = a.type.localeCompare(b.type);
          break;
        case "dateFrom":
          comparison = new Date(a.dateFrom).getTime() - new Date(b.dateFrom).getTime();
          break;
        case "days":
          comparison = a.days - b.days;
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "submittedDate":
          comparison = new Date(a.submittedDate).getTime() - new Date(b.submittedDate).getTime();
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Function to format date range for display
  const formatDateRange = (dateFrom: string, dateTo: string) => {
    const from = parseISO(dateFrom);
    const to = parseISO(dateTo);
    
    if (dateFrom === dateTo) {
      return format(from, "MMM d, yyyy");
    }
    
    if (format(from, "MMM yyyy") === format(to, "MMM yyyy")) {
      return `${format(from, "MMM d")} - ${format(to, "d, yyyy")}`;
    }
    
    return `${format(from, "MMM d, yyyy")} - ${format(to, "MMM d, yyyy")}`;
  };
  
  // Function to render status badge with appropriate color
  const renderStatusBadge = (status: string) => {
    let variant = "outline";
    
    switch (status) {
      case "approved":
        variant = "success";
        break;
      case "pending":
        variant = "warning";
        break;
      case "rejected":
        variant = "destructive";
        break;
      case "cancelled":
        variant = "outline";
        break;
      default:
        variant = "outline";
    }
    
    return (
      <Badge variant={variant as "default" | "secondary" | "destructive" | "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };
  
  // Function to generate statistics
  const getStatistics = () => {
    const currentYear = new Date().getFullYear().toString();
    const thisYearRecords = leaveHistory.filter(record => 
      new Date(record.dateFrom).getFullYear().toString() === currentYear
    );
    
    const annualCount = thisYearRecords.filter(record => 
      record.type.toLowerCase() === "annual" && record.status === "approved"
    ).reduce((sum, record) => sum + record.days, 0);
    
    const sickCount = thisYearRecords.filter(record => 
      record.type.toLowerCase() === "sick" && record.status === "approved"
    ).reduce((sum, record) => sum + record.days, 0);
    
    const personalCount = thisYearRecords.filter(record => 
      record.type.toLowerCase() === "personal" && record.status === "approved"
    ).reduce((sum, record) => sum + record.days, 0);
    
    const unpaidCount = thisYearRecords.filter(record => 
      record.type.toLowerCase() === "unpaid" && record.status === "approved"
    ).reduce((sum, record) => sum + record.days, 0);
    
    const totalCount = annualCount + sickCount + personalCount + unpaidCount;
    
    return {
      annual: annualCount,
      sick: sickCount,
      personal: personalCount,
      unpaid: unpaidCount,
      total: totalCount
    };
  };
  
  const stats = getStatistics();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="hr-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Annual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.annual} days</div>
          </CardContent>
        </Card>
        
        <Card className="hr-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sick</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sick} days</div>
          </CardContent>
        </Card>
        
        <Card className="hr-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Personal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.personal} days</div>
          </CardContent>
        </Card>
        
        <Card className="hr-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unpaid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unpaid} days</div>
          </CardContent>
        </Card>
        
        <Card className="bg-primary/10 hr-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total} days</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search leave records..." 
            className="pl-9 w-full sm:w-[300px]"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="sick">Sick</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export to Excel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export to PDF</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {/* Leave History Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("id")}
                >
                  <div className="flex items-center">
                    Request ID
                    {sortField === "id" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center">
                    Type
                    {sortField === "type" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("dateFrom")}
                >
                  <div className="flex items-center">
                    Dates
                    {sortField === "dateFrom" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("days")}
                >
                  <div className="flex items-center">
                    Days
                    {sortField === "days" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    Status
                    {sortField === "status" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("submittedDate")}
                >
                  <div className="flex items-center">
                    Submitted
                    {sortField === "submittedDate" && (
                      sortDirection === "asc" ? 
                        <ChevronUp className="ml-1 h-4 w-4" /> : 
                        <ChevronDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedRecords.length > 0 ? (
                filteredAndSortedRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                        {formatDateRange(record.dateFrom, record.dateTo)}
                      </div>
                    </TableCell>
                    <TableCell>{record.days} day{record.days !== 1 ? 's' : ''}</TableCell>
                    <TableCell>
                      {renderStatusBadge(record.status)}
                    </TableCell>
                    <TableCell>{format(parseISO(record.submittedDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 px-2">
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Leave Details</DialogTitle>
                            <DialogDescription>
                              Complete information about leave request {record.id}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm font-medium">Request ID</p>
                                <p className="text-sm">{record.id}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Type</p>
                                <p className="text-sm capitalize">{record.type}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Dates</p>
                                <p className="text-sm">{formatDateRange(record.dateFrom, record.dateTo)}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Duration</p>
                                <p className="text-sm">{record.days} day{record.days !== 1 ? 's' : ''}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Status</p>
                                <p className="text-sm">{renderStatusBadge(record.status)}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Submitted On</p>
                                <p className="text-sm">{format(parseISO(record.submittedDate), "PPP")}</p>
                              </div>
                            </div>
                            
                            <div>
                              <p className="text-sm font-medium">Reason for Leave</p>
                              <p className="text-sm mt-1">{record.reason}</p>
                            </div>
                            
                            {record.approvedBy && (
                              <div>
                                <p className="text-sm font-medium">Approved By</p>
                                <p className="text-sm mt-1">{record.approvedBy}</p>
                              </div>
                            )}
                            
                            {record.rejectionReason && (
                              <div>
                                <p className="text-sm font-medium">Reason for Rejection</p>
                                <p className="text-sm mt-1">{record.rejectionReason}</p>
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            {record.type === "Sick" && (
                              <Button variant="outline">View Medical Certificate</Button>
                            )}
                            <Button type="button">Download Record</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6">
                    <div className="text-muted-foreground">No leave records found</div>
                    <div className="text-sm text-muted-foreground mt-1">Try adjusting your filters</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
