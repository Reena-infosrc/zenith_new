// To fix linter errors, ensure you have @types/jest and @testing-library/jest-dom installed
// npm install --save-dev @types/jest @testing-library/jest-dom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewDetailsButton } from './ReviewDetailsButton';
import { JobRequisitionData } from '@/services/recruitmentService';

// @ts-expect-error - Mock module for testing
jest.mock('@/hooks/useExportToPdf', () => ({
  useExportToPdf: () => ({ exportToPdf: jest.fn() })
}));

const mockDetails: JobRequisitionData = {
  jobTitle: 'Software Engineer',
  department: 'Engineering',
  manager: 'Alice',
  numberOfOpenings: 2,
  jobType: 'Full-time',
  location: 'Remote',
  skills: ['React', 'TypeScript'],
  experienceLevel: 'Mid Level (3-5 years)',
  educationRequirements: "Bachelor's Degree",
  salaryMin: 70000,
  salaryMax: 120000,
  reasonForHire: 'Team Expansion',
  startDate: new Date(), // Use Date type as per JobRequisitionData
  notes: 'Urgent hire'
};

describe('ReviewDetailsButton', () => {
  it('opens modal and displays all fields', () => {
    render(<ReviewDetailsButton details={mockDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /review details/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Full-time')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('React, TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Mid Level (3-5 years)')).toBeInTheDocument();
    expect(screen.getByText("Bachelor's Degree")).toBeInTheDocument();
    expect(screen.getByText('$70,000 - $120,000')).toBeInTheDocument();
    expect(screen.getByText('Team Expansion')).toBeInTheDocument();
    expect(screen.getByText('Urgent hire')).toBeInTheDocument();
  });

  it('calls exportToPdf when Download is clicked', () => {
    // Use dynamic import instead of require
    const { useExportToPdf } = jest.requireActual('@/hooks/useExportToPdf');
    const exportToPdf = useExportToPdf().exportToPdf;
    render(<ReviewDetailsButton details={mockDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /review details/i }));
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(exportToPdf).toHaveBeenCalledWith(mockDetails);
  });
}); 