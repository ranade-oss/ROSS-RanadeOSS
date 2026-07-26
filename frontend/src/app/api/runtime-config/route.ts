import { NextResponse } from "next/server";
import { readRossRuntimeConfig } from "@/app/lib/runtimeConfig.server";

export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json(readRossRuntimeConfig(), {
        headers: {
            "Cache-Control": "no-store",
        },
    });
}
