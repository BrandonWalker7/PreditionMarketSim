'use client';

import { Radio } from 'lucide-react';

export function Header() {
  return <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(40,209,124,.18)]"><Radio className="size-4" /></span><span className="text-lg font-semibold tracking-tight">Master Better</span></div><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">Peer-to-peer markets</span></header>;
}
