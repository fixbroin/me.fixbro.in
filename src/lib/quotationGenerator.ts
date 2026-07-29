
"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable'; 
import type { UserOptions, CellWidthType } from 'jspdf-autotable';
import { FirestoreQuotation, CompanyDetailsForPdf, Timestamp } from '@/types/firestore'; // Added Timestamp

interface ExtendedHeadCellDef { 
    cellWidth?: CellWidthType;
    halign?: 'left' | 'center' | 'right';
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable: { finalY: number }; 
  }
}

const formatDateForIndiaDisplay = (timestamp?: Timestamp): string => {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate();
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return 'Invalid Date'; 
    }
};

export const generateQuotationPdf = async (quotation: FirestoreQuotation, companyDetails?: CompanyDetailsForPdf): Promise<string> => {
  const doc = new jsPDF();

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Wecanfix",
    address: companyDetails?.address || "#44 G S Palya Road Konappana Agrahara Electronic City Phase 2 -560100",
    contactEmail: companyDetails?.contactEmail || 'support@wecanfix.in',
    contactMobile: companyDetails?.contactMobile || '+91-7353113455',
    logoUrl: companyDetails?.logoUrl,
  };
  
  // Header Section
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(defaultCompanyDetails.name, 14, 22);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 100);
  doc.text(addressLines[0], 14, 28);
  if (addressLines.length > 1) doc.text(addressLines[1], 14, 32);
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, (addressLines.length > 1 ? 32 : 28) + 6);

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", 196, 22, { align: "right" });
  doc.setFont("helvetica", "normal");

  doc.setFontSize(10);
  doc.text(`Quotation #: ${quotation.quotationNumber}`, 196, 30, { align: "right" });
  doc.text(`Date: ${formatDateForIndiaDisplay(quotation.quotationDate)}`, 196, 36, { align: "right" });
  
  // Customer Details Section
  let startYCustomer = 50;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("To:", 14, startYCustomer);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  startYCustomer += 5; doc.text(quotation.customerName, 14, startYCustomer);
  if (quotation.customerEmail) {
    startYCustomer += 5; doc.text(`Email: ${quotation.customerEmail}`, 14, startYCustomer);
  }
  if (quotation.customerMobile) { // Added customerMobile
    startYCustomer += 5; doc.text(`Mobile: ${quotation.customerMobile}`, 14, startYCustomer);
  }

  // Service Title / Description
  startYCustomer += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Subject: Quotation for " + quotation.serviceTitle, 14, startYCustomer);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (quotation.serviceDescription) {
    startYCustomer += 6;
    const descLines = doc.splitTextToSize(quotation.serviceDescription, 180);
    doc.text(descLines, 14, startYCustomer);
    startYCustomer += (descLines.length * 4);
  }


  // Items Table
  const tableColumnStyles: { [key: string]: Partial<ExtendedHeadCellDef> } = {
    0: { cellWidth: 10 }, // #
    1: { cellWidth: 'auto' }, // Description
    2: { cellWidth: 20, halign: 'center' }, // Qty
    3: { cellWidth: 30, halign: 'right' }, // Rate
    4: { cellWidth: 30, halign: 'right' }, // Amount
  };

  const head = [["#", "Description", "Qty", "Rate (Rs)", "Amount (Rs)"]];
  const body = quotation.items.map((item, index) => [
    index + 1,
    item.itemName,
    item.quantity,
    item.ratePerUnit.toFixed(2),
    item.total.toFixed(2),
  ]);

  doc.autoTable({
    head: head, body: body, startY: startYCustomer + 10, theme: 'striped',
    headStyles: { fillColor: [70, 160, 162] }, columnStyles: tableColumnStyles,
  });

  // Totals Section
  let finalY = doc.lastAutoTable.finalY || startYCustomer + 10 + (body.length + 1) * 10;
  finalY += 7;

  const drawRightAlignedText = (label: string, value: string, y: number) => {
    doc.text(label, 150, y, { align: "right" });
    doc.text(value, 196, y, { align: "right" });
  };

  doc.setFontSize(10);
  drawRightAlignedText("Subtotal:", `Rs. ${quotation.subtotal.toFixed(2)}`, finalY);
  
  if (quotation.taxAmount && quotation.taxAmount > 0) {
    finalY += 5;
    drawRightAlignedText(`Tax (${quotation.taxPercent?.toFixed(1) || ''}%):`, `+ Rs. ${quotation.taxAmount.toFixed(2)}`, finalY);
  }

  finalY += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  drawRightAlignedText("Grand Total:", `Rs. ${quotation.totalAmount.toFixed(2)}`, finalY);
  doc.setFont("helvetica", "normal");

  // Additional Notes Section
  if (quotation.additionalNotes) {
    finalY += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Notes & Terms:", 14, finalY);
    doc.setFont("helvetica", "normal");
    finalY += 5;
    const notesLines = doc.splitTextToSize(quotation.additionalNotes, 180);
    doc.text(notesLines, 14, finalY);
    finalY += (notesLines.length * 4);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.text("Thank you for your interest!", 105, pageHeight - 15, { align: "center" });
  doc.text("This is a computer generated quotation.", 105, pageHeight - 10, { align: "center" });

  return doc.output('datauristring'); 
};
