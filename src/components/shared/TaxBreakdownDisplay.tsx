
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppliedPlatformFeeItem } from "@/types/firestore"; // Import AppliedPlatformFeeItem

interface BreakdownItem {
  name: string;
  quantity: number;
  pricePerUnit: number;
  itemSubtotal: number;
  taxPercent: number;
  taxAmount: number;
  isTaxInclusive?: boolean;
  isDefaultRate?: boolean;
}

interface VisitingChargeBreakdown {
  amount: number;
  baseAmount: number;
  taxPercent: number;
  taxAmount: number;
  isTaxInclusive?: boolean;
  isDefaultRate?: boolean;
}

interface TaxBreakdownDisplayProps {
  items: BreakdownItem[];
  visitingCharge?: VisitingChargeBreakdown | null;
  platformFees?: AppliedPlatformFeeItem[]; // Added platformFees prop
  subTotalBeforeDiscount: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  defaultTaxRatePercent: number;
}


const getBasePriceForDisplay = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
    if (isTaxInclusive && taxPercent && taxPercent > 0) {
      return displayedPrice / (1 + taxPercent / 100);
    }
    return displayedPrice;
  };

export default function TaxBreakdownDisplay({
  items,
  visitingCharge,
  platformFees, // Destructure platformFees
  subTotalBeforeDiscount,
  totalDiscount,
  totalTax,
  grandTotal,
  defaultTaxRatePercent,
}: TaxBreakdownDisplayProps) {

  const sumOfDisplayedItemSubtotals = items.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);
  const totalPlatformFeeBaseAmount = platformFees?.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0) || 0;
  const totalTaxOnPlatformFees = platformFees?.reduce((sum, fee) => sum + fee.taxAmountOnFee, 0) || 0;

  return (
    <div className="text-sm">
      <h4 className="text-md font-semibold mb-3">Tax Calculation Breakdown</h4>
      <ScrollArea className="pr-3 mb-3">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Item / Fee</TableHead>
              <TableHead className="text-right">Disp. Price / Amt (₹)</TableHead>
              <TableHead className="text-right">Base Amt (₹)</TableHead>
              <TableHead className="text-center">Tax (%)</TableHead>
              <TableHead className="text-right">Tax Amt (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const baseItemAmountForLine = item.itemSubtotal;
              return (
                <TableRow key={`item-${index}`}>
                  <TableCell>
                    {item.name} (x{item.quantity})
                    {item.isTaxInclusive && <span className="text-muted-foreground text-[10px] block">(Display price incl. tax)</span>}
                  </TableCell><TableCell className="text-right">{(item.pricePerUnit * item.quantity).toFixed(2)}</TableCell><TableCell className="text-right">{baseItemAmountForLine.toFixed(2)}</TableCell><TableCell className="text-center">{item.taxPercent.toFixed(1)}%</TableCell><TableCell className="text-right">{item.taxAmount.toFixed(2)}</TableCell>
                </TableRow>
              );
            })}
            {visitingCharge && visitingCharge.amount > 0 && (
              <TableRow key="visiting-charge">
                <TableCell>
                  Visiting Charge
                  {visitingCharge.isTaxInclusive && <span className="text-muted-foreground text-[10px] block">(Display amount incl. tax)</span>}
                </TableCell><TableCell className="text-right">{visitingCharge.amount.toFixed(2)}</TableCell><TableCell className="text-right">{visitingCharge.baseAmount.toFixed(2)}</TableCell><TableCell className="text-center">{visitingCharge.taxPercent.toFixed(1)}%</TableCell><TableCell className="text-right">{visitingCharge.taxAmount.toFixed(2)}</TableCell>
              </TableRow>
            )}
            {platformFees && platformFees.length > 0 && platformFees.map((fee, index) => (
                 <TableRow key={`platform-fee-${index}`}>
                    <TableCell>
                        {fee.name}
                        {fee.taxRatePercentOnFee > 0 && <span className="text-muted-foreground text-[10px] block">(Fee includes tax)</span>}
                    </TableCell><TableCell className="text-right">
                        {(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2)}
                    </TableCell><TableCell className="text-right">{fee.calculatedFeeAmount.toFixed(2)}</TableCell><TableCell className="text-center">{fee.taxRatePercentOnFee.toFixed(1)}%</TableCell><TableCell className="text-right">{fee.taxAmountOnFee.toFixed(2)}</TableCell>
                 </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <Separator className="my-2" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items Total (Displayed Prices):</span>
          <span>₹{sumOfDisplayedItemSubtotals.toFixed(2)}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span className="text-muted-foreground">Discount Applied:</span>
            <span>- ₹{totalDiscount.toFixed(2)}</span>
          </div>
        )}
         <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal (After Discount, Based on Displayed Prices):</span>
          <span>₹{(sumOfDisplayedItemSubtotals - totalDiscount).toFixed(2)}</span>
        </div>

        {visitingCharge && visitingCharge.amount > 0 && (
            <div className="flex justify-between">
            <span className="text-muted-foreground">Visiting Charge (Displayed):</span>
            <span>+ ₹{visitingCharge.amount.toFixed(2)}</span>
            </div>
        )}
        {totalPlatformFeeBaseAmount > 0 && (
            <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Fees (Base):</span>
                <span>+ ₹{totalPlatformFeeBaseAmount.toFixed(2)}</span>
            </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between font-semibold">
          <span className="text-muted-foreground">Taxable Amount (Items + VC + Fees - Discount):</span>
          <span>₹{(subTotalBeforeDiscount + (visitingCharge?.baseAmount || 0) + totalPlatformFeeBaseAmount - totalDiscount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-md">
          <span>Total Tax Payable:</span>
          <span>₹{totalTax.toFixed(2)}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between font-bold text-lg text-primary">
          <span>Grand Total:</span>
          <span>₹{grandTotal.toFixed(2)}</span>
        </div>
      </div>
       {items.some(item => item.isDefaultRate && item.taxPercent > 0) && (
        <p className="text-[10px] text-muted-foreground mt-3">
          *Default tax rate of {defaultTaxRatePercent}% may have been applied to items without a specific tax rate.
        </p>
      )}
    </div>
  );
}
