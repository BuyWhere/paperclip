import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { active: bigint; idle: bigint; total: bigint }[]
    >`
      SELECT
        count(*) FILTER (WHERE state = 'active') AS active,
        count(*) FILTER (WHERE state = 'idle')   AS idle,
        count(*)                                  AS total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `

    const pool = rows[0]

    return NextResponse.json({
      status: 'ok',
      db: {
        pool: {
          active: Number(pool.active),
          idle: Number(pool.idle),
          total: Number(pool.total),
        },
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        db: { error: err instanceof Error ? err.message : 'unknown' },
      },
      { status: 503 },
    )
  }
}
