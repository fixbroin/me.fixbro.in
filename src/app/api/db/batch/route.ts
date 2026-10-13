import { NextResponse, type NextRequest } from 'next/server';
import { getPool, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, isUserAdmin, isFieldProtectedFromCustomerMutation } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    // IMMUTABILITY GUARD FOR DEMO ADMIN:
    if (user.role === 'demo_admin') {
      return NextResponse.json({
        success: false,
        error: 'Demo Mode: Database modifications are disabled in demo mode. All actions are simulated.'
      }, { status: 403 });
    }

    const { operations = [] } = await request.json();
    const isAdmin = isUserAdmin(user);

    // Verify access and field-level security for all operations in the batch first
    for (const op of operations) {
      const pathToCheck = op.collection ? `${op.collection}/${op.id || ''}` : op.id || '';
      const isAllowed = validateAccess(user, pathToCheck, 'write');
      if (!isAllowed) {
        return NextResponse.json({ success: false, error: `Forbidden: No write access to "${pathToCheck}".` }, { status: 403 });
      }

      if (!isAdmin) {
        if (op.collection === 'users' || pathToCheck.startsWith('users/')) {
          if (op.data && typeof op.data === 'object') {
            for (const key of Object.keys(op.data)) {
              if (isFieldProtectedFromCustomerMutation(key)) {
                delete op.data[key];
              }
            }
          }
        }

        if (op.collection === 'bookings' || pathToCheck.startsWith('bookings/')) {
          if (op.action === 'deleteDoc' || op.action === 'setDoc') {
            return NextResponse.json({
              success: false,
              error: 'Forbidden: Bookings cannot be created, overwritten, or deleted in client batch operations.',
            }, { status: 403 });
          }
          if (op.data && typeof op.data === 'object') {
            if (op.data.status !== undefined && op.data.status !== 'Cancelled') {
              return NextResponse.json({
                success: false,
                error: 'Forbidden: Booking status changes must be processed via authoritative server endpoints.',
              }, { status: 403 });
            }
            const protectedBookingFields = [
              'paymentMethod',
              'razorpayPaymentId',
              'razorpayOrderId',
              'razorpaySignature',
              'stripeSessionId',
              'stripePaymentIntent',
              'totalAmount',
              'subTotal',
              'taxAmount',
              'visitingCharge',
              'platformFeeTotal',
              'appliedPlatformFees',
              'discountAmount',
              'discountCode',
              'bookingNumber',
              'bookingId',
              'providerId',
            ];
            for (const field of protectedBookingFields) {
              if (field in op.data) {
                delete op.data[field];
              }
            }
          }
        }

        if (op.collection === 'withdrawalRequests' || pathToCheck.startsWith('withdrawalRequests/')) {
          return NextResponse.json({
            success: false,
            error: 'Forbidden: Withdrawal requests cannot be modified in client batch operations.',
          }, { status: 403 });
        }
      }
    }

    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      for (const op of operations) {
        if (op.action === 'setDoc') {
          await setDocInternal(conn, op.collection, op.id, op.data, op.options);
        } else if (op.action === 'updateDoc') {
          await updateDocInternal(conn, op.collection, op.id, op.data);
        } else if (op.action === 'deleteDoc') {
          await deleteDocInternal(conn, op.collection, op.id);
        }
      }

      await conn.commit();
      return NextResponse.json({ success: true });
    } catch (err: any) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Batch transaction failed' },
      { status: 500 }
    );
  }
}
