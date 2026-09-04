'use client';

import { FormEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from './field';

export function JoinForm({ username, setUsername, code, setCode, onSubmit, error, back }: { username: string; setUsername: (v: string) => void; code: string; setCode: (v: string) => void; onSubmit: (e: FormEvent) => void; error: string; back: () => void }) {
  return <section className="mx-auto max-w-lg px-5 py-16"><Button variant="ghost" onClick={back} className="mb-5"><ArrowLeft /> Back</Button><form onSubmit={onSubmit} className="rounded-[2rem] border bg-card p-7 shadow-sm md:p-9"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Join a bet</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Make your call.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the bet code your host shared. You’ll get $100,000 in play money when you connect.</p><div className="mt-7 grid gap-5"><Field label="Bet code"><Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GAME-NIGHT" className="h-14 text-center font-mono text-xl uppercase tracking-[.22em]" maxLength={12} /></Field><Field label="Your display name"><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Brandon" className="h-11" maxLength={24} /></Field></div>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-7 h-12 w-full rounded-xl">Enter bet <ArrowRight /></Button></form></section>;
}
