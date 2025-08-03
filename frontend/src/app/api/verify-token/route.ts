import { NextRequest, NextResponse } from 'next/server';
import jwt, { JsonWebTokenError } from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { user_token, currentPath } = await request.json();

    const secret = process.env.SUPABASE_JWT_SECRET!;

    const decoded = jwt.verify(user_token, secret);

    if (decoded) {
      // Return redirect information as JSON
      return NextResponse.json(
        {
          message: 'Authorized session',
          redirectUrl: currentPath,
          redirectParam: request.nextUrl.pathname,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      return NextResponse.json(
        {
          message: 'Malformed jwt token',
          redirectUrl: '/',
          redirectParam: request.nextUrl.pathname,
        },
        { status: 401 }
      );
    } else {
      return NextResponse.json(
        {
          message: 'Internal server error',
          redirectUrl: '/',
          redirectParam: request.nextUrl.pathname,
        },
        { status: 500 }
      );
    }
  }
}
