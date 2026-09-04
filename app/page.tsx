'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Activity, ArrowLeft, ArrowRight, Check, CircleDollarSign,
  Clock, Copy, Crown, LockKeyhole, LogOut, PartyPopper, Plus, Radio,
  Sparkles, TrendingUp, Trophy, Users, X,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Screen = 'home' | 'host' | 'join' | 'room';
type Outcome = { id: string; label: string; pool: number; color: string };
type Payout = { name: string; stake: number; share: number; payout: number; profit: number };
type Market = {
  title: string;
  outcomes: Outcome[];
  history: Array<Record<string, number | string>>;
  closesAt: string;
  status: 'open' | 'closed' | 'resolved';
  winnerId?: string;
  payouts?: Payout[];
};
type Player = { name: string; balance: number; holdings: Record<string, number>; stakes: Record<string, number>; host?: boolean };
type ActivityItem = { id: string; text: string; time: string };
type Snapshot = { type: 'snapshot'; market: Market; players: Player[]; activity: ActivityItem[] };
type TradeMessage = { type: 'trade'; outcomeId: string; amount: number; name: string };
type Session = { role: 'host' | 'guest'; roomCode: string; username: string };

const COLORS = ['#28d17c', '#f05252', '#43a6f0', '#f1b94e', '#a77bf3', '#32c7c4'];
const SIGNAL_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';

function uid() { return Math.random().toString(36).slice(2, 10); }
function betCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function odds(outcomes: Outcome[], id: string) {
  const total = outcomes.reduce((sum, item) => sum + item.pool, 0);
  return total ? Math.round((outcomes.find((item) => item.id === id)?.pool || 0) / total * 100) : 0;
}
function now() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [marketTitle, setMarketTitle] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [scenarioLabels, setScenarioLabels] = useState(['', '']);
  const [market, setMarket] = useState<Market | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState(50);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const channelsRef = useRef(new Map<string, RTCDataChannel>());
  const peerNamesRef = useRef(new Map<string, string>());
  const marketRef = useRef<Market | null>(null);
  const playersRef = useRef<Player[]>([]);
  const activityRef = useRef<ActivityItem[]>([]);

  useEffect(() => { marketRef.current = market; }, [market]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { activityRef.current = activity; }, [activity]);

  const broadcast = useCallback((nextMarket: Market, nextPlayers: Player[], nextActivity: ActivityItem[]) => {
    const payload: Snapshot = { type: 'snapshot', market: nextMarket, players: nextPlayers, activity: nextActivity };
    channelsRef.current.forEach((channel) => {
      if (channel.readyState === 'open') channel.send(JSON.stringify(payload));
    });
  }, []);

  const executeTrade = useCallback((name: string, outcomeId: string, tradeAmount: number) => {
    const currentMarket = marketRef.current;
    const currentPlayers = playersRef.current;
    const player = currentPlayers.find((item) => item.name === name);
    if (!currentMarket || currentMarket.status !== 'open' || Date.now() >= new Date(currentMarket.closesAt).getTime() || !player || tradeAmount <= 0 || player.balance < tradeAmount) return;
    const currentPrice = Math.max(.01, odds(currentMarket.outcomes, outcomeId) / 100);
    const shares = tradeAmount / currentPrice;
    const nextOutcomes = currentMarket.outcomes.map((item) => item.id === outcomeId ? { ...item, pool: item.pool + tradeAmount } : item);
    const point: Record<string, number | string> = { tick: `${currentMarket.history.length + 1}` };
    nextOutcomes.forEach((item) => { point[item.id] = odds(nextOutcomes, item.id); });
    const nextMarket = { ...currentMarket, outcomes: nextOutcomes, history: [...currentMarket.history, point].slice(-18) };
    const nextPlayers = currentPlayers.map((item) => item.name === name ? {
      ...item, balance: item.balance - tradeAmount,
      holdings: { ...item.holdings, [outcomeId]: (item.holdings[outcomeId] || 0) + shares },
      stakes: { ...item.stakes, [outcomeId]: (item.stakes[outcomeId] || 0) + tradeAmount },
    } : item);
    const label = nextOutcomes.find((item) => item.id === outcomeId)?.label;
    const nextActivity = [{ id: uid(), text: `${name} put $${tradeAmount} on ${label}`, time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; playersRef.current = nextPlayers; activityRef.current = nextActivity;
    setMarket(nextMarket); setPlayers(nextPlayers); setActivity(nextActivity);
    broadcast(nextMarket, nextPlayers, nextActivity);
  }, [broadcast]);

  const closeBet = useCallback(() => {
    const currentMarket = marketRef.current;
    if (!currentMarket || currentMarket.status !== 'open') return;
    const nextMarket: Market = { ...currentMarket, status: 'closed' };
    const nextActivity = [{ id: uid(), text: 'Betting has closed', time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; activityRef.current = nextActivity;
    setMarket(nextMarket); setActivity(nextActivity);
    broadcast(nextMarket, playersRef.current, nextActivity);
  }, [broadcast]);

  const resolveBet = useCallback((winnerId: string) => {
    const currentMarket = marketRef.current;
    if (!currentMarket || currentMarket.status !== 'closed') return;
    const totalPot = playersRef.current.reduce((sum, player) => sum + Object.values(player.stakes).reduce((a, b) => a + b, 0), 0);
    const winningPool = playersRef.current.reduce((sum, player) => sum + (player.stakes[winnerId] || 0), 0);
    const payouts: Payout[] = playersRef.current
      .filter((player) => (player.stakes[winnerId] || 0) > 0)
      .map((player) => {
        const stake = player.stakes[winnerId] || 0;
        const share = winningPool ? stake / winningPool : 0;
        const payout = share * totalPot;
        const totalInvested = Object.values(player.stakes).reduce((a, b) => a + b, 0);
        return { name: player.name, stake, share, payout, profit: payout - totalInvested };
      })
      .sort((a, b) => b.payout - a.payout);
    const nextPlayers = playersRef.current.map((player) => ({ ...player, balance: player.balance + (payouts.find((item) => item.name === player.name)?.payout || 0) }));
    const nextMarket: Market = { ...currentMarket, status: 'resolved', winnerId, payouts };
    const winner = currentMarket.outcomes.find((item) => item.id === winnerId)?.label || 'Winner';
    const nextActivity = [{ id: uid(), text: `${winner} won — payouts sent`, time: now() }, ...activityRef.current].slice(0, 8);
    marketRef.current = nextMarket; playersRef.current = nextPlayers; activityRef.current = nextActivity;
    setMarket(nextMarket); setPlayers(nextPlayers); setActivity(nextActivity);
    broadcast(nextMarket, nextPlayers, nextActivity);
  }, [broadcast]);

  useEffect(() => {
    if (session?.role !== 'host' || !market || market.status !== 'open') return;
    const remaining = new Date(market.closesAt).getTime() - Date.now();
    if (remaining <= 0) { closeBet(); return; }
    const timer = window.setTimeout(closeBet, remaining);
    return () => window.clearTimeout(timer);
  }, [closeBet, market, session?.role]);

  const setupChannel = useCallback((peerId: string, channel: RTCDataChannel) => {
    channelsRef.current.set(peerId, channel);
    channel.onopen = () => {
      setConnection('live');
      if (session?.role === 'host' && marketRef.current) broadcast(marketRef.current, playersRef.current, activityRef.current);
    };
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data) as Snapshot | TradeMessage;
      if (message.type === 'snapshot' && session?.role === 'guest') {
        marketRef.current = message.market; playersRef.current = message.players; activityRef.current = message.activity;
        setMarket(message.market); setPlayers(message.players); setActivity(message.activity); setConnection('live');
      }
      if (message.type === 'trade' && session?.role === 'host') executeTrade(message.name, message.outcomeId, message.amount);
    };
    channel.onclose = () => { channelsRef.current.delete(peerId); if (session?.role === 'guest') setConnection('offline'); };
  }, [broadcast, executeTrade, session?.role]);

  useEffect(() => {
    if (!session) return;
    const socket = io(SIGNAL_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const createPeer = (peerId: string, initiator: boolean) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peersRef.current.set(peerId, pc);
      pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('signal', { target: peerId, data: { candidate } }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setConnection('live'); };
      pc.ondatachannel = (event) => setupChannel(peerId, event.channel);
      if (initiator) setupChannel(peerId, pc.createDataChannel('master-better'));
      return pc;
    };
    socket.on('connect', () => {
      setConnection('connecting');
      if (session.role === 'host') socket.emit('create-room', { code: session.roomCode, name: session.username }, (reply: { ok: boolean; error?: string }) => {
        if (!reply.ok) { setError(reply.error || 'That bet code is already being used.'); setSession(null); setScreen('host'); }
      });
      else socket.emit('join-room', { code: session.roomCode, name: session.username }, (reply: { ok: boolean; error?: string }) => {
        if (!reply.ok) { setError(reply.error || 'Could not join that bet.'); setSession(null); setScreen('join'); }
      });
    });
    socket.on('peer-joined', async ({ peerId, name }: { peerId: string; name: string }) => {
      peerNamesRef.current.set(peerId, name);
      const nextPlayers = playersRef.current.some((item) => item.name === name) ? playersRef.current : [...playersRef.current, { name, balance: 1000, holdings: {}, stakes: {} }];
      const nextActivity = [{ id: uid(), text: `${name} joined the bet`, time: now() }, ...activityRef.current].slice(0, 8);
      playersRef.current = nextPlayers; activityRef.current = nextActivity; setPlayers(nextPlayers); setActivity(nextActivity);
      const pc = createPeer(peerId, true);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit('signal', { target: peerId, data: { description: pc.localDescription } });
    });
    socket.on('signal', async ({ from, data }: { from: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      const pc = createPeer(from, false);
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          socket.emit('signal', { target: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) await pc.addIceCandidate(data.candidate);
    });
    socket.on('room-closed', () => { setConnection('offline'); setError('The host closed this bet.'); });
    socket.on('connect_error', () => setConnection('offline'));
    return () => {
      peersRef.current.forEach((pc) => pc.close()); peersRef.current.clear(); channelsRef.current.clear(); socket.disconnect();
    };
  }, [session, setupChannel]);

  const startHosting = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const labels = scenarioLabels.map((item) => item.trim()).filter(Boolean);
    const normalizedCode = customCode.trim().toUpperCase();
    if (!username.trim() || !marketTitle.trim() || labels.length < 2 || !closesAt) { setError('Add your name, a question, a closing time, and at least two scenarios.'); return; }
    if (normalizedCode && !/^[A-Z0-9-]{4,12}$/.test(normalizedCode)) { setError('Your custom bet code must be 4–12 letters, numbers, or hyphens.'); return; }
    if (new Date(closesAt).getTime() <= Date.now()) { setError('Choose a closing time in the future.'); return; }
    const outcomes = labels.map((label, index) => ({ id: `outcome-${index}`, label, pool: 100, color: COLORS[index % COLORS.length] }));
    const firstPoint: Record<string, number | string> = { tick: 'Start' };
    outcomes.forEach((item) => { firstPoint[item.id] = Math.round(100 / outcomes.length); });
    const initialMarket: Market = { title: marketTitle.trim(), outcomes, history: [firstPoint], closesAt: new Date(closesAt).toISOString(), status: 'open' };
    const initialPlayers = [{ name: username.trim(), balance: 1000, holdings: {}, stakes: {}, host: true }];
    const initialActivity = [{ id: uid(), text: `${username.trim()} opened the market`, time: now() }];
    marketRef.current = initialMarket; playersRef.current = initialPlayers; activityRef.current = initialActivity;
    setMarket(initialMarket); setPlayers(initialPlayers); setActivity(initialActivity);
    setSelected(outcomes[0].id); setSession({ role: 'host', roomCode: normalizedCode || betCode(), username: username.trim() }); setScreen('room');
  };

  const joinRoom = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!username.trim() || joinCode.trim().length < 4) { setError('Enter your name and a valid bet code.'); return; }
    setSession({ role: 'guest', roomCode: joinCode.trim().toUpperCase(), username: username.trim() }); setMarket(null); setScreen('room');
  };

  const placeTrade = () => {
    if (!session || !selected || amount <= 0 || marketRef.current?.status !== 'open') return;
    if (session.role === 'host') executeTrade(session.username, selected, amount);
    else {
      const channel = [...channelsRef.current.values()].find((item) => item.readyState === 'open');
      channel?.send(JSON.stringify({ type: 'trade', outcomeId: selected, amount, name: session.username } satisfies TradeMessage));
    }
  };

  const copyInvite = async () => {
    if (!session) return;
    const url = `${window.location.origin}?bet=${session.roomCode}`;
    await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('bet') || params.get('room');
    if (code) { setJoinCode(code.toUpperCase()); setScreen('join'); }
  }, []);

  if (screen === 'room' && session) return <BetView session={session} market={market} players={players} activity={activity} connection={connection} selected={selected} setSelected={setSelected} amount={amount} setAmount={setAmount} placeTrade={placeTrade} resolveBet={resolveBet} copyInvite={copyInvite} copied={copied} leave={() => { setSession(null); setScreen('home'); }} error={error} />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      {screen === 'home' ? (
        <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pt-24">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><Sparkles className="size-3.5" /> Your bet. Your crowd. Your call.</div>
            <h1 className="font-heading text-5xl font-semibold leading-[.98] tracking-[-.055em] md:text-7xl">Turn friendly debates into live markets.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">Create a private bet in seconds. Invite your people, trade with play money, and watch the crowd’s confidence move in real time.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Users className="size-4 text-primary" /> No account needed</span><span className="flex items-center gap-2"><Radio className="size-4 text-primary" /> Live peer sync</span></div>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-6 shadow-[0_30px_100px_-40px_rgba(20,32,31,.4)] md:p-8">
            <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Start predicting</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose your side of the bet</h2>
            <div className="mt-7 grid gap-3">
              <Button onClick={() => setScreen('host')} className="h-auto justify-between rounded-2xl px-5 py-5 text-left" size="lg"><span><span className="block text-base">Host a prediction</span><span className="mt-1 block text-xs font-normal opacity-70">Create scenarios and invite your group</span></span><ArrowRight className="size-5" /></Button>
              <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">or join</span><span className="h-px flex-1 bg-border" /></div>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} aria-label="Bet code" className="h-12 rounded-xl bg-background px-4 font-mono uppercase tracking-[.25em] placeholder:text-primary placeholder:opacity-100" placeholder="BET CODE" maxLength={12} /><Button onClick={() => setScreen('join')} variant="outline" className="h-12 rounded-xl px-5">Join bet</Button></div>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Everyone starts with <strong className="font-semibold text-foreground">$1,000</strong> in play money.</p>
          </div>
        </section>
      ) : screen === 'host' ? (
        <HostForm username={username} setUsername={setUsername} marketTitle={marketTitle} setMarketTitle={setMarketTitle} customCode={customCode} setCustomCode={setCustomCode} closesAt={closesAt} setClosesAt={setClosesAt} labels={scenarioLabels} setLabels={setScenarioLabels} onSubmit={startHosting} error={error} back={() => setScreen('home')} />
      ) : (
        <JoinForm username={username} setUsername={setUsername} code={joinCode} setCode={setJoinCode} onSubmit={joinRoom} error={error} back={() => setScreen('home')} />
      )}
      {screen === 'home' && <section className="mt-4 border-t border-border/70 bg-card/50"><div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 text-sm text-muted-foreground sm:grid-cols-3 md:px-10"><p><strong className="block text-foreground">01 · Create</strong> Add as many possible outcomes as you need.</p><p><strong className="block text-foreground">02 · Invite</strong> Share one custom bet code with friends.</p><p><strong className="block text-foreground">03 · Trade</strong> Buy positions and watch the odds respond.</p></div></section>}
    </main>
  );
}

function Header() {
  return <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(40,209,124,.18)]"><Radio className="size-4" /></span><span className="text-lg font-semibold tracking-tight">Master Better</span></div><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">Peer-to-peer markets</span></header>;
}

function HostForm({ username, setUsername, marketTitle, setMarketTitle, customCode, setCustomCode, closesAt, setClosesAt, labels, setLabels, onSubmit, error, back }: { username: string; setUsername: (v: string) => void; marketTitle: string; setMarketTitle: (v: string) => void; customCode: string; setCustomCode: (v: string) => void; closesAt: string; setClosesAt: (v: string) => void; labels: string[]; setLabels: (v: string[]) => void; onSubmit: (e: FormEvent) => void; error: string; back: () => void }) {
  return <section className="mx-auto max-w-2xl px-5 py-10 md:px-10"><Button variant="ghost" onClick={back} className="mb-5"><ArrowLeft /> Back</Button><form onSubmit={onSubmit} className="rounded-[2rem] border bg-card p-6 shadow-sm md:p-9"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">New bet</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">What will everyone predict?</h1><div className="mt-8 grid gap-5"><Field label="Your name"><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Brandon" className="h-11" maxLength={24} /></Field><Field label="Prediction question"><Input value={marketTitle} onChange={(e) => setMarketTitle(e.target.value)} placeholder="e.g. Who will win game night?" className="h-11" maxLength={90} /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Custom bet code (optional)"><Input value={customCode} onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="GAME-NIGHT" className="h-11 font-mono uppercase tracking-[.12em] placeholder:text-primary/70" maxLength={12} /></Field><Field label="Betting closes"><Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="h-11 [color-scheme:dark]" /></Field></div><Field label="Possible scenarios"><div className="grid gap-2">{labels.map((label, index) => <div className="flex gap-2" key={index}><span className="grid size-11 shrink-0 place-items-center rounded-xl text-xs font-bold" style={{ background: `${COLORS[index % COLORS.length]}18`, color: COLORS[index % COLORS.length] }}>{String.fromCharCode(65 + index)}</span><Input value={label} onChange={(e) => setLabels(labels.map((item, i) => i === index ? e.target.value : item))} placeholder={index === 0 ? 'First outcome' : 'Another outcome'} className="h-11" />{labels.length > 2 && <Button type="button" variant="ghost" size="icon" className="h-11" onClick={() => setLabels(labels.filter((_, i) => i !== index))}><X /></Button>}</div>)}<Button type="button" variant="outline" className="mt-1 justify-start" disabled={labels.length >= 6} onClick={() => setLabels([...labels, ''])}><Plus /> Add scenario</Button></div></Field></div>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-7 h-12 w-full rounded-xl">Open bet <ArrowRight /></Button></form></section>;
}

function JoinForm({ username, setUsername, code, setCode, onSubmit, error, back }: { username: string; setUsername: (v: string) => void; code: string; setCode: (v: string) => void; onSubmit: (e: FormEvent) => void; error: string; back: () => void }) {
  return <section className="mx-auto max-w-lg px-5 py-16"><Button variant="ghost" onClick={back} className="mb-5"><ArrowLeft /> Back</Button><form onSubmit={onSubmit} className="rounded-[2rem] border bg-card p-7 shadow-sm md:p-9"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Join a bet</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Make your call.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the bet code your host shared. You’ll get $1,000 in play money when you connect.</p><div className="mt-7 grid gap-5"><Field label="Bet code"><Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GAME-NIGHT" className="h-14 text-center font-mono text-xl uppercase tracking-[.22em]" maxLength={12} /></Field><Field label="Your display name"><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Brandon" className="h-11" maxLength={24} /></Field></div>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-7 h-12 w-full rounded-xl">Enter bet <ArrowRight /></Button></form></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium"><span>{label}</span>{children}</label>; }

function RoomView({ session, market, players, activity, connection, selected, setSelected, amount, setAmount, placeTrade, copyInvite, copied, leave, error }: { session: Session; market: Market | null; players: Player[]; activity: ActivityItem[]; connection: string; selected: string; setSelected: (v: string) => void; amount: number; setAmount: (v: number) => void; placeTrade: () => void; copyInvite: () => void; copied: boolean; leave: () => void; error: string }) {
  const me = players.find((item) => item.name === session.username);
  const chartConfig = useMemo(() => Object.fromEntries((market?.outcomes || []).map((item) => [item.id, { label: item.label, color: item.color }])) as ChartConfig, [market]);
  if (!market) return <main className="grid min-h-screen place-items-center bg-background px-5"><div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-6 animate-pulse" /></span><h1 className="mt-5 text-2xl font-semibold">Connecting to bet {session.roomCode}</h1><p className="mt-2 text-sm text-muted-foreground">Waiting for a secure peer connection…</p>{error && <p className="mt-4 text-sm text-destructive">{error}</p>}<Button onClick={leave} variant="outline" className="mt-6">Back home</Button></div></main>;
  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 md:px-7"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(40,209,124,.18)]"><Radio className="size-4" /></span><div><p className="text-sm font-semibold">Master Better</p><p className="text-[11px] text-muted-foreground">Bet {session.roomCode}</p></div></div><div className="flex items-center gap-2"><span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:flex ${connection === 'live' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}><span className={`size-1.5 rounded-full ${connection === 'live' ? 'bg-primary' : 'bg-muted-foreground'}`} />{connection === 'live' ? 'Peer sync live' : connection}</span><Button variant="outline" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Invite'}</Button><Button variant="ghost" size="icon" onClick={leave}><LogOut /></Button></div></div></header>
    <div className="mx-auto grid max-w-[1500px] gap-4 p-4 md:p-7 lg:grid-cols-[240px_minmax(0,1fr)_290px]">
      <aside className="order-2 rounded-2xl border bg-card p-4 lg:order-1"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Players</p><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold">{players.length}</span></div><div className="mt-4 grid gap-2">{players.map((player) => <div key={player.name} className={`rounded-xl p-3 ${player.name === session.username ? 'bg-primary/10' : 'bg-background'}`}><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{player.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{player.name} {player.host && <Crown className="ml-1 inline size-3 text-[#d58d3d]" />}</p><p className="font-mono text-xs text-muted-foreground">${Math.round(player.balance).toLocaleString()}</p></div></div></div>)}</div><div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Recent activity</p><div className="mt-3 grid gap-3">{activity.slice(0, 5).map((item) => <div key={item.id} className="flex gap-2 text-xs leading-5"><Activity className="mt-0.5 size-3.5 shrink-0 text-primary" /><p><span>{item.text}</span><span className="block text-[10px] text-muted-foreground">{item.time}</span></p></div>)}</div></div></aside>
      <section className="order-1 min-w-0 lg:order-2"><div className="rounded-2xl border bg-card p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Live market</p><h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">{market.title}</h1><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{market.outcomes.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`rounded-2xl border p-4 text-left transition ${selected === item.id ? 'border-primary bg-primary/5 ring-2 ring-primary/10' : 'bg-background hover:border-primary/40'}`}><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{item.label}</span><span className="text-2xl font-semibold tracking-tight" style={{ color: item.color }}>{odds(market.outcomes, item.id)}%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${odds(market.outcomes, item.id)}%`, background: item.color }} /></div><p className="mt-2 text-[11px] text-muted-foreground">${item.pool.toLocaleString()} backing this outcome</p></button>)}</div><div className="mt-8 rounded-2xl bg-background p-4 md:p-6"><div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-semibold">Crowd confidence</p><p className="text-xs text-muted-foreground">Probability shifts after every trade</p></div><TrendingUp className="size-5 text-primary" /></div><ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto"><AreaChart data={market.history} margin={{ left: -18, right: 8, top: 8 }}><defs>{market.outcomes.map((item) => <linearGradient key={item.id} id={`fill-${item.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={item.color} stopOpacity={.24}/><stop offset="95%" stopColor={item.color} stopOpacity={0}/></linearGradient>)}</defs><CartesianGrid vertical={false} strokeDasharray="4 4" /><XAxis dataKey="tick" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltipContent />} />{market.outcomes.map((item) => <Area key={item.id} type="monotone" dataKey={item.id} stroke={item.color} fill={`url(#fill-${item.id})`} strokeWidth={2.5} dot={market.history.length < 3} animationDuration={350} />)}</AreaChart></ChartContainer></div></div></section>
      <aside className="order-3"><div className="sticky top-24 rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Your position</p><span className="flex items-center gap-1 text-sm font-semibold text-primary"><CircleDollarSign className="size-4" />${Math.round(me?.balance ?? 1000).toLocaleString()}</span></div><h2 className="mt-5 text-lg font-semibold">Back an outcome</h2><div className="mt-4 grid gap-2">{market.outcomes.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm ${selected === item.id ? 'border-primary bg-primary/5' : 'bg-background'}`}><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span><span className="font-mono text-xs">{odds(market.outcomes, item.id)}¢</span></button>)}</div><label className="mt-5 block text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Amount</label><div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input type="number" min={1} max={Math.floor(me?.balance ?? 1000)} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="h-12 pl-7 font-mono text-base" /></div><div className="mt-2 grid grid-cols-4 gap-1">{[25, 50, 100, 250].map((value) => <Button key={value} variant="outline" size="sm" onClick={() => setAmount(value)}>${value}</Button>)}</div><Button onClick={placeTrade} disabled={!selected || amount <= 0 || amount > (me?.balance ?? 1000) || connection !== 'live' && session.role === 'guest'} className="mt-5 h-12 w-full rounded-xl">Place prediction <ArrowRight /></Button><p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">Play money only. No real currency or prizes.</p><div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Your holdings</p><div className="mt-3 grid gap-2">{market.outcomes.filter((item) => (me?.holdings[item.id] || 0) > 0).map((item) => <div key={item.id} className="flex justify-between text-xs"><span>{item.label}</span><span className="font-mono">{(me?.holdings[item.id] || 0).toFixed(1)} shares</span></div>)}{!Object.values(me?.holdings || {}).some(Boolean) && <p className="text-xs text-muted-foreground">No positions yet.</p>}</div></div></div></aside>
    </div>
  </main>;
}

function BetView({ session, market, players, activity, connection, selected, setSelected, amount, setAmount, placeTrade, resolveBet, copyInvite, copied, leave, error }: { session: Session; market: Market | null; players: Player[]; activity: ActivityItem[]; connection: string; selected: string; setSelected: (v: string) => void; amount: number; setAmount: (v: number) => void; placeTrade: () => void; resolveBet: (winnerId: string) => void; copyInvite: () => void; copied: boolean; leave: () => void; error: string }) {
  const [winnerChoice, setWinnerChoice] = useState('');
  const me = players.find((item) => item.name === session.username);
  const chartConfig = useMemo(() => Object.fromEntries((market?.outcomes || []).map((item) => [item.id, { label: item.label, color: item.color }])) as ChartConfig, [market]);
  if (!market) return <main className="grid min-h-screen place-items-center bg-background px-5"><div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-6 animate-pulse" /></span><h1 className="mt-5 text-2xl font-semibold">Connecting to bet {session.roomCode}</h1><p className="mt-2 text-sm text-muted-foreground">Waiting for a secure peer connection…</p>{error && <p className="mt-4 text-sm text-destructive">{error}</p>}<Button onClick={leave} variant="outline" className="mt-6">Back home</Button></div></main>;
  const winner = market.outcomes.find((item) => item.id === market.winnerId);
  const totalPot = players.reduce((sum, player) => sum + Object.values(player.stakes).reduce((a, b) => a + b, 0), 0);
  const canTrade = market.status === 'open' && Date.now() < new Date(market.closesAt).getTime();
  const statusLabel = market.status === 'open' ? `Closes ${new Date(market.closesAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : market.status === 'closed' ? 'Betting closed · awaiting result' : 'Result finalized';

  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 md:px-7"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(40,209,124,.18)]"><Radio className="size-4" /></span><div><p className="text-sm font-semibold">Master Better</p><p className="text-[11px] text-muted-foreground">Bet {session.roomCode}</p></div></div><div className="flex items-center gap-2"><span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:flex ${connection === 'live' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}><span className={`size-1.5 rounded-full ${connection === 'live' ? 'bg-primary' : 'bg-muted-foreground'}`} />{connection === 'live' ? 'Peer sync live' : connection}</span><Button variant="outline" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Invite'}</Button><Button variant="ghost" size="icon" onClick={leave}><LogOut /></Button></div></div></header>

    {market.status === 'resolved' && winner && <section className="winner-banner relative isolate overflow-hidden border-b border-primary/30 bg-[linear-gradient(100deg,#0b2518,#153d28,#0b2518)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(40,209,124,.22),transparent_58%)]" />{Array.from({ length: 18 }).map((_, i) => <span key={i} className="winner-particle absolute size-2 rounded-sm" style={{ left: `${4 + i * 5.4}%`, top: `${16 + (i % 4) * 18}%`, background: i % 3 === 0 ? '#f05252' : i % 3 === 1 ? '#28d17c' : '#f1b94e', animationDelay: `${(i % 7) * .09}s` }} />)}<div className="relative mx-auto flex max-w-[1500px] flex-col items-center justify-center gap-3 px-5 py-8 text-center sm:flex-row sm:text-left"><span className="winner-trophy grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_45px_rgba(40,209,124,.5)]"><Trophy className="size-7" /></span><div><p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-primary sm:justify-start"><PartyPopper className="size-4" /> Winner announced</p><h2 className="mt-1 text-3xl font-black tracking-tight text-white md:text-4xl">{winner.label} wins!</h2><p className="mt-1 text-sm text-white/65">${totalPot.toLocaleString(undefined, { maximumFractionDigits: 0 })} total pot distributed to the winning bettors.</p></div></div></section>}

    <div className="mx-auto grid max-w-[1500px] gap-4 p-4 md:p-7 lg:grid-cols-[240px_minmax(0,1fr)_290px]">
      <aside className="order-2 rounded-2xl border bg-card p-4 lg:order-1"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Bettors</p><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold">{players.length}</span></div><div className="mt-4 grid gap-2">{players.map((player) => <div key={player.name} className={`rounded-xl p-3 ${player.name === session.username ? 'bg-primary/10' : 'bg-background'}`}><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{player.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{player.name} {player.host && <Crown className="ml-1 inline size-3 text-[#f1b94e]" />}</p><p className="font-mono text-xs text-muted-foreground">${Math.round(player.balance).toLocaleString()}</p></div></div></div>)}</div><div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Recent activity</p><div className="mt-3 grid gap-3">{activity.slice(0, 5).map((item) => <div key={item.id} className="flex gap-2 text-xs leading-5"><Activity className="mt-0.5 size-3.5 shrink-0 text-primary" /><p><span>{item.text}</span><span className="block text-[10px] text-muted-foreground">{item.time}</span></p></div>)}</div></div></aside>

      <section className="order-1 min-w-0 lg:order-2"><div className="rounded-2xl border bg-card p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">{market.status === 'open' ? 'Live bet' : market.status === 'closed' ? 'Bet closed' : 'Final result'}</p><h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">{market.title}</h1></div><span className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${market.status === 'open' ? 'border-primary/30 bg-primary/10 text-primary' : market.status === 'closed' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-primary'}`}>{market.status === 'open' ? <Clock className="size-3.5" /> : market.status === 'closed' ? <LockKeyhole className="size-3.5" /> : <Trophy className="size-3.5" />}{statusLabel}</span></div><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{market.outcomes.map((item) => <button key={item.id} disabled={!canTrade} onClick={() => setSelected(item.id)} className={`rounded-2xl border p-4 text-left transition disabled:cursor-default ${selected === item.id ? 'border-primary bg-primary/5 ring-2 ring-primary/10' : 'bg-background hover:border-primary/40'} ${market.winnerId === item.id ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(40,209,124,.08)]' : ''}`}><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{item.label} {market.winnerId === item.id && <Trophy className="ml-1 inline size-3.5 text-primary" />}</span><span className="text-2xl font-semibold tracking-tight" style={{ color: item.color }}>{odds(market.outcomes, item.id)}%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${odds(market.outcomes, item.id)}%`, background: item.color }} /></div><p className="mt-2 text-[11px] text-muted-foreground">${item.pool.toLocaleString()} backing this outcome</p></button>)}</div>

        <div className="mt-8 rounded-2xl bg-background p-4 md:p-6"><div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-semibold">Crowd confidence</p><p className="text-xs text-muted-foreground">Final probability history stays visible after settlement</p></div><TrendingUp className="size-5 text-primary" /></div><ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto"><AreaChart data={market.history} margin={{ left: -18, right: 8, top: 8 }}><defs>{market.outcomes.map((item) => <linearGradient key={item.id} id={`fill-${item.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={item.color} stopOpacity={.24}/><stop offset="95%" stopColor={item.color} stopOpacity={0}/></linearGradient>)}</defs><CartesianGrid vertical={false} strokeDasharray="4 4" /><XAxis dataKey="tick" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltipContent />} />{market.outcomes.map((item) => <Area key={item.id} type="monotone" dataKey={item.id} stroke={item.color} fill={`url(#fill-${item.id})`} strokeWidth={2.5} dot={market.history.length < 3} animationDuration={350} />)}</AreaChart></ChartContainer></div>

        {market.status === 'resolved' && <div className="mt-6 overflow-hidden rounded-2xl border bg-background"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><p className="text-sm font-semibold">Winner payouts</p><p className="mt-1 text-xs text-muted-foreground">The full ${totalPot.toLocaleString(undefined, { maximumFractionDigits: 0 })} pot is split by each winner’s share of money placed on {winner?.label}.</p></div><span className="rounded-full bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary">{market.payouts?.length || 0} winner{market.payouts?.length === 1 ? '' : 's'}</span></div><Table><TableHeader><TableRow><TableHead>Bettor</TableHead><TableHead className="text-right">Put on winner</TableHead><TableHead className="text-right">Share of winners</TableHead><TableHead className="text-right">Payout</TableHead><TableHead className="text-right">Net result</TableHead></TableRow></TableHeader><TableBody>{market.payouts?.map((item) => <TableRow key={item.name}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-right font-mono">${item.stake.toFixed(0)}</TableCell><TableCell className="text-right font-mono">{(item.share * 100).toFixed(1)}%</TableCell><TableCell className="text-right font-mono font-semibold text-primary">${item.payout.toFixed(0)}</TableCell><TableCell className={`text-right font-mono ${item.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>{item.profit >= 0 ? '+' : ''}${item.profit.toFixed(0)}</TableCell></TableRow>)}{!market.payouts?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No one backed the winning outcome, so there are no payouts.</TableCell></TableRow>}</TableBody></Table></div>}
      </div></section>

      <aside className="order-3"><div className="sticky top-24 rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Your position</p><span className="flex items-center gap-1 text-sm font-semibold text-primary"><CircleDollarSign className="size-4" />${Math.round(me?.balance ?? 1000).toLocaleString()}</span></div>{market.status === 'open' ? <><h2 className="mt-5 text-lg font-semibold">Back an outcome</h2><div className="mt-4 grid gap-2">{market.outcomes.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm ${selected === item.id ? 'border-primary bg-primary/5' : 'bg-background'}`}><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span><span className="font-mono text-xs">{odds(market.outcomes, item.id)}¢</span></button>)}</div><label className="mt-5 block text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Amount</label><div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input type="number" min={1} max={Math.floor(me?.balance ?? 1000)} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="h-12 pl-7 font-mono text-base" /></div><div className="mt-2 grid grid-cols-4 gap-1">{[25, 50, 100, 250].map((value) => <Button key={value} variant="outline" size="sm" onClick={() => setAmount(value)}>${value}</Button>)}</div><Button onClick={placeTrade} disabled={!selected || amount <= 0 || amount > (me?.balance ?? 1000) || connection !== 'live' && session.role === 'guest'} className="mt-5 h-12 w-full rounded-xl">Place bet <ArrowRight /></Button><p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">Play money only. No real currency or prizes.</p></> : market.status === 'closed' && session.role === 'host' ? <><div className="mt-5 flex items-center gap-2 text-destructive"><LockKeyhole className="size-5" /><h2 className="text-lg font-semibold">Choose the winner</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Betting is locked. Select the outcome that happened to calculate and publish payouts.</p><div className="mt-4 grid gap-2">{market.outcomes.map((item) => <button key={item.id} onClick={() => setWinnerChoice(item.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${winnerChoice === item.id ? 'border-primary bg-primary/10' : 'bg-background'}`}><span className="size-2.5 rounded-full" style={{ background: item.color }} />{item.label}</button>)}</div><Button disabled={!winnerChoice} onClick={() => resolveBet(winnerChoice)} className="mt-5 h-12 w-full rounded-xl"><Trophy /> Announce winner</Button></> : <div className="mt-6 rounded-xl border bg-background p-4 text-center"><Trophy className="mx-auto size-7 text-primary" /><p className="mt-2 text-sm font-semibold">{market.status === 'resolved' ? 'Bet settled' : 'Betting is closed'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{market.status === 'resolved' ? 'Payouts have been added to winner balances.' : 'Waiting for the host to announce the result.'}</p></div>}<div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Your holdings</p><div className="mt-3 grid gap-2">{market.outcomes.filter((item) => (me?.holdings[item.id] || 0) > 0).map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span>{item.label}</span><span className="font-mono">${(me?.stakes[item.id] || 0).toFixed(0)} · {(me?.holdings[item.id] || 0).toFixed(1)} sh</span></div>)}{!Object.values(me?.holdings || {}).some(Boolean) && <p className="text-xs text-muted-foreground">No positions yet.</p>}</div></div></div></aside>
    </div>
  </main>;
}
