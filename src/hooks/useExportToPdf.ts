import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JobRequisitionData } from '@/services/recruitmentService';

export function useExportToPdf() {
  const exportToPdf = (details: JobRequisitionData) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Department Request - Request Details', 14, 18);
    doc.setFontSize(12);

    // Prepare data for table
    const rows = [
      ['Job Title', details.jobTitle],
      ['Department', details.department],
      ['Manager', details.manager],
      ['Number of Openings', details.numberOfOpenings?.toString() ?? ''],
      ['Job Type', details.jobType],
      ['Location', details.location],
      ['Skills', (details.skills || []).join(', ')],
      ['Experience Level', details.experienceLevel],
      ['Education Requirements', details.educationRequirements ?? ''],
      ['Salary Range', `$${details.salaryMin?.toLocaleString()} - $${details.salaryMax?.toLocaleString()}`],
      ['Reason for Hire', details.reasonForHire],
      ['Start Date', details.startDate ? new Date(details.startDate).toLocaleDateString() : ''],
      ['Notes', details.notes ?? ''],
    ];

    // Add table
    autoTable(doc, {
      startY: 28,
      head: [['Field', 'Value']],
      body: rows,
      styles: { cellPadding: 2, fontSize: 11 },
      headStyles: { fillColor: [41, 128, 185] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    doc.save('Department_Request_Details.pdf');
  };

  return { exportToPdf };
} 