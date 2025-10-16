import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Settings, Eye, EyeOff, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useFeatureFlags, FeatureFlag, FeatureFlagStatus } from '@/contexts/FeatureFlagsContext';

export function FeatureFlagManagement() {
  const { 
    featureFlags, 
    isLoading, 
    error, 
    updateFeatureFlag, 
    getFeatureFlagsByCategory 
  } = useFeatureFlags();
  
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingFlags, setUpdatingFlags] = useState<Set<string>>(new Set());

  // Filter feature flags based on category and search term
  const filteredFlags = featureFlags.filter(flag => {
    const matchesCategory = selectedCategory === 'all' || flag.category === selectedCategory;
    const matchesSearch = flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         flag.display_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(featureFlags.map(flag => flag.category)))];

  // Handle status update
  const handleStatusUpdate = async (flagId: string, newStatus: FeatureFlagStatus) => {
    setUpdatingFlags(prev => new Set(prev).add(flagId));
    
    try {
      const success = await updateFeatureFlag(flagId, newStatus);
      if (!success) {
        throw new Error('Failed to update feature flag');
      }
    } catch (error) {
      // You could add a toast notification here
    } finally {
      setUpdatingFlags(prev => {
        const newSet = new Set(prev);
        newSet.delete(flagId);
        return newSet;
      });
    }
  };

  // Get status icon
  const getStatusIcon = (status: FeatureFlagStatus) => {
    switch (status) {
      case 'enabled':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'disabled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'hidden':
        return <EyeOff className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: FeatureFlagStatus) => {
    switch (status) {
      case 'enabled':
        return 'default';
      case 'disabled':
        return 'destructive';
      case 'hidden':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading feature flags...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error loading feature flags: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feature Flag Management</h1>
          <p className="text-muted-foreground">
            Control module visibility and functionality across the HR system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <span className="text-sm text-muted-foreground">Admin Only</span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter feature flags by category and search terms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search feature flags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-48">
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category.replace('_', ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags List */}
      <div className="grid gap-4">
        {filteredFlags.map((flag) => (
          <Card key={flag.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-lg">{flag.display_name}</CardTitle>
                    {flag.is_core_feature && (
                      <Badge variant="outline" className="text-xs">
                        Core Feature
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    {flag.description || 'No description available'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(flag.status)}
                  <Badge variant={getStatusBadgeVariant(flag.status)}>
                    {flag.status.charAt(0).toUpperCase() + flag.status.slice(1)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    <strong>Module:</strong> {flag.module}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <strong>Category:</strong> {flag.category.replace('_', ' ')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <strong>Flag Name:</strong> {flag.name}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {updatingFlags.has(flag.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Select
                          value={flag.status}
                          onValueChange={(value: FeatureFlagStatus) => 
                            handleStatusUpdate(flag.id, value)
                          }
                          disabled={updatingFlags.has(flag.id)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enabled">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                Enabled
                              </div>
                            </SelectItem>
                            <SelectItem value="disabled">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                Disabled
                              </div>
                            </SelectItem>
                            <SelectItem value="hidden">
                              <div className="flex items-center gap-2">
                                <EyeOff className="h-4 w-4 text-gray-500" />
                                Hidden
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {featureFlags.filter(f => f.status === 'enabled').length}
              </div>
              <div className="text-sm text-muted-foreground">Enabled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {featureFlags.filter(f => f.status === 'disabled').length}
              </div>
              <div className="text-sm text-muted-foreground">Disabled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {featureFlags.filter(f => f.status === 'hidden').length}
              </div>
              <div className="text-sm text-muted-foreground">Hidden</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
