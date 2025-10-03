import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Link, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useEmployees } from '@/hooks/use-employees';

interface ImportEmployeesProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportEmployees({ isOpen, onClose }: ImportEmployeesProps) {
  const [file, setFile] = useState<File | null>(null);
  const [linkedInUrl, setLinkedInUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("csv");
  const { toast } = useToast();
  const { importEmployeesFromCsv } = useEmployees();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
  };
  
  const handleCsvImport = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import.",
        variant: "destructive"
      });
      return;
    }

    try {
      const success = await importEmployeesFromCsv(file);
      if (success) {
        setFile(null); // Reset file input
        onClose();
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: "An error occurred while importing employees.",
        variant: "destructive"
      });
    }
  };

  const handleLinkedInImport = async () => {
    // This would be implemented in the future
    toast({
      title: "LinkedIn import",
      description: "LinkedIn import functionality will be available in a future update.",
    });
  };

  const downloadTemplate = () => {
    const csvContent = [
      "EmployeeID,FirstName,LastName,EmploymentCategory,Gender,EmployeeStatus,Account,Department,IsLeader,Location,Mobile,Dob,Doj,Email,Position,ProfilePic,Expertise,ExperienceYears",
      "E0001,Ajay,Patel,FTE,MALE,Billable,Ford,Info Services Delivery,No,India,9884271939,1969-12-01,2025-07-02,Ravikumar.Sivaprakasam@infoservices.com,Manager,https://example.com/profile.jpg,Project Management,5",
      "E0002,Jane,Smith,FTE,FEMALE,Billable,Microsoft,Engineering,Yes,USA,5551234567,1990-05-15,2024-01-15,jane.smith@microsoft.com,Senior Developer,https://example.com/jane.jpg,Frontend Development,3"
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'employee_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Template Downloaded",
      description: "CSV template has been downloaded successfully.",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Employees</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="csv" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="csv">CSV/Excel File</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          </TabsList>
          
          <TabsContent value="csv" className="space-y-4 mt-4">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB - {file.type || 'Unknown type'}
                    </p>
                  </div>
                  <button 
                    onClick={clearFile}
                    className="p-1 rounded-full hover:bg-muted"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground mb-2">
                    Drag and drop your CSV or Excel file here
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    or
                  </p>
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                </>
              )}
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Required Columns:</h3>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>EmployeeID:</strong> Unique employee identifier</div>
                  <div><strong>FirstName:</strong> Employee's first name</div>
                  <div><strong>LastName:</strong> Employee's last name</div>
                  <div><strong>Email:</strong> Employee's email address</div>
                  <div><strong>Position:</strong> Job title/position</div>
                  <div><strong>Department:</strong> Department name</div>
                  <div><strong>EmploymentCategory:</strong> FTE, Contractor, etc.</div>
                  <div><strong>Gender:</strong> MALE, FEMALE, Prefer not to say</div>
                  <div><strong>EmployeeStatus:</strong> Billable, Non-billable, etc.</div>
                  <div><strong>Account:</strong> Client account name</div>
                  <div><strong>IsLeader:</strong> Yes/No</div>
                  <div><strong>Location:</strong> Work location</div>
                  <div><strong>Mobile:</strong> Phone number</div>
                  <div><strong>Dob:</strong> Date of birth (YYYY-MM-DD)</div>
                  <div><strong>Doj:</strong> Date of joining (YYYY-MM-DD)</div>
                  <div><strong>ProfilePic:</strong> Profile picture URL</div>
                  <div><strong>Expertise:</strong> Area of expertise</div>
                  <div><strong>ExperienceYears:</strong> Years of experience (number)</div>
                </div>
              </div>
              
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> All columns are required. Date format must be YYYY-MM-DD. 
                  Maximum 500 records per import.
                </p>
              </div>
              
              <button 
                onClick={() => downloadTemplate()}
                className="text-xs text-primary inline-block mt-2 hover:underline"
              >
                Download CSV Template
              </button>
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCsvImport} disabled={!file}>Import</Button>
            </div>
          </TabsContent>
          
          <TabsContent value="linkedin" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin-url">LinkedIn Profile URL</Label>
                <Input 
                  id="linkedin-url" 
                  placeholder="https://www.linkedin.com/in/username"
                  value={linkedInUrl}
                  onChange={(e) => setLinkedInUrl(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <Link className="h-5 w-5 text-primary" />
                <p className="text-xs">
                  Import employee profiles directly from LinkedIn (Coming Soon)
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleLinkedInImport} disabled={!linkedInUrl.includes('linkedin.com/')}>
                Import
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}