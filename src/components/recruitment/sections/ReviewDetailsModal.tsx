import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { JobRequisitionData } from '@/services/recruitmentService';
import { useExportToPdf } from '@/hooks/useExportToPdf';

interface ReviewDetailsModalProps {
  open: boolean;
  onClose: () => void;
  details: JobRequisitionData;
}

export const ReviewDetailsModal: React.FC<ReviewDetailsModalProps> = ({ open, onClose, details }) => {
  const { exportToPdf } = useExportToPdf();

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()} aria-label="Department Request Details">
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogTitle className="mb-2">Department Request – Request Details</DialogTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="space-y-2">
            <ReadOnlyField label="Job Title" value={details.jobTitle} />
            <ReadOnlyField label="Department" value={details.department} />
            <ReadOnlyField label="Manager" value={details.manager} />
            <ReadOnlyField label="Number of Openings" value={details.numberOfOpenings?.toString()} />
            <ReadOnlyField label="Job Type" value={details.jobType} />
            <ReadOnlyField label="Location" value={details.location} />
            <ReadOnlyField label="Skills" value={(details.skills || []).join(', ')} />
          </div>
          <div className="space-y-2">
            <ReadOnlyField label="Experience Level" value={details.experienceLevel} />
            <ReadOnlyField label="Education Requirements" value={details.educationRequirements ?? ''} />
            <ReadOnlyField label="Salary Range" value={`$${details.salaryMin?.toLocaleString()} - $${details.salaryMax?.toLocaleString()}`} />
            <ReadOnlyField label="Reason for Hire" value={details.reasonForHire} />
            <ReadOnlyField label="Start Date" value={details.startDate ? new Date(details.startDate).toLocaleDateString() : ''} />
            <ReadOnlyField label="Notes" value={details.notes ?? ''} />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button onClick={() => exportToPdf(details)} aria-label="Download Department Request as PDF">Download</Button>
          <Button variant="outline" onClick={onClose} aria-label="Close Modal">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ReadOnlyField: React.FC<{ label: string; value: string | number | undefined }> = ({ label, value }) => (
  <div className="flex flex-col" tabIndex={0} aria-label={label}>
    <span className="text-xs text-muted-foreground font-medium">{label}</span>
    <span className="text-base font-normal bg-muted px-2 py-1 rounded" style={{ wordBreak: 'break-word' }}>{value || '-'}</span>
  </div>
); 