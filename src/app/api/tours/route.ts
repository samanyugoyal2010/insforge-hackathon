import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

export async function POST(req: Request) {
  const { title, address } = await req.json();
  if (!title || !address) {
    return NextResponse.json({ error: "title and address required" }, { status: 400 });
  }

  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.database
    .from("tours")
    .insert([{ title, address }])
    .select();

  if (error || !data?.[0]) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json({ id: data[0].id }, { status: 201 });
}

export async function GET() {
  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.database
    .from("tours")
    .select("id, title, address, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
