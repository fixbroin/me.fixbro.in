
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart as BarChartIcon, DollarSign, ShoppingBag, CheckCircle, Clock, Loader2, PackageSearch, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltipRecharts } from 'recharts'; // Renamed to avoid conflict with ShadCN Tooltip
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FirestoreBooking } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useAuth } from "@/hooks/useAuth";
import PermissionGuard from "@/components/admin/PermissionGuard";



interface ReportData {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  activeBookings: number; // Confirmed or Processing
  bookingsPerMonth: { monthYear: string; bookings: number; earnings: number }[];
}

const chartConfig = {
  bookings: {
    label: "Bookings",
    color: "hsl(var(--chart-1))",
  },
  earnings: {
    label: "Earnings",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export default function AdminReportsPage() {
  const { stats: globalStats } = useAdminStats();
  const [reportData, setReportData] = useState<ReportData>({
    totalRevenue: 0,
    totalBookings: 0,
    completedBookings: 0,
    activeBookings: 0,
    bookingsPerMonth: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    console.log("AdminReportsPage: useEffect started");
    setIsLoading(true);
    setError(null); 
    const bookingsCollectionRef = collection(db, "bookings");
    const q = query(bookingsCollectionRef, orderBy("createdAt", "desc"), limit(500)); 

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log("AdminReportsPage: onSnapshot received data, docs count:", querySnapshot.docs.length);

      const fetchedBookings = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as FirestoreBooking));
      
      console.log("AdminReportsPage: fetchedBookings (first 5):", fetchedBookings.slice(0,5));


      if (querySnapshot.empty) {
        console.log("AdminReportsPage: No bookings found in snapshot.");
        setReportData({
          totalRevenue: 0,
          totalBookings: 0,
          completedBookings: 0,
          activeBookings: 0,
          bookingsPerMonth: [],
        });
        setIsLoading(false);
        return;
      }

      let newTotalRevenue = 0;
      const newTotalBookings = fetchedBookings.length;
      let newCompletedBookings = 0;
      let newActiveBookings = 0;
      const monthlyBookingsData: { [key: string]: { monthYear: string; bookings: number; earnings: number } } = {};

      fetchedBookings.forEach(booking => {
        // Only count revenue for COMPLETED bookings to match Dashboard logic
        if (booking.status === "Completed") {
          newTotalRevenue += booking.totalAmount || 0;
          newCompletedBookings++;
        }
        
        if (booking.status === "Confirmed" || booking.status === "Processing") {
          newActiveBookings++;
        }

        // Aggregate bookings by month - DEFENSIVE CODING
        if (typeof booking.scheduledDate !== 'string' || !booking.scheduledDate) {
          console.warn(`Booking ID ${booking.id} has invalid or missing scheduledDate type: '${booking.scheduledDate}'. Skipping for chart aggregation.`);
          return; 
        }
        
        const scheduledDateObj = new Date(booking.scheduledDate);
        if (isNaN(scheduledDateObj.getTime())) {
          console.warn(`Invalid scheduledDate format for booking ID ${booking.id}: '${booking.scheduledDate}'. Skipping for chart aggregation.`);
          return; 
        }
        
        const year = scheduledDateObj.getFullYear();
        const month = scheduledDateObj.getMonth() + 1; // JavaScript months are 0-indexed
        const monthYear = `${year}-${month.toString().padStart(2, '0')}`;
        
        if (!monthlyBookingsData[monthYear]) {
          monthlyBookingsData[monthYear] = { monthYear, bookings: 0, earnings: 0 };
        }
        monthlyBookingsData[monthYear].bookings++;
        if (booking.status === "Completed") {
          monthlyBookingsData[monthYear].earnings += booking.totalAmount || 0;
        }
      });
      
      const calculatedReportData: ReportData = {
        totalRevenue: newTotalRevenue,
        totalBookings: newTotalBookings,
        completedBookings: newCompletedBookings,
        activeBookings: newActiveBookings,
        bookingsPerMonth: Object.values(monthlyBookingsData).sort((a, b) => a.monthYear.localeCompare(b.monthYear)),
      };

      console.log("AdminReportsPage: Processed reportData:", calculatedReportData);
      setReportData(calculatedReportData);
      setIsLoading(false);
    }, (err) => {
      console.error("AdminReportsPage: Error fetching booking data for reports: ", err);
      setError("Failed to load report data. Check console for details.");
      setIsLoading(false);
      toast({
        title: "Error Loading Reports",
        description: err.message,
        variant: "destructive"
      })
    });

    return () => {
      console.log("AdminReportsPage: useEffect cleanup, unsubscribing.");
      unsubscribe();
    };
  }, [toast]);

  console.log("AdminReportsPage: Rendering component. isLoading:", isLoading, "error:", error, "reportData.totalBookings:", reportData.totalBookings);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Generating reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Reports</h2>
        <p className="text-destructive-foreground bg-destructive/10 p-3 rounded-md">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-6">Try Again</Button>
      </div>
    );
  }

  if (reportData.totalBookings === 0 && !isLoading) { // Ensure isLoading is false
    return (
      <div className="text-center py-10">
        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Booking Data Available</h2>
        <p className="text-muted-foreground">Cannot generate reports as there are no bookings yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <BarChartIcon className="mr-2 h-6 w-6 text-primary" /> Reports Overview
          </CardTitle>
          <CardDescription>
            Summary of booking activities and revenue.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{(globalStats?.completedRevenue ?? reportData.totalRevenue).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.totalBookings ?? reportData.totalBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Bookings</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.completedBookings ?? reportData.completedBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.activeBookings}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Bookings Per Month</CardTitle>
          <CardDescription>Visual representation of bookings over time.</CardDescription>
        </CardHeader>
        <CardContent>
          {reportData.bookingsPerMonth.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart accessibilityLayer data={reportData.bookingsPerMonth}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="monthYear"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (typeof value !== 'string' || !value.includes('-')) {
                      // console.warn("XAxis tickFormatter: unexpected value", value);
                      return String(value); // Fallback for unexpected values
                    }
                    try {
                      // value is "YYYY-MM"
                      const [year, month] = value.split('-');
                      // Create date as UTC to avoid timezone issues if only month/year is relevant
                      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
                      if (isNaN(date.getTime())) {
                        // console.warn("XAxis tickFormatter: invalid date from value", value);
                        return value;
                      }
                      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                    } catch {
                      return value; // Fallback
                    }
                  }}
                />
                <YAxis allowDecimals={false} />
                <ChartTooltipRecharts cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="bookings" fill="var(--color-bookings)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-center py-4">Not enough data to display monthly booking chart.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Earnings Per Month</CardTitle>
          <CardDescription>Visual representation of revenue over time (completed bookings only).</CardDescription>
        </CardHeader>
        <CardContent>
          {reportData.bookingsPerMonth.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart accessibilityLayer data={reportData.bookingsPerMonth}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="monthYear"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (typeof value !== 'string' || !value.includes('-')) {
                      return String(value);
                    }
                    try {
                      const [year, month] = value.split('-');
                      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
                      if (isNaN(date.getTime())) return value;
                      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                    } catch {
                      return value;
                    }
                  }}
                />
                <YAxis 
                  tickFormatter={(value) => `₹${value.toLocaleString()}`}
                />
                <ChartTooltipRecharts 
                  cursor={{ fill: 'hsl(var(--muted))' }} 
                  content={
                    <ChartTooltipContent 
                      hideLabel 
                      formatter={(value) => `₹${Number(value).toLocaleString()}`}
                    />
                  } 
                />
                <Bar dataKey="earnings" fill="var(--color-earnings)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-center py-4">Not enough data to display monthly earnings chart.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

