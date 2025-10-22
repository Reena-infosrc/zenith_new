import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { JobRequisitionData } from '@/services/recruitmentService';
import { ReviewDetailsModal } from './ReviewDetailsModal';

interface ReviewDetailsButtonProps {
  details: JobRequisitionData;
}

export const ReviewDetailsButton: React.FC<ReviewDetailsButtonProps> = ({ details }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label="Review Department Request Details">
        Review Details
      </Button>
      <ReviewDetailsModal open={open} onClose={() => setOpen(false)} details={details} />
    </>
  );
}; 