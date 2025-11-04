import { useState, useEffect } from "react";
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  Target,
  Star,
  Send
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Feedback {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto?: string;
  fromUserId: string;
  fromUserName: string;
  fromUserPhoto?: string;
  type: 'praise' | 'correction' | 'general';
  message: string;
  goalId?: string;
  goalTitle?: string;
  visibility: 'private' | 'manager';
  createdAt: string;
  tags?: string[];
}

export function ContinuousFeedback() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    type: 'praise' as 'praise' | 'correction' | 'general',
    message: '',
    goalId: '',
    visibility: 'private' as 'private' | 'manager'
  });

  // Mock data
  useEffect(() => {
    setFeedbacks([
      {
        id: '1',
        employeeId: 'emp1',
        employeeName: 'John Doe',
        fromUserId: 'mgr1',
        fromUserName: 'Jane Smith',
        type: 'praise',
        message: 'Excellent work on the React performance optimization project! The improvements were significant.',
        visibility: 'manager',
        createdAt: '2024-03-15T10:30:00',
        tags: ['react', 'performance']
      },
      {
        id: '2',
        employeeId: 'emp1',
        employeeName: 'John Doe',
        fromUserId: 'mgr1',
        fromUserName: 'Jane Smith',
        type: 'correction',
        message: 'Please ensure code reviews are completed within 24 hours to maintain project velocity.',
        goalId: 'goal1',
        goalTitle: 'Improve Code Review Efficiency',
        visibility: 'manager',
        createdAt: '2024-03-10T14:20:00'
      },
      {
        id: '3',
        employeeId: 'emp2',
        employeeName: 'Mike Johnson',
        fromUserId: 'user1',
        fromUserName: 'Sarah Wilson',
        type: 'praise',
        message: 'Great collaboration on the API design!',
        visibility: 'private',
        createdAt: '2024-03-12T09:15:00'
      }
    ]);
  }, []);

  const filteredFeedbacks = feedbacks.filter(f => {
    const matchesSearch = f.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         f.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || f.type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'praise':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'correction':
        return <ThumbsDown className="h-4 w-4 text-orange-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const configs: Record<string, { label: string; variant: any }> = {
      praise: { label: 'Praise', variant: 'default' },
      correction: { label: 'Correction', variant: 'destructive' },
      general: { label: 'General', variant: 'secondary' }
    };
    const config = configs[type] || configs.general;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleCreateFeedback = () => {
    if (!formData.message || !formData.employeeId) return;
    
    // TODO: API call
    const newFeedback: Feedback = {
      id: Date.now().toString(),
      employeeId: formData.employeeId,
      employeeName: formData.employeeName,
      fromUserId: 'current-user',
      fromUserName: 'Current User',
      type: formData.type,
      message: formData.message,
      goalId: formData.goalId || undefined,
      visibility: formData.visibility,
      createdAt: new Date().toISOString()
    };
    
    setFeedbacks([newFeedback, ...feedbacks]);
    setShowCreateModal(false);
    setFormData({
      employeeId: '',
      employeeName: '',
      type: 'praise',
      message: '',
      goalId: '',
      visibility: 'private'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Continuous Feedback
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Give real-time praise and constructive feedback
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-gradient-to-r from-primary to-primary/80"
        >
          <Plus className="h-4 w-4 mr-2" />
          Give Feedback
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search feedback..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px] bg-background/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="praise">Praise</SelectItem>
                <SelectItem value="correction">Correction</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <Tabs defaultValue="received" className="space-y-4">
        <TabsList>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="given">Given</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-4">
          {filteredFeedbacks.map((feedback) => (
            <Card
              key={feedback.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={feedback.fromUserPhoto} />
                    <AvatarFallback>
                      {feedback.fromUserName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{feedback.fromUserName}</span>
                        {getTypeIcon(feedback.type)}
                        {getTypeBadge(feedback.type)}
                        <Badge variant="outline" className="text-xs">
                          {feedback.visibility === 'manager' ? 'Visible to Manager' : 'Private'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(feedback.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{feedback.message}</p>
                    {feedback.goalTitle && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Target className="h-3 w-3" />
                        <span>Linked to: {feedback.goalTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="given" className="space-y-4">
          {filteredFeedbacks.map((feedback) => (
            <Card
              key={feedback.id}
              className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={feedback.employeePhoto} />
                    <AvatarFallback>
                      {feedback.employeeName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">To: {feedback.employeeName}</span>
                        {getTypeIcon(feedback.type)}
                        {getTypeBadge(feedback.type)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(feedback.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{feedback.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Create Feedback Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-2xl">
          <DialogHeader>
            <DialogTitle>Give Feedback</DialogTitle>
            <DialogDescription>
              Provide real-time praise or constructive feedback to team members
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Employee</Label>
                <Input
                  placeholder="Search employee..."
                  value={formData.employeeName}
                  onChange={(e) => {
                    setFormData({ ...formData, employeeName: e.target.value });
                    // TODO: Implement employee search
                  }}
                  className="mt-1 bg-background/50"
                />
              </div>
              <div>
                <Label>Feedback Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="mt-1 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="praise">
                      <div className="flex items-center gap-2">
                        <ThumbsUp className="h-4 w-4 text-green-500" />
                        Praise
                      </div>
                    </SelectItem>
                    <SelectItem value="correction">
                      <div className="flex items-center gap-2">
                        <ThumbsDown className="h-4 w-4 text-orange-500" />
                        Correction
                      </div>
                    </SelectItem>
                    <SelectItem value="general">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        General
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Message</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter your feedback..."
                className="mt-1 min-h-[120px] bg-background/50"
              />
            </div>

            <div>
              <Label>Visibility</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value: any) => setFormData({ ...formData, visibility: value })}
              >
                <SelectTrigger className="mt-1 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (Only employee)</SelectItem>
                  <SelectItem value="manager">Visible to Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFeedback}
              disabled={!formData.message || !formData.employeeName}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

